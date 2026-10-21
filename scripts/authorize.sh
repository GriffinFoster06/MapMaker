#!/usr/bin/env bash
# Usage: scripts/authorize.sh <checkpoint>   e.g. scripts/authorize.sh 6
# Run by the user only (agents must never run it or edit the line themselves). Sets the "Authorized through" line in
# docs/RESUME.md to the given checkpoint, commits that one change on a new branch authorize-<name> and pushes it.
set -euo pipefail

name="${1:-}"
if [ -z "${name// /}" ]; then
  echo "Usage: scripts/authorize.sh <checkpoint>   (for example: scripts/authorize.sh 6)" >&2
  exit 1
fi
slug="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
if [ -z "$slug" ]; then echo "Checkpoint name has no usable characters." >&2; exit 1; fi

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain)" ]; then echo "Working tree has uncommitted changes; commit or stash them first." >&2; exit 1; fi
if ! grep -q '^- \*\*Authorized through' docs/RESUME.md; then echo "No 'Authorized through' line in docs/RESUME.md." >&2; exit 1; fi

branch="authorize-$slug"
git fetch -q origin
git switch -q -c "$branch" origin/main

NAME="$name" python3 - <<'PY'
import os, re
p = 'docs/RESUME.md'
s = open(p, encoding='utf-8').read()
line = f"- **Authorized through: {os.environ['NAME']}.** Set by `scripts/authorize.sh`; only the user changes this line."
s, n = re.subn(r'^- \*\*Authorized through.*$', line, s, count=1, flags=re.M)
assert n == 1
open(p, 'w', encoding='utf-8').write(s)
PY

git add docs/RESUME.md
git commit -q -m "Authorize work through $name"
git push -q -u origin "$branch"
echo "Done. Branch $branch is pushed. Next: open the PR for it on GitHub (Compare & pull request), merge it as a merge commit, then type /go."
