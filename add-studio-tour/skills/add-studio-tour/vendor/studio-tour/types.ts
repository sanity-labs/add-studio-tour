import type { Config as DriverConfig } from 'driver.js'

// ─── Tour ─────────────────────────────────────────────────────────────────────

/**
 * Where a tour step asks the Studio to navigate before highlighting.
 *
 * - `doc`  → open a document via the Studio's `edit` intent. Resolved through
 *   the structure automatically, so it also reveals the parent panes. Robust
 *   against structure/id changes.
 * - `tool` → open a Studio tool by name (e.g. "presentation").
 * - `path` → navigate to a workspace-relative router path (basePath is prepended
 *   by the controller). The escape hatch for views no intent opens — notably a
 *   structure list pane (`/structure/...`) so its "+" create button renders and
 *   can be highlighted. Authored via a step's `openPath`.
 */
export type NavTarget =
  | { kind: 'doc'; id: string; type: string }
  | { kind: 'tool'; tool: string }
  | { kind: 'path'; path: string }

export interface TourStep {
  /** CSS selector for the target element inside the Studio. */
  element?: string
  /**
   * The authored target key this step points at (e.g. `pane-create`,
   * `field:title`), carried through from the document so a skipped step can be
   * reported by the friendly key, not just its resolved CSS selector.
   */
  target?: string
  /**
   * True when the step authored a `target` that resolved to no selector (an
   * unknown/removed chrome key). The runtime treats it as a miss — records
   * telemetry and skips — rather than rendering a misleading centered popover.
   */
  unresolvedTarget?: boolean
  /** Optional: navigate the Studio here before highlighting this step. */
  navigateTo?: NavTarget
  /** Popover title (plain text — escaped before it reaches driver.js). */
  title: string
  /**
   * Popover body as SAFE HTML, serialized from the authored Portable Text by
   * `portableTextToSafeHtml` (escaped text + an allowlist of tags). Never raw
   * author-supplied HTML — that would be an innerHTML XSS sink in driver.js.
   */
  description: string
  /** Which side of the element to place the popover (driver.js may auto-flip). */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** How the popover aligns along that side. Defaults to 'center'. */
  align?: 'start' | 'center' | 'end'
  /** Delay in ms before this step becomes interactive (no-element steps only). */
  delay?: number
}

export interface TourDefinition {
  id: string
  label: string
  description: string
  steps: TourStep[]
  /** driver.js config overrides. */
  driverConfig?: Partial<DriverConfig>
}

// ─── Per-user progress ────────────────────────────────────────────────────────

export type TourProgressStatus = 'in_progress' | 'completed' | 'incomplete'

/**
 * One step that was skipped at runtime because its target selector never
 * resolved in the live DOM — the persistent record of what the console-only
 * `[tour] skipping step …` warning used to surface. Stored on the play's
 * progress doc so a broken tour is queryable/visible after the fact (and shows
 * in the dashboard) instead of relying on someone watching the console.
 */
export interface MissedStep {
  _key?: string
  /** 0-based index of the skipped step. */
  stepIndex: number
  /** Snapshot of the step title (so a later tour edit can't orphan the record). */
  stepTitle: string
  /** Authored target key (e.g. "pane-create"), if the step had one. */
  target?: string
  /** The resolved CSS selector that didn't match — the actionable "what to fix". */
  selector?: string
  /** ISO timestamp of the miss. */
  at: string
}

/**
 * One progress record PER PLAY (per run) — not per (user × tour). It captures
 * user identity (id/name/email), so where it is stored is a privacy decision:
 * by default it goes in the studio's own (content) dataset; point
 * `progress.dataset` at a private dataset to keep identity out of a public one.
 * `tourId`/`tourLabel` are a string + snapshot, not a reference, so tour
 * edits/reseeds can't orphan it.
 */
export interface TourProgressDoc {
  _id: string
  _type: string
  /** Unique id for this play/run (the last segment of `_id`). */
  runId?: string
  user: string
  userName?: string
  userEmail?: string
  tourId: string
  tourLabel: string
  workspace: string
  status: TourProgressStatus
  /** Last shown step index (0-based). */
  currentStep: number
  totalSteps: number
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  /** Steps skipped this play because their target selector didn't resolve. */
  missedSteps?: MissedStep[]
}

// ─── Tour state ─────────────────────────────────────────────────────────────

export interface TourState {
  activeTour: string | null
  isRunning: boolean
  currentStep: number

  startTour: (tourId: string) => void
  stopTour: () => void
  setStep: (step: number) => void
}

// ─── Plugin config ────────────────────────────────────────────────────────────

export interface FieldTargetOption {
  /** Label shown in the authoring dropdown, e.g. "Collections field". */
  title: string
  /** Schema field name, e.g. "collections" — becomes `field:collections`. */
  field: string
}

