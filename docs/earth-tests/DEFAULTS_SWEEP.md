# Earth-likeness sweep of the generation sliders (decision P2, queue item Q3)

Run 2026-10-19 against `earth.png` targets; the defaults were changed later against independent data (section "Defaults changed against independent Earth data"). Tools: `tools/tuning/earthlike/` (`metrics.mjs`, `shape.mjs`, `earth.mjs`, `sweep.mjs`, test `earthlike.test.ts`). Raw aggregated results: `defaults-sweep-report.json` here; per-world rows (43 MB) stay in the git-ignored `tools/tuning/results/earthlike/`. Nothing under `packages/`, `OROGEN_DEFAULTS`, goldens or baselines was touched.

## Result

An **Earth-like preset** (configuration L612) was added to the settings panel (`PRESETS` in `apps/web/src/settings.ts`, tests in `settings.test.ts`). The defaults are unchanged.

| slider | default | Earth-like | slider | default | Earth-like |
|---|---|---|---|---|---|
| Irregularity (`jitter`) | 0.75 | 0.75 | Glacial erosion | 0.5 | 0.75 |
| Plates (`P`) | 80 | 81 | Hydraulic erosion | 0.5 | 0.4 |
| Continents | 4 | 4 | Thermal erosion | 0.1 | 0.25 |
| Roughness (`nMag`) | 0.4 | 0.23 | Ridge sharpening | 0.5 | 0.95 |
| Continent size variety | 0.35 | 0.1 | Temperature (°C) | 0 | −2 |
| Land coverage | 0.3 | 0.36 | Precipitation | 0 | −0.5 |
| Terrain warp | 0.75 | 0 | Smoothing | 0.1 | 0.15 |

Earth distance (objective, lower is better; 1 means every term is one tolerance away; mean ± standard error over seeds):

| | search seeds (5) | held-out seeds (20), N = 50k | held-out (5), N = 200k |
|---|---|---|---|
| defaults | not run in the search | 0.889 ± 0.022 | 0.968 ± 0.038 |
| Earth-like (L612) | 0.702 ± 0.035 (rank 1 of 6000) | 0.735 ± 0.014 | 0.729 ± 0.019 |
| runner-up (L2801) | 0.765 | 0.761 ± 0.012 | 0.772 ± 0.035 |

The improvement holds on held-out seeds and at four times the resolution, but **it is modest** (0.89 to 0.74), and part of it is simply land fraction: the defaults give 27.5% land (Earth 31.4%), the preset 31.7%.

## Defaults changed against independent Earth data (decision P6, 2026-10-22)

**Supersedes the defaults part of this report.** The sweep above scored against `earth.png` targets. P6 rebuilt the targets from independent data on the same mesh as the worlds (`docs/earth-tests/EARTH_TARGETS.md`: ETOPO 2022, Natural Earth, Kottek, 14 to 15 °C) and searched again. Result: **land coverage 0.30 → 0.31** and **temperature offset 0 → −3**; continents, smoothing and every generator-specific slider keep orogen's defaults. A first pass on this branch had set land coverage to 0.36 from the `earth.png` land fraction (31.4%); on the mesh Earth has 28.6% land, which 0.36 overshoots (32%), so that change was replaced.

Rule (user, P6): a default changes only where the finalist beats the current default by more than twice the standard error **and** wins under every reweighting; the temperature and precipitation offsets only where they can be compared in real units. The model's temperature is in °C (0 to 1 over −45 to +45 °C), so the global mean is compared with Earth's 14 to 15 °C; its precipitation is normalised (the mm/yr mapping is Phase 8), so the **precipitation offset stays 0 and was not searched**.

