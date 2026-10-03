#!/usr/bin/env bash
# Run a command under the project-local Node pinned in .nvmrc.
# fnm and Node live in .tools/ (gitignored); system Node and global tools are untouched.
# Usage: scripts/node24.sh node -v   |   scripts/node24.sh npm ci
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FNM_DIR="$ROOT/.tools/fnm"
export PLAYWRIGHT_BROWSERS_PATH="$ROOT/.tools/ms-playwright"
export npm_config_cache="$ROOT/.tools/npm-cache"
FNM="$ROOT/.tools/bin/fnm"
if [ ! -x "$FNM" ]; then
  echo "fnm not found at $FNM; see docs/spikes/PHASE1_REPORT.md for setup" >&2
  exit 1
fi
VERSION="$(cat "$ROOT/.nvmrc")"
"$FNM" install "$VERSION" >/dev/null 2>&1 || true
exec "$FNM" exec --using="$VERSION" -- "$@"
