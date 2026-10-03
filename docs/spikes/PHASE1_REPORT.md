# Phase 1 report (Checkpoint 1)

Date: 2026-10-03. Spikes 1a–1d were run with:
- orogen at `cc2662b`, Azgaar at `3d94b80`, VPLanet at `dd55da7`;
- Node 24.21.0, project-local;
- macOS 27 on Apple-silicon arm64 (18 cores, 64 GB).

All spike code is in `spikes/` and is throwaway. Raw results are in `spikes/*/results/`, images are in `docs/spikes/img/`, and the commands are listed at the end. `upstream/` was not modified: `git status` is clean in every upstream repo. System Node is still 22.19.0.

## Summary

| Question | Answer |
|---|---|
| Do orogen's ratings hold? | **Mostly.** Tectonics, erosion and climate run headless and match the audit. The Köppen row should drop from 5 to 4. Measured skill against Earth is 38–40% exact class and 72% major group. |
| Is orogen deterministic? | **Yes, including across engines.** All 69 output arrays are bit-identical across repeat runs, fresh processes, Node, Chromium 140, Firefox 141 and WebKit 26, at 20k, 200k and 1M cells. |
| Is low-N orogen a faithful preview of high-N orogen? | **No.** Continent layout and land fraction carry over. Cell-level fields do not, and they do not converge as N grows (1M → 2.56M still differs). The fidelity slider needs a design change. See 1c. |
| Can Azgaar's hydrology run on orogen's sphere? | **Yes, with no edits to Azgaar's source.** All three pass criteria are met at 200k. One real defect appears at higher N: Uint16 flux overflow. |
| Can orogen's coarse-plate stage take pinned constraints? | **Yes, with limits.** A patch of about 110 lines in 4 files pins plates and land/sea exactly. Elevation and mountains inside a pinned region are *not* held, so partial-world mode must also hold imported elevation. |
| GPlates license | **GPL-2.0-only, confirmed.** `COPYING` says "version 2 … not any later version". Math-reference only, permanently. |
| VPLanet as golden-data oracle | **Usable.** It builds with clang with no warnings and runs `EarthClimate` in 105 s. |

**Decisions needed from you:**
- Q7: final thresholds, proposed in 1c.
- Q3: cross-engine scope, proposed in 1a.
- Whether to adopt the fidelity-slider redesign (proposed architecture change 1).

---

## 1a. Build and run orogen and Azgaar; confirm ratings

### orogen headless harness

`spikes/lib/orogen.mjs` runs orogen's **unmodified** `planet-worker.js` `generate` command in Node.
- It shims `self` and captures the posted result.
- A Node resolve hook maps orogen's CDN Delaunator import to the same version (5.0.1) installed locally.
- `spikes/1a/browser-worker.js` is the same harness inside a real module Worker, bundled with esbuild, for the browser runs.

The parameters are orogen's slider defaults: P = 80, 4 continents, jitter 0.75, and so on.

| N (cells) | Node | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| 20k | 0.57 s | 0.54 s | 0.58 s | 0.58 s |
| 200k | 3.9–4.0 s | 3.8–3.9 s | 4.3–4.5 s | 4.7 s |
| 1M | 23 s | 23 s | 30 s | 35 s |
| 2.56M | 73–77 s (Node, from 1c) | — | — | — |

### Determinism

Results are in `spikes/1a/results/determinism-*.json`.

| Check | 20k s12345 | 200k s12345 | 200k s777 | 1M s4242 |
|---|---|---|---|---|
| Repeat run in the same process | identical | identical | identical | identical |
| Fresh Node process | identical | identical | identical | identical |
| Chromium 140 vs Node | identical | identical | identical | identical |
| Firefox 141 vs Node | identical | identical | identical | identical |
| WebKit 26 vs Node | identical | identical | identical | identical |

"Identical" means every one of the 69 typed arrays has the same SHA-256. That covers mesh, plates, elevation, wind, currents, precipitation, temperature, Köppen and all debug layers.

Caveats:
- Everything ran on one machine (macOS arm64).
- Windows/x64 was not tested.
- Playwright's WebKit build stands in for Safari.

