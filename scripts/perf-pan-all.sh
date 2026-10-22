#!/usr/bin/env bash
# Pass A of the pan study: every browser at 500k, 1M, 2.56M, one at a time (docs/checkpoints/PERFORMANCE_STUDY.md).
cd "$(dirname "$0")/.."
for n in 500000 1000000 2560000; do
  for t in chromium firefox electron; do
    echo "== $t $n"
    scripts/node24.sh node scripts/perf-pan.mjs $t $n docs/perf-study/pan-$t-$n.json all 2>&1 | grep -v "^$"
  done
done
echo DONE
