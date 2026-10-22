#!/usr/bin/env bash
# Before/after measurements of the first performance fixes (docs/checkpoints/PERFORMANCE_STUDY.md, "After the first fixes").
# Usage: scripts/perf-fixes-run.sh <before|after>. Needs the built web app served on 127.0.0.1:4173 and apps/desktop/dist. One run at a time.
cd "$(dirname "$0")/.."
tag=$1; out=docs/perf-study/$tag; mkdir -p "$out"
cfgs=styled+labels,styled+labels+ov,elev,ring-elev,ring-styled+labels,switch,flat-styled
for n in 500000 1000000 2560000; do
  for t in chromium firefox electron; do
    echo "== pan $t $n"
    scripts/node24.sh node scripts/perf-pan.mjs $t $n $out/pan-$t-$n.json $cfgs 2>&1 | grep -v "^$"
  done
done
for t in chromium electron firefox; do
  for n in 1000000 2560000; do
    echo "== render $t $n"
    scripts/node24.sh node scripts/perf-render.mjs $t $n $out/render-$t-$n.json base 2>&1 | grep -v "^$"
  done
done
echo DONE