**Q3 recommendation.** orogen already achieves cross-engine bit-exactness here without a deterministic math library. I recommend:
- making cross-engine exactness a **tested goal**: CI runs the hash test on all three engines;
- keeping `dmath` as a pass-through;
- switching to a vendored fdlibm only if a divergence appears, for example on Windows or in new code.

The guarantee stays "same engine" until a Windows run confirms it.

### F1: axis convention and the seam cell

Results are in `spikes/1a/results/axis-seam-N200000.json`, from 5 seeds at 200k.
- **Axis permutation confirmed.** For every cell, `asin(y_o)` equals `asin(Z)` and `atan2(x_o, z_o)` equals `atan2(Y, X)` with zero error. orogen's east vector is `(cos λ, 0, −sin λ)`, which agrees with the cyclic permutation.
- **The seam cell is at exactly (0°N, 0°E).** It is region N, orogen-frame `(0, 0, 1)`. The spiral's other end sits at about (0°N, 180°E).
- **The seam cell is geometrically irregular.**
  - Area: 0.28–0.62× the mean cell area.
  - Degree: 4–6 (median degree is 6).
  - Nearest neighbour: 0.54–0.70× the median spacing.
- **No field artifact was found there.** Within the equatorial band, the seam cell's roughness (|f − mean of neighbours|) falls between the 18th and 97th percentile across fields and seeds, with no field consistently extreme. Elevation sits at the 25th–87th percentile.
- **New finding: orogen stores mesh points as Float32** (`r_xyz`), not Float64. The Phase 4 parity test therefore has to run the canonical mesh at Float32, or parity will fail.

### F2: elevation units

Results are in `spikes/1a/results/f2-units-N200000-s12345.json`.
- Raw elevation ranges from −0.90 to +1.08.
- 25 land cells (0.05%) exceed 1.0 and are clipped by the 6 km cap, so they are lossy.
- Converting to metres (Float32) and back through the inverse S-curve recovers raw elevation to within 2.6e-6.
- **That tiny error is not harmless.** Re-running orogen's climate on the round-tripped elevation changes:
  - 13 Köppen cells;
  - precipitation by up to 0.15 (normalised);
  - temperature by up to 0.03 °C.
- **Consequence:** the adapter must keep orogen's raw dimensionless elevation as an adapter-private layer for parity, and not reconstruct it from metres. This is proposed change 3.

### F4: RNG

These findings come from code reading, with the measured effect in 1c.
- The main `rng` (`makeRng(seed)`) is used only for mesh jitter. No later stage reads it, so the specific worry behind F4 does not occur.
- **But the number of draws inside some stages depends on N.** The phasor-kernel placement in `elevation.js` (around line 1459) runs a Fisher–Yates shuffle over a candidate list whose length grows with N. So mountain-kernel positions differ at every resolution even with a fixed seed.
- **Stream collisions.** Several stages seed with the same offset, so their streams are identical or correlated:
  - `seed+999`: `coarse-plates.js` SimplexNoise and `elevation.js` `hsRng`;
  - `seed+501`: two SimplexNoise fields in `elevation.js`;
  - `seed+9999`: `plate-physics.js` and `terrain-post.js`.

  The `orogen-lcg` parity stream has to reproduce these collisions. New code must use the hash-derived streams in §3.5.

### Tuning harness

The Kottek data was downloaded from the primary Vienna server; it is logged in `PROVENANCE.md` with no explicit license, citation requested. `tuning/climate/evaluate.mjs` then ran headless in under 2 s.

| N | Objective | Exact accuracy | Major-group accuracy | Macro F1 | Land agreement |
|---|---|---|---|---|---|
| 40k (default) | **0.678** | 0.400 | 0.721 | 0.215 | 0.967 |
| 160k | **0.668** | 0.382 | 0.719 | 0.191 | 0.966 |

Supporting files:
- maps: `docs/spikes/img/1a-koppen-{sim,truth,diff}.png`;
- raw results: `spikes/1a/results/tuning-baseline-*.json`.

The largest confusions are BWh→BSh (deserts simulated as steppe) and Am/Af→Aw.

One documentation drift: orogen's README says the objective is `0.5·exact + 0.5·macroF1`. The code computes `.60 graded + .12 macroF1 + .15 balance + .13 watchlist`.

### Scale invariance

