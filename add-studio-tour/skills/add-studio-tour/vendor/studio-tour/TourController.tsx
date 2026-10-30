import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useWorkspace } from 'sanity'
import { useRouter } from 'sanity/router'
import { useTour, type RunOptions } from './useTour'
import { useTours } from './useTours'
import {
  useTourProgress,
  useResumeState,
  useCompletedTours,
  useNewTours,
  type ResumeInfo,
} from './useTourProgress'
import { RevealRegistryContext } from './revealRegistry'
import { useTourStore } from './store'
import type { NavTarget, ResolvedTourConfig, TourDefinition } from './types'

/**
 * TourController
 *
 * Rendered inside <TourProvider> (so the workspace-scoped store is available),
 * and inside the Studio's router context (so it can call `useRouter()` directly
 * to navigate during a tour — the entire navBridge pub/sub of the old Vite shell
 * existed only to smuggle this fn out of <Studio>, and is gone here).
 *
 * It fetches the workspace's tours, owns the driver.js run/stop handles, and
 * exposes them via context to the navbar launcher.
 *
 * Note: `sanity/router` has no `useNavigate`. Document targets go through
 * `navigateIntent('edit', { id, type })`, which the structure resolves
 * automatically (revealing parent panes too) — far more robust than hand-built
 * `/structure/...;docId` URLs, so prefer `doc` for documents. Raw `path` targets
 * go through `navigateUrl` (workspace `basePath` prepended) — the escape hatch
 * for views no intent opens, e.g. a structure list pane and its create button.
 */
interface TourContextValue {
  tours: TourDefinition[]
  loading: boolean
  isRunning: boolean
  run: (tour: TourDefinition, options?: RunOptions) => void
  stop: () => void
  /** Current user's resumable tours, keyed by tourId. Empty when progress is off. */
  resume: Record<string, ResumeInfo>
  /** Tour ids the current user has completed. Empty when progress is off. */
  completed: Set<string>
  /** Tour ids the current user hasn't started yet (progress plays + localStorage). */
  newTours: Set<string>
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTourContext(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTourContext must be used within <TourProvider>')
  return ctx
}

export function TourController({
  config,
  children,
}: {
  config: ResolvedTourConfig
  children: ReactNode
}) {
  const router = useRouter()
  const { basePath } = useWorkspace()
  const { tours, loading } = useTours(
    config.schemaTypeName,
    config.chromeSelectors,
    config.workspaceScope
  )
  const isRunning = useTourStore((s) => s.isRunning)
  const reveal = useContext(RevealRegistryContext)

  // Collapse whatever the tour expanded, however it ended (finish, close, stop).
  useEffect(() => {
    if (!isRunning) reveal?.restore()
  }, [isRunning, reveal])
  const progress = useTourProgress(config)
  const { resume, plays, loading: playsLoading } = useResumeState(config)
  const completed = useCompletedTours(config)
  const { newTours, markSeen } = useNewTours(tours, plays, playsLoading)

  const navigate = useCallback(
    (target: NavTarget) => {
      if (target.kind === 'doc') {
        router.navigateIntent('edit', { id: target.id, type: target.type })
      } else if (target.kind === 'tool') {
        // `navigateUrl` pushes the path verbatim, so include the workspace
        // basePath (e.g. "/personal" + "/presentation").
        const root = basePath && basePath !== '/' ? basePath : ''
        router.navigateUrl({ path: `${root}/${target.tool}` })
      } else {
        // Raw router path (e.g. a structure list pane "/structure/...;node").
        // Authored workspace-relative, so prepend basePath exactly like a tool.
        const root = basePath && basePath !== '/' ? basePath : ''
        router.navigateUrl({ path: `${root}${target.path}` })
      }
    },
    [router, basePath]
  )

  const lifecycle = useMemo(
    () => ({
      onBeforeStep: async (navigateTo: NavTarget | undefined) => {
        if (navigateTo) navigate(navigateTo)
      },
      onRevealField: async (fieldPath: string, isCancelled: () => boolean) => {
        await reveal?.reveal(fieldPath, isCancelled)
      },
      onStart: progress.start,
      onStep: progress.advance,
      onComplete: progress.complete,
      onLeave: progress.leave,
      onMissedStep: progress.recordMiss,
    }),
    [navigate, progress, reveal]
  )

  const { run: runTour, stop } = useTour(lifecycle)

  const run = useCallback(
    (tour: TourDefinition, options?: RunOptions) => {
      markSeen(tour.id)
      runTour(tour, options)
    },
    [markSeen, runTour]
  )

  const value = useMemo<TourContextValue>(
    () => ({ tours, loading, isRunning, run, stop, resume, completed, newTours }),
    [tours, loading, isRunning, run, stop, resume, completed, newTours]
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}
