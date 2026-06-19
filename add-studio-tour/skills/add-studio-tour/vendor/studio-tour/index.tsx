import { definePlugin } from 'sanity'
import { TourProvider } from './TourProvider'
import { TourLauncher } from './TourLauncher'
import { TourField } from './TourField'
import { createTourType, DEFAULT_CHROME_SELECTORS } from './tourSchema'
import type { ResolvedTourConfig, StudioTourConfig } from './types'

export type {
  StudioTourConfig,
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
  }

  return {
    name: 'sanity-plugin-studio-tour',
    schema: {
      types: [createTourType(resolved)],
    },
    form: {
      components: {
        field: TourField,
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
