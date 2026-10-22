#!/usr/bin/env bash
# Both parts of the before/after measurements, one after the other: scripts/perf-fixes-all.sh <before|after>.
cd "$(dirname "$0")/.."
scripts/perf-fixes-run.sh "$1" > "docs/perf-study/$1/run.log" 2>&1
scripts/perf-fixes-flat.sh "$1" > "docs/perf-study/$1/run-flat.log" 2>&1
