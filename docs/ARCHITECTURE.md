# Architecture

Inputs: `docs/REQUIREMENTS.md`, `audit/CAPABILITY_MATRIX.md`, the per-repo audits in `audit/`, and spot checks of the source in `upstream/`.

## Resolved decisions

The open decisions in §8 were resolved on 2026-10-03. At Checkpoint 1 (also 2026-10-03), Q2, Q3 and Q7 were updated, D5 and D6 were added, and the eight architecture changes proposed in `docs/spikes/PHASE1_REPORT.md` were applied throughout this document. At Checkpoint 2 (2026-10-03), Q7 and Q9 were updated, D7–D10 were added, and the design-note changes below were approved. These resolutions override any earlier wording in this document.

| # | Decision | Resolution |
|---|---|---|
| Q1 | Base codebase | **Approved.** A new TypeScript shell that vendors orogen's stages (§1). |
| Q2 | Project license | **GPL-3.0-only.** I checked orogen at `cc2662b`. `LICENSE` is the unmodified GPL-3.0 text, and `README.md` says only "GNU General Public License v3.0". There are no per-file headers, no SPDX tags and no package license field, and no "or (at your option) any later version" wording appears outside the license text. Under GPL-3.0 §14, a work that names version 3 without the later-version clause is version-3-only, so MapMaker cannot be offered as "-or-later" while it includes orogen code. `/LICENSE` holds the GPL-3.0 text. <br>**Checkpoint 1:** GPlates is confirmed **GPL-2.0-only**. Its `COPYING` preamble says "version 2, dated June 1991, not any later version" (spike 1a). That is incompatible with GPL-3.0-only, so GPlates stays a **math reference only**, permanently. |
| Q3 | Determinism scope | **Final at Checkpoint 3b (2026-10-04): `dmath` has two modes, and canonical Float64 state uses `fdlibm`.** <ul><li>**History.** Checkpoint 1: spike 1a saw all 69 orogen output arrays bit-identical across Node, Chromium 140, Firefox 141 and WebKit 26 (20k–1M cells) with no deterministic math library, because orogen rounds to Float32. Checkpoint 3: the cross-engine probe (`tools/determinism/`) on Linux x64, macOS arm64 and Windows x64, in Node, Chromium, Firefox and WebKit, showed that results passing Float64 libm output through (`dmath` sweeps, Float64 mesh points, cell areas and circumcentres) differ by 1–2 ULP on about 0.01–3% of sampled inputs, between engines and between Node on arm64 and on x64. RNG streams, topology, Float32 points and the history save → load → resume chain were exact everywhere.</li><li>**Decision.** `dmath.mode = 'fdlibm'` is a line-by-line TypeScript port of netlib fdlibm 5.3 (`packages/core/src/fdlibm.ts`; `log2` from FreeBSD msun, which descends from fdlibm). It uses only IEEE `+ - * /` and `Math.sqrt`, so it is bit-identical on every engine and CPU. It covers all 22 transcendentals that lint allows only through `dmath` (`sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh atanh exp expm1 log log2 log10 log1p pow cbrt hypot`). `hypot` is fdlibm's two-argument function folded left for more arguments. `'native'` (pass-through to `Math.*`) stays available for orogen parity and is the **default** until a stage opts in. **Anything that must be cross-engine exact (canonical Float64 geometry, history simulation state) runs in `'fdlibm'`**, and the save manifest records the mode.</li><li>**Verification.** The port matches 22,675 reference vectors bit for bit. They come from the unmodified C (netlib fdlibm 5.3, FreeBSD `e_log2.c`) compiled with FMA contraction off (`tools/fdlibm-vectors/`), and include special values, subnormals and the large-argument range reduction path. Corrupting one constant makes the test fail. The probe now runs twice: native-mode keys keep their report-only status for libm-dependent values, and **every `fd.` key is strict in CI** (the dmath sweep of all 22 functions, Float64 mesh points, areas, circumcentres, topology, and a **1M-cell Float64 mesh**). All 84 `fd.` keys match on ubuntu x64, macOS arm64 and Windows x64, in Node, Chromium, Firefox and WebKit.</li><li>**Measured (Node 24, arm64, 2.56M-cell mesh, median of 5).** Mesh build **+6%** at f64 (2.89 s → 3.08 s) and **+13%** at f32 (2.83 s → 3.21 s). The point-generation step alone, which is where the transcendentals are, is **1.39×** (606 ms → 842 ms). `cellArea_sr` is 1.2× (184 → 222 ms) and `circumcentres` is 1.8× (196 → 356 ms, from the folded `hypot`). Per call: sin 1.28×, cos 1.18×, asin 1.05×, log 1.11×, exp 1.38×, atan2 1.62×, tanh 1.65×, cbrt 2.04×, **pow 4.2×** (47 ns vs 11 ns); heavy `pow` loops are the one place to watch in Phase 13.</li><li>**Does a ULP difference flip a Delaunay triangle?** Not in the cases measured. Native and fdlibm Float64 points differ by up to 29 ULP at 1M cells (jitter amplifies the 1-ULP libm differences; 49k of 3M coordinates differ), yet the triangle arrays are identical at 200k, 1M and 2.56M cells. At f32 the points are bit-identical between modes. The 1M-cell strict key keeps checking this on every CI run.</li><li>**Side findings.** Node on x64 (Linux and Windows) already returns the fdlibm values for 20 of the 22 native-mode libm keys; only `pow` and the `hypot`-derived circumcentres differ. The native divergence is therefore mostly arm64 V8 (and the browsers), not Linux vs Windows. Current V8 `main` no longer ships fdlibm (`src/base/ieee754.cc` forwards to LLVM libc), so it was not usable as the port source.</li><li>**Guarantee.** With `dmath.mode = 'fdlibm'`: bit-exact across Chromium, Firefox, WebKit and Node, on Linux x64, macOS arm64 and Windows x64, same app version. With `'native'`: same app version, same engine build and same CPU architecture only. The mode is per realm: every worker sets it before computing.</li></ul> |
| Q4 | Desktop wrapper | **Approved.** Electron, built only if benchmarks demand it. |
| Q5 | History t0 | **Approved.** History starts from Azgaar's static human layer. |
| Q6 | Fidelity targets | **Benchmark targets, not hard caps.** <ul><li>Whole planet: up to 2.56M cells.</li><li>Regional patches: down to about 1 km.</li><li>History benchmark: 5,000 years at 1-year ticks with aggregate agents.</li></ul>The timeline must support longer spans by using a coarser `dtYears` per era (§3.4), so histories of tens of thousands of years stay possible. |
| Q7 | A/B thresholds | **Final at Checkpoint 1, as targets.** Each is measured on the 20k reference mesh after area-weighted restriction, comparing a preview with the final run of the same seed: <ul><li>land IoU ≥ 0.95;</li><li>coastline p95 ≤ 2 preview-cell widths;</li><li>Köppen area agreement ≥ 90%, for preview tiers of **200k cells and above**;</li><li>annual precipitation correlation (land) r ≥ 0.9;</li><li>mountain IoU (≥ 1,500 m) ≥ 0.6;</li><li>hypsometry KS distance (land) ≤ 0.05;</li><li>≥ 7 of the top 10 basins matched at IoU ≥ 0.5.</li></ul>**Checkpoint 2 added three full-resolution metrics**, because under anchoring (D5) four of the seven above hold by construction (design note 14 §3.9): <ul><li>hypsometry KS distance on native L1 land cells, preview vs final low-passed to the preview's band set;</li><li>Köppen agreement on the 1° grid (inverse sampling);</li><li>river-mouth distance (km) for the top-10 basins.</li></ul>Their target values are set from the Phase 4a baseline and reviewed at Checkpoint 4b. CI **hard-fails on regression only** (Phase 4b defines regression), for all ten metrics. The targets are reviewed at Checkpoint 4b. |
| Q8 | Calibration data | **Approved.** Data is downloaded at tuning time and never vendored. Each dataset is logged in `PROVENANCE.md` with its license. |
| Q9 | Tectonic history | **Changed.** The static tectonic snapshot still comes first. Forward plate evolution over deep time (hundreds of Myr) is a **core feature**: it has a fast rough pass and a slow detailed pass from the same seed. Design note 13 (Phase 2) specifies it. **Checkpoint 2:** it is built in **Phase 6b**, after Phase 6 and before Phase 7, with its own checkpoint. Default duration 300 Myr; the maximum is never capped below 800 Myr (initially 1,000 Myr). |
| Q10 | Climate fidelity | **Approved.** orogen heuristics, forced by the VPLanet subset. |
| Q11 | Node 24 | **Approved, project-local only.** fnm runs from `.tools/` with `FNM_DIR=.tools/fnm`, and the version is pinned in `.nvmrc`. System Node and global tools are not changed. |
| D5 | Fidelity slider | **Redesign adopted (Checkpoint 1).** Structural decisions (mountain kernels and belts, hotspots, the macro land mask, major drainage divides) are made at a fixed reference resolution, with counter-based randomness keyed to reference-cell ids. Higher N adds only band-limited detail. See §3.1, §3.5, §4 (Fidelity slider) and design note 14. |
| D6 | Phase 4 split | **Adopted (Checkpoint 1).** Phase 4a: orogen in the shell, parity test, globe, benchmarks. Phase 4b: the preview restructure (D5) behind the Q7 A/B gate. Each has its own checkpoint (§7). |
| D7 | Climate at L0, downscaled | **Approved with a gate (Checkpoint 2).** Phase 4b must show that the downscaled climate scores within a stated tolerance of orogen's full-resolution climate on the Earth tuning harness, at the same N. The tolerance starts at **0.02 of the objective**: the downscaled score may be at most 0.02 lower. If it is not, the climate solve moves to the **80k-cell climate mesh fallback** (L0′, note 14 §3.6). |
| D8 | Phase 4b fallback | **Adopted (Checkpoint 2).** If the restructure cannot reach the Q7 targets within its effort budget (Phase 4b), the preview shows **reference-level structure only**, and detail appears with the final run. |
| D9 | Overlapping patches | **Approximate agreement (Checkpoint 2).** Nested patches stay exact (each restricts to its parent). Non-nested overlaps agree approximately and show a warning in the UI. Revisit at Phase 11. |
| D10 | Phase 2 defaults | **Approved (Checkpoint 2).** <ul><li>Partial-world: latitude must be supplied when the import has no climate-bearing layers (40°N pre-filled).</li><li>Plate evolution: 300 Myr default.</li><li>Tidally locked and > 54° obliquity planets generate but are marked "climate outside model validity".</li><li>Soils use USDA orders.</li><li>Undiscovered deposits are stored and revealed by the history simulation (`discoveredTick`).</li><li>Parameter sweeps run nightly (about 1.4 h).</li><li>History uses aggregate agents, with named notable figures for the event log only.</li></ul> |

### Known gaps (revisit later)

| Gap | Status | Revisit |
|---|---|---|
| Tidally locked planets | Generated, but marked unsupported by the parameter mapping (design note 10 §3.4). orogen's banded circulation cannot represent a substellar-antistellar climate. | After Phase 8 |

**Changes from the Phase 2 design notes (approved at Checkpoint 2).**

