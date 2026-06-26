import { useEffect, useMemo, useState } from 'react'
import { useClient, useCurrentUser, useWorkspace } from 'sanity'
import {
  buildProgressDoc,
  progressDocId,
  buildTourListQuery,
  latestResumableByTour,
  RESUME_QUERY,
  COMPLETED_QUERY,
  type ResumablePlay,
} from './progress'
import type { ResolvedProgressConfig, ResolvedTourConfig, TourDefinition } from './types'

/**
 * Per-user tour progress (write side) + live resume/observe (read side).
 *
 * Progress docs live in a PRIVATE add-on dataset (default `comments`, the one
 * Sanity provisions for Comments/Tasks — private, complimentary, and already
 * paired to the project). We reach it with a `withConfig({ dataset })` client
 * rather than the `@internal` `useAddonDataset` hook, so this doesn't pin to a
 * Studio-internal API. Reads use the Live Content API (sync-tag refetch) for
 * sub-second updates without CDN polling.
 *
 * Hard rule: a failed progress write must NEVER break a tour. Every mutation is
 * fire-and-forget with a swallowed rejection.
 */

const API_VERSION = '2024-10-01'

// Every call carries the `runId` of the active play, so the lifecycle patches
// the exact per-play doc (fresh start mints a new one; resume reuses the existing).
export interface TourProgressApi {
  start: (tour: TourDefinition, runId: string) => void
  advance: (tour: TourDefinition, runId: string, stepIndex: number) => void
  complete: (tour: TourDefinition, runId: string) => void
  /** User closed the tour before finishing → mark `incomplete` (still resumable). */
  leave: (tour: TourDefinition, runId: string, stepIndex: number) => void
}

const NOOP: TourProgressApi = {
  start: () => {},
  advance: () => {},
  complete: () => {},
  leave: () => {},
}

// Module-level so a dataset-level problem warns ONCE per dataset+status, not on
// every tour step (writes) or live refetch (reads). Keyed `${dataset}:${status}`.
const warnedDatasets = new Set<string>()

function progressErrorStatus(err: unknown): number | undefined {
  const e = err as { statusCode?: number; response?: { statusCode?: number } }
  return e?.statusCode ?? e?.response?.statusCode
}

/**
 * The two ways the progress dataset trips things up: it doesn't exist (404) or
 * the current user can't access it (403). Both must NEVER break a tour — if `err`
 * is one of these, log a single actionable warning per dataset+status and return
 * true so the caller stays quiet (progress just no-ops). Any other error returns
 * false so the caller logs it normally.
 */
function warnProgressUnavailable(dataset: string | undefined, err: unknown): boolean {
  const status = progressErrorStatus(err)
  if (status !== 404 && status !== 403) return false
  const ds = dataset ?? '(unknown)'
  const key = `${ds}:${status}`
  if (warnedDatasets.has(key)) return true
  warnedDatasets.add(key)
  if (status === 404) {
    console.warn(
      `[tour] progress dataset "${ds}" does not exist — progress, resume, and the ` +
        `dashboard are disabled (tours still run). Point progress.dataset at a ` +
        `dataset that exists (by default this is the studio's own content dataset).`
    )
  } else {
    console.warn(
      `[tour] access forbidden (403) on progress dataset "${ds}" — progress, ` +
        `resume, and the dashboard are disabled (tours still run). The current ` +
        `user needs write access to it. NOTE: a Comments "<dataset>-comments" ` +
        `add-on dataset always 403s here — its managed grants only allow ` +
        `comment/task types; use the content dataset or a separate private one.`
    )
  }
  return true
}

/**
 * A client bound to the progress dataset, or null when disabled. When no dataset
 * is configured, defaults to the studio's own (active) content dataset — a
 * regular dataset governed by project roles, so admins and normal write-roles can
 * persist progress. (The Comments `<dataset>-comments` add-on dataset is NOT used:
 * its managed grants only permit comment/task types and reject custom types.)
 * Override `progress.dataset` to keep this telemetry in a separate private dataset.
 */
function useProgressClient(progress: ResolvedProgressConfig) {
  const base = useClient({ apiVersion: API_VERSION })
  const { enabled, dataset } = progress
  return useMemo(() => {
    if (!enabled) return null
    const target = dataset ?? base.config().dataset
    return base.withConfig({ dataset: target, useCdn: false })
  }, [base, enabled, dataset])
}

export function useTourProgress(config: ResolvedTourConfig): TourProgressApi {
  const client = useProgressClient(config.progress)
  const user = useCurrentUser()
  const { name: workspace } = useWorkspace()
  const { typeName } = config.progress

  return useMemo<TourProgressApi>(() => {
    if (!client || !user) return NOOP

    const idOf = (tour: TourDefinition, runId: string) =>
      progressDocId(typeName, user.id, tour.id, runId)
    const swallow = (p: Promise<unknown>) =>
      void Promise.resolve(p).then(
        () => undefined,
        (err) => {
          if (!warnProgressUnavailable(client.config().dataset, err))
            console.warn('[tour] progress write failed (ignored)', err)
        }
      )
    const now = () => new Date().toISOString()

    return {
      // Fresh start (incl. "Start over") → a brand-new play doc (unique runId), so
      // it never overwrites a prior run. Resume doesn't call this; it patches the
      // existing run's doc via advance below.
      start: (tour, runId) =>
        swallow(
          client.createOrReplace(
            buildProgressDoc({
              typeName,
              runId,
              user: { id: user.id, name: user.name, email: user.email },
              tourId: tour.id,
              tourLabel: tour.label,
              totalSteps: tour.steps.length,
              workspace,
              now: now(),
            })
          )
        ),
      advance: (tour, runId, stepIndex) =>
        // Also flips status back to in_progress so a *resumed* play (which was
        // `incomplete`) reads as running again until it's next completed or left.
        swallow(
          client
            .patch(idOf(tour, runId))
            .set({ status: 'in_progress', currentStep: stepIndex, updatedAt: now() })
            .commit()
        ),
      complete: (tour, runId) =>
        swallow(
          client
            .patch(idOf(tour, runId))
            .set({
              status: 'completed',
              currentStep: Math.max(0, tour.steps.length - 1),
              updatedAt: now(),
              completedAt: now(),
            })
            .commit()
        ),
      leave: (tour, runId, stepIndex) =>
        swallow(
          client
            .patch(idOf(tour, runId))
            .set({ status: 'incomplete', currentStep: stepIndex, updatedAt: now() })
            .commit()
        ),
    }
  }, [client, user, workspace, typeName])
}

