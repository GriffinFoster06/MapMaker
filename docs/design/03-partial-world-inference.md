# Design note 3: Partial-world inference

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 11 |
| Depends on | Spike 1d (plate pins), note 14 (reference-level structure), note 6 (patches), note 13 (optional) |
| Decision taken here | **Hold the imported elevation fixed.** Do not add constraint inputs to orogen's elevation stage. Pin the reference-level structure instead (§3.1). |

## 1. Problem

**Requirement:** given a regional map plus world conditions, infer the most likely surrounding tectonic and continental context, and derive the region's climate and biomes from it. The rest of the planet is never fully generated.

This is an inverse problem. The generator runs forward from plates to elevation, and here elevation is known in one window.

Spike 1d tested the mechanism:
- orogen's coarse-plate stage accepts **plate** and **land/sea** pins with a ~110-line patch. Pinned plates survive 99.98–100% of the time, and the patched code is bit-identical when nothing is pinned.
- **Elevation, coastline detail and mountains inside a pinned region are not held.** Final land agreement was 86–91% and mountain IoU at most 0.22, even with Euler poles pinned. They come from `elevation.js`, which uses whole-world plate interactions, `applyPlatePhysics` (which adjusts the pinned poles) and seed-keyed noise.

That spike left this note a choice: hold the imported elevation fixed, or constrain orogen's elevation stage.

## 2. Canonical inputs and outputs

**Inputs**
- **The import:** a heightmap (required), plus optional land mask, coastline vector, rivers, and biome or Köppen classes.
- **Its georeference:** projection (default equirectangular for large regions, azimuthal equidistant for small ones), scale in km per pixel, and the vertical datum (sea level).
- **Placement**, if the user supplies it: centre lat/lon, rotation, extent.
- **World conditions:** `planet.*`, plate count, land fraction, seed.

**Outputs**
- **`partialWorld` record:**
  - placement, with its source (user or inferred) and confidence;
  - the import hash;
  - the search seed and the score of the chosen context, plus the top 3 alternatives.
- **`inferredFeatures` entity table:** one row per extracted feature (range, trench, rift, arc, active or passive margin segment), with geometry (unit-vector polyline), type, orientation and confidence.
- **`pins`:**
  - a plate partition inside the region;
  - land/sea per plate;
  - Euler-pole *constraints*;
  - reference-level structural pins (§3.1).
- **`importWeight` layer** (Uint8, 0–255) on L1 and the patch: 255 inside the held region, falling to 0 across the margin band.
- **The whole world** at L0, and at L1 for display at a modest N. The region is a regional patch (note 6) at the import's resolution, with climate, hydrology, Köppen and biomes.
- **Events:** none in the static case. With note 13, the geologic event log of the chosen context.

## 3. Approach and algorithm choice

### 3.1 The decision: hold elevation fixed, and pin the structure

| Option | What it buys | Cost and risk |
|---|---|---|
| **A. Hold imported elevation fixed**, blend at the margins | Exact fidelity to the user's map, which is their data and must not be altered. Small, and independent of orogen internals. | Alone, it leaves seams: a range cut at the region edge does not continue outside it. |
| **B. Constrain `elevation.js`** | Generated elevation tends towards the import. | Even a perfect constraint only *approximates* the import, so the import would still be written over the result to be exact. B therefore buys only consistency *outside* the region. It touches all 13 elevation stages and their whole-world interactions, where spike 1d measured ≤ 0.22 mountain IoU. It also conflicts with the Phase 4b restructure. |
| **C (chosen). A inside the region, plus structural pins at L0** | Exact import inside. Outside, structures continue across the edge, because the reference-level structure (note 14) is told what crosses it. | Needs pin inputs in the note 14 structural stage. That stage is MapMaker's own TS port, so the inputs are designed in rather than retrofitted. |

**Choice: C.** In the terms the spike posed, this is "hold imported elevation fixed", *not* "constrain orogen's elevation stage". The constraint goes into the reference-level structure that Phase 4b ports, not into orogen's 13-stage elevation code. Four structural pins:
1. **Pinned reference elevation.** e_ref[c] = R(import)[c] on every L0 cell fully covered by the import. Partly covered cells get a weighted blend with the generated value.
2. **Pinned land mask** on covered L0 cells.
3. **Pinned structures.** For each extracted range, arc or rift that reaches the region edge, a run of kernel or edifice rows in the `structures` table continues along its strike for a distance proportional to its length inside the region. Each run's amplitude and envelope are taken from the import and tapered to the generated level.
4. **Pinned stress orientation** along those runs. The ported stress field is clamped there, so the phasor ridges outside the region keep the imported grain.

