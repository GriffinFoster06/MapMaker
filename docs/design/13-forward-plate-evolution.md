# Design note 13: Forward plate evolution over deep time

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Decision | Q9 (core feature) |
| Built in | **Phase 6b**, after Phase 6 and before Phase 7 (set at Checkpoint 2, §3.9) |
| Depends on | §3.5 RNG, §3.6 rotation math, note 14 (reference level, per-cell `crustType`), Phase 6 (`planet.*` gravity and radius), spike 1d pins |
| Used by | Stage 3 elevation (orogeny age), Phase 7 erosion (lithology), notes 4 and 5, note 3 |

## 1. Problem

orogen, like every upstream repo, produces a **static** tectonic snapshot. Plates are Voronoi-grown regions with instantaneous velocities, and each plate is wholly ocean or wholly land. No upstream repo generates plate *history* (matrix row 1).

Q9 made forward evolution over hundreds of Myr a core feature, for three reasons:
- **Realism a snapshot cannot give:** old, eroded orogens next to young, high ones; sutures; true seafloor age; passive margins; and lithology that records history (arcs, ophiolites, cratons, foreland basins).
- **Inputs that soils (note 4), minerals (note 5) and erosion (lithology-dependent erodibility) need.**
- **A geologic history** users can scrub through.

It must have a fast rough pass and a slow detailed pass from the same seed, where the fast pass is a true preview of the slow one.

## 2. Canonical inputs and outputs

**Inputs**
- the seed and `planet.*` (radius, and gravity for buoyancy scaling);
- parameters (each 1.0 = Earthlike where scalar):
  - plate count;
  - mean plate speed (cm/yr);
  - duration T (Myr): default 300; the maximum is never capped below 800 and starts at 1,000;
  - continental fraction;
  - initial configuration (`snapshot` | `supercontinent`);
  - rift hazard;
  - supercontinent tenure (Myr).

**Outputs (at present day, t = 0)**

| Output | Kind | Notes |
|---|---|---|
| `plates` | entity table | One row per plate over its lifetime. `validFrom/validTo` in **Myr**; Euler pole and rate per step as a child table; parent ids for splits, child ids for merges |
| `plate` | layer (L0; L1 via P) | Present-day partition |
| `crustType` | layer | **Per cell**: oceanic, continental, arc, oceanic plateau. Plates carry mixed crust, unlike orogen's per-plate rule |
| `crustAge_Myr` | layer | True age since formation at a ridge or arc. Replaces stage 3's heuristic tag when this stage is active |
| `crustThickness_km` | layer | Thickened at collisions, thinned at rifts; feeds isostatic elevation |
| `lithology` | layer (enum) | Provenance classes: craton, mobile belt, magmatic arc, accretionary wedge, ophiolite, passive-margin sediments, foreland basin, rift, LIP basalt, MORB |
| `orogenyAge_Myr`, `orogenyIntensity` | layers | Time since the last collision or arc pulse, and its strength. Lets elevation make old belts low and young belts high |
| `boundaryType`, `stress` | layers | From present-day relative velocities, consistent with orogen's classes |
| `geoEvents` | event log | `{ id, tMyr, type: rift \| breakup \| collision \| suture \| subductionStart \| plateMerge \| plateSplit \| LIP \| hotspotTrack, plates, cells, payload, causes }` |
| keyframes | time-varying layers | `plate`, `crustType` and `crustAge_Myr` every 10 Myr on the **geologic time axis** (§3.8), for scrubbing |

## 3. Approach and algorithm choice

### 3.1 Representation: Lagrangian crust, Eulerian detection

- **Plates are rigid caps of crust tracers.** A tracer stores:
  - its plate id;
  - its position in the plate frame (Float64 unit vector);
  - crust type, thickness and formation time;
  - lithology class and orogeny stamps;
  - a terrane id (provenance).

  Moving a plate rotates its tracers exactly, so properties carried *within* a plate never diffuse, however many steps run. This is the reason for tracers over pure resampling on a fixed mesh. Resampling every step on a 141 km mesh would smear boundaries by about a cell per step.
