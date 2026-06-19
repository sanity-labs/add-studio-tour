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
  /** Optional: navigate the Studio here before highlighting this step. */
  navigateTo?: NavTarget
  /** Popover title. */
  title: string
  /** Popover body (supports basic HTML). */
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

/** Public plugin options (all optional — the plugin works with no config). */
export interface StudioTourConfig {
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
}
