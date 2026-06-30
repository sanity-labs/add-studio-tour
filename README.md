# add-studio-tour

Guided product tours for **Sanity Studio**, packaged as a standalone [Claude Code](https://claude.com/claude-code) plugin. It installs and wires [`sanity-plugin-studio-tour`](#) into an existing Studio: vendors the plugin, adds `tourPlugin` to the chosen workspaces, patches the desk structure so the Guided Tour type is browsable, authors a starter tour, and verifies selectors against the running Studio.

The plugin code ships **vendored** inside the skill (`skills/add-studio-tour/vendor/studio-tour`, currently studio-tour **v1.8.0**), so each Studio that installs the skill gets its own copy to adapt — no central runtime dependency to version or maintain.

## What is a Studio tour?

A **Studio tour** is a guided, step-by-step walkthrough that runs *inside* Sanity Studio. Each tour is an ordered set of steps; every step points at a real element of the Studio UI (via a CSS selector) and shows a small popover with a title, description, and optional media. Editors advance through the steps to learn where things live and how a workflow is meant to be done — onboarding, feature announcements, or "how we use this Studio" guidance — without leaving the app.

Tours are authored as content: a **Guided Tour** document type lives in your dataset, so non-developers can write, reorder, and publish steps from the Studio itself. Only published tours appear to editors.

> [!NOTE]
> A step's selector is what anchors the popover to the UI. If the Studio layout changes, re-verify selectors so steps don't point at the wrong (or a missing) element.

### What it looks like
**Studio Tour Selector**
<img width="1579" height="949" alt="Screenshot 2026-06-30 at 16 53 15" src="https://github.com/user-attachments/assets/1eab0e1a-cbff-4066-a597-6dbe50de4e2e" />
**Studio Tour Step**
<img width="1503" height="934" alt="Screenshot 2026-06-30 at 16 53 34" src="https://github.com/user-attachments/assets/48d78306-303b-4ba5-956f-c6693d9f96e7" />
**Studio Tour Dashboard**
<img width="1505" height="806" alt="Screenshot 2026-06-30 at 16 54 18" src="https://github.com/user-attachments/assets/c248b0a4-6689-4f0b-b8a7-081e82bf1c19" />


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