orogen claims to be scale-invariant. **That holds only for the plate and continent layout,** which comes from a fixed-size coarse mesh. Land fraction moves by at most 1.5 points from 20k to 2.56M. Cell-level fields are not scale-invariant; see 1c.

### Azgaar under Node 24 (work copy)

- `npm ci` and `npm run build` succeed. npm 11 skipped two install scripts (`simple-git-hooks`, `fsevents`) with no effect.
- **Playwright e2e:** 259 passed, 1 skipped (2.7 min). **Vitest:** 1,194 tests in 105 files, all passed.
- **Same-seed determinism:** two fresh pages with the same seed produce identical `pack` digests (heights, features, rivers, burgs, states, cultures, religions, provinces, burg names). Only the timestamp line in the `.map` differs.
- **`.map` round-trip (save → load → save) is lossy.** Results are in `spikes/1a/results/azgaar-roundtrip.json`.
  - `pack.cells.h` changes in 547 of 4,226 cells, by up to 14 height units. pack heights are not saved; they are re-derived from `grid.cells.h` on load, which drops the river down-cutting.
  - `pack.cells.pop` changes in 2,286 cells by up to 5e-5 (rounding).
  - `cells.conf` (line 18) is recomputed.
  - The file holds no RNG state, only the seed string. An automated grep hit on "alea" was a burg name, *Aleanostes*.
- **`Math.random` inventory (F7):**
  - 64 direct `Math.random()` call sites in 29 files, 2 of them test files;
  - 17 places outside tests that overwrite the global with a re-seeded Alea, 12 of them in generators;
  - most generators also draw indirectly through `utils/probabilityUtils.ts` (`rand`, `P`, `gauss`, `ra`, `rw`, `biased`), all of which call `Math.random`.
- **Ratings:** rivers (3), names (3) and burgs (2–3) all generate and test cleanly, so they are confirmed. Save drops from 4 to 3: the format is broad, but it is lossy on reload and holds no RNG state.

### GPlates license (F10)

**Confirmed GPL-2.0-only.** The preamble of `COPYING` says: "the only valid and applicable version of the GPL, as far as the GPlates program is concerned, is _this_ particular version of the license (version 2, dated June 1991, not any later version)". 2,320 source files carry "GNU General Public License, version 2". The phrase "any later version" appears only inside the GPL text itself. GPL-2.0-only is incompatible with MapMaker's GPL-3.0-only, so GPlates stays math-reference only.

### VPLanet (optional)

- Built with `clang -O3 src/*.c -lm`, with 0 warnings, in a work copy.
- `examples/EarthClimate` completed in 105 s.
- Output hashes are in `spikes/1a/results/vplanet-earthclimate.sha256`.
- It is usable as the golden-data oracle for Phase 6. No global installs were needed.

---

## 1b. Azgaar generators on orogen's spherical mesh

`spikes/1b/facade.mjs` is a sphere-backed `PackedGraph` facade, 75 lines. It runs Azgaar's **unmodified** `features-generator`, `lakes` and `river-generator` (bundled with esbuild) over an orogen mesh.

How the facade maps onto Azgaar:
- One mesh serves as both `grid` and `pack`, with `cells.g[i] = i`.
- Azgaar's own `Voronoi` class accepts orogen's closed triangulation as-is.
- Voronoi vertices are spherical circumcentres.
- `cells.p` and `vertices.p` are equirectangular "pixels" on a 3600×1800 graph.
- Scales are matched to native Azgaar (`spikes/1b/azgaar-native-scales.json`):
  - h: metres → 0–100, with m = (h − 18)²;
  - prec: orogen's normalised value × 45;
  - temp: the mean of summer and winter.
- A closed sphere has no map border, and Azgaar classifies the world ocean by "touches the border". So the facade flags **one** deep-ocean cell as border. Azgaar then finds exactly one ocean feature.

| Run | Rivers | Lakes | River termination (ocean / lake / tributary / dead end) | Downstream flux decreases | Max cell flux | Time (facade + markup + rivers) |
|---|---|---|---|---|---|---|
| 20k, s12345 | 475 | 20 | 209 / 13 / 253 / **0** | 0 | 12,293 | 0.07 s |
| 200k, s12345 | 2,557 | 231 | 692 / 122 / 1,743 / **0** | **0** | 29,899 | 1.4 s |
| 200k, s777 | 2,412 | 196 | 651 / 57 / 1,704 / **0** | **0** | 62,318 | 3.0 s |
| 1M, s12345 | 9,457 | 850 | 1,801 / 552 / 7,104 / **0** | **6** | 62,851 | 27 s |

