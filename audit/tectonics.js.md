# Audit: tectonics.js

Commit `e43927ce88e766b63e35e896f36bfb882a4c8de4` (master, 2020-08-22). **Verified** = read in source or measured by me. **Inferred** = not checked directly. The first draft of this audit (by a subagent) was rewritten after I checked it against the source: it named a non-existent `Erosion.js`, claimed a 1M-cell mesh at 60 FPS, a seeded-rifting determinism test and a "reference" Schellart implementation, none of which hold up.

## 1. Overview

A browser plate-tectonics and planet simulator by davidson16807: an icosphere of up to 40,962 cells carrying per-plate crust rasters, with rigid-plate motion, subduction, rifting, isostasy, a basic atmosphere, a star-system generator and a three.js globe UI. 1,755 commits; last commit August 2020. About 24,955 lines of first-party JS outside `libraries/` (`noncompiled` 8,341, `precompiled` 5,959, `postcompiled` 8,835; `postcompiled` is generated from `precompiled`, so first-party code is nearer 14K). The plate-evolution core is small: `Lithosphere.js` 494, `Plate.js` 124, `Tectonophysics.js` 290, `Crust.js` 607, `SupercontinentCycle.js` 35.

## 2. Language, runtime, dependencies, build

- **Language**: JavaScript (ES5/ES6 mix), plain `<script>` tags, no modules, no bundler. GLSL shaders under `precompiled/shaders`.
- **Runtime**: browser (WebGL). Nothing in the lithosphere code touches the DOM.
- **Vendored libraries** (`libraries/`): three.js r71 (`REVISION: '71'`), Vue 2.5.17, Chart.js, Bootstrap 4.1.3, jQuery 1.10.2, prism, Stats.js, base64-arraybuffer, `random-0.26.js` (Mersenne Twister).
- **Does it run? Yes (verified).** I served an unmodified copy over `python3 -m http.server` and loaded `index.html?resolution_level=5|6&seed=1` in headless Chromium (Playwright). It loads with no JS errors (the only console error is a blocked YouTube iframe). The mesh has **10,242 cells at level 5 and 40,962 at level 6**. Level 6 is the cap: `Math.min(6, …)` at `index.html:554`. The cell ids are `Uint16Raster` (`Plate.js:71-72`, `Grid.js:26`), so the design cannot exceed 65,535 cells without changes.
- **Tests**: `karma.conf.js` + QUnit (`tests/*.html`, `tests/scripts/`). Not run.
- **Browser feasibility**: already a browser app. For MapMaker the question is not running it but porting 1,500 lines of lithosphere logic plus the raster library it depends on.

## 3. Subsystem inventory

### 3.1 Plate motion (`Plate.js`, `Tectonophysics.js`)
- **Where**: `noncompiled/models/lithosphere/Plate.js:104-123`, `noncompiled/academics/Tectonophysics.js:12-251`.
- **What it does** (verified): each plate is a rigid body with a 3×3 matrix `local_to_global_matrix` and its own crust raster and mask on the shared grid. Per step, `move()` builds a rotation matrix and left-multiplies it. Velocity at each cell is `boundary_normal × buoyancy × k`, where `boundary_normal` is the normalized gradient of the plate mask and `k` is built from a Schellart (2010) terminal-velocity expression with **hard-coded** slab width 300 km, length 600 km, thickness 100 km, shape 0.725, dip constant 4.025, radius 6,367 km (`:145-151`). Per-cell angular velocities are averaged twice, about the plate's centre of mass and about the world centre, each converted to a rotation vector and matrix, then multiplied. There is no explicit Euler pole or rate per plate.
- **The author flags it as unsound**: `Tectonophysics.js:125-132`: "WARNING: most of this is wrong! … the reason we don't do it the correct way is 1.) it's slow, 2.) it's complicated, and 3.) it's not super important". Also `:236` "TODO: negation shouldn't theoretically be needed!" and an `isNaN` fallback to the identity matrix (`:238-244`). `:142-144` lists TODOs to remove the hard-coded constants.
- **Rating: 3/5** (works as a visual model; not reference-grade). **Extractability: loose** (pure functions over rasters).
- **Could serve**: Tectonics (plate evolution).