/**
 * Per-user progress tracking. Setting `progress` (to `true` or an object) turns
 * it on: a `studioTourProgress` doc is written per PLAY (per run) so tours can be
 * resumed and replays are kept as history. The live admin dashboard is a separate
 * plugin — `studioTourDashboard()`.
 *
 * These docs capture user identity (name/email). By default they go in the
 * studio's own (active) content dataset — a regular dataset governed by project
 * roles, so admins and normal write-roles can persist progress. If that dataset
 * is (or may become) public, set `dataset` to a separate PRIVATE dataset so the
 * identity data isn't world-readable. The current user must have write access to
 * whichever dataset is used. (A Comments `<dataset>-comments` add-on dataset
 * CANNOT be used — its managed grants only permit comment/task types and reject
 * `studioTourProgress`, returning 403 even for admins.)
 */
export interface TourProgressConfig {
  /**
   * Dataset for progress docs. Default: the studio's own (active) content
   * dataset — a regular dataset governed by project roles, so admins and normal
   * write-roles can persist progress. Set this to a separate PRIVATE dataset to
   * keep the user identity (name/email) out of a public content dataset.
   * (The Comments `<dataset>-comments` add-on dataset can't be used: its managed
   * grants only permit comment/task types and reject custom types.)
   */
  dataset?: string
  /** `_type` for progress docs. Default `studioTourProgress`. */
  typeName?: string
}

/**
 * Options for the standalone `studioTourDashboard()` plugin. Adding the plugin
 * registers the live "Tour Progress" tool (it's enabled simply by being added).
 * The options only need to be set when they were customized on `progress` —
 * they must point at the same dataset/type the progress writes go to.
 */
export interface TourDashboardConfig {
  /**
   * Dataset the progress docs live in. Default: the studio's own content
   * dataset. Match this to `progress.dataset` if that was customized.
   */
  dataset?: string
  /** `_type` of the progress docs. Default `studioTourProgress`. Match `progress.typeName`. */
  typeName?: string
  /**
   * The tour document type to enumerate so EVERY tour is listed (even unplayed
   * ones). Default `tour`. Match `tourPlugin`'s `schemaTypeName` if you changed it.
   */
  schemaTypeName?: string
  /**
   * Central-management mode only: set to this workspace's scope key to filter the
   * dashboard to its tours (+ untagged/global), mirroring `tourPlugin`'s
   * `workspaceScope`. Out-of-scope tours and their plays are hidden. Omit on a
   * global-admin workspace (or the simple one-dataset-per-workspace model) to see
   * every tour.
   */
  workspaceScope?: string
  /**
   * Restrict who sees the "Tour Progress" tool to users holding one of these
   * project roles (e.g. `['administrator']`). Omit to show it to everyone. This
   * is convenience visibility, not a security boundary — dataset permissions
   * still govern the underlying docs.
   */
  roles?: string[]
}

/** Public plugin options (all optional — the plugin works with no config). */
export interface StudioTourConfig {
  /** Per-user progress tracking + resume. `true` enables with defaults; omit to disable. */
  progress?: boolean | TourProgressConfig
  /** Document types a tour step may open (the reference target list). */
  docTypes?: string[]
  /** Schema-specific field targets shown in a step's highlight dropdown. */
  fieldTargets?: FieldTargetOption[]
  /** Name of the tour document type. Defaults to `tour`. */
  schemaTypeName?: string
  /** Override/extend the CSS selectors used for Studio chrome targets. */
  chromeSelectors?: Record<string, string>
  /**
   * Central-management mode (shared dataset). Set this on each *product*
   * workspace to a stable workspace key (e.g. the workspace `name`). Its
   * launcher then shows only tours tagged for this key — plus untagged
   * ("global") tours — via the `workspaces` field on the tour document. Also
   * makes that field visible for authoring. Omit for the simple
   * one-dataset-per-workspace model (no field, no filter — current behaviour).
   */
  workspaceScope?: string
  /**
   * Central-management mode (shared dataset). Set this `true` on the **global
   * admin** workspace: it shows the `workspaces` tagging field and sees/manages
   * **all** tours (no scope filter applied).
   */
  manageWorkspaceScopes?: boolean
}

/** Config after defaults are applied — passed to the internal components. */
export interface ResolvedTourConfig {
  docTypes: string[]
  fieldTargets: FieldTargetOption[]
  schemaTypeName: string
  chromeSelectors: Record<string, string>
  /** Workspace key to filter the launcher by, or null for no filter. */
  workspaceScope: string | null
  /** Whether to show the `workspaces` tagging field on the tour type. */
  showWorkspaceField: boolean
  /** Resolved per-user progress settings. */
  progress: ResolvedProgressConfig
}

/** Resolved per-user progress settings — the runtime slice the client/hooks read. */
export interface ResolvedProgressConfig {
  enabled: boolean
  /**
   * Dataset progress docs are read/written in.
   * `null` → use the studio's own (active) content dataset at runtime.
   */
  dataset: string | null
  /** `_type` for progress docs. */
  typeName: string
}
