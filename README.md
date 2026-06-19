# add-studio-tour

Guided product tours for **Sanity Studio**, packaged as a standalone [Claude Code](https://claude.com/claude-code) plugin. It installs and wires [`sanity-plugin-studio-tour`](#) into an existing Studio: vendors the plugin, adds `tourPlugin` to the chosen workspaces, patches the desk structure so the Guided Tour type is browsable, authors a starter tour, and verifies selectors against the running Studio.

The plugin code ships **vendored** inside the skill (`skills/add-studio-tour/vendor/studio-tour`, currently studio-tour **v1.8.0**), so each Studio that installs the skill gets its own copy to adapt — no central runtime dependency to version or maintain.

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
