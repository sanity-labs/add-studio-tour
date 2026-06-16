import { definePlugin } from 'sanity'
import { Box, Flex } from '@sanity/ui'
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
        navbar: (props) => (
          <Flex align="center">
            <Box flex={1}>{props.renderDefault(props)}</Box>
            <Box paddingX={2}>
              <TourLauncher />
            </Box>
          </Flex>
        ),
      },
    },
  }
})

/** Alias: the demo and earlier docs refer to this as `tourPlugin`. */
export const tourPlugin = studioTourPlugin