| From | Change | Where |
|---|---|---|
| Note 14 | The pipeline becomes a **reference pass** (L0, identical for every fidelity setting) plus a **detail pass** (L1 at N). Climate is solved at L0 and downscaled to N. Reference erosion is one fixed model, and the slider chooses only N and the detail-erosion model. Stage 6 coupling runs at L0. Hydrology inherits major divides from L0. Collisions and stress move to L0. | §3, §4 |
| Note 14 | New `structures` entity table; `referenceHash` in stage manifests. | §3, §3.3 |
| Note 3 | Partial-world mode holds the imported elevation fixed and pins the **reference-level structure** (not orogen's elevation stage); adds feature extraction, a context search and Laplace margin blending. | §4 step 0p |
| Note 6 | Patch meshes are snapped azimuthal equal-area lattices with an apron; patches nest (levels ≥ 2). Nested patches agree exactly; non-nested overlaps agree approximately and warn (D9). | §3.1 |
| Note 11 | Climate layers are stored as annual-harmonic coefficients (H = 2), fitted from 12 phases solved at L0. Köppen uses real monthly criteria; the two-season form remains the parity mode. | §3.2 |
| Note 13 | New stage 2e (plate evolution) as a pipeline variant; a layer has one producer *per variant*; entities declare `timeAxis` and time-varying layers declare it through `timeVarying` (geologic Myr or history ticks); geologic timeline in the save format; **Phase 6b** (moved from the proposed 4c at Checkpoint 2). | §3.2–3.4, §4, §5, §7 |

## Status of claims (read first)

- The capability ratings this document builds on came from **code reading**. Phase 1 then built and ran the ones that decide this architecture. Results are in `docs/spikes/PHASE1_REPORT.md`; revised ratings are in `audit/CAPABILITY_MATRIX.md`.
- **`†`** marks a claim I could not confirm from source, or one that depends on a measurement that has not been made yet.
- Q1–Q11 are resolved (see above). The following decisions are also settled and are not reopened here: D1/D3 (sphere is canonical, inverse-projection rendering, d3-geo for projection math), D2 (requirements corrected), D4 (fast pass = orogen erosion, slow pass = Badlands-style re-implementation, still to be validated), the RNG-state save requirement, and the license rules:
  - Eurace and WRF-Hydro are never extracted.
  - GPlates is GPL-2.0-only (confirmed in spike 1a) and is a math reference only, permanently.
  - All other license conflicts are deferred.

### Facts checked against `upstream/` while writing this

These affect the design and are not all in the audits.

| # | Finding | Where | Consequence |
|---|---|---|---|
| F1 | orogen builds the Fibonacci sphere and its stereographic pole closure around **+z**, but every physics module treats **+y as north** (`lat = asin(y)`, `lon = atan2(x, z)`). | `js/sphere-mesh.js` (`generateFibonacciSphere`, `buildSphere`); `js/wind.js:571`, `js/terrain-post.js:453`, `js/elevation.js`, `js/planet-mesh.js:427` | The orogen adapter applies one fixed axis permutation. The mesh's construction pole and its closure cell end up on the *physical equator* at 0°E. Spike 1a confirmed the permutation exactly and found that seam cell at (0°N, 0°E): it is small and irregular (0.28–0.62× mean area, degree 4–6) but shows no field artifact. orogen stores `r_xyz` as **Float32** (§3.1). |
| F2 | orogen elevation is **dimensionless**. Land runs 0..1 through an S-curve to 0..6 km; ocean is linear at ×10 km. Land is hard-capped at 6 km. | `js/color-map.js` `elevToHeightKm` | The canonical model stores metres. The adapter converts forward. Spike 1a showed that the inverse S-curve round trip (error ≤ 2.6e-6) still changes 13 Köppen cells at 200k, so the adapter keeps orogen's raw value as the adapter-private layer `orogen.elevRaw` and never feeds orogen's climate from inverse-mapped metres (§3.6). |
| F3 | orogen hard-codes the Earth radius `6371`. | `js/temperature.js`, `js/precipitation.js`, `js/ocean.js`, `js/elevation.js`, `js/heuristic-precip.js` | Planet radius has to be threaded through as a parameter. This belongs to gap 11 (physical-parameter mapping). |
| F4 | orogen's RNG is a Park-Miller LCG with a one-integer state. With no seed given, it seeds from `Math.random()`. `buildSphere` consumes jitter draws proportional to N from the shared `rng`. | `js/rng.js`, `js/planet-worker.js:204` | The state is trivially serializable. Spike 1c found that no later stage reads the post-mesh `rng`. The real hazards are draw counts *inside* stages that grow with N (the phasor-kernel Fisher–Yates shuffle in `elevation.js`) and stage seeds that collide (`seed+999`, `+501`, `+9999`). See §3.5. |
| F5 | orogen's pipeline exists twice: once in `generate.js` (main-thread fallback) and once in `planet-worker.js`. UI and app state live in a global mutable `state` object. | `js/generate.js`, `js/planet-worker.js`, `js/state.js` | Only the stage functions are reused. Orchestration is replaced. |
| F6 | orogen's tuning harness runs headless in Node. Its Köppen ground truth (`tuning/climate/data/ascii/Koeppen-Geiger-ASCII.txt`, Kottek et al. 2006) is **not in the checkout**. | `tuning/climate/README.md`, `tuning/climate/lib/ground-truth.mjs:15` | The data must be downloaded before the harness can run. This corrects the matrix's "appears to be the single earth.png". |
| F7 | Azgaar **overwrites the global `Math.random`** with a re-seeded Alea at several points, and calls `Math.random()` directly in 11 generators. | `src/generators/grid-generator.ts:20`, `heightmap-generator.ts:558`, `precipitation-generator.ts:34`, `routes-generator.ts:210`, `provinces-generator.ts:82`, `src/components/seed.ts:20` | RNG state cannot be captured while this pattern exists. Every extracted Azgaar generator receives an injected stream instead. |
| F8 | Azgaar uses two global graphs: `grid` (a jittered square grid) and `pack` (re-graphed from it). Generators read `cells.c` (neighbours), `cells.p` (planar xy), `cells.h` (0–100, sea level 20), `cells.area`, `cells.b` (border flag), `cells.g` (link to grid cell), and use quadtree `findCell`. | `src/types/PackedGraph.ts`, `src/generators/generation-pipeline.ts` | Planar geometry is concentrated in a few fields. A sphere-backed `PackedGraph` facade is feasible. Spike 1b tests it. |
| F9 | Azgaar requires Node ≥ 24. This machine has Node 22.19.0. | `package.json` (per audit); `node --version` | Spike 1a uses a project-local Node 24 through fnm in `.tools/`, pinned in `.nvmrc` (Q11 resolved). System Node is unchanged. |
| F10 | GPlates headers read "GNU General Public License, version 2", and a grep of all of `src/` finds no "any later version" wording. | `upstream/GPlates/src/maths/*.h`, `COPYING` | **Confirmed GPL-2.0-only** in spike 1a: the `COPYING` preamble says "version 2, dated June 1991, not any later version". GPlates is math-reference only, permanently. |

---

## 1. Base codebase: orogen fork or new shell?

**Recommendation: build a new TypeScript shell. Vendor orogen's generation and climate modules into it verbatim, behind adapters, and replace them piece by piece (a strangler pattern).** This is not a rewrite. The orogen stage code moves over unchanged at first, and a parity test pins its output.

Why not fork orogen and grow it:

1. **Most of orogen's non-generation code would be replaced anyway.** Of its 18.7k LOC, roughly 11k are generation and climate (`elevation.js`, `terrain-post.js`, `plates.js`, `plate-physics.js`, `coarse-plates.js`, `super-plates.js`, `ocean-land.js`, `wind.js`, `ocean.js`, `temperature.js`, `precipitation.js`, `heuristic-precip.js`, `koppen.js`, `sphere-mesh.js`, plus config). Those are what MapMaker needs. The rest conflicts with the settled decisions:
   - The flat map is a forward-projected triangle mesh with antimeridian triangle splitting (`planet-mesh.js` `buildMapMesh`). D1/D3 require inverse-projection sampling, so that code goes.
   - The planet code (`planet-code.js`) holds a seed and slider values only. It cannot hold RNG state or mid-run state.
   - Global mutable `state` (F5), a duplicated pipeline (F5), and no build step, types or tests.
2. **The design philosophies conflict.** orogen's `CLAUDE.md` puts "artistic appeal" first and says "never slow down generation to chase physical accuracy". MapMaker's requirements say "prioritize realism over speed". A fork inherits a codebase tuned around the opposite trade-off.
3. **Azgaar is a worse base.** Its UI, renderers and data model are planar SVG throughout, which is the opposite of sphere-canonical.
4. **Cross-cutting guarantees must be imposed from outside.** Exact resume needs one RNG service, one layer registry and one stage runner across orogen-, Azgaar-, VPLanet- and Badlands-derived code. That has to be imposed by a shell that owns orchestration, not retrofitted into one upstream's globals.
5. **License outcome is the same either way.** orogen is GPL-3.0, so the combined work is effectively GPL-3.0 whether we fork it or vendor it.

The cost: a fork reaches first pixels sooner. That is mitigated by Phase 4a, which runs orogen's stages *unmodified* inside the shell and asserts output parity with stock orogen for the same seed before anything is changed.

What is kept from orogen besides generation:
- the globe renderer concepts in `scene.js` (175 LOC) and the globe parts of `planet-mesh.js`;
- the heightmap import sampling in `import-main.js` and `planet-worker.js` `handleImportHeightmap`;
- the 16-bit PNG encoder in `planet-mesh.js`;
- the tuning harness in `tuning/climate/`.

---

## 2. Host language and integration

**Host: TypeScript (strict), ES modules, built with Vite, tested with Vitest and Playwright, organised as an npm-workspaces monorepo.** The same packages run in browser workers and in Node, which is used for headless tuning, A/B tests and golden-file tests. Output is a static bundle for GitHub Pages.

| Source | Integration mode | Detail |
|---|---|---|
| **orogen** (JS, GPL-3.0) | **Vendor → adapt → port incrementally** | Copy `js/` stage modules at commit `cc2662b` into `packages/gen-orogen/vendor/` unchanged. Wrap each stage behind the stage interface (§4) with an adapter that does axis permutation, unit conversion, RNG injection and the radius parameter (F1–F4). Port to TypeScript one module at a time, with the parity test as a guard. Drop orogen's inlined Delaunator for the npm package. |
| **Azgaar** (TS, MIT) | **Source-level adaptation** of selected generators | Extract `river-generator`, `lakes`, `features-generator`, `biomes-generator`, `population-generator`, `cultures-generator`, `names-generator`, `burgs-generator`, `states-generator`, `provinces-generator`, `routes-generator`, `religions-generator`, `goods-generator`, `production-generator`, `markets-generator`. Replace globals (`pack`, `grid`, `options`) with an explicit context and replace `Math.random` with injected streams (F7). Run them over a sphere-backed `PackedGraph` facade (§3.6). Azgaar's renderers, UI and `.map` format are references only. |
| **VPLanet** (C, MIT) | **TypeScript re-implementation of a small subset**, validated against the native binary | Port only what MapMaker needs: insolation by latitude and day of year from orbital elements and obliquity (DistOrb/DistRot steady-state formulas, not secular evolution), and the POISE energy-balance core (annual and seasonal modes, OLR parameterisation, ice-albedo). A full WASM port is rejected: `poise.c` is tangled with `evolve.c` and the body struct, and we need a fraction of it. Native `vplanet` is built locally and its `examples/EarthClimate` output is used as golden data in tests. |
| **Badlands** (Python/Fortran, GPL-3.0) | **Re-implementation in TypeScript** on the sphere mesh | Braun–Willett O(n) receiver and stack ordering, implicit stream-power incision (detachment-limited first, with transport-limited variants later), and linear and nonlinear hillslope diffusion, all using spherical cell areas. Validated against a Python Badlands run on a planar benchmark (Phase 7). Flexure (gFlex) is not ported; Airy isostasy if needed. |
| **GPlates** (C++, GPL-2.0-only) | **Math reference only** | Finite rotations, Euler poles and quaternion composition are written from published formulas (for example Cox & Hart, *Plate Tectonics: How It Works*), not from GPlates source. GPlates file paths are cited as reference only. |
| **d3-geo, d3-geo-projection** | npm dependency | All projection math (D1). License recorded in `PROVENANCE.md`†. |
| **proj4js** | npm dependency, only if needed | Only if a required projection is missing from d3-geo-projection. |
| **three** | npm dependency | Globe rendering (WebGL2). |
| **delaunator** | npm dependency | Spherical Delaunay through stereographic projection, as orogen does it. |
| **fflate** | npm dependency | ZIP container for the save format and streaming compression. |
| **Eurace, WRF-Hydro** | **Never extracted** | No code and no close paraphrase. Not even consulted as an algorithm reference for new code. |

**WASM** is reserved for hot kernels, after profiling shows JS is the bottleneck. Likely candidates are flow routing and the stream-power solve at 2.56M cells, and history-sim inner loops. Such kernels would be written in Rust with wasm-bindgen. WASM is *not* a route for porting upstream C, C++ or Fortran.

**Separate processes**: none in the browser build. The desktop fallback (§6.5) runs the same bundle. Native companion processes are not planned.

**Proposed repository layout** (created in Phase 3, not now):

```
apps/web/                 UI shell, render loop, views
packages/core/            canonical model: mesh, layers, entities, timeline, rng, dmath, units, save format
packages/engine/          stage runner, worker protocol, worker pool, checkpoints
packages/gen-orogen/      vendor/ (verbatim orogen) + adapters + progressive TS ports
packages/planet/          VPLanet-derived insolation, seasons, EBM; physical → simulation parameter mapping
packages/erosion/         Badlands-style slow pass; shared flow routing
packages/human/           Azgaar-derived generators + PackedGraph facade
packages/projection/      d3-geo wrappers, inverse sampler, distortion, Tissot, vector path
packages/history/         history simulation (built last)
tools/tuning/             calibration harness (from orogen tuning/), A/B harness
spikes/                   Phase 1 throwaway code (not shipped)
docs/                     ARCHITECTURE, design/, spikes/, PARAMETERS (later)
PROVENANCE.md             module-level provenance + third-party dependencies
```

---

## 3. Canonical spherical world model

Everything the app knows about a world lives in one `World` object. Every stage reads and writes it through the layer registry. Every view and export samples it. Nothing else is authoritative.

```
World
├── manifest      format version, app version, stage code versions
├── planet        physical parameters + derived forcing tables
├── params        all generation parameters (1.0 = Earthlike convention)
├── rng           named stream states
├── meshes        reference (L0), global (L1, fidelity N), regional patches (L2+), each linked to its parent
├── layers        per-cell typed-array fields, via LayerRegistry
├── entities      columnar tables with stable ids and validity intervals on a declared time axis
├── timeline      geologic axis (Myr) and history axis (calendar, tick), agent tables, event logs, keyframes
└── pipeline      resolved pipeline variant, completed stages, input hashes (incl. referenceHash), mid-stage checkpoints
```

### 3.1 Geometry and coordinates

- **Frame**: unit sphere, right-handed. **+Z = north pole**, **+X = (0°N, 0°E)**, **+Y = (0°N, 90°E)**. `lat = asin(z)`, `lon = atan2(y, x)`. All positions are unit vectors in Float64 where precision matters (mesh points), and Float32 elsewhere.
  - orogen stores its mesh points as **Float32** (`r_xyz`, spike 1a). The canonical Float64 mesh is a deliberate deviation. Parity runs (Phase 4a) build the mesh at Float32 so that stock orogen's arithmetic is reproduced, and the Float64 mesh is tolerance-tested against them.
- **Physical scale**: `planet.radius_m`. Every distance and area is computed as angle × radius, or steradians × radius², so no `6371` constant appears anywhere (F3).
- **`SphereMesh`** is mesh-agnostic. Generators depend only on this interface, not on how the points were placed:
  - `points: Float64Array(3N)`, the cell centres;
  - Delaunay `triangles` and `halfedges` (Int32), closed over the sphere;
  - CSR adjacency `adjOffset` / `adjList` (the shape orogen already uses);
  - Voronoi vertices (triangle circumcentres on the sphere);
  - `cellArea_sr: Float64Array(N)`;
  - a spatial index for point → cell lookup (cube-map buckets, then a walk on the Delaunay graph).
- **Global mesh**: orogen's jittered Fibonacci–Voronoi mesh at the chosen fidelity N. Keeping it is what makes orogen's scale-invariance rules (hop counts scaled by `avgEdgeKm`, smoothing in physical km) carry over unchanged.
  - The construction pole and closure cell land at (0°N, 0°E) after the axis permutation (F1). That **seam cell** is a known small cell (0.28–0.62× mean area, degree 4–6). Spike 1a measured no field artifact there, and a regression test keeps it that way.
- **Reference mesh** (D5, design note 14): a fixed-size mesh, the same ~20k-region mesh orogen already uses for coarse plates, on which every *structural* decision is made. It does not depend on fidelity N. The global mesh at any N relates to it through the same restriction and prolongation operators that relate a regional patch to the global mesh (below). Its layers and the `structures` entity table are the output of the **reference pass** (§4).
  - **Mesh levels**: L0 = reference, L1 = global at N, L2+ = patches (a patch may parent a finer patch). Each level relates to its parent by R, P and the correction operator C, which makes R(C(δ)) = δ exactly (note 14 §3.4).
- **Regional patches** are separate, finer meshes covering a spherical cap or polygon, linked to the global mesh by:
  - `parentOf: Int32Array` (patch cell → global cell);
  - a **restriction operator** R (area-weighted average of patch cells onto their parent cells);
  - a **prolongation operator** P (barycentric interpolation from the global Delaunay).

  The invariant is **R(patch field) = global field** on every fully covered parent cell. Patch detail is P(global) plus band-limited detail whose restriction is zero. That makes whole-planet and regional views consistent by construction (requirement: no discontinuities across zoom).
  - **Patch meshes** (design note 6) are jittered hexagonal lattices in the azimuthal equal-area projection about the patch centre, re-legalised as spherical Delaunay. Centre, radius and spacing snap to fixed ladders, so the same request always gives the same mesh. An apron around the displayed core absorbs edge effects. Rivers crossing the patch edge enter as inflow boundary conditions from L1. A nested patch restricts exactly to its parent patch. Overlapping patches that are not nested agree only approximately, and the UI warns where they overlap (D9).

### 3.2 Layers (per-cell fields)

Fields are stored struct-of-arrays: one typed array per field per mesh. They are registered in a `LayerRegistry` with this descriptor:

| Descriptor field | Meaning |
|---|---|
| `id` | e.g. `elevation`, `temp.mean`, `precip.annual`, `wind.jan` |
| `dtype` | Float32, Int32, Uint16, Uint8 (categorical) |
| `unit` | SI unit string (`m`, `degC`, `mm/yr`, `m/s`, `m^2`, `m^3/s`, `enum:koppen`, ...) |
| `kind` | `scalar`, `vector-en` (east and north components, two arrays), `categorical`, `bitset` |
| `producer` | stage id that writes it in the resolved pipeline variant (for example with or without plate evolution, note 13). Exactly one producer per layer per variant, checked by the runner; only that stage may write it |
| `deps` | layer ids the producer read; used for invalidation |
| `sample` | `barycentric` (continuous), `nearest` (categorical), or `none` |
| `timeVarying` | `false`, or the time axis the layer changes on: `'geo'` (plate evolution, Myr) or `'history'` (ticks). See 3.4 |
| `hash` | content hash, used for caching and the save manifest |

Representative layers, with their producers:

- **Tectonic**: `plate` (Uint16), `crustType` (Uint8: oceanic, continental, arc...), `crustAge_Myr`, `crustThickness_km`, `orogenyAge_Myr`, `boundaryType`, `stress`, `lithology` (Uint8), from tectonics, or from plate evolution (stage 2e) when that variant is active.
- **Terrain**: `elevation` (m, relative to sea level), `bedrock` (m), `sediment` (m), `erosionRate` (m/Myr).
- **Climate**: per field, annual-harmonic coefficients (`temp.a0`, `temp.a1`, `temp.b1`, `temp.a2`, `temp.b2`, and likewise for `precip` (mm), `wind` and `current` (m/s, east/north) and `pressure` (hPa)), evaluated for any day of the year (design note 11). Derived layers: `temp.mean/warmest/coldest`, `precip.annual/driest/wettest`, `growingSeasonDays`; `iceCover`. Parity mode keeps orogen's two seasons (`temp.summer`, `temp.winter`, ...).
- **Hydrology**: `receiver` (Int32), `stackOrder` (Int32), `drainageArea` (m²), `discharge` (m³/s), `lake` (Int32 id or −1), `basin` (Int32), `riverId`.
- **Classification and land**: `koppen` (enum), `biome` (enum), `soilType` (enum), `soilFertility` (0..1), `soilDepth` (m), `mineral.*` (deposit grade per class).
- **Human, as the current value of time-varying fields**: `population`, `culture`, `language`, `polity`, `province`, `landUse`, `habitability`.

**Rule:** no layer is ever modified to suit a projection, a view or an export. Derived visual products (hillshade, colour ramps) are computed at render time and never stored in `World`.

### 3.3 Entities

Entities are columnar tables. Each row has a stable `id`, a `validFrom` / `validTo` interval (the `valid_time` idea from GPlates' feature model, used here as a concept only), and typed columns. Each table declares its **time axis**: `geo` (Myr, negative before present; plates, terranes) or `history` (ticks; everything human). Tables:

- `plates` (Euler pole unit vector, rate in rad/Myr, density, oceanic flag; with plate evolution, a per-step pole history and split and merge links);
- `structures` (reference-pass features: kind, unit-vector position, orientation, amplitude, envelope, reference-cell id; note 14);
- `rivers` (source and mouth cells, cell path, discharge at mouth);
- `lakes` (type, surface elevation, outlet);
- `cultures`, `languages`, `settlements` (cell, offset vector, population, rank), `polities`, `provinces`, `religions`, `routes` (cell paths), `goods`, `markets`.

Positions are stored as `(cell id, local unit-vector offset)`. They are never stored as planar coordinates.

### 3.4 Time, agents and events (designed now, simulated last)

This exists in the schema and save format from Phase 3, even though only a dummy stage exercises it until Phase 13.

- **`Timeline`**: `calendar` (epoch, year length, month table from `planet`), `tick` (integer), `simTime`, and a `dtYears` schedule.
  - The schedule is a list of eras, `[{ fromTick, dtYears }]`, so the span covered by one tick varies by era.
  - The benchmark is 5,000 years at 1-year ticks (Q6). That is a target, not a cap.
  - Longer histories, up to tens of thousands of years, use coarser eras: for example, 10- or 25-year ticks in deep prehistory and 1-year ticks near the present.
  - Agents and stages read `dtYears` for the current tick and never assume one year. Counter-based RNG keys on the tick, so changing the era schedule changes results only from the first changed era onward.
- **Geologic axis** (note 13): `timeline.geo = { tStartMyr, dtMyr, keyframeEveryMyr }`, with its own keyframes and a `geoEvents` log of the same shape as `EventLog` (time in Myr). Present day, t = 0 Myr, is the physical world at history tick 0.
- **Agent tables** are entity tables whose rows change every tick: settlements (population by cohort, resources, buildings), polities (treasury, military, government form, relations matrix in sparse form), populations or cultures (traits, language id), and languages (phoneme inventory, lexicon, sound-change history). Struct-of-arrays, so a tick can process them in bulk and in parallel.
- **Time-varying cell layers** (`timeVarying: 'geo'` or `'history'`, as in §3.2) have, on their own axis:
  - a *current* array;
  - **keyframes**: every K ticks on the history axis, every `keyframeEveryMyr` on the geo axis (a full array snapshot);
  - a **change log** between keyframes: (time, cell, layer, old, new), run-length packed, where time is a tick or a geo step.

  Scrubbing to time t on an axis means loading that axis's nearest earlier keyframe and replaying its log. A layer can be time-varying on one axis only. The physical world can also change during history (climate shifts, river avulsion, sea level), so the same mechanism covers physical layers if they are marked time-varying.
- **`EventLog`** is append-only:

  ```
  { id, tick, type, actors: EntityRef[], cells: Int32[], payload: {...}, causes: eventId[] }
  ```

  `causes` makes causal chains explicit, for example famine → migration → war, which is the "causation" Azgaar lacks. The log is chunked by tick range, so saves and the UI page it.
- **RNG for the simulation** is counter-based (§3.5). A draw is a pure function of `(stream, tick, entityId, k)`, so results do not depend on worker scheduling, and resume only needs the tick.

### 3.5 RNG service and deterministic math

- **Named streams.** `ctx.rng(name)` returns a stream whose state serializes to `{ algo, state, draws }`. Algorithms:
  - `orogen-lcg`: bit-identical to orogen's `makeRng`, with a one-integer state. Used for parity.
  - `alea`: bit-identical to the Alea package Azgaar uses, with its state words exported. Used for parity.
  - `sfc32`: four uint32 state words. The default for new code.
- **Stream derivation**: stream seeds come from `hash(masterSeed, streamName)` (SplitMix64 / Murmur-style). Adding a stream therefore never shifts other streams, and mesh jitter at a different N cannot perturb downstream draws. That is necessary for preview = final, but not sufficient (next two points).
- **orogen's stage seeds collide** (spike 1a). `seed+999` seeds both the `coarse-plates.js` SimplexNoise and `elevation.js` `hsRng`; `seed+501` seeds two SimplexNoise fields in `elevation.js`; `seed+9999` seeds both `plate-physics.js` and `terrain-post.js`. The `orogen-lcg` parity mode reproduces these collisions exactly. New code never uses offset seeds; it uses derived streams.
- **N-dependent draw counts are the real preview hazard** (spike 1c). Separate streams do not help when the *number* of draws inside a stage depends on N. orogen's phasor-kernel placement shuffles a candidate list whose length grows with N, so kernel positions change at every resolution. Structural randomness (D5) therefore uses **reference-keyed counter draws**: `u32 = hash(streamSeed, refCellId, k)`, where `refCellId` is a reference-mesh cell id. A structural decision then does not depend on N or on draw order.
- **Counter-based draws** for parallel and history code: `u32 = hash(streamSeed, tick, entityId, k)`.
- **Ban**: `Math.random` is a lint error in every engine package. It is still allowed in UI-only cosmetic code (for example the starfield in orogen `scene.js`).
- **`dmath`**: all simulation code calls `dmath.sin/cos/exp/log/pow/atan2/...` rather than `Math.*` (lint error in `packages/**`, as is the `**` operator). It has two modes, switched with `dmath.setMode()` or `dmath.withMode()`. `'native'` passes straight through to `Math.*` (orogen parity; the default). `'fdlibm'` uses the vendored fdlibm port, which is bit-identical on every engine and CPU. JS arithmetic is IEEE-754 deterministic, but transcendental `Math` functions are *not* guaranteed identical across V8, SpiderMonkey and JavaScriptCore, or even between arm64 and x64 V8. **Q3:** spike 1a saw bit-identical orogen output because orogen rounds to Float32; Checkpoint 3 then measured 1–2 ULP divergence in Float64 results, and Checkpoint 3b added the `'fdlibm'` mode and made its keys strict in CI (see the Q3 row for the numbers). Canonical Float64 state and the history simulation run in `'fdlibm'`.

### 3.6 How each upstream's data converts into the model

**orogen ↔ canonical** (`packages/gen-orogen/adapter`)

| orogen | canonical | Conversion |
|---|---|---|
| `r_xyz` (physics frame: +y north, lon 0 at +z) | `points` | Fixed axis permutation: X = z_o, Y = x_o, Z = y_o. This is cyclic, so it preserves handedness. Verified in spike 1a: orogen's `lat = asin(y)` matches canonical `asin(Z)` for every cell with zero error (F1). orogen holds these as Float32 (§3.1). |
| `mesh.triangles/halfedges/adjOffset/adjList` | `SphereMesh` | Unchanged (permutation does not affect topology). |
| `r_elevation` (dimensionless) | `elevation` (m), plus adapter-private `orogen.elevRaw` | `elevToHeightKm × 1000` (F2) for the canonical layer. orogen's raw value is also kept as `orogen.elevRaw` (Float32), written by the orogen elevation and erosion stages and not read outside `packages/gen-orogen`. orogen's climate stages read `orogen.elevRaw`, never metres run back through the inverse S-curve: that round trip changes 13 Köppen cells, precipitation by up to 0.15 (normalised) and temperature by up to 0.03 °C at 200k (spike 1a), which breaks parity. When a non-orogen stage changes `elevation` (slow erosion, import, partial-world hold), the adapter regenerates `orogen.elevRaw` from metres through the inverse S-curve, and that world is outside the parity claim. Land above raw 1.0 (0.05% of cells) is clipped by the 6 km cap and is lossy in metres. |
| precipitation (normalised 0–1, 95th-percentile scaled) | `precip.*` (mm/yr) | Monotone calibrated mapping fitted in Phase 8 against Earth data†. Until then, stored as `unit: "normalized"` and flagged. |
| temperature (°C) | `temp.*` | Unchanged. |
| climate stages at N | — | **Parity mode only.** From Phase 4b, orogen's climate runs at L0 and is downscaled to N (note 14 §3.6). |
| wind / currents (3D tangent vectors) | `wind.*`, `current.*` (east/north) | Project onto local east = (−sin λ, cos λ, 0) and north = (−sin φ cos λ, −sin φ sin λ, cos φ). |
| Köppen class index (1–30) | `koppen` enum | Table map; the canonical enum is a superset (adds `As`, separate from `Aw`). |
| `r_plate`, plate seeds, vectors, density | `plate` layer + `plates` table | Plate velocity becomes an Euler pole and rate (GPlates-style math, re-implemented). |
| `CLIMATE` / terrain config constants | `params` | Via the parameter-mapping layer (gap 11). Constants become parameters with documented 0 / 1.0 / 1.5 meaning (Phase 8). |
| hard-coded `6371` | `planet.radius_m` | Patched in the vendored copy as a single injected constant. Parity tests run at R = 6371 km. |

**Azgaar ↔ canonical** (`packages/human/facade`)

Azgaar generators run against a `PackedGraph` facade built from the sphere mesh. There is no `grid`/`pack` split: one mesh serves both, so `cells.g[i] = i` (F8).

| Azgaar field | Facade source |
|---|---|
| `cells.i`, `cells.c` | Cell index and CSR adjacency. |
| `cells.v`, `vertices.p`, `vertices.c` | Voronoi vertices of the sphere mesh. |
| `cells.p` (planar xy) | Local tangent-plane (gnomonic) coordinates about a per-call or per-region origin, in metres, for code that needs angles or local shapes. Distance and bearing helpers are replaced with geodesic versions where Azgaar computes them. Spike 1b counts the call sites. |
| `cells.h` (0–100, sea level 20) | Monotone map from metres. Defined once and documented, then inverted on write-back. |
| `cells.area` | `cellArea_sr × R²`, in Azgaar's expected unit. |
| `cells.b` (map-edge border) | All false on a whole planet; true on regional patch edges. Azgaar identifies the world ocean as the water feature that touches the border, so the facade replaces that rule with an explicit **world-ocean rule**: the connected water body of largest area is the ocean (on a patch, any water body touching the patch edge also is). Spike 1b's workaround, flagging one deep-ocean cell as border, is not kept. |
| temperature, precipitation (Int8 °C, Uint8 scaled) | From canonical `temp.mean` and `precip.annual` by a documented scale. |
| quadtree `findCell(x, y)` | Sphere spatial index. |
| `Math.random` | Injected stream `ctx.rng('human.<generator>')` (F7). |

Outputs map back as ids, cell ids and unit vectors. Burg positions become `(cell, offset)`; river paths become cell sequences; states, provinces and cultures become per-cell id layers plus entity rows.

Spike 1b ran `features-generator`, `lakes` and `river-generator` unmodified over a 75-line version of this facade at 20k–1M cells. The call-site changes needed for correctness at scale (Uint16 flux first) are in the Phase 10 extraction checklist (§7).

**VPLanet → canonical** (`packages/planet`)

- Inputs: stellar mass, luminosity and age; semi-major axis, eccentricity, obliquity and longitude of perihelion; rotation period; planet mass and radius; CO₂ / greenhouse factor; ocean fraction.
- Outputs:
  - `planet.forcing.insolation[lat][dayOfYear]` (W/m²);
  - `planet.forcing.annualTempProfile[lat]` and the ice line from the EBM;
  - `planet.surfaceGravity`, `planet.coriolis(lat)`, and the year and day lengths that drive the calendar.
- These feed orogen's climate through the **parameter-mapping layer** (gap 11), which turns forcing tables into orogen's tuned constants (thermal-equator profile, ITCZ swing amplitude, polar temperatures) instead of Earth-hard-coded values.

**Badlands-style erosion → canonical** (`packages/erosion`)

- Runs natively on the canonical mesh.
- Reads `elevation`, `precip.annual` (as runoff), `lithology` (erodibility) and `uplift`.
- Writes `receiver`, `stackOrder`, `drainageArea` (m², from spherical cell areas), `erosionRate`, `sediment`, and optional `strata` (per-cell layer stacks, deferred).
- The flow-routing products are **shared with hydrology**: rivers and the slow erosion pass see the same drainage network.

**GPlates math → canonical**

- `plates` rows carry an Euler pole and rate.
- Finite rotations are unit quaternions, composed with standard quaternion algebra.
- These rotations give plate-motion vectors at boundaries for the static snapshot.
- They are also the kinematic core of **forward plate evolution**, which is a core feature (Q9, design note 13). `plates` rows use `validFrom/validTo` in Myr of geologic time, and finite rotations compose per time step.

### 3.7 Projection, distortion and rendering paths

Projection is a *view*. It sits entirely outside `World` and the pipeline.

```
World (sphere) ──► ProjectionView ──► raster path (inverse)   ──► screen / PNG
                                  └─► vector path (forward)   ──► SVG / overlays
                                  └─► distortion (Jacobian)   ──► overlay layers / Tissot
```

**`ProjectionView`** wraps a d3 projection: `geoEquirectangular` (default), `geoMercator`, `geoEqualEarth`, `geoMollweide`, `geoRobinson`, `geoOrthographic`, azimuthal equal-area and equidistant, `geoNaturalEarth1`, and so on. It also holds rotation (centre lon/lat), clip settings and output size.

**Raster path: inverse projection only.**

For each output pixel (px, py):

1. Call `projection.invert([px, py])` to get (λ, φ). If the result is null or non-finite, the pixel is outside the domain.
2. **Domain check**: `projection([λ, φ])` must round-trip to within 0.5 px. d3 `invert` can return in-range values for points outside some projections' outlines, so this check is required.
3. Convert (λ, φ) to a unit vector, look up the containing Delaunay triangle and cell with the spatial index, and sample the layer by its `sample` rule.

There are two implementations:

| Path | Used for | How |
|---|---|---|
| **Exact (CPU, workers)** | All exports (PNG, 16-bit heightmap, GeoTIFF later) and the test oracle | The steps above, using d3 `invert` directly, tiled across the worker pool. |
| **Interactive (GPU)** | On-screen flat views | Fragment shaders implement inverse formulas for the supported projections. They sample a **cell-id cube map** and a triangle-id cube map, both built from the sphere at resolution at or above cell density, plus per-cell value textures. Barycentric weights are computed in-shader. Every shader projection is validated against d3 `invert` by pixel-difference tests. A projection with no shader implementation falls back to the CPU path at reduced resolution. |

The cube maps are a lookup acceleration built from the sphere, not a resampled copy of the data: values still come from the per-cell arrays. Poles and the antimeridian need no special handling, because each pixel independently asks the sphere for its value. There is no triangle splitting and no seam patching, which removes the class of artifacts noted in orogen's `V1_REVIEW.md`.

**Vector path: forward projection through d3.**

- Rivers, borders, routes, coastlines, graticules and labels are stored as spherical polylines and polygons (cell-vertex unit vectors with great-circle edges). They are rendered as GeoJSON in lon/lat through `d3.geoPath(projection)`.
- That gives adaptive great-circle resampling, antimeridian cutting and clip-circle or clip-extent handling from d3.
- SVG export uses this path.
- Vector geometry is derived from the sphere at export time. It is never stored projected.

**Distortion: computed from the projection, never applied to data.**

- For a point (λ, φ), compute the forward Jacobian J of (x, y) with respect to (λ, φ), using central differences on the d3 forward projection, or analytically for projections that have closed forms. Normalise it by the sphere metric:

  ```
  J' = J · diag(1/(R cos φ), 1/R)
  ```

- Let a ≥ b be the singular values of J'. Then:
  - **areal scale** = a·b;
  - **maximum angular deformation** ω = 2·asin((a − b)/(a + b));
  - **meridian scale** h = |∂(x,y)/∂φ| / R;
  - **parallel scale** k = |∂(x,y)/∂λ| / (R cos φ).
- These are offered as overlay layers (areal-scale heatmap, ω heatmap, h/k), computed per pixel on the same inverse path.

**Evaluation at and near the poles.** The normalisation `1/(R cos φ)` is singular at φ = ±90°. Evaluating it directly gives Inf/NaN, and its error grows near the poles. The rules are:

1. **General points: use a pole-free tangent frame.**
   - Let p be the point's unit vector, with an orthonormal tangent basis (e₁, e₂) at p. Away from the poles this is local east and north; at a pole it is any fixed pair, for example e₁ = +X and e₂ = +Y at the north pole.
   - Differentiate F(s, t) = projection(normalize(p + s·e₁ + t·e₂)) at (0, 0). For projections with closed forms, do this analytically; otherwise, use central differences with step δ in radians.
   - The Jacobian with respect to arc length is then J' = J_st / R. The singular values a ≥ b, areal scale a·b and ω are invariant under rotation of the tangent basis, so they need no cos φ term.
   - h and k are defined only where east and north exist. Away from the poles: h = |J'·ê_north| and k = |J'·ê_east|.
2. **At the pole itself, φ = ±90° exactly.** Each projection declares one of three pole classes:
   - **Point pole** (azimuthals in polar aspect, orthographic, stereographic, Lambert conformal conic at its pole, and others): the projection is differentiable at the pole, so rule 1 applies directly. h and k are reported as their **analytic limit** as φ → ±90° along any meridian.
   - **Non-differentiable pole**: the projection is not differentiable at the pole. There are two cases:
     - a *line pole*, where the pole maps to a segment (equirectangular, Equal Earth, Robinson, Natural Earth, Eckert IV, and others);
     - a *cusp pole*, where the pole maps to a point but meridians arrive at different angles (Mollweide, sinusoidal, and others).

     Values are the **analytic limit** as φ → ±90° along the meridian λ that `invert` returns for the pixel (λ = 0 if `invert` returns none), taken from the projection's closed-form h and k:
     - finite limits are reported as numbers (for example h → 1 for equirectangular, and a·b → 1 for any equal-area projection);
     - divergent limits are reported as `+Infinity`, with a per-pixel `singular` flag;
     - ω → 180° wherever k → ∞ while h stays finite.
     - NaN is never produced.
   - **Excluded** (Mercator, with |φ| clipped at about 85.05°; and the gnomonic outside its hemisphere): the domain check in step 2 of the raster path rejects the pixel, and the distortion is "outside domain".
3. **Projections with no closed form** (some of the d3-geo-projection set): the limit is a **one-sided Richardson extrapolation** from φ = ±(90° − δ), ±(90° − δ/2) and ±(90° − δ/4), with δ = 1e-3 rad. The result is classed as divergent if the sequence grows by more than 2× per halving.
4. **Overlays** draw `singular` pixels with a dedicated colour, not by clamping the ramp.
- **Tissot indicatrix overlay**: at graticule nodes, generate a true geodesic small circle of fixed angular radius on the sphere and forward-project it through the vector path. This is exact rather than linearised, so it stays correct where distortion is extreme.
- **Analytic tests**:
  - Mercator: h = k = sec φ, ω = 0;
  - equal-area projections: a·b = 1;
  - equirectangular: h = 1, k = sec φ.
- **Pole tests (φ = +90° and φ = −90° exactly, plus φ = ±(90° − 1e-9°) to check continuity):**
  - azimuthal equal-area, polar aspect: h = k = 1, ω = 0, a·b = 1;
  - azimuthal equidistant, polar aspect: h = k = 1, ω = 0;
  - orthographic and stereographic, polar aspect: h = k = 1, ω = 0;
  - equirectangular: h = 1, k = +∞ with `singular` set, ω = 180°, and no NaN;
  - Equal Earth and Mollweide: a·b = 1 (finite limit), `singular` set for k;
  - Mercator: "outside domain";
  - rotated aspects: the azimuthal equal-area centred on (0°, 0°), evaluated at the geographic poles, must give a·b = 1 with no special-casing. This checks that rule 1 needs no cos φ.

**Globe view**: Three.js (WebGL2). The sphere mesh is rendered directly with per-vertex colours and optional terrain displacement, adapting orogen's `scene.js` and the globe parts of `planet-mesh.js`. The globe is a direct rendering of the sphere, so it is not a projected view in the sense above.

**Switching projection** swaps the `ProjectionView` and rebuilds GPU lookups only. It never touches `World` and never re-runs a stage.

**SharedArrayBuffer note**: zero-copy sharing between workers needs cross-origin isolation (COOP/COEP headers). GitHub Pages cannot set custom headers. The default is transferable `ArrayBuffer`s (ownership moves, no copy). The `coi-serviceworker` shim is an optional upgrade for SharedArrayBuffer. **Checkpoint 3 (tested):** with the shim (`?coi`), the page reloads once and becomes cross-origin isolated, and a worker can use a `SharedArrayBuffer` with `Atomics`, in Chromium, Firefox and WebKit, on Linux, macOS and Windows runners and on the live GitHub Pages site under `/MapMaker/`. Without the shim, `crossOriginIsolated` is false and transferable `ArrayBuffer`s move as expected.

---

## 4. Pipeline order

Each stage is a pure function:

```
stage(inputs: frozen layers, params, rng streams) → outputs: layers + entities + stage manifest
```

The stage manifest records the stage code version and a hash of its inputs. The runner uses it to skip unchanged stages, to invalidate downstream stages when an input changes, and to resume a saved world mid-pipeline. Stages never read UI state.

From Phase 4b (D5, design note 14) the pipeline has two passes:

- The **reference pass (R)** runs on the reference mesh L0 and makes every structural decision. It is identical for every fidelity setting: the same code, models and parameters.
- The **detail pass (D)** runs on the global mesh L1 at fidelity N. It prolongs the structure, adds band-limited detail, runs detail erosion, **anchors** every continuous field to the reference pass (R(field_N) = field_ref), downscales climate, and routes water within the major divides.
- The slider chooses only N and the detail-erosion model. Regional patches run the detail pass again with L1 as parent (note 6).

"R + D" means a stage has a reference part and a detail part. Before Phase 4b, and in parity mode, every stage runs as stock orogen does at N.

| # | Stage | Pass | Source | Writes |
|---|---|---|---|---|
| 0 | **Planet setup**: physical parameters → forcing tables, calendar, radius, gravity, Coriolis. In partial-world mode, also the constraints from inference (step 0p). | — | VPLanet subset (new TS) | `planet.*` |
| 1 | **Meshes**: the reference mesh L0 (fixed 20k) and the global mesh L1 at fidelity N, plus spatial indexes | R + D | orogen `sphere-mesh.js` | `meshes.reference`, `meshes.global` |
| 2e | **Plate evolution** (optional variant; design note 13; Phase 6b): forward evolution over deep time from a snapshot or a supercontinent. The fast pass (L0, Δt 5 Myr) computes the dynamics and the event schedule. The slow pass (finer mesh, Δt 1 Myr, final tier only) replays it kinematically. The present-day state replaces orogen's coarse plates in stage 2. | R (fast) + D (slow) | new; orogen `plate-physics.js` formulas; rotation math | `plates`, `plate`, `crustType`, `crustAge_Myr`, `crustThickness_km`, `lithology`, `orogenyAge_Myr`, `geoEvents`, geologic keyframes |
| 2 | **Tectonics**: coarse reference plates (or the stage 2e state), plate physics (skipped after 2e), super-plates, collisions and stress, Euler poles, all at L0. The partition is prolonged to L1 with orogen's continuous FBM boundary wobble. | R | orogen `coarse-plates.js`, `plates.js`, `plate-physics.js`, `super-plates.js`, `ocean-land.js`, `elevation.js` (collisions, stress) + rotation math | `plate`, `crustType`, `boundaryType`, `stress`, `plates` |
| 3 | **Crust and elevation**: at L0, the structural stages (tectonic state, spatial fields, classification, skeleton, keyed kernel and edifice placement, low-frequency bands, final shaping, topology fixup); at L1, P(structure) plus band-limited detail, then anchoring. Reads per-cell `crustType` and, with 2e, `orogenyAge_Myr`. Tags crust age and lithology when 2e is off. | R + D | orogen `elevation.js` (ported, note 14 §3.10) + new | `elevation`, `structures`, `crustAge_Myr` and `lithology` (2e off) |
| 4 | **Erosion**. *Reference erosion* at L0 is one fixed model for every slider setting: orogen `terrain-post.js` until Phase 7, then the Badlands-style pass with effective erodibility. *Detail erosion* at L1, anchored: fast = orogen `terrain-post.js` (warp, smoothing, hydraulic, thermal, ridge sharpening, soil creep); slow = Badlands-style stream power + diffusion, then orogen's glacial and thermal finishing. The fidelity slider chooses the detail model only. | R + D | orogen / new (Badlands algorithm) | `elevation`, `sediment`, `erosionRate`, `receiver`, `stackOrder`, `drainageArea` |
| 5 | **Climate**, at 12 phases of the year fitted to annual harmonics (note 11): solved at L0 (wind → ocean currents → temperature → precipitation, forced by step 0), then downscaled to L1 (lapse-rate temperature, linear orographic precipitation, prolonged wind and currents, anchored). orogen's full climate at N is the parity mode only. | R + D | orogen `wind.js`, `ocean.js`, `temperature.js`, `precipitation.js`, `heuristic-precip.js`; downscaling new (note 14 §3.6) | `wind.*`, `current.*`, `temp.*`, `precip.*`, `pressure.*` |
| 6 | **Erosion ↔ climate coupling**: re-run reference erosion with precipitation-weighted runoff, then re-run reference climate if elevation changed beyond a threshold. At most 2 iterations. Runs at L0 only, so it is identical for preview and final. | R | glue | as 4 and 5 |
| 7 | **Hydrology**: major basins and divide bands at L0. At L1, flow routing constrained to them (reusing step 4's network), lakes with water balance (note 12), river extraction, watersheds | R + D | new flow core + Azgaar `river-generator`, `lakes`, `features-generator` | `discharge`, `lake`, `basin`, `basin.major`, `riverId`, `rivers`, `lakes` |
| 8 | **Classification**: Köppen at L0 (for the A/B gate) and per L1 cell from downscaled fields; biomes (Azgaar matrix informed by Köppen); ice | R + D | orogen `koppen.js`, Azgaar `biomes-generator` | `koppen`, `biome`, `iceCover` |
| 9 | **Soils and minerals** (new). Mineral deposits are keyed to L0 cells, so the deposit list does not depend on N (note 5). | D | design notes 4 and 5 | `soilType`, `soilFertility`, `soilDepth`, `mineral.*` |
| 10 | **Resources and goods** | D | Azgaar `goods-generator`, extended to use soils and minerals | `goods`, per-cell resource layers |
| 11 | **Static human layer = history t0**, in Azgaar's order: rank cells → cultures and names → expand cultures → burgs → states → routes → religions → specify burgs → state forms → provinces → markets → production | D | Azgaar generators via the facade | human layers and entities |
| 12 | **History simulation** (Phase 13): time-stepped from t0 for demography, settlement growth and decline, trade, economics, politics and borders, war, and language evolution. Writes the event log and keyframes. | — | new | `timeline.*`, time-varying layers, `EventLog` |
| — | **Views and exports** (outside the pipeline) | — | §3.7 | nothing in `World` |

**Partial-world mode** adds step 0p before step 1 (design note 3):

1. Import the regional map and its georeference.
2. Place it on the sphere: user-specified lat/lon, extent and rotation. Latitude is inferred only when the import carries climate-bearing layers (biomes, Köppen, ice); elevation alone does not determine it.
3. **Extract and interpret features** from the imported elevation: ranges, trenches, rifts, arcs, and active or passive margins. The output is candidate plate boundaries with types and confidences.
4. **Pin** the inferred configuration:
   - for step 2: plate partition, land/sea per plate, and Euler-pole *constraints*. Spike 1d showed the plate and land/sea pins work with a ~110-line patch to orogen's plate code (exact pin survival; bit-identical when unpinned). Pins change the plate stage's draw order, so the unpinned remainder differs from the same seed without pins.
   - for stage 3, at L0: e_ref = R(import) on covered reference cells, the land mask, and structures (ranges, arcs, rifts) continuing across the region edge.
5. **Search** for the most likely global context. Each candidate runs the tectonic and structural part of the reference pass (about 0.5 s) and is scored on boundary-type agreement, range continuation, land fraction and a plate-statistics prior. The best is kept, along with the top three alternatives.
6. **Hold the imported elevation fixed**, the option design note 3 chose over constraining orogen's elevation stage. The region is exact. Outside it, the boundary mismatch is spread by Laplace interpolation over a margin band, so the join has no cliff. The hold is **required**: plate and land/sea pins survive exactly, but elevation, coastline detail and mountains inside a pinned region are *not* held by them (final land agreement 86–91%, mountain IoU ≤ 0.22 in spike 1d).
7. Run climate on the whole sphere at L0 and downscale it to the region, which is a regional patch (§3.1, note 6).

**Fidelity slider** (D5; design note 14). Spike 1c showed that running the same stages at lower N is **not** a faithful preview. Continent layout and land fraction carry over; mountain belts, coastline detail, Köppen and drainage basins do not, and they do not converge as N grows. The slider therefore separates *structure* from *detail*:

- **Structural decisions are made on the fixed reference mesh** (§3.1), as orogen already does for plates: mountain kernels and orogenic belts, hotspots, the macro land mask, and the major drainage divides. Their randomness uses reference-keyed counter draws (§3.5), so it depends on neither N nor draw order.
- **Higher N adds only band-limited detail** on top, whose restriction to the reference mesh is zero. This is the same R/P machinery as regional patches (§3.1).
- Preview and final use the same seed and the same stream derivation. The preview runs the detail pass at lower N with fast detail erosion; the final run uses higher N and slow detail erosion. The reference pass, including its erosion and climate, is identical for both.
- Faithfulness is measured, not assumed. The Q7 metrics become a CI gate in Phase 4b, and the A/B is re-run in Phase 7 with the slow pass as "final". Under anchoring, the four Q7 metrics measured after restriction (hypsometry, mountain IoU, and the elevation and precipitation fields) hold by construction and act as anchoring checks. The three full-resolution metrics added at Checkpoint 2 keep the gate informative.
- **Fallback (D8):** if Phase 4b cannot reach the Q7 targets within its effort budget, the preview shows reference-level structure only (the reference pass prolonged to preview N, with no detail bands or detail erosion), and detail appears with the final run.
- Stock orogen behaviour stays available as a parity mode, so the Phase 4a parity test keeps running after the restructure.

---

## 5. Save file format

Container: **`.mapmaker`, a ZIP** written with fflate in streaming mode. JSON holds metadata and small tables; raw little-endian binary chunks hold typed arrays.

```
world.mapmaker
├── manifest.json        format version, app version + git commit, created/modified,
│                        stage code versions, chunk table [{path, dtype, shape, unit, sha256}],
│                        determinism profile (dmath mode, engine fingerprint)
├── params.json          all generation parameters + fidelity + master seed (128-bit, hex)
├── planet.json          physical parameters; forcing tables → planet/*.bin
├── rng.json             every named stream: {name, algo, state[], draws}
├── mesh/                points.f64, triangles.i32, halfedges.i32 (+ reference/, and patches/ with parentOf and PatchSpec)
├── layers/<id>.bin      one chunk per layer per mesh
├── entities/<table>/    columnar chunks + schema.json per table
├── pipeline.json        completed stages, input hashes, current stage,
│                        mid-stage checkpoint (e.g. slow-erosion iteration k + its state chunks)
├── timeline/
│   ├── timeline.json    calendar, tick, dtYears schedule, geo axis {tStartMyr, dtMyr}
│   ├── geo/             geologic keyframes and geoEvents chunks (plate evolution)
│   ├── agents/          per agent type, columnar chunks
│   ├── keyframes/<tick>/<layer>.bin
│   ├── changes/<range>.bin   run-length-packed cell changes between keyframes
│   └── events/<range>.ndjson.gz   event-log chunks
└── ui.json              camera, projection, styles, selected layers (non-authoritative)
```

Rules:

- **Exact resume.** Loading restores `params`, `rng`, `pipeline` and `timeline` exactly. Continuing a run (the next erosion iteration or the next history tick) gives the same result as if the session had never stopped. This is tested by a CI test that runs N steps, saves at step k, reloads, finishes, and compares hashes.
- **Scope of exactness.** It is guaranteed for the same app version in `dmath.mode = 'fdlibm'` on any engine and CPU (CI-verified on Chromium, Firefox, WebKit and Node on Linux x64, macOS arm64 and Windows x64); in `'native'` mode only on the same engine build and CPU architecture (Float64 libm results differ across engines and between arm64 and x64; see Q3). The manifest records the mode. Cross-engine bit-exactness is a **CI-tested goal** (Q3): CI hashes outputs on Chromium, Firefox and WebKit, and on a Windows runner from Phase 3. **GPU-computed values are never part of resumable state** (§6).
- **Mid-stage checkpoints.** Iterative stages (slow erosion, the coupling loop, history) implement `checkpoint(): Chunk[]` and `restore(chunks)`. Single-shot stages are re-run from their recorded inputs if interrupted.
- **Versioning.** `manifest.format` uses semver and migrations live in `packages/core/save/migrations/`. If stage code versions differ from the running app, the world opens **view-only for simulation**: it can be viewed and exported, but resuming requires an explicit "re-run from stage X".
- **World code.** A short, recipe-only string (params + seed + app version), like orogen's planet code, for sharing a world that regenerates deterministically. It is not a save.
- **Storage.** Saves use the File System Access API where available and a Blob download elsewhere. Autosave goes to IndexedDB at stage boundaries and every K history ticks.
- **Size**†. At 2.56M cells, mesh plus about 40 Float32 layers is roughly 0.5 GB uncompressed. Layers are compressed per chunk. Preview-tier worlds are small. Phase 12 measures real sizes and may add optional Float16 quantisation for display-only layers.
- Azgaar's `.map` (`src/services/io/save.ts`) is the template for the breadth of what to save, but not for the encoding: it is CRLF-separated, JSON-in-text, and has no RNG state.

---

## 6. Heavy simulation in the browser

### 6.1 Threads

- **The main thread** runs the UI, input and rendering. It never runs a stage.
- **The engine worker** (a module worker) owns `World` during generation and runs the stage runner. orogen already runs generation in a worker, so this is its pattern, generalised.
- **The worker pool** (`navigator.hardwareConcurrency − 1` workers) handles data-parallel kernels: climate passes over cell ranges, inverse-projection export tiles, history ticks partitioned by region. Data moves as transferable `ArrayBuffer`s by default, or as SharedArrayBuffer under cross-origin isolation (§3.7).
- **Protocol**: typed messages `run(stage, inputs)`, `progress`, `checkpoint`, `cancel`, `result`. Cancellation is cooperative: long loops poll an abort flag at chunk boundaries.

### 6.2 Memory budget

The memory budget is set per fidelity tier. Layers are allocated only when a downstream stage or the user needs them. The tiers below are **benchmark targets, not hard caps** (Q6).

| Tier | Cells | Approx. cell size | Rough working set |
|---|---|---|---|
| Preview | 50k–200k | 90–45 km | < 100 MB |
| Standard | 500k–1M | 28–20 km | 150–300 MB |
| Max (browser) | 2.56M | ~12.5 km | ~400–600 MB† |
| Regional patch | per patch, up to ~1M | down to ~1 km | budgeted separately |

Safari's per-tab limits are the tightest constraint†. Phase 4a measures real numbers per browser.

### 6.3 CPU, WASM and GPU roles

- **Authoritative results come from CPU code** (JS, with optional WASM SIMD kernels), because CPU arithmetic can be made deterministic (§3.5).
- **WebGL2** (Three.js) is the baseline renderer for the globe and the interactive inverse-projection views.
- **WebGPU** is used where available for rendering acceleration and for **non-authoritative previews only** (for example a live erosion preview while the user drags a slider). GPU floating-point results vary across hardware and drivers, so a GPU result is never saved as resumable state. If a GPU kernel ever becomes authoritative, it must use integer or fixed-point arithmetic and pass a cross-GPU bit-equality test.

### 6.4 Long runs

The slow erosion pass and the history simulation run in the engine worker with periodic checkpoints and IndexedDB autosave. They support pause and resume, and they report progress and ETA. The UI can view a running world: the engine posts read-only snapshots at a throttled rate.

### 6.5 Desktop fallback

The desktop fallback is built **only if** phase-gate benchmarks (Phases 4a, 7 and 13) show the browser cannot complete the max tier within budget. That means running out of memory, or a slow pass or history run taking over about 30 minutes†.

**Recommendation: Electron**, wrapping the same bundle, rather than Tauri:

- Electron ships the same Chromium/V8 on Windows and macOS, so the determinism profile matches Chrome.
- Heap limits can be raised.
- Node `worker_threads` are available.
- Azgaar already ships an Electron build, which is a working reference.

Tauri is lighter, but it uses WKWebView on macOS, so the Mac desktop build would inherit Safari's memory limits and JavaScriptCore math. That is decision Q4.

---

## 7. Phased build plan

Every phase ends at a **checkpoint**. At that point I stop, post a summary (what was built, test results, measurements, deviations from this document, proposed changes), and **wait for your review** before starting the next phase. Each checkpoint also updates `PROVENANCE.md` (from Phase 3 on) and this document where reality differs.

### Phase 1: Spikes only (throwaway code in `spikes/`, not shipped)

**1a. Build and run orogen and Azgaar locally; confirm the ratings that decide the plan.**

- Run orogen with a static server and Azgaar with Node 24 (`npm ci && npm run build`, then dev server and its Playwright tests).
- Confirm or downgrade each of these, with evidence (screenshots, numbers, hashes):
  - orogen tectonics/heightmap (4), erosion (4), climate (4), Köppen (5);
  - the **tuning harness (5)**: download the Kottek Köppen data (F6), run `tuning/climate/evaluate.mjs`, and record the baseline objective;
  - **scale invariance** (orogen's own claim);
  - **determinism**: same planet code gives identical array hashes across runs and across Chrome, Firefox and Safari. Record any cross-engine divergence; this input decides Q3;
  - **axis convention and the seam cell** (F1);
  - **elevation units** (F2).
- Azgaar: rivers (3), names and burgs (3), save (4) via a `.map` round-trip that compares state, and an inventory of `Math.random` use (F7).
- Record the **GPlates license check** (F10): headers across `src/`, plus `COPYING`.
- *Optional*: build native VPLanet and run `examples/EarthClimate`, to confirm it is usable as a golden-data oracle.

**1b. Run an Azgaar generator on orogen's spherical mesh.**

- Build a minimal `PackedGraph` facade (§3.6) over an orogen-generated mesh. Feed orogen elevation and precipitation (converted). Run Azgaar `features-generator` → `lakes` → `river-generator`.
- Pass criteria:
  - every river terminates in ocean or a lake;
  - no river or lake artifacts at the poles, the antimeridian or the orogen seam cell;
  - discharge increases downstream.
- Record: adapter LOC, number of Azgaar call sites changed (especially uses of `cells.p` and geodesic replacements), and run time at 200k cells.
- Stretch: `burgs-generator`.

**1c. A/B: orogen low-res vs high-res for the fidelity slider.**

- Same seed at N = 20k, 50k, 200k, 1M and 2.56M. Resample every run onto a common reference (the 20k mesh by area-weighted restriction, and a 1° grid by inverse sampling).
- Metrics:
  - land-mask IoU;
  - coastline Hausdorff distance (km) and its 95th percentile;
  - hypsometric-curve KS distance;
  - elevation RMSE after low-pass to the 20k Nyquist scale;
  - mountain-belt overlap;
  - Köppen class agreement (% of area);
  - annual precipitation correlation;
  - major-basin agreement;
  - **RNG-draw divergence** (does any stage consume the post-mesh `rng`? F4).
- The thresholds in Q7 are provisional. The spike reports **measured values first**, without pass or fail, and recommends thresholds. Final thresholds are set at Checkpoint 1.
- If the measurements show the preview is not faithful, the report proposes a fix: either stream separation (§3.5) or restructuring the preview as "coarse stages exact, detail skipped".
- The A/B is re-run in Phase 7 once the slow pass exists.

**1d. Can orogen's coarse-plate stage accept pinned constraints?**

Partial-world mode (§4, step 0p) needs to pin part of the tectonic and continental configuration and generate the rest around it. This spike decides whether orogen's coarse-plate stage can be driven that way.

- Targets:
  - `generateCoarsePlates` (`js/coarse-plates.js`), which in turn calls `generatePlates` (`js/plates.js`) and `assignOceanLand` (`js/ocean-land.js`);
  - `projectCoarsePlates`, which adds FBM boundary perturbation;
  - `buildSuperPlates` (`js/super-plates.js`).
- Constraint types to test:
  1. **Fixed continent shape**: a set of coarse cells forced to land, optionally with a given plate id.
  2. **Region held fixed**: plate ids and land/sea locked inside a region while the rest of the planet is regenerated.
- Method:
  - Read the code to find every place that would override or ignore a pinned cell: plate seed placement, plate growth, smoothing and reconnection, land/sea selection, trapped-sea absorption, and the FBM perturbation in projection.
  - In a spike-local copy (never `upstream/`), make the smallest patch that honours pins.
  - Measure how well the pins survive, as the fraction of pinned cells whose land/sea and plate are unchanged at N = 20k and N = 200k.
  - Check that the unpinned remainder still looks like an orogen world.
- Deliverable: the exact list of functions, and the line ranges at `cc2662b`, that would have to change, with what each change is. Then a plain verdict, one of three:
  - **constrainable**;
  - **constrainable with these limits**;
  - **cannot be constrained**, with the reason.

**Checkpoint 1**: `docs/spikes/PHASE1_REPORT.md`, containing:
- results of spikes 1a–1d;
- the confirmed or revised ratings;
- the measured A/B values and the proposed final thresholds (Q7);
- the measured cross-engine divergence and a recommendation for Q3;
- the 1d verdict;
- a proposed diff to `audit/CAPABILITY_MATRIX.md`;
- any changes this architecture needs.

**Stop and wait.**

### Phase 2: Design notes for original-code gaps (documents only, no code)

Each note goes in `docs/design/` and uses one template:
- problem;
- canonical inputs and outputs (layers, entities, events);
- approach and algorithm choice;
- upstream references (algorithm-level only; Eurace and WRF-Hydro excluded);
- validation method;
- open questions;
- size estimate.

Notes are 1–3 pages each.

1. History, war, economics and politics simulation (agent types, tick structure, event causality, the counter-based RNG; ideas from UrbanSim discrete choice, SLiM individual-based models, Azgaar t0).
2. Language evolution (proto-language generation, sound-change rules, lexical replacement, family trees, names derived from language state at tick t; extends Azgaar `names-generator`).
3. Partial-world inference (from region to plate and continent constraints; formulation as constrained sampling over orogen's coarse-plate stage).
4. Soils (from lithology, slope, climate, vegetation and time; LPJmL and CTSM as references).
5. Mineral and ore resources (deposit classes keyed to tectonic setting, lithology and erosion depth).
6. Regional-patch refinement (the restriction and prolongation operators, band-limited detail, the patch–global consistency test).
7. STL export (sphere or patch → watertight mesh, vertical exaggeration, base plate, size limits).
8. Parameter-scale documentation (the 1.0 = Earth convention, sweep methodology at 0 / 1.0 / 1.5, the `docs/PARAMETERS.md` format).
9. Dynamic population, settlement, trade and borders over time (the bridge from Azgaar's static t0 to the history engine).

Also, because they are gaps in the matrix:

10. Physical → simulation parameter mapping (VPLanet forcing to orogen constants; the radius plumbing, F3).
11. Continuous seasons (N seasons from forcing tables, versus orogen's two).
12. Lake and basin hydrology (water balance, endorheic basins, salt lakes).

Added by decision Q9:

13. **Forward plate evolution over deep time.** The note uses the standard template and must cover:
    - **Scope.** Forward evolution of plates over hundreds of millions of years from an initial configuration. The initial configuration is either orogen's static snapshot or a supercontinent seed. The output is the present-day tectonic state plus its history.
    - **Algorithm.**
      - Kinematics: Euler poles and rates per plate, and finite rotations as composed unit quaternions (§3.6, GPlates math re-implemented).
      - Plate interactions: rifting and new ocean crust at divergent boundaries; subduction and slab consumption at convergent oceanic boundaries; collision and suturing of continents; plate break-up and merging.
      - Driving forces: a heuristic model, for example slab pull and ridge push weighted by boundary type. The note must say where it comes from, at the algorithm level only.
      - Remeshing: crust is advected on the sphere, and per-cell state is resampled onto the fixed mesh each step.
    - **Inputs and outputs.**
      - Inputs: seed, `planet.*`, and parameters (plate count, mean rate, duration in Myr, continental fraction).
      - Outputs: the `plates` table, with rows and `validFrom/validTo` in Myr; `plate`, `crustType`, `crustAge_Myr` (true age since formation at a ridge, replacing the heuristic tag in stage 3), `lithology` (from tectonic history: arc, ophiolite, craton, passive margin, foreland basin...), `boundaryType` and `stress`; and a geologic event log (rifts, collisions, orogenies) with times.
    - **Fast and slow passes from the same seed.**
      - Fast pass: the coarse mesh (about 20k cells, as orogen's coarse plates) with large Δt (about 5–10 Myr).
      - Slow pass: a finer mesh with small Δt (about 1 Myr).
      - Both draw from the same named RNG streams, keyed by (plate id, event index), not by step count. Both share one **event schedule**, rifts and collisions included, decided at coarse resolution, so the slow pass refines the fast one rather than diverging from it.
      - The fast pass is a true preview in the same sense as the fidelity slider. The note defines the A/B metrics for this, matching spike 1c.
    - **Feeding the existing model.** The final state feeds stage 2 in place of orogen's coarse plates, either replacing it or seeding it. The pass must stay compatible with partial-world pins (spike 1d).
    - **Canonical-model check.** Confirm that nothing in §3 blocks this. Entities already have validity intervals. Layers can be marked time-varying with keyframes. The timeline's era schedule can carry a geologic era in Myr ahead of the human-history eras. Stage 2 is a replaceable stage. One rule is affected: each layer has a single producer. When plate evolution is active, `crustAge_Myr` and `lithology` are produced by the plate-evolution stage and not by stage 3, and the stage graph has to express that choice.
    - **Phase order.** At Checkpoint 2, propose where this goes in the phase order, for example after Phase 4 and before Phase 7, since erosion consumes lithology.

Added at Checkpoint 1 (D5):

14. **Resolution-independent structure for faithful previews.** Which decisions are structural; the reference mesh; reference-keyed counter draws; band-limited detail whose restriction is zero; how each orogen stage is restructured; how the slow erosion pass and climate respect the structure; and how the Q7 gate runs in CI.

**Checkpoint 2**: all notes, plus the proposed phase slot for note 13. **Stop and wait.**

### Phase 3: Shell, canonical model, determinism infrastructure

- Monorepo scaffolding (§2 layout), TypeScript strict, Vite, Vitest, Playwright, lint rules (including the `Math.random` ban), and CI.
- **Cross-engine hash test in CI** (Q3): output hashes compared across Chromium, Firefox and WebKit, plus a **Windows/x64 runner**, since Windows is the one platform spike 1a could not test.
- `PROVENANCE.md` plus a script that checks every vendored file against `upstream-manifest.json` commits, and records the third-party npm dependencies with their licenses.
- `packages/core`: frame and units, `SphereMesh` (orogen's mesh builder, ported), `LayerRegistry`, entity tables (with declared time axes), `Timeline` (geologic and history axes) and `EventLog`, the RNG service (three algorithms, derivation, counter-based), `dmath` (pass-through; gained the `'fdlibm'` mode at Checkpoint 3b), and save/load v0.
- `packages/engine`: stage runner (manifests, hashing, invalidation, pipeline variants with the one-producer check), worker protocol, worker pool, cancellation, checkpoints.
- A **dummy history stage** that writes agents, events, keyframes and changes, to prove the history schema round-trips through save → load → resume with hash equality.
- GitHub Pages deployment, and a COOP/COEP shim test.

**Checkpoint 3.** Stop and wait.

### Phase 4a: orogen generation in the shell, plus the globe

- Vendor orogen (`cc2662b`). Write the adapters (F1–F4), including `orogen.elevRaw` (§3.6). Run stages 1–5 and 8 in the engine worker.
- **Parity test**: with R = 6371 km and the mesh built at Float32 (§3.1), the canonical outputs equal stock orogen's for the same seed. Bit-exact for elevation and plates; within a stated tolerance anywhere the adapter changes arithmetic. The `orogen-lcg` mode reproduces orogen's colliding stage seeds (§3.5).
- Globe view (Three.js). Layer picker. Per-browser memory and timing benchmarks for each tier.
- orogen's tuning harness runs headless against the shell.
- The spike 1c A/B harness moves into `tools/tuning/` and records a **baseline** of the Q7 metrics for stock orogen.

**Checkpoint 4a.** Stop and wait.

### Phase 4b: Preview restructure behind the A/B gate (D5)

- Implement design note 14. Restructured stages are ported TypeScript modules next to the verbatim `vendor/` copy, which stays unchanged. They make structural decisions on the reference mesh with reference-keyed counter draws, and add band-limited detail above the reference scale.
- Stock orogen stays available as a parity mode, so the Phase 4a parity test keeps running.
- **A/B gate.** CI runs the ten Q7 metrics (the seven from Checkpoint 1 plus the three full-resolution metrics from Checkpoint 2) on fixed seeds and tiers. It **hard-fails only on regression**: a metric worse than the committed baseline for the same seed and tier, by more than a per-metric noise tolerance stored with the baseline. An improvement updates the baseline in the same commit. The Q7 thresholds are **targets**; the Köppen ≥ 90% target applies to preview tiers of 200k cells and above.
- **Climate gate (D7).** On the Earth tuning harness at 40k and 160k, the reference-solve-plus-downscaling climate must score no more than **0.02** below orogen's full-resolution climate at the same N (the Phase 4a baselines were 0.678 at 40k and 0.668 at 160k). If it fails, switch the climate solve to the 80k-cell climate mesh (L0′) and re-run the gate. Changing the tolerance needs sign-off at a checkpoint.
- **Effort budget and fallback (D8).** The budget is the first complete implementation of note 14 plus at most **two tuning rounds**, each ending with a full A/B run on the CI seeds. If the preview still misses Q7 targets after that, the preview switches to **reference-level structure only**: the reference pass prolonged to preview N, with no detail bands and no detail erosion. Detail then appears only with the final run. The gate keeps running, comparing the restricted final with the reference pass.

**Checkpoint 4b**: measured Q7 metrics against the targets, the climate-gate result (and whether the 80k fallback was needed), whether the D8 fallback was taken, and a review of the targets themselves. Stop and wait.

### Phase 5: Projection and distortion layer

- `ProjectionView` with the d3 projection set, the exact CPU inverse sampler, GPU shaders for the common projections, the vector path via `geoPath`, distortion overlays, the Tissot overlay, and 16-bit PNG heightmap export through the exact path.
- Tests:
  - analytic distortion values (§3.7);
  - distortion pole tests at ±90° (§3.7);
  - pole and antimeridian pixel tests;
  - shader vs d3 `invert` pixel-difference tests;
  - a guard that switching projection does not change any `World` hash.

**Checkpoint 5.** Stop and wait.

### Phase 6: Planet physics

- VPLanet subset in TS (insolation, seasons, EBM core) with golden tests against native VPLanet output.
- Parameter-mapping layer (design note 10); `planet.radius_m` threaded through.
- Continuous seasons (design note 11).
- **Q7 baseline rule:** any change to the climate model (the parameter mapping, seasons, or downscaling) re-records the Q7 A/B baseline in the **same commit**.

**Checkpoint 6.** Stop and wait.

### Phase 6b: Forward plate evolution (design note 13; slot set at Checkpoint 2)

- Stage 2e: tracers, quaternion kinematics, ridge, subduction and collision interactions, force balance (porting orogen's `plate-physics.js` formulas), and the event schedule. The fast pass runs in the reference pass; the slow kinematic replay runs in the final-tier detail pass.
- Duration: default 300 Myr. The maximum must not be capped below 800 Myr; it starts at 1,000 Myr. Benchmarks cover 300 and 1,000 Myr.
- Present-day export to stage 2, with orogeny-age hooks in the structural stage. Geologic timeline and keyframes. The `plateEvolution` pipeline variant.
- Fast/slow A/B in CI (regression-only failure), and Earth-likeness statistics (seafloor age, plate sizes, speeds).
- Re-record the Q7 baseline with evolution on, in the same commit that enables it.

**Checkpoint 6b.** Stop and wait.

### Phase 7: Slow erosion pass and hydrology, including D4 validation

- Badlands-style stream power and diffusion on the sphere, as slow detail erosion at L1 and as the reference erosion at L0. The L0 model uses an effective erodibility calibrated so that R(an unanchored fine run) ≈ the L0 run (note 14 §3.8). Shared flow routing. Azgaar rivers, lakes and features via the facade. Lake water balance (design note 12).
- **D4 validation**:
  1. On a planar benchmark, compare against Python Badlands with the same initial DEM, uplift and parameters (longitudinal profiles, hypsometry, drainage-area statistics);
  2. compare against orogen's fast pass on the same world;
  3. compare against Earth statistics (hypsometry, Hack's law, concavity of river profiles). These run on the **anchored** result that users get, not on an unanchored test run. The unanchored fine run is used only to calibrate the L0 effective erodibility;
  4. re-run the fidelity A/B from 1c with the slow pass as "final", through the Phase 4b gate.

**Checkpoint 7.** Stop and wait.

### Phase 8: Calibration and parameter-scale documentation

- Extend the tuning harness: elevation hypsometry, Köppen (Kottek or Beck), and temperature and precipitation climatology. Fit the precipitation unit mapping (§3.6).
- Run sweeps on the five-point scale **0, 0.5, 1, 1.5, 2** (design note 8) for every exposed parameter, and generate `docs/PARAMETERS.md`.
- **Q7 baseline rule:** any change to the climate model (for example re-tuned constants or the precipitation unit mapping) re-records the Q7 A/B baseline in the **same commit**.
- Revisit the known gap for tidally locked planets (Known gaps, top of this document).

**Checkpoint 8.** Stop and wait.

### Phase 9: Soils, minerals, final biomes

Implement design notes 4 and 5, and the biome layer that combines Köppen and the Azgaar matrix.

**Checkpoint 9.** Stop and wait.

### Phase 10: Static human layer on the sphere, and SVG

Azgaar generators (step 11 in §4) via the facade, with injected RNG. Settlement, border, route and label rendering on the globe and flat views. SVG export via the vector path.

**Extraction checklist (spike 1b).** Each change is needed for correctness at scale, not to make the code run.

| Call site | Change |
|---|---|
| `river-generator.ts` `cells.fl` (Uint16) and `cells.conf` (Uint8/Uint16) | Uint32 or Float32. Uint16 flux wraps above 65,535 (seen at 1M; 62,318 already at 200k). |
| `features-generator.ts` `markupPack` ocean rule (`border`) | Explicit world-ocean rule (§3.6) |
| `features-generator.ts` `addFeature` `clipPoly`/`polygonArea` | Geodesic area from cell areas |
| `features-generator.ts` `defineHaven` `distanceSquared(cells.p…)` | Geodesic distance |
| `river-generator.ts` `addMeandering`, `getApproximateLength` | Tangent-plane meander, geodesic length |
| `Math.random = Alea(options.map.seed)` in `markupGrid`, `features-generator.ts:466`, and `Rivers.generate` | Injected streams (F7) |
| `utils/index.ts` barrel | Touches `document` at import time; import the needed utils directly |
| `drainWater` `features.filter` inside the per-cell loop | Index lakes by outlet cell (rivers are superlinear: 1.1 s at 200k, 25 s at 1M) |

**Checkpoint 10.** Stop and wait.

### Phase 11: Import, partial-world mode, regional patches

- Heightmap and layer import onto the sphere (orogen import sampling; a GeoTIFF decoder library if wanted).
- Partial-world inference (design note 3), including the plate-stage pins from spike 1d and the required elevation hold (§4, step 0p.5).
- Regional-patch refinement with the R/P consistency test (design note 6). Revisit D9: approximate agreement and a warning for non-nested overlaps, or a fixed tiling.

**Checkpoint 11.** Stop and wait.

### Phase 12: Exports and save hardening

STL (design note 7), GeoJSON, PNG tiles, and other formats as feasible. Save size measurements, migrations, autosave, and a large-world streaming test.

**Checkpoint 12.** Stop and wait.

### Phase 13: History simulation (built last; a checkpoint after each sub-phase)

| Sub-phase | Content |
|---|---|
| 13a | Engine core (tick loop, agent tables, event log, keyframes, scrubbing, mid-run save and resume) plus demography and settlement growth and decline |
| 13b | Trade networks and economics (dynamic prices and flows over Azgaar's route graph) |
| 13c | Politics, diplomacy, borders and war |
| 13d | Language evolution and time-dependent naming |

Each sub-phase ends at a checkpoint. Stop and wait after each.

### Phase 14: Performance and desktop fallback (conditional)

Profile, add WASM kernels where they are justified, and build the Electron wrapper **only if** earlier benchmarks require it.

**Checkpoint 14.** Stop and wait.

---

## 8. Decisions (all resolved, 2026-10-03)

This is the original decision table, kept for its rationale. **All eleven questions are resolved.** The binding outcomes are in [Resolved decisions](#resolved-decisions) at the top of this document. Where a resolution differs from the recommendation here (Q2, Q3, Q6, Q7, Q9), the resolution wins.

| # | Status | Decision | Original recommendation | Why |
|---|---|---|---|---|
| **Q1** | **Resolved** | Base: new TS shell, or fork orogen? | **New shell, vendoring orogen's stages verbatim** | §1. The parts of orogen we would keep are the parts that move cleanly. A fork's head start is recovered by the Phase 4 parity approach. |
| **Q2** | **Resolved** | Project license | ~~Declare GPL-3.0-or-later now~~ → **GPL-3.0-only** (orogen has no or-later grant) | orogen (GPL-3.0, with no or-later grant) forces version 3 for the combined work. Declaring it early avoids accidental incompatible additions. This does not resolve the deferred conflicts (GPlates 2.0-only stays code-free). |
| **Q3** | **Resolved** | Determinism scope: exact resume on the same browser engine only, or bit-exact across Chrome, Firefox and Safari? | **Same-version, same-engine exactness now**, with the `dmath` hook in place from day one. Decide on cross-engine exactness after spike 1a measures actual divergence. | A deterministic math library costs performance (estimated 1.5–3× on transcendental-heavy code†). It may be needed only for the history simulation. Changed at Checkpoint 1: spike 1a measured no divergence, so cross-engine exactness became a CI-tested goal. |
| **Q4** | **Resolved** | Desktop wrapper, if needed | **Electron**, built only if benchmarks demand it | Same engine as Chrome on both OSes, consistent determinism, raisable heap. Tauri on macOS inherits WebKit's limits. |
| **Q5** | **Resolved** | History t0 | **Start from Azgaar's static human layer**; add "grow from first settlements" later | Gets a working history loop much sooner. The schema already supports both. |
| **Q6** | **Resolved** | Fidelity ceilings | Whole planet ≤ **2.56M cells (~12.5 km)** in the browser; regional patches down to **~1 km**; history at **1-year ticks for ≤ 5,000 years**, with **aggregate agents** (settlements, polities, cultures), not individuals | These set memory budgets, save sizes and the desktop-fallback trigger. Resolved as **benchmark targets, not caps**; longer histories use coarser per-era `dtYears`. |
| **Q7** | **Resolved** | A/B pass thresholds for "preview is faithful" | Land IoU ≥ **0.95**; coastline Hausdorff ≤ **2 preview-cell widths**; Köppen area agreement ≥ **90%**; precipitation correlation ≥ **0.9**; no new or missing major mountain belts | These make "true preview" testable rather than subjective. Resolved as **provisional**: spike 1c measures first, and the final values are set at Checkpoint 1. Final at Checkpoint 1: seven targets, CI fails on regression only. |
| **Q8** | **Resolved** | Earth calibration data | **Download at tuning time** (Kottek/Beck Köppen-Geiger, ETOPO elevation, a precipitation and temperature climatology), log each in `PROVENANCE.md` with its license, and never vendor large datasets in the repo | Keeps the repo small and licenses explicit. Licenses are checked before first use†. |
| **Q9** | **Resolved** | Tectonic history | **Static tectonic snapshot first**, then forward plate evolution over deep time as a **core feature** (changed at resolution; design note 13) | No upstream generates plate history (matrix row 1). This is large original work. At resolution it became a core feature, with fast and slow passes from the same seed; Checkpoint 2 placed it in Phase 6b, after Phase 6 and before Phase 7. |
| **Q10** | **Resolved** | Climate fidelity ceiling | **orogen heuristics, forced by the VPLanet subset**; consider a dynamical (shallow-water) atmosphere or ocean only if Phase 8 calibration plateaus | orogen's climate is tuned against Earth and is the most-cited strength. A dynamical model is a large original project. |
| **Q11** | **Resolved** | Node 24 for building Azgaar | **Install a project-local Node 24** (via a version manager such as `fnm` or `volta`, pinned in `.nvmrc`) | Azgaar requires Node ≥ 24 and this machine has 22.19.0. Approved: fnm plus Node 24 live in `.tools/`, with nothing global. |
