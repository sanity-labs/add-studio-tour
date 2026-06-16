# Native Sanity Studio selectors (tour targets)

Reference catalog of the Sanity Studio `data-testid`s the tour plugin can anchor
to, plus the recipe for re-verifying them on a Sanity upgrade.

**Verified against:** `sanity@5.28.0`.

> ⚠️ These are Sanity's *internal* test IDs. They are not a public API and can
> change between Studio majors. Re-run the verification recipe below after any
> `sanity` upgrade, and prefer the plugin's own `data-tour-field="<name>"`
> (field targets) when you can — that attribute is owned by this plugin and is
> stable.

## Origin legend

Every target carries an **origin** so you know what owns it and how stable it is.
The authoring dropdown shows the same tag as a `— Origin` suffix on each option.

| Origin | Meaning | Stability |
| --- | --- | --- |
| **Sanity** | Native Studio target — selects a `data-testid` that Sanity core renders. Ships in the plugin's `DEFAULT_CHROME_SELECTORS`. | Internal API; re-verify on each Sanity upgrade. |
| **Field** | The plugin's own `data-tour-field="<name>"` (added by `TourField`). Authored as `field:<name>`. | Stable — owned by this plugin. |
| **Studio** | Defined per vertical via `chromeSelectors` / `fieldTargets` in that studio's `sanity.config.ts`. Usually selects a native testid, but the *key* is project-specific. | Owned by the studio; selector still depends on Sanity internals. |

## Two hard-won rules

1. **Bundle-uniqueness ≠ runtime-uniqueness.** A testid can appear once in the
   minified build yet render many times in the live DOM — e.g. `pane-header`
   (one per open pane), `pt-editor` / `field-actions-trigger` (one per field),
   `action-intent-button` (one per pane). `querySelector` returns the *first* in
   DOM order, which is rarely the one you mean. **Always scope** these to a
   container (`[data-testid="document-pane"] …`, `[data-testid="document-list-pane"] …`).
   This is exactly how `document-actions` ended up on the rich-text toolbar's
   `action-menu-button` instead of the footer's — see `targeting.ts`.
2. **Some testids are dynamic or feature-gated.** Document action buttons get
   `data-testid="action-${label}"` (so `action-publish` is locale-sensitive),
   and `releases-tool-link` / `tasks-toolbar` only render when those features are
   enabled for the project (Tasks needs a deployed Studio). Don't assume presence.

## Built-in chrome targets (in the authoring dropdown)

These are wired into `DEFAULT_CHROME_SELECTORS` in `targeting.ts`. All are
**Origin: Sanity** (native testids). "Present when" tells you the screen state
required for the target to resolve.

| Key | Selector | Present when |
| --- | --- | --- |
| `navbar` | `[data-testid="studio-navbar"]` | always |
| `logo` | `[data-testid="studio-logo"]` | always |
| `create-button` | `[data-testid="new-document-button"]` | always (global Create) |
| `search` | `[data-testid="studio-search"]` | always |
| `perspective` | `[data-testid="global-perspective-menu-button"]` | always (draft/published/release switcher) |
| `releases` | `[data-testid="releases-tool-link"]` | Releases feature enabled |
| `tasks` | `[data-testid="tasks-toolbar"]` | Tasks feature enabled (deployed Studio) |
| `sidebar` | `[data-testid="structure-tool-list-pane"]` | Structure tool |
| `document-list` | `[data-testid="document-list-pane"]` | a list pane is open |
| `pane-create` | `[data-testid="pane-header"] [data-testid="action-intent-button"]` | a list pane is open (navigate with `openPath`) |
| `document-panel` | `[data-testid="document-panel-scroller"]` | a document is open |
| `pane-header` | `[data-testid="document-pane"] [data-testid="pane-header"]` | a document is open |
| `breadcrumb` | `[data-testid="document-pane"] [data-testid="document-header-breadcrumb"]` | a document is open |
| `document-title` | `[data-testid="document-pane"] [data-testid="document-panel-document-title"]` | a document is open |
| `pt-editor` | `[data-testid="document-pane"] [data-testid="pt-editor"]` | document has a Portable Text field (first one) |
| `publish-button` | `[data-testid="action-publish"]` | doc is publishable (English UI) |
| `document-actions` | `[data-testid="document-pane"] [data-testid="pane-footer"] [data-testid="action-menu-button"]` | a document is open (footer Publish ▾ menu) |
| `show-more` | `[data-testid="document-pane"] [data-testid="pane-context-menu-button"]` | a document is open (pane `···` menu: Inspect, Review changes, Incoming references) |

**Origin: Field** — `field:<name>` → `[data-tour-field="<name>"]`, the plugin's
own attribute. Works for any *visible* field path, including nested ones
(`field:seo.metaTitle`). Authored per vertical via `fieldTargets` in
`sanity.config.ts` (which only seeds the dropdown — any visible field works at
runtime).

## Studio-specific targets (Origin: Studio)

Defined per vertical in that studio's `sanity.config.ts` via `chromeSelectors` /
`fieldTargets`, merged on top of the defaults. They appear in the dropdown tagged
`— Studio`.

