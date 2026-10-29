---
name: add-studio-tour
description: >-
  Install and wire sanity-plugin-studio-tour into an existing Sanity Studio:
  add tourPlugin to chosen workspaces, choose schemaTypeName(s) (isolating tours
  when workspaces share a dataset), patch custom desk structures so the Guided
  Tour type is browsable, author a starter published tour, and verify selectors
  against the running Studio. Use when adding guided product tours to a Sanity
  Studio, or reproducing the install in a new project.
---

# Add a Studio Tour to a Sanity Studio

This skill installs and wires `sanity-plugin-studio-tour` (driver.js-powered
guided tours, authored as documents) into an existing Studio. The plugin is the
runtime; this skill is the install judgment — it inspects the target project and
makes the per-workspace decisions a static template can't.

**Do the steps in order. Steps 1, 4, and 6 are decisions, not mechanics — read
the project before acting.**

## Plugin API (ground truth — don't paraphrase from memory)

`tourPlugin` (alias of `studioTourPlugin`) takes an optional config:

```ts
import { tourPlugin } from "./src/plugins/studio-tour"; // vendored in Step 2

tourPlugin({
  schemaTypeName: "tour", // default 'tour'. The authored document type.
  docTypes: [], // doc types a step's "Open document first" may reference
  fieldTargets: [], // [{ title, field }] → authoring-dropdown options ONLY. At runtime any visible field path works (e.g. field:title, nested field:seo.metaTitle), whether or not it's listed here.
  chromeSelectors: {}, // override/extend built-in chrome selectors (see below)
  progress: false, // OPTIONAL per-user progress + resume. Off by default. `true` enables with defaults; `{ dataset, typeName }` customizes. Writes `studioTourProgress` docs (to the content dataset by default). The admin dashboard is a SEPARATE plugin — `studioTourDashboard()`. See Step 5b.
  // ── Central-management mode (shared dataset only — see "Multi-workspace") ──
  workspaceScope: undefined, // product workspace: a stable key (e.g. workspace name). Launcher shows only tours tagged for it + untagged/global ones, and the "Show in workspaces" field appears.
  manageWorkspaceScopes: false, // admin workspace: shows the tagging field and sees ALL tours (no filter).
});
```

The standalone **dashboard** plugin (only if you enabled `progress`):

```ts
studioTourDashboard({
  roles: ["administrator"], // OPTIONAL. Only these project roles see the "Tour Progress" tool. Omit → everyone sees it.
  dataset: undefined,        // OPTIONAL. Match `progress.dataset` if you customized it.
  typeName: undefined,       // OPTIONAL. Match `progress.typeName` if you customized it.
  schemaTypeName: undefined, // OPTIONAL. Tour doc type to list (default 'tour'). Match tourPlugin's schemaTypeName so EVERY tour shows, even unplayed ones.
});
```

`workspaceScope` and `manageWorkspaceScopes` are **mutually exclusive per
workspace** and only used in the shared-dataset central-management model. Omit
both for the default one-dataset-per-workspace setup (no extra field, no filter —
unchanged behaviour).

Built-in chrome target keys (each maps to a Sanity `data-testid`) —
**global:** `navbar`, `logo`, `create-button`, `search`, `perspective`,
`releases`, `tasks`; **structure:** `sidebar`, `document-list`, `pane-create`
(`document-list` and `pane-create` only resolve while a list pane is open — give
the step an `openPath` to that pane first, see the list-pane lesson below);
**document:** `document-panel`, `pane-header`, `breadcrumb`, `document-title`,
`pt-editor`, `publish-button`, `document-actions` (footer Publish ▾ menu),
`show-more` (pane `···` overflow menu — Inspect, Review changes, Incoming
references). A step's `target` is one of these keys **or** `field:<name>`
(resolves to the stable `data-tour-field="<name>"` attribute this plugin owns).

