import type { TourProgressDoc, TourProgressStatus } from './types'
import { workspaceScopeFilter } from './targeting'

/**
 * Pure, dependency-free helpers for per-user tour progress. Kept free of React /
 * Sanity (mirrors `targeting.ts`) so the id scheme, the document shape, and the
 * GROQ live in one tested place. The runtime client wiring lives in
 * `useTourProgress.tsx`.
 *
 * One document PER PLAY (per run), not per (user × tour): each start/Start over
 * mints a fresh `runId` and a new doc, so a user's history is preserved (e.g.
 * two completed runs + one incomplete) instead of the latest run overwriting the
 * rest. Resume continues the most-recent unfinished run's doc.
 */

/** Sanity doc ids allow [a-zA-Z0-9._-]; coerce any other char (rare in user / tour / run ids) to '-'. */
export function sanitizeIdPart(part: string): string {
  return part.replace(/[^a-zA-Z0-9_-]/g, '-')
}

/**
 * **Published** id for a single play's progress doc:
 * `<type>.<user>.<tour>.<run>`. The `runId` is unique per run, so each play gets
 * its own doc (no overwrite). Reconstructable from (user, tour, runId) so the
 * lifecycle patches the right doc without a lookup. Never prefixed with `drafts.`
 * — progress is published content the launcher reads.
 */
export function progressDocId(
  typeName: string,
  userId: string,
  tourId: string,
  runId: string
): string {
  return `${typeName}.${sanitizeIdPart(userId)}.${sanitizeIdPart(tourId)}.${sanitizeIdPart(runId)}`
}

export interface ProgressIdentity {
  id: string
  name?: string
  email?: string
}

export interface BuildProgressDocInput {
  typeName: string
  /** Unique id for THIS run/play — makes the doc id unique so plays don't overwrite. */
  runId: string
  user: ProgressIdentity
  tourId: string
  tourLabel: string
  totalSteps: number
  workspace: string
  /** ISO timestamp — passed in so this stays pure/testable (no Date here). */
  now: string
}

/**
 * The full doc written when a play starts (via `createOrReplace` — unique id, so
 * effectively a create). `tourId` is stored as a plain string and `tourLabel` is
 * snapshotted — NOT a reference — so a tour edit/reseed (new ids) can't orphan
 * progress, mirroring the `openDocument` hard-reference lesson. `runId` is stored
 * so the resume query can hand it back to continue this exact play.
 */
export function buildProgressDoc(input: BuildProgressDocInput) {
  const { typeName, runId, user, tourId, tourLabel, totalSteps, workspace, now } = input
  return {
    _id: progressDocId(typeName, user.id, tourId, runId),
    _type: typeName,
    runId,
    user: user.id,
    userName: user.name,
    userEmail: user.email,
    tourId,
    tourLabel,
    workspace,
    status: 'in_progress' as TourProgressStatus,
    currentStep: 0,
    totalSteps,
    startedAt: now,
    updatedAt: now,
    completedAt: null as string | null,
  }
}

/**
 * The current user's resumable plays — drives the launcher's "Resume". Includes
 * both `in_progress` (actively running / left mid-run) and `incomplete` (closed
 * early); `completed` is excluded. Ordered newest-first so the launcher can take
 * the most-recent unfinished play per tour (and resume that exact run via runId).
 */
export const RESUME_QUERY =
  '*[_type == $type && user == $user && status in ["in_progress", "incomplete"]] | order(updatedAt desc){ tourId, runId, currentStep, totalSteps, updatedAt }'

/** Tour ids the current user has completed — drives the "Completed" pill in the launcher. */
export const COMPLETED_QUERY =
  '*[_type == $type && user == $user && status == "completed"]{ tourId }'

/** Every play doc, most-recent activity first — drives the optional admin dashboard. */
export const DASHBOARD_QUERY =
  '*[_type == $type] | order(updatedAt desc){ _id, user, userName, userEmail, tourId, tourLabel, workspace, status, currentStep, totalSteps, startedAt, updatedAt, completedAt }'

