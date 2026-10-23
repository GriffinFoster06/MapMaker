#!/bin/bash
# Stage A in parallel shards (default 16 of 18 cores; leaves 2 free), stopping at the deadline: run-a.sh [minutes]
cd "$(dirname "$0")/../../.." || exit 1
MIN=${1:-95}; SHARDS=${SHARDS:-16}
UNTIL=$(( ($(date +%s) + MIN*60) * 1000 ))
date +%s > tools/tuning/results/seed-search-a-start.txt 2>/dev/null
for k in $(seq 0 $((SHARDS-1))); do
  scripts/node24.sh npx tsx tools/tuning/seed-search/search.mjs a --shard $k --of $SHARDS --until $UNTIL > /dev/null 2>&1 &
done
wait