The spike 1d plate pins (plate partition, land/sea per plate, Euler-pole constraints) stay at the plate stage, as patched. Phase 11 ports the patch into the TS plate stage.

### 3.2 Pipeline (expands §4, step 0p)

1. **Import and place.** Sample the import onto a patch mesh. The direction is sphere → raster: each patch cell's unit vector is forward-projected through the import's declared projection, then sampled bilinearly. This reuses the sampling in orogen's `import-main.js`.
   - If the user gives no latitude, it is **inferred only when the import carries climate-bearing layers** (biomes, Köppen, ice), by matching them against zonal climate at L0 over a latitude scan. Elevation alone does not determine latitude, so otherwise the user must supply it; the field is pre-filled with 40°N (D10).
2. **Extract features** from the held elevation, on the patch mesh:
   - land/sea and the coastline;
   - shelf width per coast segment (distance from the coast to −200 m);
   - trenches (linear deeps below −5 km within 300 km of a coast);
   - ranges (ridges of high elevation, found by ridge detection on the Hessian, with orientation from the structure tensor);
   - aligned volcanic chains;
   - rifts (linear lows bounded by highs);
   - plateaus;
   - island arcs (curved chains of islands over a trench).
   Each feature gets a confidence.
3. **Interpret tectonics** with textbook rules (Kearey, Klepeis & Vine 2009):

   | Feature | Interpretation |
   |---|---|
   | Narrow shelf + trench + coastal range or volcanic arc | Active margin: an ocean plate subducts under the land plate along the trench |
   | Wide shelf, no trench | Passive margin: no plate boundary near the coast; the continent–ocean transition is inside one plate |
   | Broad high range far from the coast, no arc volcanism | Continental collision or suture along the range axis |
   | Graben plus volcanism | Divergent boundary along the axis |
   | Island arc plus trench | Ocean–ocean convergence |
   | None of the above | Plate interior (craton or platform) |

   The output is a set of candidate boundary segments with types and confidences.
4. **Build the pins.**
   - **Plate partition inside the region:** cells are grouped by the inferred segments.
   - **Land/sea per plate**, by spike 1d's majority rule, with the high-resolution override making coastlines exact below the coarse-mesh scale.
   - **Euler-pole constraints:** inequalities on relative velocity at each segment (convergent: the normal component points into the boundary; divergent: it points out). Poles are sampled to satisfy them, not fixed.
   - **The structural pins** from §3.1.
5. **Search for the most likely global context.** The free variables are:
   - the free plates' seeds and count, within the world conditions;
   - where continents sit outside the region;
   - Euler poles, within their constraints.

   Each candidate k uses keyed streams `partial.search/<k>` and runs **only the reference pass's tectonic and structural part at L0** (about 0.3–0.6 s). Its score is the sum of:
   - (a) boundary-type agreement along the inferred segments, weighted by confidence;
   - (b) overlap of the L0 mountain envelope with the extracted ranges, near the edge;
   - (c) a land-fraction penalty against the world conditions;
   - (d) a plate-size and plate-speed plausibility prior (Bird 2003 distributions).

   The search runs 64 candidates across the worker pool, then 3 refinement rounds of 16 perturbations each around the best 4, for about 1 to 2 minutes at 8 workers. The best score wins and ties go to the lower index, so the result is deterministic. The top 3 are kept for the user.
6. **Generate the world** with all pins: the full reference pass (including climate) at L0, then L1 for display.
7. **Generate the region** as a note 6 patch.
   - **Inside the region**, e = import exactly. `importWeight` = 255 and anchoring is disabled, because R(import) = e_ref by construction (pin 1).
   - **Margin band** (width w, default 2 L0 cells ≈ 280 km, outside the region): the import is never changed. Instead, the mismatch m = import − generated along the region boundary is extended outward by solving Laplace's equation (membrane interpolation, as in Poisson image editing, Pérez et al. 2003). It decays to 0 at the band's outer edge and is added to the generated field there. That makes the join C0-continuous, with no cliff, while the generated detail keeps its texture.
