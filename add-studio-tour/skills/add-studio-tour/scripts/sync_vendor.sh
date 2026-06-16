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

# Preserve the logical version across syncs unless --version is passed.
VERSION="1.0.0"
if [[ -f "$DEST/VERSION" ]]; then
  PREV="$(grep -E '^version:' "$DEST/VERSION" | awk '{print $2}' || true)"
  [[ -n "$PREV" ]] && VERSION="$PREV"
fi
if [[ "${1:-}" == "--version" && -n "${2:-}" ]]; then
  VERSION="$2"
fi

rm -rf "$DEST" && mkdir -p "$DEST"
cp "$PKG_SRC"/*.ts "$PKG_SRC"/*.tsx "$DEST/"

# Count source files BEFORE writing VERSION so the marker isn't self-counted.
COUNT="$(ls "$DEST" | wc -l | tr -d ' ')"
SRC_COMMIT="$(git -C "$PKG_SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
SYNCED="$(date -u +%F)"

cat > "$DEST/VERSION" <<EOF
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

echo "✓ synced $COUNT files (v$VERSION, $SRC_COMMIT) → vendor/studio-tour/"
