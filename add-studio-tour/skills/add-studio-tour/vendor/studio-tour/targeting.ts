import type { NavTarget, TourDefinition } from './types'
import { portableTextToSafeHtml } from './portableText'

/**
 * Pure targeting logic for the tour plugin — NO React or Sanity imports, so it
 * can be unit-tested in isolation (see ../../tests/targeting.test.ts).
 * `tourSchema.ts` (schema definition) and `useTours.ts` (runtime fetch) both
 * build on these.
 *
 * A step's authored `target` is either a chrome key or `field:<name>`;
 * `resolveTargetSelector()` maps it to a real CSS selector. `mapTour()` turns a
 * fetched tour document into the runnable `TourDefinition` shape.
 */

// Built-in chrome targets. These point at Sanity's internal `data-testid`s,
// which can change between Studio majors — callers can override/extend them via
// the plugin's `chromeSelectors` option. Field targets, by contrast, use the
// stable `data-tour-field` attribute this plugin owns (see TourField).
// See SELECTORS.md (in the add-studio-tour skill) for the full native-target
// catalog, stability ratings, and the re-extraction/verification recipe to run
// on each Sanity upgrade.
export const DEFAULT_CHROME_SELECTORS: Record<string, string> = {
  // --- Global chrome (top bar) — single render, present on every screen ---
  navbar: '[data-testid="studio-navbar"]',
  logo: '[data-testid="studio-logo"]',
  'create-button': '[data-testid="new-document-button"]',
  search: '[data-testid="studio-search"]',
  perspective: '[data-testid="global-perspective-menu-button"]',
  // Feature-gated: only rendered when Releases / Tasks are enabled for the
  // project (and Tasks requires a deployed Studio). Resolve to nothing otherwise.
  releases: '[data-testid="releases-tool-link"]',
  tasks: '[data-testid="tasks-toolbar"]',

  // --- Structure panes ---
  sidebar: '[data-testid="structure-tool-list-pane"]',
  'document-list': '[data-testid="document-list-pane"]',
  // Per-pane "+" create button. It lives in the list pane's HEADER (a sibling of
  // `document-list-pane`, not a descendant), so scope to `pane-header`.
  // `action-intent-button` also appears in reference/array field inputs, but
  // those aren't inside a pane header. Only present when a list pane is open
  // (give the step an `openPath` to that pane). querySelector returns the first
  // match, i.e. the leftmost open list pane's button.
  'pane-create':
    '[data-testid="pane-header"] [data-testid="action-intent-button"]',

  // --- Document pane chrome (scoped to the open document) ---
  'document-panel': '[data-testid="document-panel-scroller"]',
  'pane-header': '[data-testid="document-pane"] [data-testid="pane-header"]',
  breadcrumb:
    '[data-testid="document-pane"] [data-testid="document-header-breadcrumb"]',
  'document-title':
    '[data-testid="document-pane"] [data-testid="document-panel-document-title"]',
  // First Portable Text editor in the open document. Each PT field renders its
  // own `pt-editor`; scoping to the document pane grabs the first one.
  'pt-editor': '[data-testid="document-pane"] [data-testid="pt-editor"]',

  // --- Document actions (footer) ---
  // `action-publish` is the *primary* action button; its testid is derived from
  // the action label (`action-${label}`), so it can shift under non-English UI
  // locales. Only the primary action renders as a button — the rest live in the
  // `document-actions` menu below.
  'publish-button': '[data-testid="action-publish"]',
  // The document footer's action menu — the caret next to "Publish" that opens
  // Duplicate/Delete/Unpublish/etc. `action-menu-button` is NOT unique: the
  // Portable Text editor toolbar renders one too, and it comes first in the DOM,
  // so a bare `[data-testid="action-menu-button"]` grabs the rich-text menu. The
  // footer menu is the only one inside `pane-footer`, so scope to it. This is
  // distinct from the pane's "show more" (`···`) overflow menu (`show-more`).
  'document-actions':
    '[data-testid="document-pane"] [data-testid="pane-footer"] [data-testid="action-menu-button"]',
  // The document pane's "show more" (`···`) overflow menu at the top-right of the
  // pane header. This is where built-in inspectors live (Inspect, Review changes,
  // Incoming references) — point a step here, not at `document-actions`, to open
  // them.
  'show-more':
    '[data-testid="document-pane"] [data-testid="pane-context-menu-button"]',

  // Back-compat aliases for older authored target values; hidden from the
  // dropdown (see HIDDEN_CHROME_KEYS). New tours should use the canonical keys
  // above — `sidebar` and `pane-create` respectively. `create-page` resolves to
  // the *scoped* selector, which also fixes the old unscoped studio override.
  'list-pane': '[data-testid="structure-tool-list-pane"]',
  'create-page':
    '[data-testid="pane-header"] [data-testid="action-intent-button"]',
}

// Keys kept in DEFAULT_CHROME_SELECTORS for back-compat but hidden from the
// authoring dropdown — older authored target values that now have canonical
// equivalents.
export const HIDDEN_CHROME_KEYS = new Set(['list-pane', 'create-page'])

