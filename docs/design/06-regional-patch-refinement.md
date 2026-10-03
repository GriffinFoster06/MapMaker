# Design note 6: Regional-patch refinement

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 11 |
| Depends on | Note 14 (the R, P and C operators, bands, anchoring, constrained drainage), §3.1 |
| Used by | Note 3 (the region is a patch), note 7 (patch STL), exports |

## 1. Problem

**Requirements:**
- regional patches down to the most detailed map-worthy scale (Q6: about 1 km);
- **no discontinuities between whole-planet and regional views.**

A patch has to be a finer version of the *same* world. It must not be a new generation over a cut-out. Note 14 already defines the machinery between L0 (reference) and L1 (global at N). Patches are the same problem one level down, L1 → L2, with three extra concerns:
- patch meshes have an edge;
- rivers and air cross that edge;
- patches can overlap or nest.

## 2. Canonical inputs and outputs

**Inputs**
- `PatchSpec`: centre (unit vector), angular radius, and target spacing h_p (km);
- the parent world (its L0 structure and L1 layers, plus the hashes of both).

**Outputs**
- **`meshes.patches[id]`.** A `SphereMesh` with:
  - `parentOf: Int32Array` (patch cell → L1 cell);
  - `core: Uint8Array` (1 inside the requested cap, 0 in the apron);
  - the frame (centre, north-aligned tangent basis);
  - `level` (2 for a patch of the global mesh, 3 for a patch of a patch, and so on).
- **Patch layers** with the same ids as the global ones: `elevation`, `temp.*`, `precip.*`, `wind.*`, hydrology layers, `koppen`, `biome`, and later soils and the human layers.
- **Entity updates.** Rivers, lakes and settlements inside the patch reference patch cells through `(meshId, cell)`.
- **Manifest.** Patch stage manifests record `parentHash` (the L1 layers consumed) and `specHash`.

**Invariants**
- **P1:** R_{L2→L1}(patch field) = L1 field on every L1 cell fully covered by the patch core (anchoring, as I1). By transitivity, the patch also restricts to L0.
- **P2:** every L1 detail band and every L0 structure appears unchanged in the patch (bands are continuous functions of position, note 14 §3.4).
- **P3:** the same `PatchSpec` gives a bit-identical patch.

## 3. Approach and algorithm choice

### 3.1 Patch mesh

The patch mesh is a **jittered hexagonal lattice in the azimuthal equal-area projection** about the patch centre.
- The lattice step gives cells of area h_p². Lattice index (i, j) maps to a planar point, then to the sphere by the inverse azimuthal equal-area map.
- Jitter comes from `hash(stream 'patch.mesh', i, j, k)` in the planar frame, using orogen's jitter magnitude.
- Delaunay is computed by planar Delaunator on the azimuthal coordinates. Delaunay is not invariant under the map, so the triangulation is then legalised by spherical edge flips (empty-circumcircle test on the sphere) until it is stable. Distortion over a cap of radius ≤ 15° is under 2%, so this is a handful of flips.
- Voronoi vertices, cell areas (sr) and adjacency follow the `SphereMesh` interface.

**Why not a sub-range of a Fibonacci lattice?** It would have uniform density, but a cap that is not centred on the lattice's pole is not a contiguous index range. A lattice re-centred on the patch would put the irregular pole closure (F1) at the patch centre.

**Limits**
- Angular radius ≤ 15° (about 1,700 km on Earth). Beyond that, raise global N instead.
- At most about 1M cells per patch (§6.2 budget). At h_p = 1 km that is a cap about 560 km in radius.

**Snapping, for determinism and caching.**
- The centre snaps to the nearest L0 cell centre.
- The radius snaps to a ladder of 2^(k/2) × 50 km.
- h_p snaps to a ladder of 2^(k/2) km.

The same request therefore always yields the same `PatchSpec` and the same mesh. The cache key is (world hash, `specHash`).

**Apron.** The mesh covers the core cap plus an apron of width a = max(3·h_L1, 20·h_p). The apron absorbs edge effects of nonlinear steps (erosion, routing) and is not displayed.

### 3.2 Operators between L1 and L2

These are the same definitions as note 14:
- **R:** area-weighted average over patch cells whose centres lie in an L1 Voronoi cell;
- **P:** barycentric interpolation on the L1 Delaunay;
- **C:** iterated correction, then an exact per-parent step;
- **categorical layers:** nearest L1 cell, except where a finer rule exists (§3.5 for rivers).

R is only used for L1 cells fully inside core plus apron. Partly covered parents near the outer apron edge are not anchored.

### 3.3 Elevation

1. Assemble e_p = P(e_L1) + D_p. D_p contains only **bands that are inactive at L1** (λ < 4·h_L1 by the note 14 band rule) and active at h_p. The bands active at L1 are already in e_L1, so they are not added twice.
2. Run detail erosion at patch resolution (the slow pass in final mode), with the drainage constraint of §3.5.
3. Anchor in the core: e_p ← e_p + C(e_L1 − R(e_p)). In the apron, the anchoring weight ramps to full and the detail weight ramps to 0 at the outer edge. The outer edge therefore equals P(e_L1), and the patch joins the global field continuously.
4. Apply the coastline guards from note 14 §3.5, applied relative to L1: sign lock against e_L1 and emergence lock for structures.

**Zoom continuity.** Inside the core, the patch is the global field plus zero-mean detail (P1), so low-passing the patch to the global band set gives back the global field. A renderer that cross-fades from the L1 view to the patch over the apron cannot show a jump. It only shows detail appearing, which is what zooming should do.

### 3.4 Climate

