#!/usr/bin/env bash
# Flat-map part of the before/after measurements (docs/checkpoints/PERFORMANCE_STUDY.md, "After the first fixes"): the first switch
# from the globe to the flat map (texture upload stall) and drag-panning the zoomed flat map with overlays. One run at a time.
# Usage: scripts/perf-fixes-flat.sh <before|after>.   flat-switch must come first (it is the first upload of the world's textures).
cd "$(dirname "$0")/.."
tag=$1; out=docs/perf-study/$tag; mkdir -p "$out"
for n in 1000000 2560000; do
  for t in chromium electron firefox; do
    echo "== flat $t $n"
    scripts/node24.sh node scripts/perf-pan.mjs $t $n $out/flat-$t-$n.json flat-switch,flat-pan,flat-pan-styled 2>&1 | grep -v "^$"
  done
done
echo DONE