- **Kinematics.** Each plate has a total rotation q_i(t), a unit quaternion composed per step: q_i ← exp(½ω_iΔt) ⊗ q_i, with ω_i the angular-velocity vector (rad/Myr) for that step. These are GPlates-style finite rotations, re-implemented from published formulas (Cox & Hart 1986), not from GPlates source.
- **Detection mesh.** A fixed Eulerian mesh (L0 for the fast pass, finer for the slow pass) is used **only to detect interactions**. Each step rasterises tracer positions into cells, through the spatial index, and finds:
  - **gaps:** cells with no tracer, where plates diverge;
  - **overlaps:** cells with tracers from two or more plates, where plates converge.

  This is the "per-cell state resampled onto the fixed mesh each step" from Q9. Resampling touches boundary cells only; plate interiors are carried exactly.

### 3.2 Step (Δt)

1. **Move.** Compose rotations and update tracer world positions.
2. **Divergence.** Create a new oceanic tracer in each gap cell.
   - The cell joins the plate with the nearer pre-gap tracer, so the ridge sits midway.
   - Formation time is interpolated within the step from distance to the ridge midline: t_form = t − Δt·(1 − d/d_gap). The age gradient is then correct even when one step opens many cells.
   - Lithology is MORB.
3. **Convergence.** Resolve each overlap by buoyancy:
   - **Oceanic vs continental:** the oceanic tracer subducts and is removed. A subduction zone is recorded. Arc tracers are added on the overriding plate 150–300 km behind the trench at a set rate (continental growth). Accretionary-wedge lithology is stamped on the trench edge.
   - **Oceanic vs oceanic:** the older (denser) tracer subducts, giving an island arc on the younger plate.
   - **Continental vs continental:** collision. Neither subducts beyond a slab-break limit. Overlapping tracers are merged with thickness added (crustal thickening), and an orogeny is stamped (time and intensity, from convergence rate × duration). Collision resistance enters the force balance (step 4). When relative velocity stays below ε for τ_lock, the plates **merge**; this is a suture event.
   - Ophiolite lithology is stamped where oceanic tracers are trapped between colliding continents.
4. **Forces (fast pass only, §3.5).** Update ω_i from a heuristic torque balance.
   - **Driving torques** τ = Σ p × F:
     - slab pull along subducting boundaries, ∝ length × √(slab age), directed toward the trench, normal to the boundary;
     - ridge push at ridges, smaller, directed away from the ridge;
     - collision resistance opposing convergence across continental collisions.
   - **Resisting:** basal drag ∝ ∫(ω × p) dA, with a continental-keel factor greater than 1.
   - Solve ω_i = D_i⁻¹ τ_i with D_i = c·∫(I − ppᵀ) dA over the plate.
   - Blend toward it, ω_i ← (1 − β)ω_i + β·ω_i*, and cap the speed at v_max.

   The heuristic follows Forsyth & Uyeda (1975) and Conrad & Lithgow-Bertelli (2002): slab pull dominates, continents are slow. orogen's `plate-physics.js` already implements the static version (continental drag, size–velocity scaling, mantle flow, slab-pull and ridge-push pole biasing). Its formulas are ported (GPL-3.0) and turned into a per-step update.
5. **Topology events** are drawn from keyed hazards (§3.4):
   - **rifting**, with the hazard rising with continental-plate area and tenure;
   - **break-up** of a supercontinent after its tenure;
   - **splitting** of oversized oceanic plates;
   - **subduction initiation** at old passive margins (age > 150 Myr).

   A rift line is a polyline through the plate. It is preferably routed along old sutures, because Wilson-cycle reactivation favours them. The two halves get diverging poles.
6. **Hotspots.** Fixed in the mantle frame. Each leaves a track of volcanic tracers on the plate passing over it, giving age-progressive chains; occasionally it emits a LIP pulse.
7. **Re-seed.** Every k steps, re-thin the tracers to one per detection cell in overlapped regions, keeping the most buoyant.