Pass criteria at 200k:
1. **Every river ends in ocean, a lake, or a parent river. Pass.**
2. **No artifacts at the poles, the antimeridian or the seam. Pass.**
   - The fraction of land cells carrying a river is 0.21 at the antimeridian, 0.22 near the poles, and 0.25 elsewhere (seed 12345). For seed 777 it is 0.28, 0.23 and 0.24.
   - 16–20 rivers cross the antimeridian along continuous neighbour paths.
   - The only path "gaps" are rivers passing through lake cells, which Azgaar itself produces.
   - Remaining planar issue: 3 lake or island outlines per world straddle the antimeridian, so their polygon *area* (used only for naming groups) is wrong.
3. **Discharge never decreases downstream. Pass at 200k.** At 1M it fails in 6 places because `cells.fl` is a `Uint16Array` and wraps above 65,535. Seed 777 is already at 62,318 at 200k.

**Recorded measures:**
- adapter: 75 lines (`facade.mjs`) plus a 6-line unit helper;
- Azgaar source edits needed for the spike to run: **0**;
- run time at 200k: 1.4–3.0 s.

**Call sites to change at extraction (Phase 10).** Each is needed for correctness at scale, not to make the code run.

| Call site | Change |
|---|---|
| `river-generator.ts` `cells.fl` (Uint16) and `cells.conf` (Uint8/Uint16) | Uint32 or Float32 |
| `features-generator.ts` `markupPack` ocean rule (`border`) | Explicit "world ocean" rule |
| `features-generator.ts` `addFeature` `clipPoly`/`polygonArea` | Geodesic area from cell areas |
| `features-generator.ts` `defineHaven` `distanceSquared(cells.p…)` | Geodesic distance |
| `river-generator.ts` `addMeandering`, `getApproximateLength` | Tangent-plane meander, geodesic length |
| `Math.random = Alea(options.map.seed)` in `markupGrid`, `features-generator.ts:466`, and `Rivers.generate` | Injected streams (F7) |
| `utils/index.ts` barrel | Touches `document` at import time (prompt init); import the needed utils directly |
| `drainWater` `features.filter` inside the per-cell loop | Index lakes by outlet cell. This is why rivers are superlinear: 1.1 s at 200k, 25 s at 1M |

The stretch goal (`burgs-generator`) was not attempted.

---

## 1c. Fidelity A/B: low-N vs high-N orogen

Method:
- Seeds 1, 12345 and 777, at N = 20k, 50k, 200k, 1M and 2.56M.
- Every run is resampled onto the N = 20k mesh by area-weighted restriction, and onto a 1° grid by inverse sampling.
- Each preview is compared with the 2.56M run ("final").
- "Mountain" means ≥ 1,500 m after restriction.
- Basins come from priority-flood drainage.

Raw results are in `spikes/1c/results/ab-s*.json`. Images are `docs/spikes/img/1c-elev-s*.png`: one 0.5° strip per N, top to bottom.

Measured values against the 2.56M final (ranges across the 3 seeds):

| Preview N | Land IoU (1°) | Coast p95 km (preview cells) | Coast Hausdorff km | Hypsometry KS (land) | Elev RMSE land, 20k low-pass (m) | Mountain IoU | Köppen agreement | Precip r (land) | Top-10 basins mean IoU / matched ≥ 0.5 |
|---|---|---|---|---|---|---|---|---|---|
| 20,000 | 0.80–0.83 | 533–960 (3.3–6.0) | 2,748–3,891 | 0.16–0.24 | 1037–1146 | 0.06–0.26 | 41%–48% | 0.70–0.80 | 0.30–0.32 / 1–3 |
| 50,000 | 0.84–0.86 | 466–607 (4.6–6.0) | 2,928–3,456 | 0.15–0.24 | 749–784 | 0.16–0.32 | 47%–56% | 0.77–0.86 | 0.29–0.40 / 2–3 |
| 200,000 | 0.87–0.89 | 237–359 (4.7–7.1) | 2,283–3,697 | 0.14–0.19 | 530–743 | 0.24–0.33 | 60%–61% | 0.82–0.89 | 0.36–0.40 / 3–4 |
| 1,000,000 | 0.90–0.91 | 139–274 (6.2–12.1) | 1,499–3,642 | 0.07–0.10 | 436–532 | 0.24–0.49 | 71%–73% | 0.89–0.93 | 0.33–0.61 / 2–8 |