/**
 * Generic Live Content API subscription: initial fetch (capturing sync tags),
 * then refetch whenever a live event's tags intersect them. Falls back to a
 * one-shot fetch if the client build predates `client.live`.
 */
export function useLiveRows<T = unknown>(
  progress: ResolvedProgressConfig,
  query: string,
  params: Record<string, string>
): { rows: T[]; loading: boolean } {
  const client = useProgressClient(progress)
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const paramsKey = JSON.stringify(params)

  useEffect(() => {
    if (!client) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    let syncTags: string[] = []

    const refetch = async (lastLiveEventId?: string) => {
      try {
        const res = (await client.fetch(query, params, {
          filterResponse: false,
          ...(lastLiveEventId ? { lastLiveEventId } : {}),
        } as never)) as { result?: T[]; syncTags?: string[] }
        if (cancelled) return
        syncTags = res?.syncTags ?? []
        setRows((res?.result ?? []) as T[])
      } catch (err) {
        if (!cancelled && !warnProgressUnavailable(client.config().dataset, err))
          console.warn('[tour] live query failed', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void refetch()

    const live = (client as { live?: { events?: () => { subscribe: (o: unknown) => { unsubscribe: () => void } } } }).live
    if (!live?.events) return () => {
      cancelled = true
    }
    const sub = live.events().subscribe({
      next: (event: { type?: string; id?: string; tags?: string[] }) => {
        if (event?.type === 'message' && Array.isArray(event.tags) && event.tags.some((t) => syncTags.includes(t))) {
          void refetch(event.id)
        } else if (event?.type === 'restart') {
          void refetch()
        }
      },
      error: (err: unknown) => console.warn('[tour] live events error', err),
    } as never) as { unsubscribe: () => void }

    return () => {
      cancelled = true
      sub.unsubscribe()
    }
    // params is captured via paramsKey; query is a stable module constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, query, paramsKey])

  return { rows, loading }
}

/** Re-exported for the launcher/controller — the shape used to drive "Resume". */
export type ResumeInfo = ResumablePlay

/**
 * Live map of the current user's resumable tours, keyed by tourId → the most
 * recent unfinished play (see `latestResumableByTour`). Empty when disabled.
 */
export function useResumeState(config: ResolvedTourConfig): Record<string, ResumeInfo> {
  const user = useCurrentUser()
  const { typeName } = config.progress
  const params = useMemo(
    () => ({ type: typeName, user: user?.id ?? '__no-user__' }),
    [typeName, user?.id]
  )
  const { rows } = useLiveRows<{
    tourId?: string
    runId?: string
    currentStep?: number
    totalSteps?: number
  }>(config.progress, RESUME_QUERY, params)
  return useMemo(() => latestResumableByTour(rows), [rows])
}

/**
 * Live list of every authored tour in the active CONTENT dataset (regardless of
 * where progress is stored) — so the dashboard can show tours with no plays yet.
 * `workspaceScope` mirrors the launcher's scope filter (central management).
 */
export function useActiveTours(
  schemaTypeName: string,
  workspaceScope: string | null
): { tours: { _id: string; label?: string }[]; loading: boolean } {
  // dataset: null → the active content dataset, where tour documents live.
  const cfg = useMemo<ResolvedProgressConfig>(
    () => ({ enabled: true, dataset: null, typeName: schemaTypeName }),
    [schemaTypeName]
  )
  const query = useMemo(() => buildTourListQuery(workspaceScope), [workspaceScope])
  const params = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = { tourType: schemaTypeName }
    if (workspaceScope) p.scope = workspaceScope
    return p
  }, [schemaTypeName, workspaceScope])
  const { rows, loading } = useLiveRows<{ _id: string; label?: string }>(cfg, query, params)
  return { tours: rows, loading }
}

/**
 * Live set of tour ids the current user has completed. Separate from the resume
 * map (which excludes `completed` on purpose), so it can drive a "Completed" pill
 * on the launcher's tour list. Empty when progress is off.
 */
export function useCompletedTours(config: ResolvedTourConfig): Set<string> {
  const user = useCurrentUser()
  const { typeName } = config.progress
  const params = useMemo(
    () => ({ type: typeName, user: user?.id ?? '__no-user__' }),
    [typeName, user?.id]
  )
  const { rows } = useLiveRows<{ tourId?: string }>(config.progress, COMPLETED_QUERY, params)
  return useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) if (row?.tourId) set.add(row.tourId)
    return set
  }, [rows])
}