### 3.3 Initial configuration

- **`snapshot`:** orogen's coarse plates at t = −T (`generateCoarsePlates`, stream `plates.initial`), turned into tracers, with crust type per plate and ages drawn from a plausible distribution.
- **`supercontinent`:** one continental block holding the target continental fraction, with orogen's `assignOceanLand` at `numContinents = 1`, surrounded by oceanic plates. The first scheduled event is break-up.

### 3.4 Same seed, fast and slow, faithful by construction

The fast pass is the **dynamics**. The slow pass is a **kinematic replay** at higher resolution.

| | Fast pass | Slow pass |
|---|---|---|
| Detection mesh | L0 (20k, 141 km) | Configurable, default 160k (50 km) |
| Δt | 5 Myr (fixed) | 1 Myr (5 sub-steps per fast step) |
| Tracers | about 1 per L0 cell | about 1 per fine cell |
| Euler poles | **Computed** (force balance, §3.2 step 4) | **Prescribed:** the fast pass's ω_i per step. Sub-steps use the same ω_i, so the composed rotation at every fast-step boundary is identical |
| Topology events | **Decided**, then written to the event schedule | **Replayed** at the same times. Rift lines are refined with keyed detail noise, but stay within one L0 cell of the fast line |
| Interactions | Coarse (step 3) | Fine: arc growth, terrane accretion, age gradients, lithology boundaries at 50 km |
| May create major events? | Yes | **No.** Only local events below an area threshold (small terrane docking, back-arc opening). Contact earlier than scheduled is allowed only as local deformation; merging waits for the scheduled time |

Every random decision is a counter draw keyed by `(stream, plateId, eventIndex, k)` or by `(stream, refCellId, stepIndex, k)`, never by draw order (§3.5). That satisfies the Q9 rule.

**Fast-pass CFL.** At 10 cm/yr, a 5 Myr step moves a plate about 500 km, about 3.5 L0 cells. That is acceptable for a rough pass, because creation ages are interpolated within the step (step 2) and subduction removes material rather than routing it. Collisions are detected up to one step late (≤ 5 Myr). The slow pass at 1 Myr moves at most about 2 fine cells per step.

**Under note 14,** the fast pass is part of the **reference pass**: structural, and run for every fidelity setting. The slow pass is **detail**, run only for the final tier. The preview therefore shows the fast pass's world. The final run adds the slow pass's finer boundaries and lithology, and is anchored by the same rule as note 14: continuous fields restrict to the fast result on L0, and categorical fields agree in their L0 mode.

**A/B metrics** (matching spike 1c; measured on L0 after restriction):
- the event lists are identical, an exact check;
- plate-partition IoU, area-weighted per plate, ≥ 0.95;
- continental-crust IoU ≥ 0.95;
- crustAge r ≥ 0.95 (oceanic cells);
- orogeny-belt IoU ≥ 0.8;
- lithology agreement ≥ 85%.

These are proposed targets in the Q7 style (CI fails on regression), reviewed at Checkpoint 6b.

### 3.5 Feeding the existing model

The present-day state at t = 0 **replaces orogen's coarse plates in stage 2**, on the same L0 mesh:
- `plate`, the per-plate Euler poles (from the last step), `crustType`, `crustAge_Myr`, `crustThickness_km`, `lithology` and the orogeny layers are written at L0.
- orogen's `applyPlatePhysics` is **skipped**, because the motion is already dynamically consistent.
- `buildSuperPlates` and the collision and stress stages run as usual on the evolved partition.
- The note 14 structural stage reads **per-cell `crustType`** (already required by note 14 §3.10). It also reads `orogenyAge_Myr`:
  - belt amplitude decays with orogeny age, for example a half-height time of about 100 Myr, tuned in Phase 6b;
  - inactive old belts get kernels with low amplitude and wide envelopes;
  - foreland basins come from lithology.