Consecutive steps for seed 12345 show the output does not converge:

| Step | Land IoU | Köppen agreement | Mountain IoU | Precip r |
|---|---|---|---|---|
| 1M → 2.56M | 0.91 | 74% | 0.40 | 0.89 |

What carries over between resolutions:
- continent count, positions and rough shapes (from the coarse plates);
- land fraction, within 1.5 points;
- broad precipitation structure (r 0.7–0.93).

What does not:
- mountain-belt placement;
- coastline detail and small islands (the Hausdorff distance of thousands of km comes from islands appearing and disappearing);
- Köppen at cell level;
- drainage basins.

The mountain-belt counts (major belts missing from or new in the preview) are noisy at this threshold. They are in the JSON but are not used for the verdict.

**RNG-draw divergence (F4).** It is not caused by the post-mesh `rng`. It is caused by the N-dependent draw counts inside stages and by resolution-dependent detail. The phasor-kernel shuffle, noise-octave placement and hop-count smoothing all change with N.

**Verdict.** Under the provisional Q7 thresholds, **no preview resolution passes any metric.** orogen as it stands cannot back a "true preview".

**Fix (proposed change 1):**
- Make every *structural* decision on a fixed reference resolution, as orogen already does for plates. That covers mountain kernels and orogenic belts, hotspots, the macro coastline (land mask at the reference scale), and the major drainage divides.
- Key their randomness to reference-cell ids with counter-based draws, not to draw order.
- Let higher N add only band-limited detail on top. This is the "coarse stages exact, detail skipped" option, and it uses the same restriction and prolongation machinery as regional patches (§3.1).

**Q7 thresholds to finalise.** I recommend keeping the provisional targets and adding three more. All are measured on the 20k reference after restriction:
- land IoU ≥ 0.95;
- coast p95 ≤ 2 preview cells;
- Köppen ≥ 90%;
- precipitation r ≥ 0.9;
- mountain IoU ≥ 0.6;
- hypsometry KS ≤ 0.05;
- ≥ 7 of the top 10 basins matched at IoU ≥ 0.5.

These become CI gates for the restructured preview in Phase 4, and are re-run in Phase 7. If you would rather gate on what orogen can reach without restructuring, the realistic ceiling at 200k is roughly: land IoU 0.87, Köppen 60%, precipitation r 0.82. That is not a true preview.

---

## 1d. Partial-world constraints on orogen's coarse-plate stage

**The patch.**
- Code: `spikes/1d/apply-pins.py`. It applies to a separate copy, `spikes/_work/orogen-1d`; `upstream/` and the main work copy are untouched.
- Diff: `spikes/1d/pins.diff` (111 lines added, 23 removed, 4 files).
- Pins are geographic predicates evaluated per mesh:
  - `plateAt(x,y,z)` returns a pinned plate label, or −1;
  - `landAt(x,y,z)` returns 1 (land), 0 (ocean) or −1 (free);
  - `plateVec` optionally pins Euler poles;
  - `growPinned` controls whether pinned plates may grow beyond their pins.

**What has to change in orogen's plate code (at `cc2662b`):**

