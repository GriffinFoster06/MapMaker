# Default seed (decision S1)

Built 2026-10-23 by `tools/tuning/seed-search/` (README there: method and reproduce commands). The default seed was 12345; it is now **241774**. This is the seed whose continents and coastlines are statistically closest to real Earth among the sampled seeds at the P6 defaults. No seed reproduces Earth's actual coastlines (decision P1), and the choice is close to arbitrary among the top few (below).

## Terms

Only layout terms with a verified Earth target (`EARTH_TARGETS.md`): land fraction (target 28.6% on the mesh), landmass count / largest share / top-3 share (≥ 10⁶ km² after the 80 km erosion; Earth 6 / 0.57 / 0.84 as joined Afro-Eurasia), box fill, straight-coast share. Same distances, tolerances and weights as `objective-real.mjs`. Not used: Köppen, rivers, hypsometry, slope, temperature. Score = weighted mean of capped normalised distances (lower is better; 1 = every term one tolerance away).

## Cost and coverage

- Cheapest layout-fixing run: the reference pass cut after the reference erosion on the 20k mesh, bit-identical to `runReferencePass`'s `elevRaw` (checked on seeds 1, 777, 12345). Single core, idle machine: 0.23 to 0.32 s plus about 0.055 s to score. The measured mean during the search (16 shards on 18 cores, other work running) was **0.85 s per seed per core** (0.69 layout + 0.16 score).
- All 1,000,000 seeds would take about 13 hours at that rate, so the budget (95 minutes for stage A, 2 hours for the search) allowed a random sample: fixed shuffle of 1..1,000,000, sampling seed 20261022. **142,746 seeds scored** (14.3% of the range). Seeds found by a later, larger search could beat this; the sample is uniform, so the winner is a top-0.0007% seed of the sample, not of the range.
- Stage B: 701 worlds at N = 50k (the best 500 of A, 200 random sample seeds as the median reference, and 12345), about 85 s of core time each. Stage C: 11 worlds at N = 200k.

## Robustness (measurement artifacts)

Each stage-B/C world is re-scored with erosion 2 and 4 passes (40 to 120 km isthmuses) and size thresholds 0.8e6 and 1.25e6 km². A seed is rejected if its landmass count changes or its objective moves by more than 0.15. 142 of the 500 stage-B seeds were rejected (the best raw stage-B seed, 907370 at 0.253, was one: its count flips); one stage-C seed (181133) was rejected at 200k. The kept seeds move by at most 0.015 (winner 0.007).

## Result

| # | Seed | Score N=200k | Score N=50k | Score 20k (A) | landFrac | landmasses | largest / top-3 | box fill | straight |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **241774** | **0.379** | 0.342 | 0.289 | 0.287 | 5 | 0.346 / 0.764 | 0.380 | 0.098 |
| 2 | 234803 | 0.403 | 0.349 | 0.299 | 0.283 | 5 | 0.368 / 0.870 | 0.385 | 0.113 |
| 3 | 308078 | 0.411 | 0.297 | 0.311 | 0.288 | 6 | 0.368 / 0.829 | 0.367 | 0.084 |
| 4 | 614482 | 0.438 | 0.335 | 0.312 | 0.286 | 6 | 0.355 / 0.831 | 0.379 | 0.071 |
| 5 | 268513 | 0.445 | 0.361 | 0.284 | 0.287 | 4 | 0.314 / 0.811 | 0.380 | 0.092 |

Earth (mesh targets, N = 200k): land 0.287, 6.4 ± 0.55 landmasses, largest 0.49 ± 0.12, box fill 0.376 (N = 50k), straight 0.174 (N = 50k). Ranks 6 to 9 at 200k: 23857 (0.450), 817449 (0.457), 331332 (0.471), 104961 (0.495). Images: `docs/feedback/seeds/` (`contact-sheet.png`, `seed-<n>-flat.png`, `seed-<n>-globe.png`; the top 12 are the nine robust stage-C seeds and stage-B ranks 11 to 13). The globe is the initial view, so a seed can look like mostly ocean there; the flat map shows the layout.

## Overfitting and noise

- Against the stage-B median seed (random reference group, 200 seeds, median 0.632): the winner is 0.29 better at N = 50k (0.342). Against 12345: 0.573 at 50k and 0.603 at 200k, so the winner is 0.23 and 0.22 better. 12345 was not in the sample's best list; it sits near the median.
- Measurement noise of one score (the same layout measured on the 20k reference raster and on the 50k world, sd of the difference / √2, over 500 seeds): **σ = 0.030**. The top 500 were selected on A, and their B scores are 0.13 worse on average (winner's curse), so A scores are optimistic and only B and C scores are comparable.
- Seeds within noise of the winner: at N = 200k, 234803 is within 1σ (0.024 away) and 308078 within 1.1σ; at N = 50k, 9 of the 358 robust seeds are within 2σ of the best. **The winner is not distinguishable from the next two or three; the choice among the top 5 is arbitrary within the noise.** The stage-B order did not hold at 200k (the stage-B best, 308078, is third; the shape term, box fill and straight coast, moves most with N). The top 5 is what matters.
- The scored terms leave out hypsometry, climate and rivers by design; the winner is not tuned to them. Two terms systematically differ from Earth for every seed at the default parameters (largest-landmass share about 0.35 against 0.57; straight-coast share 0.07 to 0.11 against 0.17), so the generator, not the seed, would have to move to close them.

## Swap the choice

One line: `seed: 241774` in `packages/gen-orogen/src/params.ts` (`OROGEN_DEFAULTS`), and the same number in `apps/web/index.html` (`id="seed"`) and the two `|| 241774` fallbacks in `apps/web/src/app.ts`.

## What the change touched

No golden, hash, probe key or baseline depends on the default seed: every test fixes its own seed (1, 777, 12345, ...). All 534 unit tests pass unchanged, so nothing was re-recorded.