### 3.2 Interactions: subduction, rifting, collision (`Lithosphere.js`)
- **Where**: `Lithosphere.js:90-306`, `:478-493`.
- **Order per step** (`applyChanges`, verified): `integrate_deltas` → `move_plates` → `supercontinentCycle.update` → `merge_plates_to_master` → `update_rifting` → `update_subducted`.
- **Merge**: every plate's crust is resampled onto the global grid by nearest-neighbour (`grid.getNearestIds`). The least-dense plate in each cell is "on top". Where plates overlap, `Crust.overlap` **adds** the mass pools (`Crust.js:248-255`), and elevation follows from isostasy. That is the whole of "collision": there is **no** orogeny, collision-resistance, suture or merge logic, and **no event log**. A repo-wide grep for `orogen|ophiolite|accretionary|arc|collision|event_log` in the model code returns nothing.
- **Subduction** (`:224-306`): cells where a plate is not on top, plate count >1 and density exceeds mantle are detached one cell per step at the plate's inner border; their sediment and felsic pools become metamorphic, and 85% / 15% of the lost mass is added as felsic plutonic / volcanic accretion to the global delta.
- **Rifting** (`:170-223`): cells where no plate exists (or only one, on top), just outside a plate's border, are filled with a fixed 7,100-unit mafic volcanic column (`:24-28`) and added to that plate's mask. There is no rift-line geometry, no time interpolation of creation age (new crust has age 0 and then ages with everything else), and no randomness.
- **Plate set**: plates are **re-derived every 150 Myr** (`SupercontinentCycle`, 35 lines, fixed duration) by image segmentation of a velocity field computed from buoyancy (`resetPlates`, `:398-426`; `guess_plate_map`, 7 segments). Between resets the plate count only changes through the border logic above.
- **Isostasy and age** (verified): Airy: `displacement = thickness − thickness·ρ/ρ_mantle` (`FluidMechanics.js:65-76`). Mafic crust density mixes linearly between a min and max over 0–250 Myr of age (`Crust.js:263-266`), so oceanic crust densifies with age.
- **Rating: 3/5.** **Extractability: loose.** **Could serve**: Tectonics, Heightmap generation (elevation derived from crust, not generated).

### 3.3 Crust model (`Crust.js`, `RockColumn.js`)
Structure-of-arrays pools per cell: sediment, sedimentary, metamorphic, felsic plutonic/volcanic, mafic volcanic/plutonic, plus `age` of the mafic component only (`Crust.js:88-90`). Also `model_erosion`, `model_weathering`, `model_lithification`, `model_metamorphosis` called from `calculate_deltas` (`Lithosphere.js:307-345`); **not reviewed in detail**. Note `RockColumn.js:13`: `mafic_plutonic = optional['mafic_volcanic']` (copies the wrong key). Rating 3/5 (inferred from structure). Extractability: loose.

### 3.4 Raster library and morphology (`precompiled/rasters/`)
Typed-array rasters, vector fields, binary morphology (dilation, erosion, margin, padding), image segmentation. First-party except `Matrix4x4.js`, which carries a gl-matrix MIT header (Brandon Jones, Colin MacKenzie IV, 2015). Rating 3/5 (not reviewed beyond use). Extractability: standalone in principle. The ids are Uint16, which is the 65k-cell cap.

### 3.5 Atmosphere, climate, hydrology, biosphere, universe, name generator
Present as `noncompiled/models/{atmosphere,hydrosphere,biosphere,universe}`, `academics/{Climatology,Thermodynamics,Hydrology,OrbitalMechanics,Optics,PlantBiology}.js`, `generators/{NameGenerator,NameCorpii,StarSystemGenerator,CrustGenerator}.js`. **Not reviewed.** There is no river or flow routing: `Hydrology.js` is used for `get_surface_heights` only (`Lithosphere.js:38`). There is no `Erosion.js` file.

### 3.6 Views and UI
three.js globe, projection views, Vue UI (`noncompiled/views`, `index.html`). Tangled with three.js r71 and Vue. Not reviewed. Skip.

### 3.7 Time stepping and simulation loop
`Simulation.update()` (`Simulation.js:66-86`) advances by `speed × wall-clock seconds since last frame` (`performance.now()`), skipping frames slower than 5 fps. **The in-app time step is therefore not reproducible.** `calcChanges`/`applyChanges` return early unless the step is large (`Lithosphere.js:467-482`, test at `:469` and `:480`; the mean supercontinent cycle must be below 30 days of "perceivable" time). Plates therefore only start moving at high time speeds. With the default speed, after 6 s the lithosphere had **0 plates** (verified).

