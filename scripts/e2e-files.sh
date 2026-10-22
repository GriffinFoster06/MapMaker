#!/usr/bin/env bash
# The spec files of one e2e group (apps/web/e2e), for the CI matrix in ci.yml and cloudflare.yml. The groups split the slowest
# specs (GPU shaders, styled map, flat map: minutes on macOS Firefox) from the rest so that no job waits for all of them.
# `core` is every spec file the other groups do not name, so a new spec runs without touching the workflows.
# Usage: scripts/e2e-files.sh gpu|cartomap|heavy|core
cd "$(dirname "$0")/.."
all=$(ls apps/web/e2e/*.spec.ts)
case "$1" in
  gpu) echo "apps/web/e2e/gpu.spec.ts" ;;
  cartomap) echo "apps/web/e2e/carto.spec.ts apps/web/e2e/map.spec.ts" ;;
  heavy) echo "apps/web/e2e/gpu.spec.ts apps/web/e2e/carto.spec.ts apps/web/e2e/map.spec.ts" ;;
  core) echo "$all" | grep -Ev '/(gpu|carto|map)\.spec\.ts$' | tr '\n' ' ' ;;
  *) echo "unknown group: $1" >&2; exit 1 ;;
esac