8. **Climate, hydrology and biomes.** Planet-wide climate comes from the pinned L0 world. It is downscaled to the patch with the held elevation (note 14 §3.6). This is "derive the region's climate from the inferred context". Rivers that enter the region carry inflow from the L1 network (note 6 boundary conditions).

### 3.3 Determinism

The result is a pure function of (import hash, placement, world conditions, seed, app version). Spike 1d found that plate pins change the plate stage's draw order, so the unpinned remainder is not the same world as the unpinned seed. That is acceptable and documented. Draws for structure (note 14) are keyed by L0 cell, so pins do not shift them outside the pinned cells.

### 3.4 With forward plate evolution (note 13)

Pins describe the present day. When plate evolution is on, the search scores each candidate's **final** state, and the pins are then applied exactly to that final state, with the spike 1d mechanism at the final step. History inside the region is labelled approximate. Note 13 §3.6 discusses this.

### 3.5 Consequences for ARCHITECTURE.md

§4 step 0p is expanded:
- feature extraction and interpretation;
- the search;
- structural pins at L0;
- Laplace margin blending;
- latitude inference only from climate-bearing layers.

Step 0p.5 records this note's decision.

## 4. Upstream references (algorithm level)

- **Spike 1d patch** (`spikes/1d/pins.diff`), to be ported: `generatePlates`, `smoothAndReconnectPlates`, `generateCoarsePlates`, `projectCoarsePlates`, `assignOceanLand`, `handleGenerate`.
- **orogen** `import-main.js` and `planet-worker.js` `handleImportHeightmap`, for heightmap sampling.
- **Tectonic interpretation:** Kearey, Klepeis & Vine, *Global Tectonics* (3rd ed., 2009); Cox & Hart (1986).
- **Plate statistics:** Bird (2003), *G³* 4(3) (PB2002 size distribution). The dataset is downloaded at tuning time if used, with its license checked (Q8).
- **Ridge detection:** Lindeberg (1998), *IJCV* 30.
- **Seam blending:** Pérez, Gangnet & Blake (2003), "Poisson image editing", *SIGGRAPH*.
- **GPlates:** the partial-plate-circuit *concept* only. Its audit says inference of missing rotations is not implemented, and GPlates code is not used (GPL-2.0-only).

## 5. Validation

- **Held elevation.** The patch elevation inside the region equals the resampled import, bit for bit (hash test).
- **Seam.** The 95th-percentile gradient across the region boundary must not exceed the larger of the 95th-percentile gradients just inside and just outside.
- **Synthetic round trip.** Generate a MapMaker world, cut out a region, run inference with the true placement, and compare against the truth:
  - boundary-type accuracy for segments inside the region;
  - land/sea IoU of the L0 mask within 2,000 km of the region;
  - Köppen agreement inside the region.
  Targets are set at Checkpoint 11. Expect land/sea outside the region to be weak, since many contexts are consistent.
- **Earth hold-outs.** ETOPO regions are downloaded at tuning time: the central Andes (active margin), East Africa (rift), the Himalaya and Tibet (collision), the US East Coast (passive margin), Japan (arc). Check feature-type classification against PB2002 boundary types, and boundary location error in km.
- **Continuation.** Ranges that cross the edge continue for at least 0.5× their in-region length outside it (measured by mountain mask overlap along strike).
- **Determinism.** Same inputs give the same hash. The top-3 ordering is stable.

## 6. Open questions

1. ~~**Latitude.**~~ **Resolved at Checkpoint 2:** latitude is required when the import has no climate-bearing layers, with 40°N pre-filled (D10).
2. **Alternatives.** Should the UI expose the top-3 alternative contexts, or only the best?
3. **Margin band width.** The default of 2 L0 cells could instead be a fraction of the region size.
4. **Fully inland imports** (no coast) give weak evidence, so the search falls back to the prior. Should the app warn when confidence is low?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Georeferencing and placement (plus UI) | ~800 |
| Feature extraction | ~1,200 |
| Interpretation rules | ~600 |
| Pins (port of the 1d patch plus structural pins) | ~600 |
| Search harness | ~500 |
| Laplace margin blend | ~300 |
| Tests and Earth hold-out harness | ~1,500 |
| **Total** | **~5,500** |
