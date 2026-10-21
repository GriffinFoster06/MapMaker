#!/usr/bin/env bash
# Builds the unsigned MapMaker desktop app for the current OS into apps/desktop/release/ (docs/RELEASING.md).
# macOS: .dmg and .zip (+ latest-mac.yml). Windows (Git Bash): NSIS installer (+ latest.yml). Never publishes or signs.
# Usage: scripts/build-desktop.sh [--smoke]   (--smoke runs the Electron smoke test against the fresh bundle first)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
run() { "$ROOT/scripts/node24.sh" "$@"; }

run npm run desktop:build
if [ "${1:-}" = "--smoke" ]; then run npm run desktop:smoke; fi

case "$(uname -s)" in
  Darwin) TARGET=(--mac) ;;
  MINGW*|MSYS*|CYGWIN*) TARGET=(--win) ;;
  *) echo "error: build the macOS app on macOS and the Windows installer on Windows (decision W7)" >&2; exit 1 ;;
esac
# CSC_IDENTITY_AUTO_DISCOVERY=false: never pick up a signing identity from the keychain.
CSC_IDENTITY_AUTO_DISCOVERY=false run npx --no-install electron-builder --projectDir apps/desktop "${TARGET[@]}" --publish never
echo "== installers =="
ls -1 apps/desktop/release | grep -E '\.(dmg|zip|exe|yml|blockmap)$' || true