| Function | File, lines (original) | Change |
|---|---|---|
| `generatePlates` | `plates.js` 20, 31–38 | Takes `pins`. Pre-assigns pinned cells, and uses the first pinned cell as each pinned plate's id. Pinned plates count toward `numPlates`. Free seeds use farthest-point sampling from *all* pinned cells, which are excluded as candidates. |
| `generatePlates` (growth) | `plates.js` 135–148 | Pinned plates start their frontier from all pinned cells, or stay frozen if `growPinned` is false. `remaining` counts unassigned cells, not `numRegions − plates`. |
| `generatePlates` (return) | `plates.js` 230, 245 | Passes the `locked` mask to smoothing. Returns `pinIds` and `locked`. |
| `smoothAndReconnectPlates` | `plates.js` 255, 296, 332–333 | New `locked` argument. Majority-vote never flips a locked cell. Reconnection treats locked cells as part of the main component, so they are never reassigned. |
| `generateCoarsePlates` | `coarse-plates.js` 21–40 | Passes `pins` through to `generatePlates` and `assignOceanLand`. Returns `coarsePinIds` (label → plate id). |
| `projectCoarsePlates` | `coarse-plates.js` 53–70 | At high resolution, a pinned cell takes its pinned plate directly, with no FBM boundary wobble, so the boundary is exact. Exposes the hi-res `locked` mask. (In the spike this is a function property; a real port returns it.) |
| `assignOceanLand` | `ocean-land.js` 7, 65–230 | Forced land or ocean per plate, by majority of pinned cells. Connected forced-land plates become one continent seed. Free seeds fill up to `numContinents`. The seed-budget trim never removes forced seeds. Growth skips forced-ocean plates. A trapped sea containing forced ocean is never absorbed. |
| `handleGenerate` | `planet-worker.js` 196, 222, 227, 232, 236 | Accepts `data.pins`, threads it through, passes `locked` to the hi-res smoothing call, and applies pinned Euler poles before plate physics. |

**Regression.** With no pins, the patched code is **bit-identical** to stock orogen across all 69 arrays.

**Test A: a fixed continent shape.** A 15° cap at (20°N, 30°E) is pinned as one land plate. 3 seeds × N = 20k and 200k.

| Measure | Result |
|---|---|
| Pinned plate survival | **100%** in every run |
| Pinned plate is land | yes in every run |
| Final land (elevation > 0) inside the cap | 94–99.6% |
| Final land inside the 13° core | 96–100% |
| Land in the 15–17° ring outside the cap | 60–91%. The pinned plate grew past its pins (`growPinned`), and coast shaping extends land. |
| World land fraction and plate count | Unchanged (26–27%, 80 plates) |

**Test B: a region held fixed.** A 25° cap from a seed-12345 world is pinned into a seed-777 world.

| N | Variant | Plate survival | Plate-level land/sea agreement | Final land agreement | Elevation r | Mountain IoU |
|---|---|---|---|---|---|---|
| 20k | Control (seed 777, unpinned) | — | 0.65 | 0.62 | −0.14 | 0.00 |
| 20k | Plates + land + Euler poles pinned | 1.000 | 1.000 | 0.86 | 0.65 | 0.00 |
| 20k | Plates + land pinned | 1.000 | 1.000 | 0.87 | 0.63 | 0.10 |
| 200k | Control | — | 0.67 | 0.66 | −0.14 | 0.00 |
| 200k | Plates + land + Euler poles pinned | 0.9998 | 1.000 | 0.90 | 0.73 | 0.22 |
| 200k | Plates + land pinned | 0.9998 | 1.000 | 0.91 | 0.68 | 0.05 |

**Verdict: constrainable, with these limits.**
1. Plate partition and land/sea **can be pinned exactly** with a small, local patch. No redesign of orogen's plate code is needed.
2. Land/sea in orogen is decided **per plate.** A pinned coastline therefore has to be expressed as the boundary of pinned plates. Below the coarse-mesh scale (about 160 km), only the high-resolution override is exact.
3. **Elevation, coastline detail and mountains inside a pinned region are not held.** Final land agreement is 86–91% and mountain IoU at most 0.22. They are produced downstream by `elevation.js`, which draws on whole-world plate interactions, `applyPlatePhysics` (which adjusts pinned Euler poles), and seed-keyed noise.
   - Partial-world mode must therefore keep §4 step 0p.5: hold the imported elevation fixed and blend at the margins.
   - Alternatively, `elevation.js` must take constraint inputs, which is a much larger change. Design note 3 should choose between these.
4. Pins change the RNG draw sequence, so the unpinned remainder is a different world from the same seed without pins. That is acceptable for partial-world mode, but it is worth knowing.
5. This spike tests the *mechanism* only. Choosing the pins from a regional map, which is the inference itself, remains design note 3.

---

## Proposed diff to `audit/CAPABILITY_MATRIX.md`

