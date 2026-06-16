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
});
```

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
`DEFAULT_CHROME_SELECTORS`), **`— Field`** (the plugin's own `data-tour-field`),
and **`— Studio`** (defined per vertical via `chromeSelectors`/`fieldTargets` in
that studio's `sanity.config.ts`). See **SELECTORS.md** for the origin legend,
the full native-target catalog (including ones not in the dropdown), per-target
"present when" conditions, the studio-specific targets, and the
extraction/verification recipe to run on each Sanity upgrade.

Authored tour document shape (what the launcher reads — **published perspective only**):

```jsonc
{
  "_type": "<schemaTypeName>",
  "label": "Welcome to the Studio",
  "description": "Shown on the launcher card.",
  "steps": [
    {
      "_type": "tourStep",
      "title": "...",
      "description": "...", // basic HTML ok
      "target": "navbar", // chrome key | "field:title" | omit
      "openDocument": { "_type": "reference", "_ref": "<docId>" }, // optional
      "openPath": "/structure/pagesByPath;all-pages-list", // optional; opens a structure pane (workspace-relative). For pane-create / list targets
      "openTool": "presentation", // optional. Precedence: openDocument > openPath > openTool
      "side": "bottom", // top|right|bottom|left
      "align": "center", // start|center|end
      "delay": 0, // ms; only for steps with no target
    },
  ],
}
```

---

## Step 1 — Detect the project shape (decision)

This drives every later choice. Determine:

1. **Find the config.** Locate `sanity.config.ts` (or `.js`). List each workspace
   in the `defineConfig([...])` array: `name`, `basePath`, `projectId`, `dataset`.
2. **Shared dataset?** If two or more target workspaces use the **same** dataset,
   each MUST get a **distinct `schemaTypeName`** — the launcher queries
   `*[_type == $type]`, so distinct type names are what keep each workspace's tour
   set isolated within a shared dataset. If every target workspace has its own
   dataset, you can leave `schemaTypeName` at its `tour` default.
3. **Custom desk structure?** For each target workspace, check its
   `structureTool({ structure })` resolver. If it has a custom structure that
   explicitly lists document types, the tour type will NOT appear automatically →
   Step 4 applies. If it uses Sanity's default structure (no `structure` option),
   skip Step 4 for that workspace.
4. **Doc types & fields to highlight.** Pick 1–3 real document types per workspace
   for `docTypes`, and the field names worth highlighting for `fieldTargets`
   (e.g. `title`, `slug`). Read the schema to use real names.

Confirm these choices with the user before editing if any are ambiguous.

## Step 2 — Vendor the plugin (no npm publish, no tarball)

The full plugin source travels with this skill under `vendor/studio-tour/`. Copy
it into the target Studio's source tree and install only the two runtime deps:

```sh
# from the target Studio root
mkdir -p src/plugins
cp -R <path-to-this-skill>/vendor/studio-tour src/plugins/studio-tour
pnpm add driver.js zustand        # public deps; match the project's package manager
```

That's the whole install. Notes:

- **Match the project's existing plugin location and path alias — don't assume
  `src/plugins`.** Many Studios (e.g. the Turbo Start Sanity template) have no
  `src/` and keep local plugins at the repo root (`plugins/`) with `@/*` aliased
  to the Studio root. There, vendor into `plugins/studio-tour` and import via
  `@/plugins/studio-tour` (Step 3). Look at how an existing local plugin is
  imported and follow that.
- **`driver.js` + `zustand` are the only deps to add** — they're public packages,
  not the plugin.
- **Peer deps are already satisfied** by any Studio: `sanity ^3 || ^4 || ^5`,
  `@sanity/ui ^2 || ^3`, `react 18 || 19`, `react-dom`, `styled-components ^6.1`.
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

Leave non-target workspaces untouched. **Re-running is safe: skip any workspace
whose `plugins` array already contains `tourPlugin` — only add it where missing,
so a second run (e.g. to wire a newly-added workspace) never double-registers
the plugin, launcher, or schema type.**

## Step 4 — Patch custom desk structures (only if Step 1.3 said so)

If a target workspace uses a custom structure resolver, add a list item for the
tour type so editors can browse/author tours. Match the helpers the project
already uses — e.g. a `createList({ S, type, title })` helper, or plain
`S.documentTypeList('<schemaTypeName>').title('Guided Tours')`. Use the same
`schemaTypeName` you wired in Step 3.

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
empty on first run. Use `scripts/author_tour.ts` (bundled with this skill) — it
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
then `publish_documents`. Tours can have any id — the launcher queries
`*[_type == "<schemaTypeName>"]` — so the random ids `create_documents` assigns
are fine (it ignores any `_id` you pass). `edit_document` (to tweak an existing
tour's `steps`) requires a **deployed schema**; if `get_schema`/`edit_document`
return "No Sanity schema has been deployed", run `npx sanity schema deploy` from
the Studio first. Each step's `openDocument` ref must point at a real, existing
document — author/seed those before publishing the tour.

**`openDocument` is a hard reference — reseeds orphan it.** A step's
`openDocument` stores the target doc's id, so deleting or re-seeding that doc
later (new ids) breaks the navigation step silently — the tour opens nothing and
any field/panel targets that depended on the doc being open then miss too. After
a content reset, re-point the tour's `openDocument` refs (or re-author the tour)
to the new doc ids. Prefer referencing **stable, seeded ids** (e.g.
`product-merino-crewneck`) over random ones so tours survive a reseed.

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

The pure targeting contract — chrome-key resolution, `field:<name>` mapping
(incl. nested paths), and `mapTour`'s `doc`/`openPath`/`openTool`/neither
branches (incl. precedence) — lives
dependency-free in `vendor/studio-tour/targeting.ts` and is covered by
`tests/targeting.test.ts`. Run them (no extra deps; Node ≥ 22):

```sh
node --experimental-strip-types --test tests/targeting.test.ts
# Node 23.6+: `node --test tests/targeting.test.ts`  ·  or `npx tsx --test tests/targeting.test.ts`
```

`tourSchema.ts` (schema) and `useTours.ts` (runtime fetch) re-use `targeting.ts`
so the tested code is the code that ships. Keep the schema/fetch files free of
targeting logic so this stays testable.

## Step 7 — Revert (if needed)

```sh
rm -rf <where-you-vendored>/studio-tour   # e.g. src/plugins/ or plugins/
pnpm remove driver.js zustand     # only if nothing else uses them
git checkout sanity.config.ts <any structure files you patched in Step 4>
```

Authored tour documents remain in the dataset until deleted; they're inert once
the plugin is gone.