**Partial-world pins (spike 1d)** constrain the *present*. Evolution runs forward, so pins cannot be imposed throughout. In partial-world mode:
1. The note 3 search scores candidate evolutions by their **final** state.
2. The pins are applied exactly to the chosen final state, using the spike 1d mechanism.
3. History inside the pinned region is labelled approximate in the event log (`payload.approx = true`).

Rewinding history backwards from the pins (a reconstruction-style inverse) is out of scope (open question 2).

### 3.6 Canonical-model check

Nothing in §3 blocks this design. Two rules need explicit wording, and these are changes to ARCHITECTURE.md:
1. **A second time axis.** Entities and time-varying layers need to say *which* time their validity refers to. Plates live in geologic Myr (negative before present). Human history lives in integer ticks with the era `dtYears` schedule. The proposal:
   - every entity table declares `timeAxis: 'geo' | 'history'`, and every time-varying layer declares the same axis through `timeVarying: false | 'geo' | 'history'` (§3.2);
   - `Timeline` gains a `geo` section `{ tStartMyr, dtMyr, keyframeEveryMyr }`;
   - geologic keyframes are stored under `timeline/geo/`.

   Present day (t = 0 Myr) is history tick 0's physical world.
2. **One producer per layer, chosen per pipeline variant.** When plate evolution is active, `crustAge_Myr`, `lithology` and `crustType` are produced by stage 2e (plate evolution), not stage 3. The `producer` field becomes *the* producer within the resolved pipeline variant. The stage graph declares `variant: { plateEvolution: on | off }`, and the runner checks that exactly one producer per layer is active. The variant is recorded in `params.json`, so a save knows its graph.

Entity validity intervals, keyframes, the stage runner and counter-based RNG already exist and need no change.

### 3.7 Consequences for ARCHITECTURE.md

1. §3.3/§3.4 time axes (above).
2. §3.2 producer per variant (above).
3. §4 gains **stage 2e, plate evolution**, before stage 2. Its fast pass belongs to the reference pass; its slow pass belongs to the final-tier detail pass.
4. §7 gains a **Phase 6b** slot (§3.9).
5. §5 save format gains `timeline/geo/`.

### 3.8 Performance

| Pass | Steps | Cost per step | Total |
|---|---|---|---|
| Fast, 300 Myr | 60 | ~10–20 ms (20k tracers, binning, interactions, torques) | **~1 s** |
| Slow, 300 Myr | 300 | ~80–150 ms (160k tracers) | **~25–45 s** |
| Fast, 1,000 Myr (maximum) | 200 | as above | **~2–4 s** |
| Slow, 1,000 Myr (maximum) | 1,000 | as above | **~1.5–2.5 min** |

Cost is linear in T. Geologic keyframes at L0 are small (about 0.3 MB each), so 100 keyframes at 1,000 Myr fit easily. The slow pass checkpoints every 10 Myr (mid-stage checkpoint, §5). These are estimates, measured in Phase 6b at 300 and 1,000 Myr.

### 3.9 Where it goes in the phase order (set at Checkpoint 2)

**Phase 6b: forward plate evolution, fast pass plus slow replay.** It comes after Phase 6 and before Phase 7, and has its own checkpoint. Checkpoint 2 moved it from the proposed slot 4c.

- **After Phase 6.**
  - Planet physics (radius, gravity) is in place, so buoyancy and speed scaling read real `planet.*` values from the start.
  - Phases 5 and 6 run on static-snapshot worlds. That is fine: projection is independent of tectonics, and planet physics does not read lithology.
- **After 4b.**
  - The fast pass lives in the note 14 reference pass, which 4b builds.
  - The 4b structural stage already takes per-cell `crustType`, and an `orogenyAge_Myr` input defaulting to "none" (note 14 §3.10). Phase 6b supplies those producers without rewriting the stage.
- **Before Phase 7.**
  - Phase 7 erosion reads `lithology` for erodibility, and D4 validation should run on worlds with real lithology.
  - Phase 9 (soils and minerals) also needs `crustAge_Myr` and `lithology`.
- **Q7 baseline.** Enabling evolution changes structure, so Phase 6b re-records the Q7 A/B baseline in the same commit.

