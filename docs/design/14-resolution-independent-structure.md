# Design note 14: Resolution-independent structure for faithful previews

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Decision | D5 (fidelity-slider redesign) |
| Built in | Phase 4b, behind the Q7 A/B gate |
| Depends on | §3.1 R/P operators, §3.5 RNG, Phase 4a parity harness |
| Used by | notes 3, 5, 6, 11, 12, 13 |

## 1. Problem

The requirement is a fast preview and a slow final run from the same seed, where the preview is a *true* preview. Spike 1c measured stock orogen against that requirement and it failed every Q7 metric at every preview size. Continent layout and land fraction carry over between resolutions, because they come from the fixed ~20k coarse-plate mesh. Mountain belts, coastline detail, Köppen classes and drainage basins do not, and they do not converge as N grows (1M → 2.56M: Köppen 74%, mountain IoU 0.40).

Reading `elevation.js` and `planet-worker.js` at `cc2662b` gives three causes. Separating the RNG streams fixes none of them.

1. **Draw counts that depend on N.** `applyPhasorRidges` runs a Fisher–Yates shuffle over every stressed land cell and keeps the first 4,000 (`PHASOR_NUM_KERNELS`). The candidate list grows with N, so the kernels land in different places at every resolution. `applyHotspotsAndLIPs` snaps hotspot positions to the nearest cell of the N-mesh.
2. **Operators that depend on resolution.** Collisions and stress are computed on the N-mesh (`findCollisions`, with `scaleFactor = sqrt(N / 10000)`; `propagateStress` uses a fixed pass count). Super-plate physics also runs on the N-mesh. Distance fields (`assignDistanceField`) count BFS hops. Smoothing pass counts are rounded from km to hops.
3. **Nonlinear thresholds applied after noise.** Ocean clamps, `fixupTopology` (filling interior seas), the priority-flood carve in `terrain-post.js`, and the 1,500 m and 0 m thresholds all turn small differences in high-frequency noise into different islands, basins and mountain masks.

The goal: a preview at N_p and a final run at N_f produce the same world at and above the reference scale (about 140 km), and differ only by detail below it.

## 2. Canonical inputs and outputs

**Mesh levels**

