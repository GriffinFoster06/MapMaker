#!/usr/bin/env bash
# Downloads the independent Earth data of the Earth-likeness targets (decision P6) into data/ (git-ignored; only the
# derived statistics in targets/ are committed). Both sources are public domain; versions and hashes are logged in
# PROVENANCE.md. After downloading, `tsx tools/tuning/earthlike/earth-real.mjs` rebuilds targets/earth-real-*.json.
#   NOAA NCEI ETOPO 2022 v1, 60 arc-second surface elevation, GeoTIFF (466 MB).
#   Natural Earth 10m land and minor islands, v5.1.2, GeoJSON (nvkelso/natural-earth-vector tag v5.1.2).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HERE/data"
mkdir -p "$DEST"
NE="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson"
FILES=(
  "ETOPO_2022_v1_60s_N90W180_surface.tif|https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif|9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e"
  "ne_10m_land.geojson|$NE/ne_10m_land.geojson|1ac90796408bc6ad6911d69448485d3c4dbf2190370080368a09976e1c9f7416"
  "ne_10m_minor_islands.geojson|$NE/ne_10m_minor_islands.geojson|8c933ca7a4760256bdc46408355706e39764b0fa01c160c28888b90b4faec29f"
)
fresh=0
sha() { (shasum -a 256 "$1" 2>/dev/null || sha256sum "$1") | cut -d' ' -f1; }
for e in "${FILES[@]}"; do
  IFS='|' read -r name url want <<< "$e"
  if [ -f "$DEST/$name" ] && [ "$(sha "$DEST/$name")" = "$want" ] && [ -z "${FORCE:-}" ]; then echo "$name: present"; continue; fi
  curl -fsSL --retry 3 -o "$DEST/$name.part" "$url"
  got="$(sha "$DEST/$name.part")"
  [ "$got" = "$want" ] || { echo "$name: SHA-256 mismatch: got $got, expected $want" >&2; rm -f "$DEST/$name.part"; exit 1; }
  mv "$DEST/$name.part" "$DEST/$name"; fresh=1; echo "$name: downloaded"
done
[ "$fresh" = 0 ] || rm -f "$DEST/earth-5m.bin" # the cached 5' grid is rebuilt from new files
