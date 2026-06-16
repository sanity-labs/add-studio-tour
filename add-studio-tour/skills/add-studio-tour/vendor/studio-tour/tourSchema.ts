import { defineType, defineField, defineArrayMember } from 'sanity'
import type { ResolvedTourConfig } from './types'
import {
  CHROME_TARGET_LABELS,
  DEFAULT_CHROME_SELECTORS,
  HIDDEN_CHROME_KEYS,
} from './targeting'

/**
 * Tours are authored as documents (default type name `tour`). This file defines
 * that document type. The pure targeting logic (chrome selectors,
 * `resolveTargetSelector`, `mapTour`) lives in `targeting.ts` so it can be unit
 * tested without React/Sanity; the runtime fetch+map lives in `useTours.ts`.
 *
 * Re-exported here for back-compat — existing imports resolve these from
 * `./tourSchema`.
 */
export { DEFAULT_CHROME_SELECTORS, resolveTargetSelector } from './targeting'

export function createTourType(config: ResolvedTourConfig) {
  const { schemaTypeName, docTypes, fieldTargets, chromeSelectors } = config

  // Origin tag shown in the dropdown so authors can tell a native Sanity Studio
  // target apart from one this studio added. Keys present in
  // DEFAULT_CHROME_SELECTORS ship with the plugin and point at Sanity's own
  // `data-testid`s ("Sanity"); any other key came from `chromeSelectors` in this
  // studio's sanity.config.ts ("Studio"). Field targets use the plugin's own
  // `data-tour-field` attribute ("Field"). See SELECTORS.md.
  const chromeOptions = Object.keys(chromeSelectors)
    // Hide back-compat aliases from the authoring dropdown.
    .filter((key) => !HIDDEN_CHROME_KEYS.has(key))
    .map((key) => {
      const label = CHROME_TARGET_LABELS[key] ?? key
      const origin = key in DEFAULT_CHROME_SELECTORS ? 'Sanity' : 'Studio'
      return { title: `${label} — ${origin}`, value: key }
    })

  const targetOptions = [
    ...chromeOptions,
    ...fieldTargets.map((f) => ({
      title: `${f.title} — Field`,
      value: `field:${f.field}`,
    })),
  ]

  return defineType({
    name: schemaTypeName,
    title: 'Guided Tour',
    type: 'document',
    fields: [
      defineField({
        name: 'label',
        title: 'Tour name',
        type: 'string',
        validation: (r) => r.required(),
      }),
      defineField({
        name: 'description',
        title: 'Description',
        type: 'text',
        rows: 2,
        description: 'Shown on the tour card in the launcher.',
      }),
      defineField({
        name: 'steps',
        title: 'Steps',
        type: 'array',
        validation: (r) => r.min(1),
        of: [
          defineArrayMember({
            type: 'object',
            name: 'tourStep',
            fields: [
              defineField({
                name: 'title',
                title: 'Step title',
                type: 'string',
                validation: (r) => r.required(),
              }),
              defineField({
                name: 'description',
                title: 'Step copy',
                type: 'text',
                rows: 3,
                description: 'The popover body. Basic HTML is supported.',
              }),
              defineField({
                name: 'target',
                title: 'Highlight',
                type: 'string',
                description: 'What this step points at in the Studio.',
                options: { list: targetOptions },
              }),
              defineField({
                name: 'openDocument',
                title: 'Open document first',
                type: 'reference',
                to: docTypes.map((t) => ({ type: t })),
                hidden: docTypes.length === 0,
                description:
                  'Optional: navigate to this document before highlighting (opens via the edit intent).',
              }),
              defineField({
                name: 'openPath',
                title: 'Open structure pane first',
                type: 'string',
                description:
                  'Optional: navigate to a workspace-relative router path before this step — use it to reveal a structure list pane (and its "+" create button) that no document/tool opens. Copy everything from "/structure" onward out of the Studio URL, e.g. "/structure/pagesByPath;all-pages-list". Then set Highlight to "pane-create". Used when no document is set above.',
              }),
              defineField({
                name: 'openTool',
                title: 'Open tool first',
                type: 'string',
                description:
                  'Optional: navigate to a Studio tool by name (e.g. "presentation", "structure", "vision") before this step. Used when no document or structure pane is set above.',
              }),
              defineField({
                name: 'side',
                title: 'Popover side',
                type: 'string',
                description: 'Preferred side; auto-flips if there is no room there.',
                options: { list: ['top', 'right', 'bottom', 'left'] },
                initialValue: 'bottom',
              }),
              defineField({
                name: 'align',
                title: 'Popover alignment',
                type: 'string',
                description: 'How the popover aligns along its side.',
                options: { list: ['start', 'center', 'end'] },
                initialValue: 'center',
              }),
              defineField({
                name: 'delay',
                title: 'Delay (ms)',
                type: 'number',
                description: 'Only used for steps with no highlight target.',
              }),
            ],
            preview: {
              select: { title: 'title', target: 'target' },
              prepare: ({ title, target }) => ({
                title: title || '(untitled step)',
                subtitle: target,
              }),
            },
          }),
        ],
      }),
    ],
    preview: {
      select: { title: 'label', steps: 'steps' },
      prepare: ({ title, steps }) => ({
        title: title || '(untitled tour)',
        subtitle: `${steps?.length ?? 0} steps`,
      }),
    },
  })
}