| Level | Mesh | Size | Role |
|---|---|---|---|
| L0 | `meshes.reference` | Fixed N_ref = 20,000 (orogen's `N_COARSE`), spacing ≈ 141 km. Built exactly as orogen's coarse mesh (stream `mesh.reference`; `seed+137` in parity mode) | Every structural decision |
| L1 | `meshes.global` | Fidelity N (5k–2.56M) | Structure prolonged from L0, plus detail |
| L2 | patch meshes | Note 6 | Structure prolonged from L1, plus finer detail |

Spacing is h(N) = πR/√N.

**Layers on L0** (the reference pass). These are produced once per (seed, params) and are identical for every N:
- `plate`, `crustType`, `boundaryType`, `stress`, `stressDir`;
- orogen's terrain-classification fields (`foldBelt`, `craton`, `basinFactor`, `tectonicActivity`, `orogenicPower`);
- `elevation`, `landMask`;
- per season `temp.s`, `precip.s`, `wind.s`, `pressure.s`, `current.s`;
- `basin.major`, `divideBand`, `koppen`.

**Entities on L0.** `structures` is a columnar table. Each row is a discrete structural feature:
- `kind`: mountain kernel, hotspot dome, LIP, island arc, volcano, major lake;
- a unit-vector position (Float64);
- tangent orientation, amplitude, envelope radius (km), wavelength (km);
- the reference-cell id it was keyed from.

The table is **bit-identical for every N**. That is invariant I2 below.

**Layers on L1.** These use the same ids at N. Each L1 stage manifest records `referenceHash`, the hash of the L0 layers and the `structures` table it consumed.

**Invariants** (all checked by tests):
- **I1. Anchoring.** For every L0 cell c, |R(e_N)[c] − e_ref[c]| ≤ 0.01 m. The same holds for `temp.*` (0.001 °C) and, multiplicatively, for `precip.*` (relative 1e-5).
- **I2. Structure.** The `structures` table and every L0 layer are identical for every N.
- **I3. Nested detail.** Each continuous detail band that is active at N_p is also active, unchanged, at every N_f > N_p.

## 3. Approach and algorithm choice

### 3.1 Two passes: reference, then detail

| Pass | Runs at | Content | Depends on fidelity? |
|---|---|---|---|
| **Reference pass** | L0 | tectonics (plates, plate physics, super-plates, collisions, stress); orogen elevation stages 1–4 (tectonic state, spatial fields, classification, skeleton); structural placement (kernels, edifices); the low-frequency parts of stages 5–11; final shaping; topology fixup; the **reference erosion model**; climate for all seasons; erosion–climate coupling; major drainage; Köppen | **No.** The same code and parameters for every slider setting |
| **Detail pass** | L1 at N | prolong the structure; synthesise band-limited detail; **detail erosion** (fast or slow); anchoring; climate downscaling; constrained hydrology; Köppen per cell | Yes: N, and the choice of detail-erosion model |

The slider therefore chooses only **N** and the **detail-erosion model**. Everything structural, including the erosion and climate that shape the large-scale world, is computed once at L0 with one fixed model. That is what makes the preview faithful by construction. The reference pass costs about the same as stock orogen at 20k (0.57 s measured in 1a), plus the reference erosion model.

### 3.2 What counts as structural

**Rule:** a decision is structural if (a) its outcome is visible at the reference scale, about 2 L0 cells (≈ 280 km) or more; or (b) it is discrete and changes a topological answer: is there an island here, which ocean does this river reach, does this basin drain to the sea.

| Structural (L0) | Detail (L1, band-limited) |
|---|---|
| Plates, boundaries, collisions, stress field and stress direction | Phasor ridge stripes (55 km wavelength) inside a belt envelope |
| Mountain-kernel positions, orientations and belt envelopes (180 km bandwidth) | Noise octaves with wavelength < 2·h_ref |
| Hotspots, LIPs, island and volcanic arcs: position, size, emergence (island or seamount) | Edifice shape at sub-reference scale (cone profile, caldera, satellites) |
| Macro land mask, interior seas larger than one L0 cell | Coastal fractal detail, small islands created by detail only |
| Erosion at the reference scale (large-scale lowering, sediment basins) | Valley incision, ridge sharpening, talus |
| Climate circulation: pressure bands, ITCZ, winds, currents, large-scale T and P | Lapse-rate temperature, local orographic rain and rain shadow |
| Major basins and divides, lakes larger than one L0 cell | Minor basins, river paths within a basin, small lakes |

### 3.3 Reference-keyed randomness

All structural randomness uses counter draws `u = hash(streamSeed, refCellId, k)` (§3.5):
- **Kernel selection.** This replaces the Fisher–Yates shuffle. The candidates are L0 cells passing orogen's tests (land, stress ≥ `PHASOR_STRESS_THRESHOLD`, subduction factor ≤ `PHASOR_SF_KERNEL_MAX`, a clear stress direction). Each candidate c gets the key u_c = hash(s, c, 0), and the K candidates with the smallest keys are kept. This is order-independent sampling without replacement: the same set comes out whatever order the candidates are visited in, and whatever N is. K is scaled from orogen's 4,000 by the candidate area, not by the candidate count.
- **Sub-cell position.** Each kernel and edifice is offset from its cell centre by a tangent vector drawn from hash(s, c, 1..2), inside the cell's circumradius. Its orientation jitter comes from hash(s, c, 3). Positions are continuous Float64 unit vectors, so features no longer snap to N-mesh cells.
- **Hotspots** (orogen picks `NUM_HOTSPOTS` with `hsRng` and an O(N) nearest-cell search) are drawn the same way over L0 cells.
- **Per-plate draws** such as orogen's `makeRng(plateSeedRegion + 777)` densities are already keyed by an L0 cell id. They are kept.
- **Noise fields** become `SimplexNoise` instances seeded from derived streams (`elev.noise.<name>`), not `seed + k`. Simplex noise is a continuous function of position, so sampling it at different N already agrees. Only the octave set has to be fixed (§3.4).

### 3.4 Band-limited detail whose restriction is zero

Detail is a sum of **bands**, D_N(x) = Σ_b w_b(N)·d_b(x). Each d_b is a continuous function of the unit vector x: a noise octave, the stripe part of the phasor kernels, or the sub-reference part of an edifice shape.
- **Band weight.** w_b(N) = 1 when λ_b ≥ 4·h(N). It ramps smoothly to 0 at λ_b = 2·h(N), which prevents aliasing. A band present at N_p is therefore present at every finer N_f. That gives I3.
- **Band split of orogen's stages.** Any orogen noise stack whose octaves straddle the reference scale is split: octaves with λ ≥ 2·h_ref go into the reference pass, and the rest become detail bands. The total spectrum at N_f = 2.56M matches the stock stack.
- **Zero restriction.**
  - R is the area-weighted average of the L1 cells whose centres fall in an L0 Voronoi cell. This is the spike 1c operator.
  - P is barycentric interpolation on the L0 Delaunay triangulation.
  - R∘P is close to the identity but not equal to it. So the **correction operator** C(δ) iterates x₀ = P(δ), x_{k+1} = x_k + P(δ − R(x_k)) until max|δ − R(x_k)| < tol. It then applies one piecewise-constant per-parent step, which makes the result exact. The final step's amplitude is at the tolerance, so it is invisible.
  - Detail is made zero-mean per parent with D ← D − C(R(D)).
- **Assembly.** e_N = P(e_ref) + D_N, followed by anchoring (§3.5). Categorical L0 layers (`plate`, `crustType`) are prolonged by nearest L0 cell after orogen's FBM boundary wobble, which `projectCoarsePlates` already applies as a continuous function of position.

### 3.5 Nonlinear detail steps and anchoring

Several detail steps are nonlinear: detail erosion, sea-level clamps, peak compression, and filling small depressions. Each one changes R(e_N). After each, the detail pass **anchors**:

e_N ← e_N + C(e_ref − R(e_N))

This restores I1. It removes only the component that shows at the reference scale and keeps every valley and ridge below it. Regional climate modelling uses the same technique as *spectral nudging* (von Storch et al. 2000), to keep a fine model's large scales on its driving coarse model.

Coastline guards keep the land mask structural:
- **Sign lock.** If |e_ref[parent]| exceeds the summed amplitude of every active band at that cell, the cell keeps the sign of e_ref. Islands from detail alone can therefore appear only on shelves and coastal bands. They cannot appear in the open ocean, which is where spike 1c's Hausdorff distances of thousands of km came from.
- **Emergence lock.** An edifice that the reference pass marks emergent gets at least one land cell at every N ≥ N_ref: its summit cell is clamped to at least +1 m before anchoring. A seamount gets no land cell.
- Depressions smaller than one L0 cell are filled or kept by the detail pass. Larger ones were decided at L0.

### 3.6 Climate: solve at the reference level, then downscale

orogen's climate (wind, then ocean, temperature and precipitation, for each season) runs at L0 on e_ref. The detail pass downscales it:
- **Wind, pressure and currents.** P(field). Vectors are interpolated in 3-D and re-projected onto each cell's tangent plane. Ocean cells at N whose parent is land take the nearest ocean parent's value.
- **Temperature.** T_N = P(T_ref) + Γ(x)·(P(e_ref) − e_N), where Γ is orogen's own moisture-dependent lapse rate (`TEMP_MOIST_LAPSE_C_PER_KM` plus dryness × `TEMP_DRY_LAPSE_EXTRA_C_PER_KM`). The result is then anchored.
- **Precipitation.** Let P_up = P(P_ref)·(1 + O(D, wind)), where O is a linear orographic term computed from detail elevation only. The upslope and lee formulation follows Smith & Barstad (2004), and PISM's `OrographicPrecipitation` serves as an algorithm reference. It is evaluated on each L1 cell's tangent plane over a window of a few L0 cells, with ref-level wind. Anchoring is multiplicative per parent, P_N = P_up · C×(P_ref / R(P_up)), so precipitation stays non-negative.
- **Köppen** is classified per L1 cell from the downscaled T and P.

This **replaces the full climate solve at N**. That is a change to §4 stage 5. Stock orogen climate at N remains as the parity mode. Two consequences:
1. **Cost.** Climate at N becomes O(N) local arithmetic.
2. **Realism trade-off.** Sub-reference orographic rain now comes from a published linear orographic model instead of orogen's heuristic advection at N.

**Climate gate (D7, Checkpoint 2).** On the Earth tuning harness at 40k and 160k, the reference-plus-downscaling climate must score **no more than 0.02 below** orogen's full-resolution climate at the same N. The Phase 4a baselines were 0.678 and 0.668. 0.02 is the starting tolerance; changing it needs sign-off at a checkpoint.

If the gate fails, the climate solve moves to a **climate-only reference level at 80k cells (L0′)**:
- L0′ is built and related to L1 exactly as L0 is (R, P, C);
- climate is solved on R_{L1→L0′}(e_N) restricted from the anchored elevation, and downscaled from L0′;
- the gate is re-run.

Structure (tectonics, elevation, erosion, drainage) stays on L0 either way.

### 3.7 Hydrology: major divides come from L0

At L0, priority-flood drainage on e_ref gives basins. A **major basin** is one whose area is at least A_major, provisionally 2×10⁵ km² (about 8 L0 cells; Earth has about 60 such basins). The **divide band** is the set of L0 cells that touch a major-basin boundary.

At L1, flow routing on e_N is constrained:
- A cell whose parent is outside every divide band must drain within its parent's major basin.
- Inside the divide band, fine topography places the divide, but the divide cannot leave the band.

The implementation runs one priority flood per major basin, seeded at its L0 outlet cells, and forbids receivers in another major basin outside the divide band. Endorheic major basins keep their L0 sink (note 12). Note 6 reuses this rule for patches.

### 3.8 Erosion and the fast/slow split (D4 under D5)

- **Reference erosion is one fixed model** for every slider setting. Until Phase 7 it is orogen's `terrain-post.js` run at L0. From Phase 7 it is the Badlands-style stream-power pass at L0, which is cheap at 20k cells. Switching from one to the other is a stage-code version change, so old saves open view-only, as §5 already provides.
- **Stream power depends on resolution**: slope over a 141 km cell is not slope over a 12.5 km cell. The L0 model therefore uses an *effective* erodibility, calibrated so that R(an unanchored fine run) ≈ the L0 run. That calibration is a Phase 7 test. The unanchored fine run is used **only** for this calibration. Phase 7's Earth-statistics validation (hypsometry, Hack's law, river-profile concavity) runs on the **anchored** result that users get.
- **Detail erosion** uses orogen's `terrain-post.js` at N for preview tiers and the slow stream-power pass at N for the final run. Both are anchored.
- **Stage 6, the erosion–climate coupling, runs at L0**, so it is identical for preview and final.