## 4. Internal data representation

- **Grid**: three.js `IcosahedronGeometry(1, level)` (`index.html:579`), level ≤ 6 → ≤ 40,962 vertices. Cells are vertices; neighbours from the face list. `getNearestIds` for point lookup.
- **Units**: SI seconds throughout (`Units.MEGAYEAR` etc.); radians; the world radius is hard-coded at 6,367 km in `Tectonophysics.js:151`.
- **Coordinates**: unit vectors; plate-local frame via 3×3 matrix.
- **Time**: continuous seconds (`elapsed_time`); no calendar.
- **Serialization**: `Simulation.getParameters()` includes `seed`, `elapsed_time` and the RNG state (`random.mt`, `random.mti`). `Lithosphere.getParameters()` omits the grid (`// TODO: add grid`). Rasters are written uncompressed.
- **RNG**: `random-0.26.js` Mersenne Twister, seeded from `?seed=` (default `Date.getTime()`, `index.html:568`). **It is not used by plate motion, rifting or subduction** (verified by grep: random draws occur only in `CrustGenerator`, `SphericalGeometry`, `StarSystemGenerator`, `NameGenerator`). `Math.random` appears only in `RealisticPointLightSourceView` (starfield). The library uses native `Math.log/exp/pow/sqrt`.
- **Cross-zoom consistency**: none; one global mesh.

### Measured (me, headless Chromium via Playwright, fixed 5 Myr steps with the sim paused; this machine)

| Item | Result |
|---|---|
| Cells at level 6 | 40,962 |
| `invalidate+calcChanges+applyChanges` over the whole Universe, 40 steps | median 54.2 ms, max 101.3 ms |
| Plates | 5 after the first step, 6 at step 39 |
| Same seed (`seed=1`), two fresh page loads, hashes of `top_plate_map` and `total_crust` at steps 0, 1, 2, 9, 19, 29, 39 | identical in both runs |
| Sum of `lithosphere.total_mass` at those steps | 2.084e12, 3.410e12, 2.069e12, 1.983e12, 1.824e12, 1.703e12, 1.616e12 (not constant; overlaps add mass by construction) |

Caveats: one engine (Chromium, headless), one seed, one machine; cross-engine bit-identity is untested and would be exposed to native `Math.*`. The timing includes non-lithosphere models.

## 5. License

