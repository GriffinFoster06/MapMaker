#!/usr/bin/env bash
# Downloads the Kottek et al. (2006) Köppen-Geiger 0.5° grid used as ground truth by the tuning harness (Q8: data is
# downloaded at tuning time and never committed). The archive hash is the one logged in PROVENANCE.md.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="https://koeppen-geiger.vu-wien.ac.at/data/Koeppen-Geiger-ASCII.zip"
SHA256="4b85ca339b9aba4c6507ed0db9efad99334d56bd7010f417672a0c977b4b2f75"
# upstream/ is read-only (CLAUDE.md): the stock-harness parity test copies upstream/orogen to a temp dir and takes the data from here.
DEST=("$HERE/data/ascii")

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ -f "$HERE/data/ascii/Koeppen-Geiger-ASCII.txt" ] && [ -z "${FORCE:-}" ]; then echo "already present"; else
  curl -fsSL --retry 3 -o "$TMP/kg.zip" "$URL"
  GOT="$( (shasum -a 256 "$TMP/kg.zip" 2>/dev/null || sha256sum "$TMP/kg.zip") | cut -d' ' -f1)"
  [ "$GOT" = "$SHA256" ] || { echo "SHA-256 mismatch: got $GOT, expected $SHA256" >&2; exit 1; }
  unzip -q -o "$TMP/kg.zip" -d "$TMP/x"
  F="$(find "$TMP/x" -name 'Koeppen-Geiger-ASCII.txt' | head -1)"
  for d in "${DEST[@]}"; do mkdir -p "$d"; cp "$F" "$d/"; done
  echo "Köppen ground truth installed in ${DEST[*]}"
fi
