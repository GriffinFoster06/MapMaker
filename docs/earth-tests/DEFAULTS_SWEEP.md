# Earth-likeness sweep of the generation sliders (decision P2, queue item Q3)

Run 2026-10-19. Tools: `tools/tuning/earthlike/` (`metrics.mjs`, `shape.mjs`, `earth.mjs`, `sweep.mjs`, test `earthlike.test.ts`). Raw aggregated results: `defaults-sweep-report.json` here; per-world rows (43 MB) stay in the git-ignored `tools/tuning/results/earthlike/`. Nothing under `packages/`, `OROGEN_DEFAULTS`, goldens or baselines was touched.

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
