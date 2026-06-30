# add-studio-tour

Guided product tours for **Sanity Studio**, packaged as a standalone [Claude Code](https://claude.com/claude-code) plugin. It installs and wires [`sanity-plugin-studio-tour`](#) into an existing Studio: vendors the plugin, adds `tourPlugin` to the chosen workspaces, patches the desk structure so the Guided Tour type is browsable, authors a starter tour, and verifies selectors against the running Studio.

The plugin code ships **vendored** inside the skill (`skills/add-studio-tour/vendor/studio-tour`, currently studio-tour **v1.8.0**), so each Studio that installs the skill gets its own copy to adapt — no central runtime dependency to version or maintain.

## What is a Studio tour?

A **Studio tour** is a guided, step-by-step walkthrough that runs *inside* Sanity Studio. Each tour is an ordered set of steps; every step points at a real element of the Studio UI (via a CSS selector) and shows a small popover with a title, description, and optional media. Editors advance through the steps to learn where things live and how a workflow is meant to be done — onboarding, feature announcements, or "how we use this Studio" guidance — without leaving the app.

Tours are authored as content: a **Guided Tour** document type lives in your dataset, so non-developers can write, reorder, and publish steps from the Studio itself. Only published tours appear to editors.

> [!NOTE]
> A step's selector is what anchors the popover to the UI. If the Studio layout changes, re-verify selectors so steps don't point at the wrong (or a missing) element.

### What it looks like

<!-- IMAGE PLACEHOLDER -->
<!-- Replace with a screenshot of a tour step popover anchored to the Studio UI.
     Recommended: PNG/WebP, ~1200px wide. Store under docs/images/. -->
![Studio tour step popover](docs/images/studio-tour-step.png)

<!-- VIDEO PLACEHOLDER -->
<!-- Option A — uploaded asset (GitHub renders an inline player for mp4/mov/webm):
     drag the file into the README in GitHub's editor, or paste the asset URL: -->
https://github.com/sanity-labs/add-studio-tour/assets/<id>/studio-tour-demo.mp4

<!-- Option B — thumbnail that links out to a hosted recording (Loom/YouTube): -->
[![Watch the tour walkthrough](docs/images/studio-tour-thumbnail.png)](https://www.loom.com/share/<id>)

## Install

```bash
# add this repo as a marketplace, then install the plugin
claude plugin marketplace add sanity-labs/add-studio-tour
claude plugin install add-studio-tour@studio-tour
# restart Claude Code — skills load on the next session
```

Then run the skill (`/add-studio-tour`) in a project that has a Sanity Studio.

## Update

```bash
claude plugin marketplace update studio-tour
claude plugin update add-studio-tour@studio-tour   # restart to apply
```

## Layout

```
.
├── .claude-plugin/marketplace.json   # marketplace manifest (name: "studio-tour")
└── add-studio-tour/                  # the plugin (name: "add-studio-tour")
    ├── .claude-plugin/plugin.json
    └── skills/
        └── add-studio-tour/          # the skill — SKILL.md + vendored plugin tree
```

## Notes

- **Private vs public:** if this repo is private under `sanity-labs`, org members install over SSH exactly as above; make it public for anyone to install.
- **Canonical source:** the vendored code mirrors the upstream `sanity-plugin-studio-tour` package; the skill's `scripts/sync_vendor.sh` re-syncs it.
