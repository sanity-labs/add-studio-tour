import { useCallback, useEffect, useRef } from 'react'
import { useWorkspace } from 'sanity'
import { driver } from 'driver.js'
import type { DriveStep, Driver } from 'driver.js'
import type { NavTarget, TourDefinition, TourStep } from './types'
import { ensureDriverStyles } from './driverStyles'
import { escapeHtml } from './portableText'
import { useTourStore } from './store'

/**
 * A unique-enough id for one tour run (play). Prefers `crypto.randomUUID`, but
 * that's only defined in a secure context — a Studio served over plain
 * `http://<lan-ip>` would otherwise throw here and break the whole tour, not just
 * progress. Falls back to a timestamp+random id so `run()` never throws.
 */
function makeRunId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fall through to the non-crypto id */
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

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
  // A target was authored but maps to no selector (unknown/removed chrome key):
  // treat as a miss immediately — don't burn 6s waiting on a selector that can't
  // exist, and don't fall through to the "no element → centered popover" path.
  if (step.unresolvedTarget) return false
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
// Every callback gets the active play's `runId` so progress writes hit the exact
// per-play doc. A fresh run mints a new runId; a resume reuses the existing one.
export interface TourLifecycle {
  onBeforeStep?: (navigateTo: NavTarget | undefined, stepIndex: number) => Promise<void> | void
  /** Fired once when a tour starts fresh (not on resume). Good for createOrReplace. */
  onStart?: (tour: TourDefinition, runId: string) => void
  /** Fired each time a step is shown, with its index. */
  onStep?: (tour: TourDefinition, runId: string, stepIndex: number) => void
  /** Fired when the user advances past the last step. */
  onComplete?: (tour: TourDefinition, runId: string) => void
  /** Fired when the tour is closed before completing, with the last shown index. */
  onLeave?: (tour: TourDefinition, runId: string, stepIndex: number) => void
  /**
   * Fired when a step is skipped because its target selector never resolved —
   * i.e. a broken/out-of-date step. At most once per step index per run (the
   * caller dedupes), so persisting it can't grow unbounded on back/forth nav.
   */
  onMissedStep?: (tour: TourDefinition, runId: string, stepIndex: number) => void
}

export interface RunOptions {
  /** Step index to begin at (for resume). Defaults to 0. */
  startAt?: number
  /**
   * The play to (re)write. Omit for a fresh play — a new id is minted. On resume,
   * pass the unfinished play's runId so its existing doc is continued.
   */
  runId?: string
}

