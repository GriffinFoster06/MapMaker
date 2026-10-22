# Default-seed search

Finds the seed in 1..1,000,000 whose continents and coastlines are statistically closest to real Earth at the default
parameters (not a copy of Earth's geography: no seed reproduces it, decision P1). Results and the choice:
`docs/earth-tests/DEFAULT_SEED.md`.

**Scored terms** (`score.mjs`): only terms that depend on the layout and whose Earth target is verified
(`docs/earth-tests/EARTH_TARGETS.md`): land fraction, landmass count / largest share / top-3 share (≥ 10⁶ km² after the
80 km erosion), box fill, straight-coast share. Same distances, tolerances and weights as
`tools/tuning/earthlike/objective-real.mjs`. Not scored: Köppen, rivers, hypsometry, slope, temperature.

**Funnel**
- **A** (`layout.mjs`): the reference pass cut short after the reference erosion, on the fixed 20k reference mesh (the layout
  does not depend on N, ARCHITECTURE L0). Bit-identical to `runReferencePass`'s `elevRaw`. About 0.27 s per seed on one core.
  Run over a fixed random order of 1..1,000,000 (sampling seed 20261022; any prefix is a uniform sample) in 16 shards until
  a deadline; one JSONL line per seed, a rerun skips finished seeds. Seeds whose land fraction is outside 0.1 to 0.5 are not
  rasterised.
- **B**: best 500 of A, the old default seed 12345, and 200 random sample seeds (the "median seed" reference), full structured
  pipeline at N = 50k, plus four threshold variants (erosion 2 and 4 passes; size threshold 0.8e6 and 1.25e6 km²). A seed is
  rejected if its count changes or its layout objective moves by more than 0.15 under any variant (it rests on a landmass at
  the edge of the threshold).
- **C**: best 10 robust seeds of B and 12345 at N = 200k; the winner is the best robust objective here.

**Reproduce** (about 1 h 45 min on an 18-core M-series Mac):

```
scripts/node24.sh npx tsx tools/tuning/earthlike/earth-real.mjs --N 20000   # 20k Earth target (once; committed)
tools/tuning/seed-search/run-a.sh 95                                          # stage A, 95 minutes, 16 shards
for k in $(seq 0 15); do scripts/node24.sh npx tsx tools/tuning/seed-search/search.mjs b --shard $k --of 16 & done; wait
for k in $(seq 0 9);  do scripts/node24.sh npx tsx tools/tuning/seed-search/search.mjs c --shard $k --of 10 & done; wait
scripts/node24.sh npx tsx tools/tuning/seed-search/search.mjs report          # results/seed-search/report.json
scripts/node24.sh node tools/tuning/seed-search/shots.mjs docs/feedback/seeds <seed,seed,...>   # needs desktop:build
```

Raw results are in `tools/tuning/results/seed-search/` (git-ignored); the report numbers are in `DEFAULT_SEED.md`. The set of
seeds scored in A depends on how far each shard got before the deadline; B and C are exact functions of A's rows.
