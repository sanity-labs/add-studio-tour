import { definePlugin } from 'sanity'
import { JoystickIcon } from '@sanity/icons/Joystick'
import { TourProvider } from './TourProvider'
import { TourLauncher } from './TourLauncher'
import { TourField } from './TourField'
import { TourInput } from './revealRegistry'
import { TourDashboard } from './TourDashboard'
import { createTourType, DEFAULT_CHROME_SELECTORS } from './tourSchema'
import { createTourProgressType } from './progressSchema'
import type { ResolvedProgressConfig, ResolvedTourConfig, StudioTourConfig, TourDashboardConfig } from './types'

export type {
  StudioTourConfig,
  TourProgressConfig,
  TourDashboardConfig,
  TourProgressDoc,
  TourProgressStatus,
  FieldTargetOption,
  TourDefinition,
  TourStep,
  NavTarget,
} from './types'
export { DEFAULT_CHROME_SELECTORS } from './tourSchema'

/**
 * sanity-plugin-studio-tour
 *
 * Drop into a workspace's `plugins` array and it contributes everything the tour
 * system needs:
 *
 *  - the tour document type (authored per workspace),
 *  - the global `TourField` form wrapper that tags fields with stable
 *    `data-tour-field` selectors,
 *  - a `layout` component (TourProvider) that holds workspace-scoped tour state,
 *    drives driver.js, and navigates the Studio router, and
 *  - a `navbar` launcher button.
 *
 * Plugin components compose via the `renderDefault` middleware chain, so this
 * stacks cleanly with other plugins and per-workspace customization.
 */
export const studioTourPlugin = definePlugin<StudioTourConfig | void>((config) => {
  // Per-user progress: `progress: true` enables with defaults; an object
  // customizes. Stored in the studio's own content dataset by default; set
  // `progress.dataset` to a private dataset to keep user identity out of a
  // public one (see TourProgressConfig).
  const progressInput = config?.progress
  const progressObj = typeof progressInput === 'object' && progressInput ? progressInput : {}
  const progress: ResolvedProgressConfig = {
    enabled: Boolean(progressInput),
    // null → use the studio's own (active) content dataset at runtime; a string
    // overrides it explicitly (e.g. a separate private dataset).
    dataset: progressObj.dataset ?? null,
    typeName: progressObj.typeName ?? 'studioTourProgress',
  }

  const resolved: ResolvedTourConfig = {
    schemaTypeName: config?.schemaTypeName ?? 'tour',
    docTypes: config?.docTypes ?? [],
    fieldTargets: config?.fieldTargets ?? [],
    chromeSelectors: { ...DEFAULT_CHROME_SELECTORS, ...(config?.chromeSelectors ?? {}) },
    workspaceScope: config?.workspaceScope ?? null,
    // Show the tagging field on the admin workspace and on any scoped product
    // workspace, so the shared tour type stays consistent across the dataset.
    showWorkspaceField:
      Boolean(config?.workspaceScope) || Boolean(config?.manageWorkspaceScopes),
    progress,
  }

  return {
    name: 'sanity-plugin-studio-tour',
    schema: {
      // The progress doc type is registered only when progress is on. It may
      // share the studio's content dataset, so it's kept out of the way:
      // readOnly + hidden from search (see progressSchema.ts) and filtered out
      // of the global "Create new" menu just below. A custom desk structure
      // simply doesn't list it.
      types: [
        createTourType(resolved),
        ...(progress.enabled ? [createTourProgressType(progress.typeName)] : []),
      ],
    },
    // Keep the progress type out of the global "Create new document" menu — it's
    // plugin-written telemetry, never created by hand. Composes with any host
    // newDocumentOptions resolver via the `prev` array.
    ...(progress.enabled
      ? {
          document: {
            newDocumentOptions: (prev) =>
              prev.filter((t) => t.templateId !== progress.typeName),
          },
        }
      : {}),
    form: {
      components: {
        field: TourField,
        // Registers object inputs so steps can expand collapsed fieldsets/objects
        // and switch groups to reach their target field (see revealRegistry).
        input: TourInput,
      },
    },
    studio: {
      components: {
        layout: (props) => <TourProvider config={resolved}>{props.renderDefault(props)}</TourProvider>,
        navbar: (props) => {
          // Inject the launcher as a native top-bar action via Sanity's
          // `__internal_actions` slot, so it renders *inside* the navbar's own
          // themed surface — it inherits the bottom border and the perspective
          // tone (e.g. the colour shift when a content release is active),
          // instead of floating in an un-themed wrapper beside the navbar.
          // NOTE: `__internal_actions` is @beta in Sanity; if it's ever removed
          // the launcher simply won't render (no crash) — revisit then.
          const actions = [
            ...(props.__internal_actions ?? []),
            {
              name: 'studio-tour',
              location: 'topbar' as const,
              render: () => <TourLauncher />,
            },
          ]
          return props.renderDefault({ ...props, __internal_actions: actions })
        },
      },
    },
  }
})

/** Alias: the demo and earlier docs refer to this as `tourPlugin`. */
export const tourPlugin = studioTourPlugin

/**
 * sanity-plugin-studio-tour-dashboard
 *
 * Standalone companion plugin: adding it to a workspace's `plugins` array
 * registers the live "Tour Progress" admin tool — there's no on/off flag, the
 * dashboard is enabled simply by being added. It reads the per-user progress
 * docs `studioTourPlugin({ progress })` writes.
 *
 * Defaults to the same dataset/type as `progress` (the studio's content dataset,
 * type `studioTourProgress`). Pass `dataset`/`typeName` only if you customized
 * `progress.*` — they must match.
 *
 * Pass `roles` to restrict who sees the tool: the tool is only registered for
 * users holding one of the named project roles (e.g. `['administrator']`). Omit
 * to show it to everyone. NOTE: this is convenience visibility, not a security
 * boundary — the underlying docs are still governed by dataset permissions.
 *
 * Appended via the function form so it never clobbers other plugins' tools.
 */
export const studioTourDashboard = definePlugin<TourDashboardConfig | void>((config) => {
  const progress: ResolvedProgressConfig = {
    enabled: true,
    dataset: config?.dataset ?? null,
    typeName: config?.typeName ?? 'studioTourProgress',
  }
  const schemaTypeName = config?.schemaTypeName ?? 'tour'
  const workspaceScope = config?.workspaceScope ?? null
  const allowedRoles = config?.roles ?? null
  return {
    name: 'sanity-plugin-studio-tour-dashboard',
    tools: (prev, context) => {
      // Role-gate: if `roles` is set, only add the tool when the current user
      // holds one of them. `currentUser` can be null mid-auth — hide until known.
      if (allowedRoles) {
        const userRoles = context.currentUser?.roles?.map((r) => r.name) ?? []
        if (!userRoles.some((r) => allowedRoles.includes(r))) return prev
      }
      return [
        ...prev,
        {
          name: 'tour-progress',
          title: 'Tour Progress',
          icon: JoystickIcon,
          component: () => (
            <TourDashboard
              progress={progress}
              schemaTypeName={schemaTypeName}
              workspaceScope={workspaceScope}
            />
          ),
        },
      ]
    },
  }
})
