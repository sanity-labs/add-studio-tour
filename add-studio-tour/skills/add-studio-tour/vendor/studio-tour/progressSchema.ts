import { defineType, defineField } from 'sanity'

/**
 * The `studioTourProgress` document type (default name; override via
 * `progress.typeName`). It describes the per-(user × tour) progress docs the
 * plugin writes — see `progress.ts` for the shape and `useTourProgress.tsx` for
 * the write side.
 *
 * The docs are written to whichever dataset `progress.dataset` resolves to (by
 * default the studio's own content dataset). This type is kept OUT of the editor's
 * way: `readOnly` (telemetry, never hand-authored), hidden from global search
 * (`__experimental_omnisearchVisibility`), and filtered out of the global "Create
 * new" menu by the plugin — so it doesn't surface even when it shares the content
 * dataset. Studios with a custom desk structure simply don't list it.
 */
export function createTourProgressType(typeName: string) {
  return defineType({
    name: typeName,
    title: 'Tour Progress',
    type: 'document',
    readOnly: true,
    // Keep this telemetry type out of global search results.
    __experimental_omnisearch_visibility: false,
    description:
      'Per-user tour progress, written automatically when a user starts, ' +
      'advances, or finishes a tour. Not authored by hand.',
    fields: [
      defineField({ name: 'user', title: 'User ID', type: 'string' }),
      defineField({ name: 'userName', title: 'User name', type: 'string' }),
      defineField({ name: 'userEmail', title: 'User email', type: 'string' }),
      defineField({ name: 'tourId', title: 'Tour ID', type: 'string' }),
      defineField({ name: 'tourLabel', title: 'Tour label', type: 'string' }),
      defineField({ name: 'workspace', title: 'Workspace', type: 'string' }),
      defineField({
        name: 'status',
        title: 'Status',
        type: 'string',
        options: { list: ['in_progress', 'completed', 'incomplete'] },
      }),
      defineField({ name: 'currentStep', title: 'Current step', type: 'number' }),
      defineField({ name: 'totalSteps', title: 'Total steps', type: 'number' }),
      defineField({ name: 'startedAt', title: 'Started at', type: 'datetime' }),
      defineField({ name: 'updatedAt', title: 'Updated at', type: 'datetime' }),
      defineField({ name: 'completedAt', title: 'Completed at', type: 'datetime' }),
    ],
    preview: {
      select: {
        title: 'tourLabel',
        user: 'userName',
        status: 'status',
        step: 'currentStep',
        total: 'totalSteps',
      },
      prepare: ({ title, user, status, step, total }) => ({
        title: title || '(unknown tour)',
        subtitle: `${user || 'unknown'} · ${status || '—'} · step ${(step ?? 0) + 1}/${total || '?'}`,
      }),
    },
  })
}