Today the commerce and marketing verticals add **only `fieldTargets`** (which
seed the `field:<name>` dropdown options) — no custom `chromeSelectors`. The
former `create-document` / `create-page` overrides were removed in favour of the
native `create-button` / `pane-create` keys (the old `create-page` was also
unscoped, exposing it to the per-pane collision bug).

> When you add a studio-specific selector, scope it the same way the native ones
> are (a `[data-testid="…-pane"]` container prefix) and follow the verification
> recipe below. If a native target already covers it, reuse the native key
> instead of adding a duplicate.

### Back-compat aliases (hidden from the dropdown)

`DEFAULT_CHROME_SELECTORS` keeps a few keys for tours authored before a key was
renamed. They're listed in `HIDDEN_CHROME_KEYS` so `tourSchema.ts` filters them
out of the authoring dropdown; existing tours that still reference them keep
working. New tours should use the canonical key instead.

| Alias | Resolves to | Canonical key |
| --- | --- | --- |
| `list-pane` | `[data-testid="structure-tool-list-pane"]` | `sidebar` |
| `create-page` | `[data-testid="pane-header"] [data-testid="action-intent-button"]` | `pane-create` |

(New tours should use `pane-create` with an `openPath` to the list pane rather
than this alias.)

## Other native targets — Origin: Sanity (NOT in the dropdown — use a custom `chromeSelectors` override if needed)

These exist but are conditional, per-instance, or have no stable trigger, so
they make poor general-purpose dropdown entries. Point a step at the thing that
*opens* them (usually `show-more`) and let the copy guide the click.

| What | Testid(s) | Why not baked in |
| --- | --- | --- |
| Review changes | `review-changes-pane` (the pane), `change-bar__button` (per-field) | Opens from `show-more`; the pane only exists once open. Also `[aria-label="Review changes"]`. |
| Document history / timeline | `timeline-menu` (portal id) | No stable trigger-button testid; opens from the header status chip. |
| Comments | `comment-input`, `comments-list`, `inline-comment-button` | Inspector toggle has no stable testid; sub-parts only exist once comments are open. |
| Field action menu | `field-actions-trigger` | One per field; only visible on hover/focus. Scope to a `field:<name>` container instead. |
| Insert / array add | `insert-menu-button`, `add-single-object-button`, `add-multiple-object-button`, `array-item-menu-button` | Per-array-field; scope to the field. |
| Reference input | `reference-input`, `autocomplete` | Per-field; scope to the field. |
| Image / file input | `image-input`, `file-button-input`, `hotspot-image-input` | Per-field; scope to the field. |
| PT toolbar | `pt-editor__toolbar-card`, `block-style-select`, `text-style--h1`…`text-style--normal` | Per-PT-field. |

(Full raw list: run the extraction recipe below.)

## Verification recipe (run on every Sanity upgrade)

### 1. Extract the static testid surface from the installed build

```bash
cd apps/<vertical>/studio-*            # any studio with sanity installed
node -e 'console.log(require("./node_modules/sanity/package.json").version)'

# all static data-testid literals, deduped
grep -rohE '"data-testid": "[^"]+"' node_modules/sanity/lib/_chunks-es/*.js node_modules/sanity/lib/*.js \
  | sed -E 's/.*"data-testid": "([^"]+)".*/\1/' | sort -u

# dynamic/templated ones (action buttons, intent buttons)
grep -rohE '"data-testid": `[^`]+`' node_modules/sanity/lib/_chunks-es/*.js node_modules/sanity/lib/*.js | sort -u

# count occurrences of a candidate (a bundle count > 1 is a scoping smell)
grep -roh '"data-testid": "pane-header"' node_modules/sanity/lib/_chunks-es/*.js | wc -l
```

### 2. Confirm against the LIVE DOM (the source of truth for runtime uniqueness)

Run the Studio (`pnpm dev:studio`), open a document, and paste into the browser
console:

```js
// every testid present right now, with a runtime count (count > 1 ⇒ must scope)
Object.entries([...document.querySelectorAll('[data-testid]')]
  .reduce((m, el) => (m[el.dataset.testid] = (m[el.dataset.testid]||0)+1, m), {}))
  .sort().forEach(([id, n]) => console.log(n > 1 ? `⚠︎ ${id} ×${n}` : `  ${id}`))
```

The plugin also dumps available selectors automatically: when a tour step's
target isn't found it logs `[tour] data-testid (chrome): …` (see
`makeSelectorDumper` in `useTour.ts`). To force a dump, temporarily point a step
at a bogus target like `chrome:__nope__` and run the tour.

### 3. Update + re-sync

- Edit `DEFAULT_CHROME_SELECTORS` / `CHROME_TARGET_LABELS` in
  `vendor/studio-tour/targeting.ts`, scoping any target whose runtime count > 1.
- Bump `version` in `vendor/studio-tour/VERSION`.
- Re-sync into each studio (`scripts/sync_vendor.sh`) and update this file's
  "Verified against" line.