**Objective** (`tools/tuning/earthlike/objective-real.mjs`): the earlier terms with independent targets (land fraction, land hypsometry, slope percentiles, continents, Köppen shares, shape) plus mean temperature (target 14.5 °C, tolerance 1 °C, weight 1). River statistics come from our own drainage on ETOPO, with no observed river data in the repo, so they are reported and not scored. Noise and slider effect of every term (broad stage; noise = standard error of a configuration's mean over its 8 seeds, in tolerance units; effect = largest |t| of the linear or squared coefficient of a least-squares fit on the four searched sliders and the seeds):

| term | noise (SE) | spread of configuration means | moved most by (largest \|t\|) | note |
|---|---|---|---|---|
| land fraction | 0.075 | 1.12 | land coverage (357) | |
| hypsometry | 0.038 | 0.065 | continents (32) | barely moved: spread 1.7× noise; generated land stays too low (needs model changes) |
| slope | 0.046 | 0.14 | smoothing (39), continents (24) | moved, but no slider closes the gap: the best is 1.44 tolerance units, the default 1.54 (generated slopes p90/p99 are about 2× Earth's) |
| continents | 0.054 | 0.45 | continents (111) | |
| Köppen | 0.085 | 0.57 | temperature (222), land coverage (45) | |
| shape | 0.079 | 0.11 | continents (28) | barely moved: spread 1.4× noise |
| mean temperature | 0.037 | 1.31 | temperature (166) | |
| rivers (not scored) | 0.022 | 0.095 | continents (51), smoothing, land coverage (32) | |

**Search** (`tools/tuning/earthlike/search.mjs`, resumable JSONL shards in the git-ignored `tools/tuning/results/earthlike-real/`). Sliders with an Earth-measurable target: land coverage 0.15 to 0.50, continents 1 to 10, smoothing 0 to 1, temperature offset −10 to +5 °C (panel steps); the rest at orogen's defaults. Stage 1: Latin hypercube of 2,500 configurations plus the defaults × 8 common seeds (201 to 208), N = 50k, 20,008 worlds in 42 min on 14 processes. Stage 2: coordinate search (one panel step in each direction) from the best 10 until no new neighbours, 5 rounds, 1,040 worlds. Stage 3: the best 3, the defaults and the defaults with each single slider of the best finalist, on held-out seeds never used before: 40 at N = 50k (9101 to 9140), 20 at N = 200k (9201 to 9220). Budget: about 1 h of the 3 h allowed was needed; the sample was sized to the four searched dimensions (2,500 points), not scaled down.

**Results.** Best on the broad seeds: land coverage 0.31, continents 4, smoothing 0.1, temperature −3 (0.878 ± 0.015; defaults 1.130, rank 81). The optimum is flat in smoothing (0.05 to 0.3 within 0.004) and in land coverage 0.31 to 0.32. Confirmation, paired difference from orogen's defaults (negative = better), mean ± standard error:

| configuration | N = 50k (40 seeds) | N = 200k (20 seeds) | worst of the 31 reweightings (50k) |
|---|---|---|---|
| defaults + temperature −3 | −0.240 ± 0.006 | −0.235 ± 0.009 | −0.005 ± 0.005 (mean temperature and shape removed) |
| defaults + land coverage 0.31 | −0.030 ± 0.010 | −0.031 ± 0.010 | −0.015 ± 0.005 (all tolerances ×2) |
| both (the new defaults) | −0.262 ± 0.010 | −0.253 ± 0.011 | −0.039 ± 0.012 |
| both + smoothing 0.15 | −0.270 ± 0.010 | −0.258 ± 0.010 | −0.049 |

Reweightings: each scored term's weight and tolerance ×0.5 and ×2, all tolerances ×0.5 and ×2, and the less certain terms (mean temperature, a literature value; shape, our definition) removed. In real units: mean temperature 17.30 → 14.30 °C (50k) and 17.28 → 14.28 °C (200k), inside 14 to 15 °C (−2 would give 15.3); land fraction 0.273 → 0.280 (Earth on the mesh 0.286; 0.32 is as good within noise). The temperature change rests on the temperature term: without it the change is −0.005 ± 0.005, not significant, but it still wins, which is what the rule asks. **Smoothing stays 0.1**: 0.15 is better on the 50k held-out seeds (−0.0085 ± 0.0023) but not at 200k (−0.0046 ± 0.0031, 1.5 SE) and worse on the broad seeds (+0.003 ± 0.004). **Continents stay 4** (every finalist has 4).

**The Earth-like preset** (L612) now lists only the sliders that differ from the new defaults (12; jitter and continents equal them). Against the independent targets it scores **worse than the new defaults** (+0.12 ± 0.02 on seeds 9001 to 9020 at 50k, mostly slope; +0.10 ± 0.03 with the new land coverage and temperature), so its tip says so; whether to keep, re-sweep or remove it is the user's call (a re-sweep of the generator sliders against these targets is the natural follow-up, P2's Phase 6b and 8 repeats).

Reproduce: `tools/tuning/earthlike/fetch-earth.sh`; `tsx tools/tuning/earthlike/earth-real.mjs`; `tsx tools/tuning/earthlike/search.mjs run --stage broad --n 2500 --shard k --of 14` (14 shards), then for r = 1, 2, … `search.mjs plan --round r` and the shards of `run --stage refine --round r`, then `run --stage confirm --N 50000` and `--N 200000` in shards, then `search.mjs report`. The first-pass checks of temperature and smoothing against the `earth.png` targets (`defaults-check.mjs`) are kept in git history (commit `c714432`); their conclusions are superseded by this section.

## What the preset does not fix (means over the 20 held-out seeds, N = 50k)

| | defaults | Earth-like | Earth |
|---|---|---|---|
| land fraction | 0.275 | 0.317 | 0.314 |
| land elevation, median / p90 / p99 (m) | 68 / 1549 / 5570 | 65 / 1848 / 6000 | 457 / 1946 / 4705 |
| largest landmass, share of land | 0.30 | 0.29 | 0.56 |
| landmasses ≥ 10⁶ km² | 4.2 | 4.4 | 6 |
| box fill / straight coast (P3 metrics) | 0.41 / 0.08 | 0.43 / 0.09 | 0.39 / 0.14 |
| Köppen share A / B / C / D / E | .26 / .20 / .23 / .19 / .12 | .22 / .21 / .22 / .20 / .15 | .21 / .27 / .15 / .22 / .16 |
| Hack exponent; river km per 1000 km² | 0.57; 9.4 | 0.57; 9.6 | 0.58; 9.5 |

Generated land is too low (median 65 m against 457 m), has no dominant supercontinent, is too compact (P3), and has too little desert (B) and too much temperate (C). No combination of the 14 sliders fixes those; they need model changes (Phase 6b, Phase 8). Rivers and Hack's law already match Earth at the defaults.

## Metrics (all computed from data in the repo)

Earth goes through the same functions as a world: the heightmap `packages/gen-orogen/vendor/assets/earth.png` imported at the same N and mesh, and Kottek et al.'s Köppen grid (`tools/tuning/climate/data`, from `fetch-kottek.sh`). Terms, weight and tolerance (`TERMS` in `metrics.mjs`): land fraction (2, 0.04); hypsometry, mean absolute difference of 12 area-weighted land-elevation quantiles (2, 400 m); slope percentiles 50/90/99, log ratio (1, 0.4); continents, mean of count ratio and shares of the largest and three largest landmasses (1.5); Köppen shares by area, global and in three latitude bands, plus class level (2, 0.15); river density and Hack's law (1); shape, box fill and straight-coast share (1.5; Q2's metrics). Objective = weighted mean of min(distance / tolerance, 4). Landmasses are eroded by about 80 km before counting so that Panama and Suez do not join Earth's continents. Weights and tolerances are my choice; the rows store raw metrics, so they can be changed and re-scored without regenerating.

**Missing inputs (not invented):** plate sizes and speeds (PB2002), seafloor-age distribution, lake counts, biome areas, species richness, bathymetry (the Earth heightmap's ocean values are not real depths, so only land hypsometry is scored), and a second source for river statistics. Terms for them cannot be added until the data is in the repo.

## Search

Latin hypercube over the 14 sliders (ranges and steps from `apps/web/src/settings.ts`, seeded), preview tier N = 50k, structured pipeline. Pilot: 30 configurations × 5 seeds, 150 worlds in about 35 s on 12 parallel processes (about 1.6 s per world, 8 s of CPU per configuration). Full run sized from that: 6000 configurations × 5 seeds = 30,000 worlds, about 70 minutes on 14 processes (18-core Mac), resumable (one JSONL line per world; a rerun skips finished ones) and chunked (`--shard k --of m`). Refine: the best 10 × 20 more seeds. Validation: held-out seeds 9001 to 9020 (never used for selection), plus 5 of them at N = 200k.

**A scoring bug found and fixed during the run:** worlds with almost no land (land coverage 0) produced undefined statistics that scored well, so the first two "winners" were empty worlds. A world with under 2% land now scores the cap on every term (test added), the stored metrics were re-scored, and the refine, validation, sensitivity and 200k stages were rerun on the corrected ranking. The `L1523` rows in the stage files are the stale pre-fix selection and are ignored.

## Slider sensitivity

Correlation of each slider (normalised) with the objective over the 6000 configurations (negative = a higher value is better): continents −0.22, temperature offset −0.11, land coverage −0.10, roughness −0.08, ridge sharpening −0.03; hydraulic erosion +0.14, smoothing +0.10, terrain warp +0.08, plates +0.07, thermal erosion +0.06; the rest under 0.03. One-at-a-time around the best (sliders at 25% and 75% of their range, 5 seeds): land coverage is by far the most sensitive (+0.43 and +0.73), then temperature offset low (+0.19), continents high (+0.16), smoothing high (+0.08); terrain warp, jitter, glacial erosion, ridge sharpening, hydraulic erosion and precipitation barely matter (|Δ| ≤ 0.03 at these points).

## Caveats

- **Terrain warp = 0 in the preset is not evidence that warp is bad:** the objective is insensitive to it (0.75 scores +0.02 worse, within noise), so the optimiser landed on 0. Warp gives organic coastlines; if the preset looks too smooth, set it back to 0.75, which this sweep cannot distinguish.
- Preview tier only for selection; 200k confirmed the top two, not the whole ranking. Larger tiers were not tested.
- The objective is my construction (weights, tolerances); a different weighting may pick a different configuration. The runner-up is nearly as good (0.76) with different sliders (more continents, much higher thermal erosion), which says the optimum is flat.
- Earth is one realisation; "continents" and "largest landmass" depend on how landmasses are separated.
- P2 said to repeat the sweep after Phase 6b and redo it for all parameters in Phase 8.