export function useTour(options?: TourLifecycle) {
  const driverRef = useRef<Driver | null>(null)
  // Tracks how the current run ends so completion and leaving fire exactly
  // once each, regardless of whether driver.js's onDestroyStarted also fires.
  const outcomeRef = useRef<'running' | 'completed' | 'left'>('running')
  const activeTourRef = useRef<TourDefinition | null>(null)
  const lastIndexRef = useRef(0)
  // The active play's run id, threaded into every progress lifecycle callback.
  const runIdRef = useRef<string>('')
  // Bumped on every run(), and on stop()/close/workspace-change. The async step
  // loop captures the generation it started under and bails after each await if
  // it no longer matches — so a tour closed mid-settle can't later revive the
  // destroyed driver (zombie overlay) or patch progress back to in_progress.
  const runGenRef = useRef(0)
  const startTour = useTourStore((s) => s.startTour)
  const stopTour = useTourStore((s) => s.stopTour)
  const setStep = useTourStore((s) => s.setStep)
  // The active workspace name stands in for the old `activeVertical`.
  const { name: workspaceName } = useWorkspace()

  // When the workspace changes, driver.js may still hold references to DOM
  // nodes from the previous workspace's view. Tear it down cleanly.
  useEffect(() => {
    return () => {
      // Invalidate any in-flight run so a pending settle can't touch the
      // torn-down driver after the workspace changes.
      runGenRef.current++
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [workspaceName])

  const run = useCallback(
    async (tour: TourDefinition, runOptions?: RunOptions) => {
      // driver.js styles are injected at runtime (a JS-only library build can't
      // ship a CSS import that survives to the consumer's bundler).
      ensureDriverStyles()
      startTour(tour.id)

      // Reset per-run outcome tracking. Bump the generation so any earlier run's
      // in-flight settle is invalidated and this run owns the driver.
      const myGen = ++runGenRef.current
      outcomeRef.current = 'running'
      activeTourRef.current = tour
      // Resume passes the unfinished play's runId; a fresh run mints a new one
      // (so it becomes its own play doc rather than overwriting a prior run).
      const runId = runOptions?.runId ?? makeRunId()
      runIdRef.current = runId
      const lastStep = Math.max(0, tour.steps.length - 1)
      const startAt = Math.min(Math.max(0, runOptions?.startAt ?? 0), lastStep)
      lastIndexRef.current = startAt
      // Fresh start creates the play doc at step 0. On resume (startAt > 0) we must
      // NOT — that would reset the run; per-step writes patch the existing doc.
      if (startAt === 0) options?.onStart?.(tour, runId)
      // onStart already wrote step 0, so skip the first onStep if it lands on 0 —
      // avoids a redundant second write on every fresh start. Cleared after the
      // first shown step so later navigation back to step 0 still records.
      let skipInitialStepWrite = startAt === 0

      // Dumps the available Studio selectors the first time a step is skipped.
      const dumpSelectors = makeSelectorDumper()
      // Step indices already reported as missed this run — so a back/forth that
      // re-skips the same step doesn't record (or re-write) it twice.
      const missedThisRun = new Set<number>()
      // Whether any step was actually shown this run. Guards against recording a
      // false "completed" when every step's target missed (nothing was seen).
      let shownAny = false

      const steps: DriveStep[] = tour.steps.map((step) => ({
        element: step.element,
        popover: {
          // Title is plain text → escape before driver.js innerHTMLs it, so a
          // title can't inject markup. Description is already safe HTML (built by
          // portableTextToSafeHtml in mapTour from the authored Portable Text).
          title: escapeHtml(step.title),
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
            // Bailed: the run was stopped/closed/superseded while navigating.
            if (runGenRef.current !== myGen) return
          }

          const showable = await settleStep(step)
          // Bailed: closed mid-settle. Returning here is what prevents the zombie
          // overlay and the stray in_progress patch after onLeave already fired.
          if (runGenRef.current !== myGen) return

          if (showable) {
            if (driverRef.current?.isActive()) driverRef.current.moveTo(i)
            else driverRef.current?.drive(i)
            setStep(i)
            lastIndexRef.current = i
            shownAny = true
            if (!(skipInitialStepWrite && i === 0)) options?.onStep?.(tour, runId, i)
            skipInitialStepWrite = false
            return
          }

          console.warn(
            `[tour] skipping step ${i}: ${
              step.element ? `element not found (${step.element})` : `unknown target "${step.target}"`
            }`
          )
          dumpSelectors()
          // Persist the miss (once per step index per run) so a broken tour is
          // visible in the dashboard, not only in this console.
          if (!missedThisRun.has(i)) {
            missedThisRun.add(i)
            options?.onMissedStep?.(tour, runId, i)
          }
          i += direction
        }

        // Ran off an end with nothing showable.
        if (direction === 1 && outcomeRef.current === 'running') {
          if (shownAny || startAt > 0) {
            // Forward past the last shown step (or a genuine resume) → complete.
            outcomeRef.current = 'completed'
            options?.onComplete?.(tour, runId)
          } else {
            // Every step's target missed and nothing was ever shown — do NOT
            // claim completion (that would light a false green "Completed" pill
            // and inflate the dashboard). Record it incomplete; the per-step
            // misses were already captured, so the breakage is visible.
            outcomeRef.current = 'left'
            options?.onLeave?.(tour, runId, 0)
          }
        }
        driverRef.current?.destroy()
        driverRef.current = null
        stopTour()
      }

      driverRef.current = driver({
        ...tour.driverConfig,
        showProgress: true,
        animate: true,
        allowClose: true,
        // Explicit button labels. driver.js swaps "Next" for the done button on
        // the last step, so this gives a clear "Finish" affordance there (it
        // still routes through onNextClick below → onComplete fires, then destroy).
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Finish',
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
          // Fired when the user closes the tour (X / overlay / Esc). Invalidate
          // the run first so any in-flight settle bails instead of reviving the
          // driver after we tear it down. If it didn't already complete, record
          // it incomplete at the last shown step (still resumable — not abandoned).
          runGenRef.current++
          if (outcomeRef.current === 'running') {
            outcomeRef.current = 'left'
            if (activeTourRef.current)
              options?.onLeave?.(activeTourRef.current, runIdRef.current, lastIndexRef.current)
          }
          driverRef.current?.destroy()
          driverRef.current = null
          stopTour()
        },
      })

      // Drive the first showable step (skipping any leading missing elements).
      await showFrom(startAt, 1)
    },
    [startTour, stopTour, setStep, options]
  )

  const stop = useCallback(() => {
    // Manual stop (e.g. the navbar "Stop tour" button) marks the tour incomplete.
    // Invalidate the run so any in-flight settle bails and can't re-drive.
    runGenRef.current++
    if (outcomeRef.current === 'running') {
      outcomeRef.current = 'left'
      if (activeTourRef.current)
        options?.onLeave?.(activeTourRef.current, runIdRef.current, lastIndexRef.current)
    }
    driverRef.current?.destroy()
    driverRef.current = null
    stopTour()
  }, [stopTour, options])

  return { run, stop }
}