Each dropdown option is tagged with its **origin** so authors can tell built-in
targets apart from custom ones: **`— Sanity`** (native Studio testid, shipped in
`DEFAULT_CHROME_SELECTORS`), **`— Field`** (the plugin's own `data-tour-field`,
including options seeded by `fieldTargets`), and **`— Studio`** (custom chrome
keys added via `chromeSelectors` in that studio's `sanity.config.ts`). See
**SELECTORS.md** for the origin legend,
the full native-target catalog (including ones not in the dropdown), per-target
"present when" conditions, the studio-specific targets, and the
extraction/verification recipe to run on each Sanity upgrade.

Authored tour document shape (what the launcher reads — **published perspective only**):

```jsonc
{
  "_type": "<schemaTypeName>",
  "label": "Welcome to the Studio",
  "description": "Shown on the launcher card.", // plain text
  "steps": [
    {
      "_type": "tourStep",
      "_key": "s1", // REQUIRED on every array item (steps, and PT blocks/spans)
      "title": "...", // plain text
      // Step copy is Portable Text (a block array), NOT a string — rendered
      // safely (escaped + allowlisted tags), so pasted raw HTML shows as text.
      "description": [
        {
          "_type": "block",
          "_key": "b1",
          "style": "normal",
          "markDefs": [],
          "children": [{ "_type": "span", "_key": "sp1", "text": "...", "marks": [] }],
        },
      ],
      "target": "navbar", // chrome key | "field:title" | omit
      "openDocument": { "_type": "reference", "_ref": "<docId>" }, // optional (field only exists when docTypes is non-empty)
      "openPath": "/structure/pagesByPath;all-pages-list", // optional; opens a structure pane (workspace-relative). For pane-create / list targets
      "openTool": "presentation", // optional. Precedence: openDocument > openPath > openTool
      "side": "bottom", // top|right|bottom|left
      "align": "center", // start|center|end
      "delay": 0, // ms; only for steps with no target
    },
  ],
}
```

> **Migration note:** `description` used to be a free-text string. Tours authored
> that way still *run* (a string is rendered as an escaped paragraph), but the
> Studio's Portable Text input will flag the old value as an invalid type until
> it's re-entered. Re-author those step descriptions as Portable Text.

---

## Authoring tour steps (best practices — apply on every "create a tour" request)

When asked to author a tour (e.g. *"create a guided tour to create a new landing
page from scratch"*), the hard part is **not** the copy — it's that most targets
live *nested* inside the Studio (a field, the publish button, a list's `+`) and
are not in the DOM until you navigate there. **A step highlights nothing unless
the thing it points at is already on screen.** So every step that targets nested
chrome must carry an "open first" reference. The three are mutually exclusive,
set **at most one** per step, and resolve in this precedence:
**`openDocument` > `openPath` > `openTool`**.

**Open-first decision table — pick by what the step highlights:**

| The step highlights… | `target` | Open first with | Why |
| --- | --- | --- | --- |
| Intro / welcome / pure copy | *(omit)* | *(nothing)* — set a `delay` instead | no element to reveal |
| Global chrome — navbar, global Create, search, logo, perspective | `navbar`, `create-button`, `search`, … | *(nothing)* | always present in every view |
| A list pane's `+` create button or the list body | `pane-create`, `document-list` | **`openPath`** to that **document-list** pane (the leaf `documentTypeList` node — not a parent grouping list) | only render while that document list is open; `openDocument` won't reveal them, and an intermediate grouping `S.list()` has no `+` |
| A field, the doc title, PT editor, publish button, doc panel, the `···` menu | `field:<name>`, `document-title`, `pt-editor`, `publish-button`, `document-panel`, `show-more` | **`openDocument`** (ref to a real doc) | opens via the `edit` intent and reveals the doc + its parent panes |
| A tool's own UI (Presentation, Vision) | *(tool-specific)* | **`openTool`** (e.g. `"presentation"`) | navigates to that tool by name |

**Rules that trip up first drafts:**

- **Every in-document step needs its own `openDocument` — not just the first
  one.** The runtime re-navigates per step independently; it does not "stay" in
  the doc opened by an earlier step. So in a page-creation tour, the title, slug,
  description, page-builder, and publish steps **each** carry the same
  `openDocument` ref. (This is exactly the backfill this session needed.)
- **Reference a real, stable, seeded document id**, not a random/draft one —
  `openDocument` is a hard reference, so a reseed with new ids silently orphans
  the step (see Step 5). Prefer a known seeded id (e.g. `page-spring-launch`).
- **`openDocument` opens *into* a document; it cannot reveal a list view.** To
  highlight the `+` in a list (the natural "create a new page" step), use
  `openPath` to that list pane and `target: pane-create` — copy everything from
  `/structure` onward out of the Studio URL (it's workspace-relative; the plugin
  prepends `basePath`).
- **Don't point a field step at a field behind an inactive group tab** — it
  isn't in the DOM. Target default-group fields, or drop `groups` on the demo
  doc. (Full rationale in Step 6's lessons.)
- **Order steps to follow the real workflow** and let each step's open-first ref
  match where that action happens: navigate (sidebar/tool) → create (`pane-create`
  via `openPath`) → fill fields (`field:*` via `openDocument`) → publish
  (`publish-button` via `openDocument`).

The full target catalog, per-target "present when" conditions, and the
debugging recipe for a missed selector live in Step 6 and **SELECTORS.md** — this
table is the *authoring-time* shortcut so the open-first refs are correct on the
first pass.

**Two audiences read these rules — keep both channels in sync.** A code-access
agent (e.g. Claude Code) reads them *here*. But a **code-less agent authoring
tours over the Sanity MCP / Content Agent** never sees this skill — it only sees
the **deployed schema** via `get_schema`, the dataset, and Sanity's own docs. For
that agent the open-first guidance lives in the **field `description`s of the
tour step type** (`vendor/studio-tour/tourSchema.ts`): the doc-level description
states the open-first rule + precedence, and `target` / `openDocument` /
`openPath` / `openTool` each say when they're required. Field and document
descriptions *do* survive `sanity schema deploy` and come back through
`get_schema` (verified). Consequences:
- **If you edit those descriptions, redeploy the schema** (`npx sanity schema
  deploy`) — the MCP agent reads the deployed copy, not the source.
- The plugin must be **installed and its schema deployed** in the target studio
  before any MCP/Content-Agent tour authoring will have the guidance.
- Keep the prose in `tourSchema.ts` and this section consistent when either
  changes, so both audiences get the same rule.

---

## Step 1 — Detect the project shape (decision)

This drives every later choice. Determine:

1. **Find the config.** Locate `sanity.config.ts` (or `.js`). List each workspace
   in the `defineConfig([...])` array: `name`, `basePath`, `projectId`, `dataset`.
2. **Shared dataset?** If every target workspace has its own dataset, leave
   `schemaTypeName` at its `tour` default. If two or more share the **same**
   dataset, the scoping model (see *Multi-workspace & central management*) decides:
   - **Model A (isolated):** give each a **distinct `schemaTypeName`** — the
     launcher queries `*[_type == $type]`, so distinct type names keep each
     workspace's tour set separate within the shared dataset.
   - **Model B (central management):** keep the **same `schemaTypeName`** across
     them and isolate with `workspaceScope` / `manageWorkspaceScopes` instead.
3. **Custom desk structure?** For each target workspace, check its
   `structureTool({ structure })` resolver. If it has a custom structure that
   explicitly lists document types, the tour type will NOT appear automatically →
   Step 4 applies. If it uses Sanity's default structure (no `structure` option),
   skip Step 4 for that workspace.
4. **Doc types & fields to highlight.** Pick 1–3 real document types per workspace
   for `docTypes`, and the field names worth highlighting for `fieldTargets`
   (e.g. `title`, `slug`). Read the schema to use real names.

Confirm these choices with the user before editing if any are ambiguous.

## Multi-workspace & central management

**Ask the user which scoping model they want before wiring** (it changes the
config in Step 3). At runtime the launcher fetches tours through the **active
workspace's** client — i.e. from *that workspace's own project + dataset*. Pick one:

**A. Per workspace (default).** Each workspace owns its tours; no central admin.
- **Separate dataset per workspace** → fully isolated automatically. Leave
  `schemaTypeName` at `tour`, no scope options.
- **Shared dataset, isolated tours** → give each workspace a **distinct
  `schemaTypeName`** (Step 1.2) so their tour sets don't bleed together.
- **One admin Studio listing many workspaces** → a single Studio config can list
  every workspace, so an admin switches between them and authors each one's tours.
  Tours still live per-dataset. Works with no scope options.

**B. Central management (shared dataset + global admin).** One shared dataset; a
single "admin" workspace authors *all* tours and tags which workspace(s) each
appears in; every product workspace shows only its own (plus untagged/global)
tours. Built in via the `workspaceScope` / `manageWorkspaceScopes` options:
- **All participating workspaces must point at the same dataset** and use the
  **same `schemaTypeName`** (they share one tour type).
- **Admin workspace:** `manageWorkspaceScopes: true` → shows the *Show in
  workspaces* field and sees every tour (no filter).
- **Each product workspace:** `workspaceScope: "<key>"` (use the workspace `name`)
  → its launcher fetches `*[_type==$type && (untagged || "<key>" in workspaces)]`,
  so it shows tours tagged for it plus any left untagged (treated as global).
- Authors tag a tour by adding workspace keys to its **Show in workspaces** field
  (empty = shows everywhere).

If the user is unsure, default to **A** (simpler, no shared-dataset coupling).
Only reach for **B** when they explicitly want one place to manage tours across
workspaces.

## Step 2 — Vendor the plugin (no npm publish, no tarball)

The full plugin source travels with this skill under `vendor/studio-tour/`. Copy
it into the target Studio's source tree and install only the two runtime deps:

```sh
# from the target Studio root
mkdir -p src/plugins
cp -R <path-to-this-skill>/vendor/studio-tour src/plugins/studio-tour
pnpm add driver.js zustand @sanity/ui @sanity/icons@^5   # match the project's package manager
```

That's the whole install. Notes:

- **Match the project's existing plugin location and path alias — don't assume
  `src/plugins`.** Many Studios (e.g. the Turbo Start Sanity template) have no
  `src/` and keep local plugins at the repo root (`plugins/`) with `@/*` aliased
  to the Studio root. There, vendor into `plugins/studio-tour` and import via
  `@/plugins/studio-tour` (Step 3). Look at how an existing local plugin is
  imported and follow that.
- **Install `driver.js`, `zustand`, `@sanity/ui`, and `@sanity/icons`.**
  `driver.js` and `zustand` are the plugin's own runtime deps. `@sanity/ui` and
  `@sanity/icons` are imported by the launcher/dashboard; a Studio already pulls
  them in transitively via `sanity`, but **declaring them directly is required
  under a strict package manager (pnpm)** — otherwise the vendored files' bare
  `@sanity/ui` / `@sanity/icons` imports don't resolve. `@sanity/ui` dedupes to
  the version `sanity` already uses.
- **`@sanity/icons` must be v5 (`@sanity/icons@^5`).** The plugin imports each
  icon from its own subpath (`@sanity/icons/Play`), which only exists in v5. v5
  also removed the root exports, so `import { PlayIcon } from '@sanity/icons'` is
  `undefined` at runtime there and crashes on render. v5 only needs React 18/19,
  so it works on Sanity 3–6 Studios. On Sanity 3–5, `sanity` keeps its own older
  copy alongside it.
- **Other peer deps are already satisfied** by any Studio: `sanity ^3 || ^4 || ^5`,
  `react 18 || 19`, `react-dom`, `styled-components ^6.1`.
- **No CSS import or bundler config** — driver.js styles are inlined as a JS
  string in `vendor/studio-tour/driverStyles.ts` and injected at runtime.
- **A `VERSION` file ships in `vendor/studio-tour/` and is copied with the
  plugin.** It records the plugin's logical `version` + sync date. To tell
  whether an existing install is stale, compare its
  `plugins/studio-tour/VERSION` against this skill's
  `vendor/studio-tour/VERSION` (`version:` line). Re-stamped by
  `scripts/sync_vendor.sh` (maintainers only).

## Step 3 — Wire each target workspace (`sanity.config.ts`)

Add the import once (relative to where you vendored it in Step 2 — adjust the
path to your config's location), then add `tourPlugin({...})` to the `plugins`
array of each target workspace, using the decisions from Step 1:

```ts
import { tourPlugin } from './src/plugins/studio-tour' // vendored, not an npm package
// ...
tourPlugin({
  schemaTypeName: 'designTour',                  // distinct per shared-dataset workspace
  docTypes: ['component', 'theme', 'illustration'],
  fieldTargets: [
    { title: 'Name field', field: 'name' },
    { title: 'Slug field', field: 'slug' },
  ],
}),
```

**To enable per-user progress, resume & the admin dashboard (optional)**, add
`progress` to `tourPlugin` and the separate `studioTourDashboard()` plugin to the
same workspace's `plugins`. Both are off unless added — full behaviour, storage,
and privacy caveats are in **Step 5b**:

```ts
import { tourPlugin, studioTourDashboard } from './src/plugins/studio-tour'
// ...
plugins: [
  tourPlugin({
    docTypes: [...],
    fieldTargets: [...],
    progress: true,                          // writes studioTourProgress docs (content dataset by default)
  }),
  studioTourDashboard({ roles: ['administrator'] }), // "Tour Progress" tool, gated to admins (omit roles → everyone)
]
```

**If the user chose central management (model B above)**, add the scope option per
workspace instead of distinct `schemaTypeName`s (they share one type here):

```ts
// global admin workspace — manages & sees every tour:
tourPlugin({ schemaTypeName: 'tour', docTypes: [...], manageWorkspaceScopes: true }),

// each product workspace — shows only its own + untagged tours:
tourPlugin({ schemaTypeName: 'tour', docTypes: [...], workspaceScope: 'marketing' }),
```

Leave non-target workspaces untouched. **Re-running is safe: skip any workspace
whose `plugins` array already contains `tourPlugin` — only add it where missing,
so a second run (e.g. to wire a newly-added workspace) never double-registers
the plugin, launcher, or schema type.**

## Step 4 — Patch custom desk structures (only if Step 1.3 said so)

If a target workspace uses a custom structure resolver, add **one** list item for
the tour type so editors can browse/author tours. Use the same `schemaTypeName`
you wired in Step 3.

**Rules — do not reshape the user's Studio:**
- **Never replace, reorder, or remove existing structure.** This is an *additive*
  edit only: preserve every existing list item, divider, and singleton exactly as
  written. Add a single new `Guided Tours` item — nothing else changes.
- **Append to the bottom by default**, after the existing items (a `S.divider()`
  before it is fine). Do not insert it at the top or between existing items.
- **Ask the user where to put it before editing** if the placement is at all
  ambiguous (e.g. grouped/nested structures, or they may want it under a
  "Settings"/"Admin" group). Offer the bottom as the default. Never silently
  restructure the top level.
- **Make the smallest possible diff** — add the one item in place; do not rewrite,
  reformat, or "clean up" the surrounding structure file.

Match the helpers the project already uses — e.g. a `createList({ S, type, title })`
helper, or plain `S.documentTypeList('<schemaTypeName>').title('Guided Tours')`.

**Gotcha — typed structure helpers reject the tour type.** The tour type is
contributed by the plugin at runtime, so it is NOT in the project's generated
`SchemaType` union. A typed helper like `createList({ type }: { type: SchemaType })`
will fail to type-check when passed `"tour"`. Bypass the helper for this one item
and call the builder directly:
`S.documentTypeListItem("<schemaTypeName>").id("<schemaTypeName>").title("Guided Tours").icon(SomeIcon)`.

**Skip this entirely for default-structure workspaces** — the type shows up on
its own there.

## Step 5 — Author a starter tour

Create one **published** tour document per wired workspace so **Start tour** isn't
empty on first run. **Before writing steps, apply the open-first rules in
*Authoring tour steps (best practices)* above** — every step that highlights a
nested target (field, publish button, list `+`) needs its own `openDocument` /
`openPath` / `openTool`, or it silently highlights nothing. Use
`scripts/author_tour.ts` (bundled with this skill) — it
writes a published doc via `@sanity/client`. It needs a write token:

```sh
SANITY_WRITE_TOKEN=<token> npx tsx author_tour.ts \
  --project <projectId> --dataset <dataset> --type <schemaTypeName>
```

Edit the `TOUR` constant in the script to set the steps, or let the user author
tours by hand in the Studio (a "Guided Tour" document type is now registered).
Tours must be **published** — the launcher reads the published perspective only.

**No write token? Use the Sanity MCP instead.** If `SANITY_WRITE_TOKEN` isn't
available but the Sanity MCP is connected (`whoami` succeeds), author tours with
`create_documents` (type `"<schemaTypeName>"`, content = `{label, description, steps}`)
then `publish_documents`. Each step's `description` must be **Portable Text** (a
block array, as in the shape above), not a plain string; every array item —
`steps[]` and each Portable Text block/span — needs a unique `_key`. Tours can
have any id — the launcher queries `*[_type == "<schemaTypeName>"]` — so the
random ids `create_documents` assigns are fine (it ignores any `_id` you pass).
`patch_documents` (to tweak an existing tour's `steps`) requires a **deployed
schema**; if `get_schema`/`patch_documents` return "No Sanity schema has been
deployed", run `npx sanity schema deploy` from the Studio first. Each step's
`openDocument` ref must point at a real, existing document — author/seed those
before publishing the tour.

**`openDocument` is a hard reference — reseeds orphan it.** A step's
`openDocument` stores the target doc's id, so deleting or re-seeding that doc
later (new ids) breaks the navigation step silently — the tour opens nothing and
any field/panel targets that depended on the doc being open then miss too. After
a content reset, re-point the tour's `openDocument` refs (or re-author the tour)
to the new doc ids. Prefer referencing **stable, seeded ids** (e.g.
`product-merino-crewneck`) over random ones so tours survive a reseed.

## Step 5b — Per-user progress & resume (optional)

Off by default. Set `progress` on `tourPlugin` to track each user's progress
through each tour and let them **resume** an unfinished tour from the launcher.
The **live admin dashboard** is a separate plugin — add `studioTourDashboard()`
to the same workspace's `plugins` to register the "Tour Progress" tool (it's on
simply by being added):

```ts
import { tourPlugin, studioTourDashboard } from './plugins/studio-tour'

plugins: [
  tourPlugin({
    docTypes: [...],
    fieldTargets: [...],
    progress: true,             // or { dataset } — use a PRIVATE dataset if the content dataset is public (PII); see below
  }),
  studioTourDashboard(),                          // tool, visible to everyone
  // studioTourDashboard({ roles: ['administrator'] })  // only admins see the tool
  // studioTourDashboard({ dataset, typeName })         // only if you customized progress.*
]
```

**How it works.** Each play is its **own** document — one per run, id
`studioTourProgress.<user>.<tour>.<runId>` — so a user's history is preserved
(e.g. two completed runs + one incomplete) instead of the latest run overwriting
the rest. A fresh start (or **Start over**) mints a new `runId` and doc; each step
advance patches `currentStep`; finishing sets `completed`, closing early sets
`incomplete`. **Resume** continues the most-recent **unfinished** play — `incomplete`
*or* `in_progress` — for a tour; `completed` plays are not resumed. Resumability is
decided by a tour's *newest* play, so if you **Start over** and then finish, that
newer completed run supersedes the older unfinished one and Resume no longer offers
it. The launcher shows **"Resume · step N/M"** + **Start over** when the newest
play is unfinished, and a **Completed** pill once any play of that tour is done. Reads use the **Live Content API**, so resume
state and the dashboard update within ~a second across tabs. Writes are
client-side and **fail-safe**: if the user can't write or the dataset is missing,
the tour still runs — progress just no-ops (never throws).

**Missed steps are captured too — so broken tours don't hide in the console.**
When a step is skipped because its target selector never resolved (the
`[tour] skipping step …` console warning), the plugin appends it to that play
doc's `missedSteps[]` — `{ stepIndex, stepTitle, target, selector, at }`, once
per step per play (fail-safe, like the other writes). The dashboard flags such a
tour with a ⚠ **"N missed steps · `<target>`"** badge and lists the skipped steps
under each play, so an out-of-date selector (e.g. a `pane-create` step that stopped
resolving after a Studio upgrade) is visible after the fact instead of only to
whoever happened to have the console open. The console dump (`makeSelectorDumper`)
still fires for live debugging; this just makes the signal durable.

**Where it's stored — a privacy decision, not just a default.** Progress docs
capture user **name + email**, so where they live matters. They go in the active
(content) dataset unless you set `progress.dataset`. Either way the
`studioTourProgress` type is kept out of the editor's way: `readOnly`, hidden from
global search, filtered out of the global "Create new" menu, and not listed in a
custom desk structure.

> ⚠️ **If the content dataset is public, those progress docs are world-readable** —
> anyone can query the name/email of everyone who ran a tour. Most web-facing
> projects keep their content dataset public so the frontend can read it without a
> token, so **the default lands PII in a public dataset.** Treat a dedicated
> **private** progress dataset as the recommended setup whenever the content
> dataset is (or might become) public.

**Recommended: a dedicated private dataset.** Create a regular dataset with
private visibility and point both progress and the dashboard at it:

```sh
# one-time — from a studio, or via the Sanity MCP create_dataset:
npx sanity dataset create tour-progress --visibility private
npx sanity dataset visibility get tour-progress   # confirm → "private"
```

```ts
tourPlugin({ /* … */ progress: { dataset: 'tour-progress' } }),
studioTourDashboard({ roles: ['administrator'], dataset: 'tour-progress' }),
```

Notes:
- A shared private dataset can serve several studios/workspaces' tours. When
  `progress.dataset` is set, each dashboard automatically **scopes to the tours in
  its own active content dataset** — so one studio's plays don't show up in
  another's dashboard, even though they all write to the same progress dataset.
  (The per-doc `workspace` field can't be relied on for this: studios commonly
  share the workspace `name` `"default"`. The content-dataset tour list is the
  discriminator. Trade-off: in this mode the dashboard won't list plays of a
  *deleted* tour, since it can't tell a deleted tour from another studio's tour by
  id alone.)
- The private dataset counts toward the plan's dataset limit, but it's the only
  way to keep the identity data out of public reach.
- **If progress already ran against a public dataset, delete the existing
  `studioTourProgress` docs there** — switching `progress.dataset` does not
  unexpose what's already written.
- **Verifying "private" is non-obvious:** an anonymous query to a private dataset
  returns HTTP `200` with results *filtered to empty*, NOT a `401`. So don't infer
  "public" from a `200` — compare a known-public dataset (returns data) against
  the target (returns empty), or just trust `sanity dataset visibility get`.

> ⚠️ **A Comments `<dataset>-comments` add-on dataset CANNOT be used** for this,
> even though it's private and complimentary. Add-on datasets ship with
> Sanity-managed grants that only permit the `comment`/`task` types — writing a
> `studioTourProgress` doc there returns **403 for everyone, including admins**
> (project roles can't widen a managed add-on's grants). This was tried; it
> doesn't work. Use a separate **regular** private dataset.

**Restricting who sees the dashboard.** Pass `studioTourDashboard({ roles:
['administrator'] })` — the "Tour Progress" tool is then only registered for users
holding one of those project roles. Omit `roles` to show it to everyone. This is
convenience visibility, **not** a security boundary — the docs themselves are
still governed by dataset permissions.

Requirements to verify with the user (the feature degrades but never throws if
unmet — and logs a single, actionable console warning per dataset so the cause
isn't a mystery):
- **Write access.** The current user must be able to write the progress dataset
  (admins and standard write-roles can write the content dataset). If not, the
  endpoint returns **403** and the plugin logs `[tour] access forbidden (403) on
  progress dataset "…" …`. Read-only/anonymous viewers can't persist progress —
  for that audience you'd need a token-backed endpoint instead (out of scope).
- **Dataset exists.** If `progress.dataset` points somewhere that doesn't exist,
  the endpoint returns **404** and the plugin logs `[tour] progress dataset "…"
  does not exist …`. Check with the Sanity MCP `list_datasets`.
- **CORS.** The Live Content API uses the project's CORS origins; a Studio that
  already loads tours from this project is fine. If live updates don't arrive,
  confirm the origin is allowed in sanity.io/manage.

**Design notes.** When `progress` is on, the plugin registers a
`studioTourProgress` document type and writes docs to `progress.dataset` (the
content dataset by default). The type is `readOnly`, hidden from search, and
filtered out of the global Create menu, so it stays out of editors' way even when
it shares the content dataset; the dashboard lists **every authored tour** (even
unplayed ones — it reads the tour list from the content dataset) and, under each,
groups plays **by user** (Tour ▸ User ▸ plays), one row per play. It's **one doc
per play** (id ends in a unique `runId`), so replays accumulate as separate
entries rather than overwriting. `tourId`/`tourLabel` are stored as a string + snapshot (not a
reference), so a tour edit/reseed can't orphan them. The pure id/doc/query
contract is covered by `tests/progress.test.ts`.

## Step 6 — Run & verify selectors (decision loop)

```sh
pnpm dev   # then open each wired workspace's basePath and hit "Start tour"
```

Run each tour end to end. **If a step is silently skipped, its `target` selector
didn't match the current view.** When a target misses, the plugin logs the full
set of available selectors to the console — `[tour] data-testid` (chrome keys),
`[tour] data-ui`, `[tour] data-tour-field` (the fields the plugin tagged in this
view), and `[tour] field-group / view tabs` (so a `field:` miss caused by the
field being behind an inactive tab is obvious). Pick a real target from those
lists. For fields, use
`field:<name>` only for names that actually appear under `data-tour-field`. For
chrome, add/override `chromeSelectors` rather than editing the plugin.

Targeting lessons learned (Sanity v5):

- **Fields inside a non-default field group aren't targetable.** A field with a
  `group` (e.g. `group: GROUP.SEO`) renders behind a tab and is NOT in the DOM
  until that tab is the active one, so `field:seo` resolves to nothing and the
  step is silently skipped — even though the field "exists" in the schema. Fixes,
  in order of preference: target only fields in the **default** group; or drop
  `groups` on the doc types a tour highlights (often the right call for a small
  demo doc — it also removes empty inherited tabs); or split the highlight into a
  copy-only step. The selector dump (Step 6) now also lists the field-group/view
  tabs present, so a `field:` miss caused by an inactive tab is easy to spot.
  (Remember: `fieldTargets` only fills the authoring dropdown — at runtime any
  *visible* field path works, including nested `field:seo.metaTitle`.)
- **Field decorations are not field-targetable.** Things rendered via
  `renderMembers` (e.g. `defineIncomingReferenceDecoration`) are NOT wrapped by
  the plugin's `TourField`, so they never get a `data-tour-field` and have no
  stable `data-testid`. Don't use `field:<name>` for them.
- **Incoming references is a built-in inspector, not a field.** In Sanity v5,
  "Incoming references" (everything that references the open doc — great for
  showing content reuse) is a document **inspector** opened from the document's
  "···" menu. A tour can't open an inspector, so point the step at that menu —
  the built-in `show-more` chrome target
  (`[data-testid="document-pane"] [data-testid="pane-context-menu-button"]`) —
  and let the copy say "open this menu → Incoming references". (Don't use
  `document-actions` for this — that targets the footer's Publish ▾ action menu,
  a different button.) Don't add a
  redundant `defineIncomingReferenceDecoration` for this; the inspector already
  ships by default.
- **Per-pane create ("+") and other list-pane targets: open the pane first with
  `openPath`.** The per-pane create (`[data-testid="action-intent-button"]`, the
  `pane-create` chrome key) and the list body itself
  (`[data-testid="document-list-pane"]`) only exist while that structure list
  pane is rendered. `openDocument` won't reveal them — it navigates *into a
  document* (intent `edit`), not to the parent list view. Instead, set the step's
  **`openPath`** to the pane's router path so the plugin navigates there and the
  pane (with its `+` button) is in the DOM, then set the step's `target` to
  `pane-create`. Get the path by navigating to the list pane in the Studio and
  copying everything from `/structure` onward out of the URL, e.g.
  `/structure/pagesByPath;all-pages-list`. `openPath` is workspace-relative — the
  plugin prepends the workspace `basePath` for you, so don't include it.
  - **Reach the actual document-list pane, not a parent grouping list.** Only a
    leaf `documentTypeList` pane renders the `+` (`action-intent-button`). In a
    nested/custom structure (e.g. `createSlugBasedStructure`), the parent node
    (`/structure/pagesByPath`) opens an intermediate `S.list()` that *lists* child
    items but is **not** a document list, so it has **no `+`** and `pane-create`
    finds nothing. Drill all the way down by appending the leaf node's id
    (`;all-pages-list`). **Diagnostic:** if the selector dump shows the pane's
    `pane-item-*` entries but **no `action-intent-button`**, you stopped on a
    grouping pane — go one level deeper. (This was the exact bug in the marketing
    "Create a landing page" tour: `openPath` was `/structure/pagesByPath`; the fix
    appended `;all-pages-list`.)
  - **Caveat — structure routes are brittle.** The path encodes desk-structure
    node ids (`pagesByPath`, `all-pages-list`, …), so it breaks if you rename the
    structure. Prefer `openDocument`/`field:` targets where they suffice; reach
    for `openPath` only for views no intent can open (list panes, the global
    structure root). Don't hand-build `/structure/...;docId` URLs to open a
    *document* — use `openDocument` for that, which survives id/structure changes.
- **The always-present global Create** is `[data-testid="new-document-button"]`
  (chrome key `create-button`) and needs no `openPath` — use it when a tour just
  needs to point at "where you create things" generically rather than the `+` in
  a specific list.
- **Sidebar list items** are `[data-testid="pane-item-<Title>"]` (e.g.
  `pane-item-Pages by Path`). Note the title can resolve to `undefined`
  (`pane-item-undefined`) when the list item has no preview title — don't rely on
  it as a stable target in that case.

## Tests (maintainers)

Three pure, dependency-free contracts are tested (no DOM/React/Sanity):
- **`tests/targeting.test.ts`** → `targeting.ts`: chrome-key resolution,
  `field:<name>` mapping (incl. nested paths), and `mapTour`'s
  `doc`/`openPath`/`openTool`/neither branches (incl. precedence).
- **`tests/progress.test.ts`** → `progress.ts`: the id scheme, start-doc shape,
  the queries, resume supersession, and the missed-step contract.
- **`tests/portableText.test.ts`** → `portableText.ts`: the safe HTML serializer
  (escaping, mark/list rendering, and the **XSS** cases — no author markup executes).

Run all three with **`tsx`**:

```sh
npx tsx --test tests/*.test.ts
```

Use `tsx` (not `node --experimental-strip-types`): these modules import each
other with extensionless relative paths (the correct convention for the bundled
Studio build), which `tsx` resolves but Node's type-stripping loader does not.

`tourSchema.ts` (schema) and `useTours.ts` (runtime fetch) re-use `targeting.ts`,
and `useTour.ts` re-uses `portableText.ts`, so the tested code is the code that
ships. Keep the schema/fetch/driver files free of that logic so this stays testable.

## Step 7 — Revert (if needed)

```sh
rm -rf <where-you-vendored>/studio-tour   # e.g. src/plugins/ or plugins/
pnpm remove driver.js zustand     # only if nothing else uses them
git checkout sanity.config.ts <any structure files you patched in Step 4>
```

Authored tour documents remain in the dataset until deleted; they're inert once
the plugin is gone.
