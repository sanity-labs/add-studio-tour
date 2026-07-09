/**
 * author_tour.ts — create a *published* Guided Tour document for a workspace.
 *
 * The launcher reads the published perspective only, so this writes a non-draft
 * document (id without a `drafts.` prefix) via createOrReplace, making it idempotent.
 *
 * Usage:
 *   SANITY_WRITE_TOKEN=<token> npx tsx author_tour.ts \
 *     --project <projectId> --dataset <dataset> --type <schemaTypeName> [--id <docId>]
 *
 * Edit the TOUR constant below to set the steps. Step `target` is a chrome key
 * (navbar | sidebar | document-list | document-panel | publish-button |
 * document-actions) or `field:<name>`; omit it for a copy-only step. Any step
 * that highlights something nested (a field, the title, the publish button, a
 * list's "+") MUST open its location first — set `openDocument`, `openPath`, or
 * `openTool` (see the skill's open-first rules). Global chrome (navbar, sidebar,
 * global create) needs none. Step `description` is Portable Text — use `body()`.
 * For "open a document first", set `openDocument: { _type: 'reference', _ref: '<id>' }`.
 * For "open a tool first" (e.g. presentation), set `openTool: 'presentation'`.
 */
import { createClient } from '@sanity/client'

// Stable, deterministic `_key`s so re-running createOrReplace produces the same
// document (idempotent). Sanity requires a `_key` on every array item — steps
// and Portable Text blocks/spans alike — or the Studio flags "Missing keys".
let keySeq = 0
const key = () => `k${(keySeq++).toString(36)}`

/** A single-paragraph Portable Text body from plain text (the step description type). */
function body(text: string) {
  return [
    {
      _type: 'block',
      _key: key(),
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: key(), text, marks: [] }],
    },
  ]
}

/** Wrap a step object with its `_type` and a unique `_key`. */
function step(s: Record<string, unknown>) {
  return { _type: 'tourStep', _key: key(), ...s }
}

// ─── Edit this ───────────────────────────────────────────────────────────────
const TOUR = {
  label: 'Welcome to the Studio',
  description: 'A quick guided tour of the essentials.',
  steps: [
    step({
      title: 'The navigation bar',
      description: body('Switch workspaces and access tools from up here.'),
      target: 'navbar',
      side: 'bottom',
      align: 'center',
    }),
    step({
      title: 'The content sidebar',
      description: body('Browse your document types here.'),
      target: 'sidebar',
      side: 'right',
      align: 'start',
    }),
    step({
      // Global "Create" is always present and needs no open-first — a safe,
      // universally-resolvable default. (The old publish-button step targeted a
      // nested element with no openDocument, so it always stalled and skipped.)
      title: 'Create content',
      description: body('Start something new from the global Create button.'),
      target: 'create-button',
      side: 'bottom',
      align: 'center',
    }),
  ],
}
// ──────────────────────────────────────────────────────────────────────────────

function arg(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag)
  const val = i >= 0 ? process.argv[i + 1] : undefined
  if (val) return val
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required ${flag}`)
}

async function main() {
  const projectId = arg('--project')
  const dataset = arg('--dataset')
  const type = arg('--type', 'tour')
  const _id = arg('--id', `${type}-welcome`)

  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) throw new Error('Set SANITY_WRITE_TOKEN (a write token) in the environment.')

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-10-01',
    useCdn: false,
  })

  const doc = { _id, _type: type, ...TOUR }
  const res = await client.createOrReplace(doc)
  console.log(`✓ published ${res._type} "${TOUR.label}" → ${res._id} (${projectId}/${dataset})`)
  console.log('  Reload the workspace and hit "Start tour".')
}

main().catch((err) => {
  console.error('✗ failed:', err.message ?? err)
  process.exit(1)
})