These changes are not applied; they are for your review.

```diff
 ### 4. Hydrology
-| 1 | Azgaar | 3 | loose | TS | MIT | ... Planar Voronoi grid; needs an adapter to orogen's spherical Voronoi mesh (assumption: both are Delaunay/Voronoi cell graphs). |
+| 1 | Azgaar | 3 | loose | TS | MIT | ... Verified (spike 1b): runs unmodified on orogen's sphere via a 75-line facade; all rivers terminate correctly at 200k. Uint16 flux overflows ≥~200k cells; river generation is superlinear (25 s at 1M). |

 ### 10. Biomes
-| 1 | orogen | 5 | standalone | GPL-3.0 | `koppen.js` ... |
+| 1 | orogen | 4 | standalone | GPL-3.0 | `koppen.js` ... Two-season (summer/winter) proxy for warmest/coldest month. Measured on Earth topography: 38–40% exact class, 72% major group (spike 1a). |

 ### 5–8. Climate (temperature, wind, ocean, precipitation)
+Verified headless (spike 1a). Earth Köppen objective 0.678 (40k) / 0.668 (160k). Bit-identical across Node, Chromium, Firefox, WebKit. Ratings unchanged.

 ### 25. Fidelity/speed slider with same-seed preview
-| orogen | Closest. ... **Unverified**: whether elevation/climate fields at low resolution are a faithful preview of the high-resolution result. This needs an A/B test. |
+| orogen | Closest. ... **Measured (spike 1c): not faithful below the continent scale.** Land IoU 0.80–0.91, Köppen agreement 41–73%, mountain IoU 0.06–0.49 vs 2.56M; no convergence with N. Continent layout and land fraction are resolution-independent. |

 ### 27. Full-state save / resume format
-| 1 | Azgaar | 4 | `save.ts`, `load.ts`: comprehensive versioned serialization. Browser-native. |
+| 1 | Azgaar | 3 | `save.ts`, `load.ts`: comprehensive versioned serialization. Lossy on reload (pack.cells.h re-derived from grid: 547/4226 cells differ; pop rounded; conf recomputed); no RNG state (spike 1a). |

 ### 28. Earth-data calibration
-| 1 | orogen | 5 | `tuning/climate/` (verified): ... against Earth Köppen zones (`assets/earth.png`). ... |
+| 1 | orogen | 5 | `tuning/climate/` (verified, run): ... against Kottek et al. 2006 Köppen-Geiger 0.5° (downloaded; not in checkout). Headless, <2 s per evaluation at 40k. README's objective formula is stale. |
-**Pick: orogen's tuning harness.** Unverified: how much real Earth ground truth is bundled (it appears to be the single `earth.png`). ...
+**Pick: orogen's tuning harness.** Ground truth is the Kottek ASCII grid (downloaded at tuning time, Q8); `earth.png` is the input heightmap. ...

 ### 22. Partial-world inference
+Spike 1d: orogen's coarse-plate stage accepts pinned plates and land/sea with a ~110-line patch (exact survival; bit-identical when unpinned). Elevation/mountains inside a pinned region are not held by plate pins.

 ## License and risk notes
-| GPlates | GPL-2.0 | Whether "only" or "or later" is unverified. Matters for combination with GPL-3.0 code. |
+| GPlates | GPL-2.0-only | Verified: `COPYING` preamble says "version 2 ... not any later version". Incompatible with GPL-3.0; math reference only. |
```

## Proposed changes to `docs/ARCHITECTURE.md`

These are not applied yet. I will apply the ones you approve.

1. **§4 fidelity slider (1c): structural decisions at a fixed reference resolution.**
   - Generalise orogen's coarse-plate pattern to every structural decision: mountain kernels and belts, hotspots, macro land mask, major drainage divides.
   - Key that randomness to reference-cell ids with counter-based draws.
   - Higher N adds only band-limited detail whose restriction to the reference mesh is zero.
   - Add **design note 14: resolution-independent structure for faithful previews** to Phase 2.
   - Phase 4's parity test stays as written: stock orogen first. The restructuring then lands behind the Q7 A/B gate.
2. **§3.5 RNG.**
   - Record that orogen's stage seeds collide (`+999`, `+501`, `+9999`). The `orogen-lcg` parity mode must reproduce this; new code uses derived streams.
   - Note that N-dependent draw counts inside stages are the real F4 hazard.
