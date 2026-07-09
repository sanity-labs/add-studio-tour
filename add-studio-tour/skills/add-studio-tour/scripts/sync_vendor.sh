#!/usr/bin/env bash
# Re-copy the plugin's canonical source into the skill's vendor/ directory and
# stamp a VERSION marker. Run this from the sanity-tour-app monorepo whenever the
# plugin source changes, so the skill ships an up-to-date copy. (External users
# of the skill never need this — the vendored copy is already self-contained.)
#
# Usage: scripts/sync_vendor.sh [--version X.Y.Z]
#   --version bumps the logical plugin version; omit to preserve the current one.
#   BUMP IT whenever the plugin SOURCE changes (not on a pure reformat).
set -euo pipefail

# skill root = two levels up from this script (scripts/ -> add-studio-tour/)
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# plugin package root = the package that owns .claude/skills/add-studio-tour
PKG_SRC="$SKILL_DIR/../../../src"

if [[ ! -d "$PKG_SRC" ]]; then
  echo "✗ plugin source not found at $PKG_SRC — run this from inside the monorepo." >&2
  exit 1
fi

DEST="$SKILL_DIR/vendor/studio-tour"
STAGE="$DEST.tmp"

# Preserve the logical version across syncs unless --version is passed. Read it
# from the CURRENT vendored copy BEFORE touching anything, so an interrupted run
# can't reset the version to the 1.0.0 fallback on the next run.
VERSION="1.0.0"
if [[ -f "$DEST/VERSION" ]]; then
  PREV="$(grep -E '^version:' "$DEST/VERSION" | awk '{print $2}' || true)"
  [[ -n "$PREV" ]] && VERSION="$PREV"
fi
if [[ "${1:-}" == "--version" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "✗ --version needs a value, e.g. --version 3.4.0" >&2
    exit 1
  fi
  VERSION="$2"
fi

# Collect source files up front (nullglob so a missing .ts or .tsx doesn't leave
# a literal glob for cp to choke on), and refuse to proceed if there are none —
# rather than wiping the vendored copy and replacing it with nothing.
shopt -s nullglob
SRC_FILES=("$PKG_SRC"/*.ts "$PKG_SRC"/*.tsx)
shopt -u nullglob
if (( ${#SRC_FILES[@]} == 0 )); then
  echo "✗ no .ts/.tsx source files found in $PKG_SRC — aborting (vendored copy untouched)." >&2
  exit 1
fi

# Stage into a temp dir first; only swap it in once the copy fully succeeds. This
# keeps a partially-copied tree (or a failed cp) from ever replacing the live one.
rm -rf "$STAGE"
mkdir -p "$STAGE"
trap 'rm -rf "$STAGE"' EXIT
cp "${SRC_FILES[@]}" "$STAGE/"

# Count source files BEFORE writing VERSION so the marker isn't self-counted.
COUNT="${#SRC_FILES[@]}"
SRC_COMMIT="$(git -C "$PKG_SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
SYNCED="$(date -u +%F)"

cat > "$STAGE/VERSION" <<EOF
# sanity-plugin-studio-tour — vendored with the add-studio-tour skill.
#
# Copied along with the plugin when you vendor it into a Studio (Step 2), so an
# install can be compared against the skill's current copy to detect drift.
# version is the plugin's logical version — bump it when the plugin SOURCE
# changes (pass --version to sync_vendor.sh). synced, source-commit, and files
# are stamped automatically.
version: $VERSION
synced: $SYNCED
source-commit: $SRC_COMMIT
files: $COUNT
EOF

# Atomic-ish swap: validated staging dir replaces the live one in a single mv.
rm -rf "$DEST"
mv "$STAGE" "$DEST"
trap - EXIT

echo "✓ synced $COUNT files (v$VERSION, $SRC_COMMIT) → vendor/studio-tour/"

# Run the pure contract tests against the freshly-synced copy so a source change
# that breaks them is caught here, not silently shipped. Best-effort: skip with a
# warning if no runner is available.
if command -v npx >/dev/null 2>&1; then
  echo "▶ running contract tests…"
  if ! (cd "$SKILL_DIR" && npx --yes tsx --test tests/*.test.ts); then
    echo "✗ contract tests FAILED against the synced copy — fix before shipping." >&2
    exit 1
  fi
  echo "✓ contract tests passed"
else
  echo "⚠ npx not found — skipped contract tests; run 'npx tsx --test tests/*.test.ts' by hand." >&2
fi
