import { useCallback, useEffect, useRef } from 'react'
import { useWorkspace } from 'sanity'
import { driver } from 'driver.js'
import type { DriveStep, Driver } from 'driver.js'
import type { NavTarget, TourDefinition, TourStep } from './types'
import { ensureDriverStyles } from './driverStyles'
import { useTourStore } from './store'

/**
 * Poll for an element to appear in the DOM before proceeding. More robust than
 * a static delay: fast machines proceed immediately, slow ones get up to
 * `timeout` ms. Resolves the element once found, or null if the timeout elapses.
 */
async function waitForElement(selector: string, timeout = 3000): Promise<Element | null> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector)
    if (el) return el
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}

/**
 * Scroll the target to the center of Sanity's document-panel scroll container,
 * then wait for the scroll (and any lazy field growth — array/reference items
 * resolve their previews after mount) to settle before returning.
 *
 * Doing this ourselves *before* handing off to driver.js is what fixes the
 * "struggles scrolling to far-down fields" jank: driver.js otherwise scrolls
 * the inner container and positions the popover near-simultaneously, so for an
 * element far below the fold it fights its own in-flight scroll. By the time
 * driver.js highlights, the element is already centered and stable, so its own
 * scrollIntoView is a no-op.
 */
async function scrollIntoViewAndSettle(el: Element): Promise<void> {
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  // Poll until the element's top stops moving across two checks, capped so a
  // never-settling layout can't stall the tour.
  let prevTop = NaN
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 80))
    const top = Math.round(el.getBoundingClientRect().top)
    if (top === prevTop) return
    prevTop = top
  }
}

/**
 * After (optionally) navigating, make sure the target element exists and is
 * scrolled into view before driver.js tries to highlight it. Falls back to a
 * short fixed delay when the step has no element selector to wait on.
 *
 * Returns true if the step is showable (its element resolved, or it has no
 * element and is meant to render as a centered popover), false if the element
 * never appeared and the step should be skipped.
 */
async function settleStep(step: TourStep): Promise<boolean> {
  if (step.element) {
    // 6s (not 3s): reference/array fields mount their wrapper later than scalar
    // fields while previews resolve, and a cold document open can be slow.
    const el = await waitForElement(step.element, 6000)
    if (!el) return false
    await scrollIntoViewAndSettle(el)
    return true
  }
  await new Promise((r) => setTimeout(r, step.delay ?? 300))
  return true
}

/**
 * Diagnostic: when a step's element can't be found, dump the selectors that
 * ARE present in the current Studio DOM so the right one can be wired in.
 * Runs at most once per tour run (the caller resets the guard via the factory).
 */
function makeSelectorDumper() {
  let dumped = false
  return () => {
    if (dumped) return
    dumped = true
    const dump = (attr: string) =>
      [...new Set([...document.querySelectorAll(`[${attr}]`)].map((el) => el.getAttribute(attr)))]
        .filter(Boolean)
        .sort()
    const testIds = dump('data-testid')
    const relevant = /nav|tool|workspace|studio|search|menu|pane|status|chang|publish|review|document/i
    /* eslint-disable no-console */
    console.log('[tour] ▼ available selectors (paste this back) ▼')
    console.log('[tour] data-testid (chrome):', testIds.filter((v) => relevant.test(v as string)))
    console.log('[tour] data-ui:', dump('data-ui'))
    console.log('[tour] data-tour-field:', dump('data-tour-field'))
    // Field-group (and document-view) tabs. A `field:<name>` miss is often a
    // field sitting behind an inactive group tab (e.g. an "SEO" group), so it's
    // not in the DOM — surface the tabs so that's diagnosable at a glance.
    const tabs = [...document.querySelectorAll('[role="tab"]')]
      .map((el) => {
        const label = el.textContent?.trim()
        if (!label) return null
        return el.getAttribute('aria-selected') === 'true' ? `${label} (active)` : label
      })
      .filter(Boolean)
    console.log('[tour] field-group / view tabs (a field:<name> miss may be behind an inactive tab):', tabs)
    console.log('[tour] review aria?', !!document.querySelector('[aria-label="Review changes"]'))
    /* eslint-enable no-console */
  }
}

/**
 * useTour
 *
 * Provides `run` and `stop` that drive driver.js with our TourDefinition
 * format. Handles optional Studio navigation before each step via an
 * `onBeforeStep` callback you provide, then waits for the step's target
 * element to render (and settle into view) before advancing.
 */
export function useTour(options?: {
  onBeforeStep?: (navigateTo: NavTarget | undefined, stepIndex: number) => Promise<void> | void
}) {
  const driverRef = useRef<Driver | null>(null)
  const startTour = useTourStore((s) => s.startTour)
  const stopTour = useTourStore((s) => s.stopTour)
  const setStep = useTourStore((s) => s.setStep)
  // The active workspace name stands in for the old `activeVertical`.
  const { name: workspaceName } = useWorkspace()

  // When the workspace changes, driver.js may still hold references to DOM
  // nodes from the previous workspace's view. Tear it down cleanly.
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [workspaceName])

  const run = useCallback(
    async (tour: TourDefinition) => {
      // driver.js styles are injected at runtime (a JS-only library build can't
      // ship a CSS import that survives to the consumer's bundler).
      ensureDriverStyles()
      startTour(tour.id)

      // Dumps the available Studio selectors the first time a step is skipped.
      const dumpSelectors = makeSelectorDumper()

      const steps: DriveStep[] = tour.steps.map((step) => ({
        element: step.element,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side ?? 'bottom',
          // driver.js defaults align to 'start', which left-aligns the popover
          // on the element. Center it unless a step says otherwise. (driver.js
          // still auto-flips `side` when the chosen side has no room.)
          align: step.align ?? 'center',
        },
      }))

      // Scan from `start` in `direction`, navigating to and settling each
      // candidate step. The first showable step is driven; steps whose element
      // never appears are skipped. If no showable step remains, the tour ends.
      const showFrom = async (start: number, direction: 1 | -1) => {
        let i = start
        while (i >= 0 && i < tour.steps.length) {
          const step = tour.steps[i]

          if (step.navigateTo && options?.onBeforeStep) {
            await options.onBeforeStep(step.navigateTo, i)
          }

          if (await settleStep(step)) {
            if (driverRef.current?.isActive()) driverRef.current.moveTo(i)
            else driverRef.current?.drive(i)
            setStep(i)
            return
          }

          console.warn(`[tour] skipping step ${i}: element not found (${step.element})`)
          dumpSelectors()
          i += direction
        }

        // Ran off either end with nothing showable — finish the tour.
        driverRef.current?.destroy()
        driverRef.current = null
        stopTour()
      }

      driverRef.current = driver({
        ...tour.driverConfig,
        showProgress: true,
        animate: true,
        allowClose: true,
        steps,

        onNextClick: async () => {
          const current = driverRef.current?.getActiveIndex() ?? 0
          await showFrom(current + 1, 1)
        },

        onPrevClick: async () => {
          const current = driverRef.current?.getActiveIndex() ?? 0
          await showFrom(current - 1, -1)
        },

        onDestroyStarted: () => {
          driverRef.current?.destroy()
          stopTour()
        },
      })

      // Drive the first showable step (skipping any leading missing elements).
      await showFrom(0, 1)
    },
    [startTour, stopTour, setStep, options]
  )

  const stop = useCallback(() => {
    driverRef.current?.destroy()
    driverRef.current = null
    stopTour()
  }, [stopTour])

  return { run, stop }
}