3. **§3.6 orogen adapter (F2).** Keep `orogen.elevRaw`, orogen's dimensionless elevation, as an adapter-private layer. Canonical `elevation` stays in metres. Never feed orogen climate from inverse-mapped metres, because that breaks parity: 13 Köppen cells at 200k.
4. **§3.1 and Phase 4 (F1).** orogen mesh points are Float32. Parity runs use Float32 points; the canonical Float64 mesh is a deliberate, tolerance-tested deviation. Record the seam cell (0°N, 0°E) as a known small cell, with no artifacts measured.
5. **§3.5 `dmath` and Q3 resolution.** Cross-engine exactness was observed; make it a CI-tested goal (see 1a recommendation).
6. **F10 and the §2 table.** GPlates is GPL-2.0-only (confirmed). Remove the "†" and the "pending full check" wording.
7. **§3.6 Azgaar facade.** The world-ocean rule replaces Azgaar's border rule. Add the call-site list from 1b to the Phase 10 extraction checklist, starting with Uint16 flux.
8. **§4 partial-world mode (1d).** Plate and land/sea pins are feasible at the plate stage. Step 0p.5 (hold imported elevation) is *required*, not optional, because plate pins do not hold elevation or mountains.

## Deviations from the plan

- **Node 24 and fnm.** fnm and Node 24 were installed as release binaries in `.tools/`, run through `scripts/node24.sh`. Nothing global was changed. Playwright browsers and the npm cache are also in `.tools/` (about 1 GB, gitignored).
- **Azgaar e2e** ran in CI mode (`vite preview`) on Chromium only, which is Azgaar's own configuration.
- **1b** used 200k as the main size, as planned, plus 20k and 1M. The burgs stretch goal was skipped.
- **1c** compared every preview with the 2.56M run, with 3 seeds. "Mountain belts" use a fixed 1,500 m threshold, so the belt counts are indicative only.
- **Safari.** Playwright WebKit 26 was used, not Safari. Driving real Safari would require enabling Safari's remote automation, which is a system setting I did not change.
- **Windows.** Not tested; no machine is available.

## How to reproduce

All commands run from the repo root, through `scripts/node24.sh` (Node 24.21.0).

```bash
scripts/node24.sh npm --prefix spikes install
scripts/node24.sh npx --prefix spikes playwright install chromium firefox webkit   # browsers go to .tools/ms-playwright
rsync -a upstream/orogen/ spikes/_work/orogen/
rsync -a --exclude node_modules upstream/Azgaars-Fantasy-Map-Generator/ spikes/_work/azgaar/
ln -sfn ../../node_modules spikes/_work/orogen/node_modules

# 1a
scripts/node24.sh node spikes/1a/build.mjs
scripts/node24.sh node spikes/1a/determinism.mjs 200000 12345      # also 20000 12345, 200000 777, 1000000 4242
scripts/node24.sh node spikes/1a/axis-seam.mjs 200000
scripts/node24.sh node spikes/1a/f2-units.mjs 200000 12345
# Kottek data → spikes/_work/orogen/tuning/climate/data/ascii/, then:
(cd spikes/_work/orogen && ../../../scripts/node24.sh node tuning/climate/evaluate.mjs --maps)
(cd spikes/_work/azgaar && ../../../scripts/node24.sh npm ci && ../../../scripts/node24.sh npm run build \
  && CI=1 SKIP_BUILD=1 ../../../scripts/node24.sh npx playwright test && ../../../scripts/node24.sh npx vitest run)
(cd spikes/_work/azgaar && ../../../scripts/node24.sh node ../../1a/azgaar-roundtrip.mjs)

# 1b
scripts/node24.sh node spikes/1b/build.mjs
scripts/node24.sh node spikes/1b/run.mjs 200000 12345 250

# 1c (about 15 min per seed)
scripts/node24.sh node --max-old-space-size=32000 spikes/1c/ab.mjs 12345

# 1d
rsync -a --exclude tuning upstream/orogen/ spikes/_work/orogen-1d/ && python3 spikes/1d/apply-pins.py
scripts/node24.sh node spikes/1d/pins-test.mjs
```