/**
 * Every authored tour (published only), label-sorted — so the dashboard can list
 * tours that have no plays yet. When `scope` is set (central management), it's
 * filtered to that workspace's tours + untagged/global ones, mirroring the
 * launcher's `useTours` filter. `$tourType` (and `$scope` when scoped) are params.
 */
export const buildTourListQuery = (scope: string | null): string =>
  `*[_type == $tourType && !(_id in path("drafts.**"))${workspaceScopeFilter(
    scope
  )}]{ _id, label } | order(label asc)`

// ─── Pure view helpers (tested; no React/Sanity) ───────────────────────────────

export interface ResumablePlay {
  /** The play to continue — its runId, so Resume patches that exact doc. */
  runId: string
  currentStep: number
  totalSteps: number
}

/**
 * Reduce the resume query rows (ordered newest-first) to one entry per tour: the
 * most-recent unfinished play. Rows without a `runId` (legacy one-doc-per-tour
 * data) are skipped — they can't be resumed under the per-play model.
 */
export function latestResumableByTour(
  rows: Array<{ tourId?: string; runId?: string; currentStep?: number; totalSteps?: number }>
): Record<string, ResumablePlay> {
  const map: Record<string, ResumablePlay> = {}
  for (const row of rows) {
    if (row?.tourId && row.runId && !(row.tourId in map)) {
      map[row.tourId] = {
        runId: row.runId,
        currentStep: row.currentStep ?? 0,
        totalSteps: row.totalSteps ?? 0,
      }
    }
  }
  return map
}

export interface ProgressUserGroup {
  key: string
  name: string
  email?: string
  rows: TourProgressDoc[]
}

export interface ProgressTourGroup {
  id: string
  label: string
  entries: TourProgressDoc[]
  users: ProgressUserGroup[]
  counts: { in_progress: number; completed: number; incomplete: number }
}

function groupEntriesByUser(entries: TourProgressDoc[]): ProgressUserGroup[] {
  const um = new Map<string, ProgressUserGroup>()
  for (const r of entries) {
    const key = r.user || r.userName || '(unknown)'
    let g = um.get(key)
    if (!g) {
      g = { key, name: r.userName || r.user || '(unknown user)', email: r.userEmail, rows: [] }
      um.set(key, g)
    }
    g.rows.push(r)
  }
  return [...um.values()]
}

function tallyStatuses(entries: TourProgressDoc[]) {
  const c = { in_progress: 0, completed: 0, incomplete: 0 }
  for (const r of entries) if (r.status && r.status in c) c[r.status as keyof typeof c] += 1
  return c
}

/**
 * Shape the dashboard: every tour (even unplayed) → its plays grouped by user,
 * with a per-tour status tally. `entries` should already be newest-first
 * (DASHBOARD_QUERY); that order is preserved. With `includeOrphans`, plays whose
 * tour isn't in `tours` are appended under their snapshot label (a deleted tour);
 * pass `false` when `tours` is scope-filtered so out-of-scope plays don't leak in.
 */
export function buildTourGroups(
  tours: Array<{ _id: string; label?: string }>,
  entries: TourProgressDoc[],
  includeOrphans = true
): ProgressTourGroup[] {
  const byTour = new Map<string, TourProgressDoc[]>()
  for (const r of entries) {
    const k = r.tourId || '(unknown)'
    const arr = byTour.get(k) ?? []
    arr.push(r)
    byTour.set(k, arr)
  }
  const build = (id: string, label: string, es: TourProgressDoc[]): ProgressTourGroup => ({
    id,
    label,
    entries: es,
    users: groupEntriesByUser(es),
    counts: tallyStatuses(es),
  })
  const seen = new Set<string>()
  const list: ProgressTourGroup[] = []
  for (const t of tours) {
    seen.add(t._id)
    list.push(build(t._id, t.label || '(untitled tour)', byTour.get(t._id) ?? []))
  }
  if (includeOrphans) {
    for (const [tourId, es] of byTour) {
      if (!seen.has(tourId)) list.push(build(tourId, es[0]?.tourLabel || tourId, es))
    }
  }
  return list
}