### 3.9 The Q7 gate under this design

Several Q7 metrics are measured after restriction to the 20k reference. Under I1, those become **identities**: hypsometry KS, mountain IoU, elevation RMSE and precipitation r all compare R(e_N) or R(P_N), which equal the reference by construction. They stay in the gate as correctness checks of anchoring, and should read about 0 or 1. The informative metrics are:
- land IoU on the 1° grid (inverse sampling, not restriction);
- coast p95;
- Köppen agreement (area mode of L1 cells per L0 cell);
- the top-10 basins.

**Adopted at Checkpoint 2:** three full-resolution metrics, so the gate keeps its teeth:
- hypsometry KS on native L1 land cells, preview against final, after low-passing the final to the preview's band set;
- Köppen agreement on the 1° grid;
- river-mouth distance (km) for the top-10 basins.

The gate therefore has ten metrics. Like the other seven, the new three **hard-fail on regression only**. Their target values are set from the Phase 4a baseline and reviewed at Checkpoint 4b.

**CI configuration:**
- **Per commit:** seeds {1, 777, 12345}; previews at 50k and 200k; final at 1M.
- **Nightly:** the same, with a 2.56M final.
- The baseline lives in `tools/tuning/ab-baseline.json`. Regression is defined as in Phase 4b.
- Metrics are measured on L0 itself, not on a separately built 20k mesh as in spike 1c.

