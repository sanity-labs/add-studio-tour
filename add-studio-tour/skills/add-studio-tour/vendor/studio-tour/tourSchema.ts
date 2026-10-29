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
  const { schemaTypeName, docTypes, fieldTargets, chromeSelectors, showWorkspaceField } = config

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
    description:
      'A step-by-step product tour shown in the Studio via popovers. ' +
      'AUTHORING RULE (open-first): most targets are nested and only exist on ' +
      'screen after you navigate to them, so a step that highlights one must ' +
      'open its location first. Per step set AT MOST ONE of: openDocument (for a ' +
      'field, the title, the Publish button, or the ··· menu — opens the doc and ' +
      'its parent panes), openPath (to open a structure list pane so its “+” ' +
      'create button renders), or openTool (to open a named tool like ' +
      '"presentation"). Precedence if several are set: openDocument > openPath > ' +
      'openTool. Global chrome (navbar, the global Create button, search) and ' +
      'intro/copy-only steps need none. The tour re-navigates per step, so EVERY ' +
      'in-document step needs its own openDocument — not just the first one.',
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
      // Central-management mode only: tag which workspaces this tour appears in.
      // Hidden unless the plugin is configured with workspaceScope /
      // manageWorkspaceScopes (a shared-dataset, global-admin setup).
      ...(showWorkspaceField
        ? [
            defineField({
              name: 'workspaces',
              title: 'Show in workspaces',
              type: 'array',
              of: [defineArrayMember({ type: 'string' })],
              description:
                'Workspace keys this tour appears in — each must match a workspace’s configured workspaceScope. Leave empty to show the tour in every workspace.',
            }),
          ]
        : []),
      defineField({
        name: 'roles',
        title: 'Show to roles',
        type: 'array',
        of: [defineArrayMember({ type: 'string' })],
        options: { layout: 'tags' },
        description:
          'Project role names (e.g. administrator, editor, or a custom role) that see this tour in the launcher. Leave empty to show it to everyone. Visibility only — not a permission boundary.',
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
                type: 'array',
                description:
                  'The popover body. Rich text — bold, italic, links, and lists ' +
                  'are supported. (Authored as Portable Text; rendered safely, so ' +
                  'pasted raw HTML is shown as text, not executed.)',
                of: [
                  defineArrayMember({
                    type: 'block',
                    // Keep the toolbar tight for short popover copy.
                    styles: [
                      { title: 'Normal', value: 'normal' },
                      { title: 'Heading', value: 'h3' },
                      { title: 'Quote', value: 'blockquote' },
                    ],
                    lists: [
                      { title: 'Bulleted', value: 'bullet' },
                      { title: 'Numbered', value: 'number' },
                    ],
                    marks: {
                      decorators: [
                        { title: 'Bold', value: 'strong' },
                        { title: 'Italic', value: 'em' },
                        { title: 'Code', value: 'code' },
                      ],
                      annotations: [
                        defineArrayMember({
                          name: 'link',
                          type: 'object',
                          title: 'Link',
                          fields: [
                            defineField({
                              name: 'href',
                              type: 'url',
                              title: 'URL',
                              validation: (r) =>
                                r.uri({ scheme: ['http', 'https', 'mailto', 'tel'] }),
                            }),
                          ],
                        }),
                      ],
                    },
                  }),
                ],
              }),
              defineField({
                name: 'target',
                title: 'Highlight',
                type: 'string',
                description:
                  'What this step points at in the Studio: a chrome key ' +
                  '(e.g. navbar, create-button, pane-create, publish-button, ' +
                  'document-title) or field:<name> (e.g. field:title). Leave ' +
                  'empty for an intro/copy-only step. If this names something ' +
                  'nested — a field, publish-button, document-title, pt-editor, ' +
                  'show-more, or pane-create — the step must also navigate there ' +
                  'first via one of the “open … first” fields below, or it ' +
                  'highlights nothing.',
                options: { list: targetOptions },
              }),
              // Only define the reference field when there are doc types to point
              // at. A `reference` with an empty `to: []` is a schema *error* (not
              // just a warning) that blocks the whole Studio from loading — and
              // `docTypes: []` is the documented default. Mirror the conditional
              // `workspaces` field above rather than relying on `hidden`, which is
              // a form-only flag and does NOT suppress the schema error.
              ...(docTypes.length > 0
                ? [
                    defineField({
                      name: 'openDocument',
                      title: 'Open document first',
                      type: 'reference',
                      to: docTypes.map((t) => ({ type: t })),
                      description:
                        'Open this document before highlighting. REQUIRED for any step ' +
                        'whose Highlight is a field, the document title, the PT editor, ' +
                        'the Publish button, or the ··· menu — those only exist once a ' +
                        'document is open. Opens via the edit intent and also reveals ' +
                        'the document’s parent panes. Point at a real, stable document; ' +
                        'every in-document step needs its own reference (the tour ' +
                        're-navigates per step). Takes precedence over the two fields below.',
                    }),
                  ]
                : []),
              defineField({
                name: 'openPath',
                title: 'Open structure pane first',
                type: 'string',
                description:
                  'Open a structure list pane before this step — the way to ' +
                  'highlight a list’s "+" create button (Highlight = pane-create) ' +
                  'or the list body (document-list), which no document or tool ' +
                  'opens. Copy everything from "/structure" onward out of the ' +
                  'Studio URL, e.g. "/structure/pagesByPath;all-pages-list" ' +
                  '(workspace-relative; basePath is added for you). MUST resolve ' +
                  'to an actual document-list pane — only those render the "+" ' +
                  'create button. In a nested/custom structure, drill ALL the way ' +
                  'to the document-list node ("…;all-pages-list"); stopping at a ' +
                  'parent grouping list ("/structure/pagesByPath" alone) opens a ' +
                  'section pane that lists items but has no "+", so pane-create ' +
                  'finds nothing. Used only when no openDocument is set above.',
              }),
              defineField({
                name: 'openTool',
                title: 'Open tool first',
                type: 'string',
                description:
                  'Open a Studio tool by name (e.g. "presentation", "structure", ' +
                  '"vision") before this step — for highlighting a tool’s own UI. ' +
                  'Lowest precedence: used only when neither openDocument nor ' +
                  'openPath is set above.',
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
