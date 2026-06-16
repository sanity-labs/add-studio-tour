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
 * document-actions) or `field:<name>`; omit it for a copy-only step.
 * For "open a document first", set `openDocument: { _type: 'reference', _ref: '<id>' }`.
 * For "open a tool first" (e.g. presentation), set `openTool: 'presentation'`.
 */
import { createClient } from '@sanity/client'

// ─── Edit this ───────────────────────────────────────────────────────────────
const TOUR = {
  label: 'Welcome to the Studio',
  description: 'A quick guided tour of the essentials.',
  steps: [
    {
      _type: 'tourStep',
      title: 'The navigation bar',
      description: 'Switch workspaces and access tools from up here.',
      target: 'navbar',
      side: 'bottom',
      align: 'center',
    },
    {
      _type: 'tourStep',
      title: 'The content sidebar',
      description: 'Browse your document types here.',
      target: 'sidebar',
      side: 'right',
      align: 'start',
    },
    {
      _type: 'tourStep',
      title: 'Publishing',
      description: 'When your edits are ready, publish them from here.',
      target: 'publish-button',
      side: 'top',
      align: 'center',
    },
  ],
} as const
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