### 3.9a Effort budget and fallback (D8)

Phase 4b has a fixed effort budget: the first complete implementation of this note, plus **at most two tuning rounds**. Each round ends with a full A/B run on the CI seeds.

If the preview still misses Q7 targets after the budget, the **fallback** applies:
- The preview shows **reference-level structure only**: the reference pass prolonged to the preview mesh. Elevation is P(e_ref); climate is the L0 solve prolonged, with no downscaling detail; Köppen is classified from those fields. There are no detail bands and no detail erosion.
- Detail appears only with the final run, through the full detail pass.
- The preview is then faithful by construction at the reference scale, because the final run restricts to the same reference pass (I1).
- The gate keeps running, comparing R(final) with the reference pass, plus the full-resolution metrics between successive final tiers.

Whether the fallback was taken is reported at Checkpoint 4b.

### 3.10 Changes to orogen stages (ported TypeScript; `vendor/` unchanged)

| orogen function (`cc2662b`) | Change |
|---|---|
| `applyPlatePhysics`, `buildSuperPlates` (super-plate physics currently runs on the N-mesh) | Run on L0 |
| `computeTectonicState` (`findCollisions`, `propagateStress`, `sqrt(N/10000)` scaling) | Run on L0; no N scaling |
| `computeSpatialFields`, `classifyTerrain`, `buildSkeleton` | Run on L0. Hop-count distance fields become geodesic km (Dijkstra on edge lengths) |
| `applyPhasorRidges` | Keyed kernel selection at L0 (§3.3). The envelope is structural; the stripes are a detail band |
| `applyIslandArcs`, `applyVolcanicArcs`, `applyHotspotsAndLIPs` | Positions keyed at L0. Shapes are continuous functions split into reference and detail bands |
| `applyTectonicBandNoise`, `applyDetailTexture`, `applyCoastalDetail`, `applyUniformLandNoise` | Octaves split at 2·h_ref (§3.4) |
| `applyDynamicTopography` | L0 (the mantle field is already per plate) |
| `applyFinalShaping` | Applied at L0. At L1, the same monotone map is applied, then the result is anchored |
| `fixupTopology` | L0; at L1, only for depressions smaller than one L0 cell |
| `runPostProcessing` (`terrain-post.js`) | L0 as the reference erosion; L1 as fast detail erosion, anchored |
| `computeWind`, `computeOceanCurrents`, `computeTemperature`, `computePrecipitation` | L0 only, plus downscaling (§3.6) |
| `classifyKoppen` | Per L1 cell, on downscaled fields |

