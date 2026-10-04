#!/usr/bin/env bash
# Re-clone every repo listed in upstream-manifest.json into upstream/ at the
# exact recorded commit. Use this to rebuild upstream/ on a fresh machine
# (it is gitignored and never committed).
#
# Usage: restore-upstream.sh [repo-name ...]
#   With no arguments every repo is restored (about 17 GB). With names, only those (e.g. CI: orogen Azgaars-Fantasy-Map-Generator).
#
# Requires: git, python3, jq (optional — falls back to python3 if absent)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/upstream-manifest.json"
UPSTREAM_DIR="$ROOT_DIR/upstream"

if [ ! -f "$MANIFEST" ]; then
  echo "error: $MANIFEST not found" >&2
  exit 1
fi

mkdir -p "$UPSTREAM_DIR"

WANT=("$@")
wanted() {
  [ ${#WANT[@]} -eq 0 ] && return 0
  local w
  for w in "${WANT[@]}"; do [ "$w" = "$1" ] && return 0; done
  return 1
}

# Emit "name|remote|commit" lines from the manifest, one per repo.
repo_lines() {
  python3 - "$MANIFEST" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
for repo in data["repos"]:
    print(f'{repo["name"]}|{repo["remote"]}|{repo["commit"]}')
PY
}

while IFS='|' read -r name remote commit; do
  wanted "$name" || continue
  target="$UPSTREAM_DIR/$name"
  if [ -d "$target/.git" ]; then
    echo "== $name already present, skipping (delete $target to force re-clone) =="
    continue
  fi
  echo "== Cloning $name @ $commit =="
  git clone "$remote" "$target"
  git -C "$target" checkout "$commit" --detach
done < <(repo_lines)

echo "Done. upstream/ restored to the commits recorded in upstream-manifest.json."
