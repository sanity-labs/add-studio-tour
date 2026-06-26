/**
 * Unit tests for the pure tour-progress contract (vendor/studio-tour/progress.ts):
 * the deterministic id scheme and the start-doc shape. No DOM, React, or Sanity.
 *
 * Run (from this skill dir): npx tsx --test tests/progress.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildProgressDoc,
  progressDocId,
  sanitizeIdPart,
  buildTourListQuery,
  latestResumableByTour,
  buildTourGroups,
  RESUME_QUERY,
  COMPLETED_QUERY,
  DASHBOARD_QUERY,
} from '../vendor/studio-tour/progress.ts'

test('sanitizeIdPart: keeps letters/digits/_/-, collapses everything else (incl. the "." delimiter) to "-"', () => {
  assert.equal(sanitizeIdPart('pAbc_123-XYZ'), 'pAbc_123-XYZ')
  // "." is the id's own separator, so it's not allowed inside a part.
  assert.equal(sanitizeIdPart('pAbc.4'), 'pAbc-4')
  assert.equal(sanitizeIdPart('user@example.com'), 'user-example-com')
  assert.equal(sanitizeIdPart('a/b c:d'), 'a-b-c-d')
})

test('progressDocId: per-play `<type>.<user>.<tour>.<run>`, sanitized, no drafts prefix', () => {
  const id = progressDocId('studioTourProgress', 'pUser1', 'tour-abc', 'run-1')
  assert.equal(id, 'studioTourProgress.pUser1.tour-abc.run-1')
  assert.ok(!id.startsWith('drafts.'))
  // A different run → a different id (so plays don't overwrite each other).
  assert.notEqual(id, progressDocId('studioTourProgress', 'pUser1', 'tour-abc', 'run-2'))
  // Same inputs → same id (so resume continues the same play doc).
  assert.equal(id, progressDocId('studioTourProgress', 'pUser1', 'tour-abc', 'run-1'))
})

test('buildProgressDoc: in_progress at step 0, stores runId, snapshots tour label, no reference', () => {
  const doc = buildProgressDoc({
    typeName: 'studioTourProgress',
    runId: 'run-1',
    user: { id: 'pUser1', name: 'Ada', email: 'ada@example.com' },
    tourId: 'tour-abc',
    tourLabel: 'Create a landing page',
    totalSteps: 8,
    workspace: 'marketing',
    now: '2026-06-25T00:00:00.000Z',
  })
  assert.equal(doc._id, 'studioTourProgress.pUser1.tour-abc.run-1')
  assert.equal(doc._type, 'studioTourProgress')
  assert.equal(doc.runId, 'run-1')
  assert.equal(doc.status, 'in_progress')
  assert.equal(doc.currentStep, 0)
  assert.equal(doc.totalSteps, 8)
  assert.equal(doc.tourId, 'tour-abc')
  assert.equal(doc.tourLabel, 'Create a landing page')
  assert.equal(doc.user, 'pUser1')
  assert.equal(doc.userEmail, 'ada@example.com')
  assert.equal(doc.completedAt, null)
  assert.equal(doc.startedAt, '2026-06-25T00:00:00.000Z')
  // tourId is a plain string, never a reference (so reseeds can't orphan it).
  assert.equal(typeof doc.tourId, 'string')
  assert.ok(!('_ref' in (doc as Record<string, unknown>)))
})

test('queries: resume filters to the current user + unfinished (in_progress|incomplete), newest-first with runId; dashboard is unfiltered', () => {
  assert.match(RESUME_QUERY, /_type == \$type/)
  assert.match(RESUME_QUERY, /user == \$user/)
  // Resumable = not completed: both in_progress and incomplete plays show up.
  assert.match(RESUME_QUERY, /status in \["in_progress", "incomplete"\]/)
  assert.doesNotMatch(RESUME_QUERY, /"completed"/)
  // Ordered newest-first and returns runId so the launcher resumes the latest play.
  assert.match(RESUME_QUERY, /order\(updatedAt desc\)/)
  assert.match(RESUME_QUERY, /runId/)
  assert.match(DASHBOARD_QUERY, /order\(updatedAt desc\)/)
  assert.doesNotMatch(DASHBOARD_QUERY, /user == \$user/)
})

test('COMPLETED_QUERY: filters to the current user + completed', () => {
  assert.match(COMPLETED_QUERY, /_type == \$type/)
  assert.match(COMPLETED_QUERY, /user == \$user/)
  assert.match(COMPLETED_QUERY, /status == "completed"/)
})

test('buildTourListQuery: unscoped lists all published tours; scoped adds the workspaces predicate', () => {
  const all = buildTourListQuery(null)
  assert.match(all, /_type == \$tourType/)
  assert.match(all, /!\(_id in path\("drafts\.\*\*"\)\)/) // published only
  assert.doesNotMatch(all, /workspaces/)
  const scoped = buildTourListQuery('marketing')
  assert.match(scoped, /\$scope in workspaces/)
  // untagged tours stay visible as global
  assert.match(scoped, /!defined\(workspaces\) \|\| count\(workspaces\) == 0/)
})

test('latestResumableByTour: most-recent play per tour; skips rows without runId', () => {
  const map = latestResumableByTour([
    { tourId: 'a', runId: 'a2', currentStep: 5, totalSteps: 8 }, // newest (kept)
    { tourId: 'a', runId: 'a1', currentStep: 2, totalSteps: 8 }, // older (ignored)
    { tourId: 'b', currentStep: 3, totalSteps: 4 }, // no runId → skipped
    { tourId: 'c', runId: 'c1', currentStep: 1, totalSteps: 3 },
  ])
  assert.deepEqual(Object.keys(map).sort(), ['a', 'c'])
  assert.equal(map.a.runId, 'a2')
  assert.equal(map.a.currentStep, 5)
})

test('buildTourGroups: lists every tour (even unplayed), groups plays by user, tallies status', () => {
  const tours = [
    { _id: 'tour-x', label: 'Tour X' },
    { _id: 'tour-y', label: 'Tour Y' },
  ]
  const mk = (over) => ({
    _id: '', _type: 'studioTourProgress', user: 'u1', userName: 'Ada', tourId: 'tour-x',
    tourLabel: 'Tour X', workspace: 'default', status: 'completed', currentStep: 7,
    totalSteps: 8, startedAt: '', updatedAt: '', ...over,
  })
  const groups = buildTourGroups(tours, [
    mk({ _id: '1', status: 'completed' }),
    mk({ _id: '2', status: 'incomplete', currentStep: 3 }),
    mk({ _id: '3', user: 'u2', userName: 'Grace', status: 'in_progress', currentStep: 1 }),
  ])
  assert.equal(groups.length, 2)
  const x = groups.find((g) => g.id === 'tour-x')
  assert.equal(x.entries.length, 3)
  assert.equal(x.users.length, 2) // Ada (2 plays) + Grace (1)
  assert.deepEqual(x.counts, { in_progress: 1, completed: 1, incomplete: 1 })
  const y = groups.find((g) => g.id === 'tour-y')
  assert.equal(y.entries.length, 0) // unplayed tour still listed
})

test('buildTourGroups: orphan plays (deleted tour) appended only when orphans are included', () => {
  const tours = [{ _id: 'tour-x', label: 'Tour X' }]
  const orphan = {
    _id: 'o1', _type: 'studioTourProgress', user: 'u1', tourId: 'gone', tourLabel: 'Deleted Tour',
    workspace: 'default', status: 'completed', currentStep: 1, totalSteps: 1, startedAt: '', updatedAt: '',
  }
  assert.ok(buildTourGroups(tours, [orphan], true).some((g) => g.id === 'gone'))
  // scoped (includeOrphans=false) → out-of-scope/orphan plays don't leak in
  assert.ok(!buildTourGroups(tours, [orphan], false).some((g) => g.id === 'gone'))
})