// Friendly labels for the built-in keys. Custom selector keys fall back to the
// key itself as the dropdown label.
export const CHROME_TARGET_LABELS: Record<string, string> = {
  navbar: 'Top bar (header)',
  logo: 'Studio logo',
  'create-button': 'Global Create button (top bar)',
  search: 'Global search',
  perspective: 'Perspective / release switcher',
  releases: 'Releases tool (if enabled)',
  tasks: 'Tasks button (if enabled)',
  sidebar: 'Structure sidebar (root nav)',
  'document-list': 'Open document list (e.g. Products)',
  'pane-create': 'List pane "+" create button',
  'document-panel': 'Document panel',
  'pane-header': 'Document pane header',
  breadcrumb: 'Document breadcrumb',
  'document-title': 'Document title',
  'pt-editor': 'Rich text editor (first)',
  'publish-button': 'Publish button',
  'document-actions': 'Document actions menu (Publish ▾)',
  'show-more': 'Pane "show more" menu (···)',
}

/** Resolve an authored target value to a CSS selector, or undefined if unset. */
export function resolveTargetSelector(
  target: string | undefined,
  selectors: Record<string, string>
): string | undefined {
  if (!target) return undefined
  if (target.startsWith('field:')) return `[data-tour-field="${target.slice('field:'.length)}"]`
  return selectors[target]
}

/**
 * GROQ predicate appended after `_type == $type` to restrict the launcher to the
 * current workspace's tours when central-management scoping is on. Returns '' when
 * unscoped (admin workspace, or the simple one-dataset-per-workspace model), so
 * every tour of the type shows. When scoped, a tour with no `workspaces` (or an
 * empty array) is treated as global and always shown; otherwise the workspace key
 * must be listed. The `$scope` param is only referenced when scoped.
 */
export function workspaceScopeFilter(scope: string | null): string {
  if (!scope) return ''
  return ' && (!defined(workspaces) || count(workspaces) == 0 || $scope in workspaces)'
}

/**
 * GROQ predicate restricting the launcher to tours targeted at the current
 * user's project roles. A tour with no `roles` (or an empty array) is shown to
 * everyone. Always applied; `$userRoles` must be passed (the user's role names).
 * Visibility only — not access control: tour docs stay readable via the API.
 */
export const ROLE_FILTER =
  ' && (!defined(roles) || count(roles) == 0 || count(roles[@ in $userRoles]) > 0)'

export interface RawStep {
  title?: string
  /**
   * Step copy as authored. Normally Portable Text (a block array); a plain string
   * is tolerated for tours authored under the old free-text field. `mapTour`
   * serializes it to safe HTML via `portableTextToSafeHtml`.
   */
  description?: unknown
  target?: string
  side?: TourDefinition['steps'][number]['side']
  align?: TourDefinition['steps'][number]['align']
  delay?: number
  openTool?: string | null
  openPath?: string | null
  doc?: { _id: string; _type: string } | null
}

export interface RawTour {
  _id: string
  label?: string
  description?: string
  steps?: RawStep[]
}

/**
 * Map a fetched tour document into the runnable TourDefinition. Resolves each
 * step's `target` to a selector, and folds `doc`/`openTool`/`openPath` into a
 * NavTarget. Precedence when more than one is set: `doc` (most robust — resolved
 * through the structure) → `openPath` (a workspace-relative router path, e.g. a
 * structure list pane) → `openTool` (a tool name).
 */
export function mapTour(raw: RawTour, chromeSelectors: Record<string, string>): TourDefinition {
  return {
    id: raw._id,
    label: raw.label ?? '(untitled tour)',
    // Tour-level description is plain text (rendered by React, which escapes it).
    description: typeof raw.description === 'string' ? raw.description : '',
    steps: (raw.steps ?? []).map((s) => {
      const element = resolveTargetSelector(s.target, chromeSelectors)
      const hasTarget = !!(typeof s.target === 'string' && s.target.trim())
      return {
        title: s.title ?? '',
        // Serialized to SAFE HTML here (escaped text + allowlisted tags), because
        // this string is later handed to driver.js's innerHTML popover body.
        description: portableTextToSafeHtml(s.description),
        element,
        // Keep the authored key (e.g. "pane-create") alongside the resolved
        // selector so a skipped step can be reported by its friendly target.
        target: s.target,
        // A target was authored but resolved to no selector → an unknown/removed
        // chrome key (a broken step), NOT a deliberate copy-only step. Flag it so
        // the runtime records a miss instead of silently showing a centered
        // popover and losing the telemetry. (`field:*` always resolves, so this
        // only ever trips on a bad chrome key.)
        unresolvedTarget: hasTarget && !element,
        side: s.side,
        align: s.align,
        delay: s.delay,
        navigateTo: s.doc
          ? ({ kind: 'doc', id: s.doc._id, type: s.doc._type } satisfies NavTarget)
          : s.openPath
            ? ({ kind: 'path', path: s.openPath } satisfies NavTarget)
            : s.openTool
              ? ({ kind: 'tool', tool: s.openTool } satisfies NavTarget)
              : undefined,
      }
    }),
  }
}