- **Verified**: `LICENSE.txt` is the **Creative Commons Attribution 4.0 International (CC BY 4.0)** legal code (395 lines, header "Attribution 4.0 International"). The README, `package.json` and the first-party source files contain no other licence statement or copyright-holder notice.
- **Vendored third-party code**: `Chart.js` (MIT, © 2016 Nick Downie), `vue.js` v2.5.17 (MIT), `bootstrap.bundle.min.js` v4.1.3 (MIT), `base64-arraybuffer.js` (MIT, © 2012 Niklas von Hertzen), `precompiled/rasters/Matrix4x4.js` (MIT, gl-matrix). `libraries/three.js/*` (r71), `random-0.26.js`, `Stats.js`, `prism.js`, `jquery-1.10.2.min.js`, `vue-charts.js` have no licence text in their first 600 bytes; not verified.
- **GPL-3.0-only compatibility**: the FSF licence list (fetched and read from the raw page, 2026-10-03) says of CC BY 4.0: *"This is a non-copyleft free license that is good for art and entertainment works, and educational works. It is compatible with all versions of the GNU GPL; however, like all CC licenses, it should not be used on software."* So the FSF treats it as **compatible**, with the caveat that CC licences are not designed for software (CC BY 4.0 has no software-specific terms and does not license patents, §2(b)(2)). **Verdict: not blocked by licence.** Obligations on any extraction: credit the creator, link the licence, indicate changes (CC BY 4.0 §3(a)), and note that the original copyright holder is not named in the repo. Not legal advice. (My first reading, and the subagent's, that CC BY is GPL-incompatible was wrong.)
- **Practical**: licence permits it, but the code is of limited use (below), so treat as **algorithm reference**, not a port source.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | yes | 3/5 | loose | Lithosphere.js, Plate.js, Tectonophysics.js | Rigid-plate motion, subduction by overlap, rifting by gap-fill, age-dependent density, Airy isostasy. Velocity model self-described as mostly wrong; no collision or orogeny logic, no events. |
| Heightmap generation | partial | 2/5 | loose | Lithosphere.js, FluidMechanics.js, CrustGenerator.js | Elevation derived from crust thickness and density; initial crust from noise and image import. |
| Erosion | partial | — | loose | Crust.js (`model_erosion` etc.) | Present as crust-pool deltas; not reviewed. No `Erosion.js`. |
| Hydrology (rivers/lakes/watersheds) | no | — | — | Hydrology.js | Surface-height helper only; no flow routing. |
| Climate – temperature | partial | — | loose | Thermodynamics.js, Atmosphere.js | Present; not reviewed. |
| Climate – wind | partial | — | loose | Climatology.js | Present; not reviewed. |
| Climate – ocean currents | no | — | — | — | Not found. |
| Climate – precipitation | partial | — | loose | Climatology.js | Present; not reviewed. |
| Climate – seasons | no | — | — | — | Not found. |
| Biomes | no | — | — | Biosphere.js | Stub-sized; not reviewed. |
| Soils | no | — | — | — | Not found. |
| Resources | no | — | — | — | Rock-pool types only. |
| Population & settlement | no | — | — | — | Not found. |
| Cities & towns | no | — | — | — | Not found. |
| Languages & names | partial | — | loose | NameGenerator.js, NameCorpii.js | Corpus-based name generator for stars and planets; not reviewed. |
| Political borders | no | — | — | — | Not found. |
| Trade | no | — | — | — | Not found. |
| Long-run history/war/economics/politics sim | no | — | — | — | Not found. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | 1/5 | — | Grid.js | One global icosphere, max 40,962 cells, Uint16 ids. |
| Globe view | yes | 3/5 | tangled | views/, Shaders.js | three.js r71; not reviewed in depth. |
| Flat projections | partial | — | tangled | MapProjectionView.js | Present; not reviewed. |
| Partial-world inference | no | — | — | — | Not found. |
| Import of heightmaps/layers | yes | — | loose | ImageImporter.js | Canvas image → elevations (`index.html:528`); not reviewed. |
| Fidelity/speed slider with same-seed preview | no | — | — | index.html (`resolution_level`) | The resolution slider re-grids the existing state; no fast/slow pass. |
| Export (PNG/SVG/STL/other) | partial | — | tangled | file-io/ | JSON and CSV exporters exist; not reviewed. |
| Full-state save/resume format | yes | 3/5 | loose | JsonSerializer.js, Simulation.js | JSON including RNG state; grid not serialised; uncompressed. |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | tests/earth-heightmap.png | No calibration harness; one Earth heightmap and crust-age image in `tests/`. |
| Planet-parameter derivation | partial | — | loose | models/universe/, OrbitalMechanics.js | Orbit, spin and star models; not reviewed. |

## 7. Verdict

- **Worth taking (algorithm level)**: (a) overlap and gap detection by resampling per-plate masks onto a global mesh, which corresponds to note 13's "detection mesh"; (b) subduction as removal of denser overlapped crust at the plate border with accretion; (c) age-dependent oceanic density with Airy isostasy.
- **Not worth taking**: the velocity model (the author says it is mostly wrong; note 13 uses a torque-balance heuristic from Forsyth & Uyeda and orogen instead), the 150 Myr plate re-segmentation, the wall-clock stepping, the Uint16 grid, and everything UI.
- **Fit to design note 13** (read against the note): the note specifies per-plate quaternion rotations composed per step from ω_i, a fast pass with a force balance and a slow replay at 1 Myr, events (rift, subduction, collision, orogeny stamping, suture merges) written to a schedule, and counter-based RNG keyed by `(stream, plateId, eventIndex, k)`. tectonics.js has matrices rather than ω_i; no fast/slow split; **no event schedule, collision resistance, orogeny or sutures**; and no RNG in the plate logic at all. It supplies perhaps the interaction-detection idea and a worked example of crust pools. It does **not** supply anything note 13 lacks. Note 13's own 10-20 ms-per-step estimate is its own; the 54 ms measured above is for tectonics.js at 40,962 cells with the full Universe step and is not comparable.
- **Risks**: no calibration, a global-only grid, and fields resampled by nearest neighbour each step (diffusion of fields not measured).
- **Overall**: a useful illustration of forward plate evolution in a browser. Reference only; no extraction recommended.