The ported structural stage takes **per-cell `crustType`** as input. orogen's per-plate ocean/land rule is just the default producer of that layer. It also takes an optional `orogenyAge_Myr` input that defaults to "none" (every belt treated as active, as in stock orogen). This lets plate evolution (note 13, Phase 6b) and partial-world pins (note 3) feed it without another restructure.

### 3.11 Consequences for ARCHITECTURE.md

Applied at Checkpoint 2:
1. **§4** is split into a reference pass and a detail pass.
   - Stage 5 becomes a solve at L0 plus downscaling.
   - Stage 4: the slider chooses the detail-erosion model only.
   - Stage 6 runs at L0.
   - Stage 7 inherits the major divides.
   - Tectonic stress moves to L0.
2. **§3** gains `meshes.reference`, the `structures` entity table, and `referenceHash` in stage manifests.
3. **§3.6** marks orogen climate at N as the parity mode only.

## 4. Upstream references (algorithm level)

- **orogen `cc2662b`.** `coarse-plates.js` (the reference-mesh pattern, `projectCoarsePlates` with continuous FBM wobble), `elevation.js` (stages 1–13, `applyPhasorRidges`), `terrain-post.js`, and the climate modules. Code is ported under GPL-3.0.
- **Spike 1c** (`spikes/1c/ab.mjs`): the restriction operator and every A/B metric.
- **Spectral nudging:** von Storch, Langenberg & Feser (2000), *Mon. Wea. Rev.* 128.
- **Linear orographic precipitation:** Smith & Barstad (2004), *J. Atmos. Sci.* 61; PISM `src/coupler/atmosphere/OrographicPrecipitation.cc` as an algorithm reference only.
- **Multigrid restriction, prolongation and correction:** Briggs, Henson & McCormick, *A Multigrid Tutorial* (2000).
- **Order-independent sampling without replacement** by smallest hash key: bottom-k sketches (Cohen & Kaplan 2007).