**Checkpoint 6b:**
- the fast-vs-slow A/B values;
- Earth-likeness statistics (§5);
- the Q7 baseline re-recorded with evolution on;
- timings at 300 and 1,000 Myr.

## 4. Upstream references (algorithm level)

- **Finite rotations and quaternions:** Cox & Hart, *Plate Tectonics: How It Works* (1986); GPlates `src/maths` as a citation only (GPL-2.0-only, so no code).
- **Procedural tectonics on a sphere:** Cortial, Peytavie, Galin & Guérin (2019), "Procedural Tectonic Planets", *Computer Graphics Forum* 38(2). Plates as point sets, subduction, collision, rifting. Algorithm level only.
- **Driving forces:** Forsyth & Uyeda (1975), *GJI* 43; Conrad & Lithgow-Bertelli (2002), *Science* 298.
- **Wilson and supercontinent cycles:** Nance, Murphy & Santosh (2014), *Gondwana Research* 25.
- **Seafloor age:** Müller et al. (2008), *G³* 9, for the age-area distribution used in validation. Data, if used, is downloaded at tuning time.
- **orogen** `plate-physics.js` (ported formulas), `coarse-plates.js`, `ocean-land.js` (initial state).
- **Badlands, ASPECT:** not used. ASPECT's mantle convection is out of scope for a heuristic model.

## 5. Validation

- **Kinematics.** Composing n rotations about one pole equals the analytic rotation by nωΔt (1e-12). The rotation for a plate circuit (A→B→C→A) composes to the identity. Total area is 4π: tracer coverage has no persistent gaps after re-seeding.
- **Conservation.** Continental area changes only by arc growth minus slab-break loss, logged per step and closed to 1e-9 relative.
- **Age–distance.** For oceanic cells, age against distance from the ridge is linear with slope 1/(half-spreading rate), r ≥ 0.95.
- **Earth-likeness** at default parameters, over 10 seeds (bounds set at Checkpoint 6b):
  - seafloor age distribution: mean about 60 Myr, max ≤ 250 Myr, roughly triangular as in Müller et al. 2008;
  - plate sizes: a few large plates plus a power-law tail (Bird 2003);
  - speeds of 1–10 cm/yr, with oceanic plates faster than continental ones;
  - a supercontinent cycle of 300–600 Myr when T is long enough.
- **Fast/slow A/B** (§3.4), in CI with regression-only failure.
- **Determinism.** Same seed gives the same hash for both passes. Saving the slow pass mid-run at 150 Myr, reloading and finishing gives the same hash (§5 exact resume).
- **Integration.** The elevation stage on an evolved world produces old belts lower than young belts (median height ratio < 0.6 for orogeny age > 200 Myr vs < 50 Myr).

## 6. Open questions

1. ~~**Phase slot.**~~ **Resolved at Checkpoint 2:** Phase 6b, after Phase 6 and before Phase 7, with its own checkpoint.
2. **Partial-world history.** Is labelling history inside pinned regions as approximate acceptable, or do you want a reconstruction-style inverse later?
3. ~~**Default duration.**~~ **Resolved at Checkpoint 2:** 300 Myr default; the maximum is never capped below 800 Myr (initially 1,000 Myr).
4. **Rescaling sea level.** With evolution on, land fraction is emergent. Should sea level be adjusted (hypsometric fit) to hit the `landCoverage` parameter exactly, or should land fraction be allowed to float?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Quaternion and rotation core (shared with §3.6) | ~300 |
| Tracers, binning, gap and overlap detection | ~900 |
| Interactions (ridge, subduction, collision, merge, arcs, ophiolites) | ~1,200 |
| Force balance (port of `plate-physics.js`) | ~500 |
| Event hazards, rifting, schedule and replay | ~800 |
| Present-day export to stage 2; elevation hooks (orogeny age) | ~500 |
| Geologic timeline and keyframes | ~300 |
| Tests and Earth-likeness harness | ~1,500 |
| **Total** | **~6,000** |