Downscaling from L1 uses the same scheme as note 14 §3.6, one level down:
- **temperature:** lapse rate on the elevation detail (e_p − P(e_L1));
- **precipitation:** the linear orographic term on the patch detail, using ref-level winds, anchored multiplicatively to L1;
- **wind and currents:** P(L1).

Köppen and biomes are classified per patch cell. There is no separate climate solve on the patch, because the large scales came from L0.

### 3.5 Hydrology across the patch edge

- **Inherited network.** Every L1 river whose path crosses the core is carried into the patch as a constraint.
  - Its **entry cells** are the patch cells on the apron boundary nearest the L1 river path. They receive the L1 river's upstream drainage area and discharge as **inflow boundary conditions**.
  - Its **exit cell** is where the L1 path leaves the patch, or the river's mouth if it ends inside.
  - Inside the patch, priority-flood routing is constrained so that the trunk stays within a corridor of width 2·h_L1 around the L1 path. This is the same divide-band rule as note 14 §3.7, applied to L1 basins at the patch level.
- **Minor rivers** that exist only at patch resolution are free, subject to the L1 basin assignment outside divide bands.
- **Lakes.** L1 lakes keep their outlet and their surface level (within the vertical tolerance). Smaller lakes appear only in the patch, using the water balance in note 12.

### 3.6 Overlapping and nested patches

Decided at Checkpoint 2 (D9):
- **Nesting stays exact.** A patch of a patch (level 3) treats the level-2 patch as its parent, so all the operators above apply unchanged, and P1 holds exactly against that parent. Its spec snaps inside the parent's core.
- **Non-nested overlaps agree approximately, with a warning.** Two overlapping patches with the same h_p agree **exactly** in every band (P2). Their eroded detail agrees only approximately: closely in the shared core interior, more loosely near their aprons. Each patch is stored and displayed on its own. The renderer prefers the patch whose core contains the pixel and whose centre is nearest. **The UI shows a warning** whenever two non-nested patches overlap, saying that detail in the overlap may differ slightly between them.

A fully tiled scheme (a fixed hierarchy of tiles, so every location has one canonical patch per level) would give exact agreement between overlaps. It is deferred, and revisited at Phase 11.

### 3.7 Pipeline and caching

Patches run in the engine worker, using the stage runner with `meshId`-scoped stages. Each stage is the L1 stage's detail half, reused with a different parent. Patches are saved under `mesh/patches/` and `layers/` in the save file (§5). They regenerate deterministically from `PatchSpec` if they are evicted.

### 3.8 Consequences for ARCHITECTURE.md

- **§3.1:** the patch mesh construction (azimuthal equal-area lattice, snapping ladder, apron), and patch levels ≥ 2 parented by L1 or by another patch.
- **§3.7:** zoom rendering cross-fades over the apron.
- **D9:** nested patches exact; non-nested overlaps approximate, with a warning.

These refine the existing text and do not change direction.

## 4. Upstream references (algorithm level)

- **Note 14** operators. **Multigrid:** Briggs, Henson & McCormick (2000).
- **CesiumJS** `QuadtreePrimitive.js` and `Globe.js`: the level-of-detail selection and cross-fade ideas for the renderer. Concepts only. The code is Apache-2.0 and could be used, but it is not needed.
- **orogen** `sphere-mesh.js`: jitter magnitude and Delaunay via stereographic projection.
- **Spherical Delaunay legalisation:** Renka (1997), STRIPACK, *ACM TOMS* 23. Algorithm only.
- **Badlands-style routing** (note 14 and Phase 7) with inflow boundary conditions, as in Braun & Willett (2013).

## 5. Validation

- **P1.** Max |R(e_p) − e_L1| over covered L1 cells ≤ 0.01 m. The same check runs for temperature and (relatively) for precipitation.
- **P2.** Bands sampled in the patch equal the same bands sampled at L1 at shared positions, bit for bit.
- **P3.** Generating the same spec twice gives the same hash. A spec that snaps to the same ladder values gives the same hash.
- **Zoom-jump test.**
  - Render the same view from L1 and from the patch through the exact CPU path (§3.7).
  - Low-pass the patch rendering to the L1 band set.
  - Require that the per-pixel elevation difference has p99 ≤ 1 m and that the Köppen class agrees on ≥ 99% of pixels.
- **Edge continuity.** At the apron's outer edge the patch equals P(e_L1) within 0.01 m.
- **Rivers.** Every L1 river crossing the core enters and exits the patch within one L1 cell of its L1 path. Discharge at the exit is within 5% of L1 (the difference is lake evaporation inside the patch).
- **Overlap.** Two overlapping non-nested patches: identical bands. Eroded elevation in the shared core interior has p95 |Δ| below a tolerance recorded at Checkpoint 11. The overlap warning is raised exactly when two non-nested cores intersect.
- **Nesting.** A level-3 patch restricts to its level-2 parent within P1 tolerance.
- **Performance.** Time and memory for a 1M-cell patch, per browser.

## 6. Open questions

1. ~~**Tiling.**~~ **Resolved at Checkpoint 2 (D9):** approximate agreement for non-nested overlaps, with a UI warning; nested patches stay exact. Revisit at Phase 11, where the alternative is a fixed tiling (for example cube-sphere quadtree tiles), which costs complexity in erosion across tile seams.
2. **Display rule.** Should the globe show patches automatically when zoomed in (requested lazily), or only when the user asks for them? This mostly affects the UI, but it sets how many patches the cache must hold.

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Patch mesh (lattice, legalisation, snapping) | ~700 |
| Operators reused from note 14, plus apron weighting | ~300 |
| Inflow boundary conditions and corridor-constrained routing | ~500 |
| Patch pipeline and cache | ~400 |
| Renderer cross-fade | ~300 |
| Tests (P1–P3, zoom jump, rivers, overlap) | ~1,000 |
| **Total** | **~3,200** |