## 5. Validation

- **Operator tests.** R∘C = I to tolerance on random fields. R(D) = 0 for the assembled detail. P reproduces linear functions exactly.
- **I1 and I2 at every tier.** Generate at {5k, 20k, 50k, 200k, 1M}. The L0 layers and the `structures` table must be bit-identical, and I1 must hold.
- **I3.** For each noise band b, d_b sampled at 200k equals d_b sampled at 2.56M at shared positions, bit for bit.
- **The Q7 gate (§3.9)**, plus spike 1c's elevation strips for visual review at Checkpoint 4b.
- **Earth tuning gate (D7).** `tuning/climate/evaluate.mjs` runs through the reference-plus-downscaling path at 40k and 160k. The score must be no more than 0.02 below orogen's full-resolution climate at the same N (Phase 4a baselines 0.678 / 0.668). Otherwise switch to the 80k L0′ fallback (§3.6).
- **Realism at the final tier.** Hypsometry percentiles, slope distribution, Hack's-law exponent and river density at 2.56M are compared with stock orogen at 2.56M. Restructuring must not flatten the world. The bounds are recorded in Phase 4b.
- **Performance.** Reference-pass time, and detail-pass time at each tier, against stock orogen (spike 1a: 3.9 s at 200k, 23 s at 1M).

## 6. Open questions

1. ~~**Q7 identities.**~~ **Resolved at Checkpoint 2:** the three full-resolution metrics are added (§3.9).
2. ~~**N_ref for climate.**~~ **Resolved at Checkpoint 2 (D7):** the gate is 0.02 of the objective against orogen's full-resolution climate; the fallback is the 80k L0′ climate mesh (§3.6). The outcome is measured in Phase 4b.
3. **A_major = 2×10⁵ km²** is a guess. A larger value gives fewer constrained divides and more freedom for the final run; a smaller value gives a more faithful basin metric.
4. **Previews below N_ref** (orogen's slider goes down to 5k). These sample the L0 world directly through P. They are consistent, but they cannot show anything below 141 km.

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Ported structural stage (elevation stages 1–4, keyed placement, band split) | ~3,000 |
| R, P, C operators, anchoring, coastline guards | ~600 |
| Climate downscaling (lapse rate, orographic model, anchoring) | ~800 |
| Constrained drainage (major basins, divide bands) | ~500 |
| A/B harness in `tools/tuning/`, CI wiring | ~600 |
| Tests | ~1,500 |
| **Total** | **~7,000** |

This is Phase 4b's main body of work. The largest risk is the Earth-tuning gate (open question 2).
