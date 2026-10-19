# Capability Matrix: which upstream repo should supply each MapMaker capability

Basis: the 28 per-repo audits in this directory (`audit/<repo>.md`), plus my own cross-checks against the source in `upstream/`. Requirements: `docs/REQUIREMENTS.md`.

## How to read this

- **Ratings (1-5)** come from the per-repo audits: 1 toy/unsuitable, 2 weak, 3 serviceable, 4 good, 5 reference-grade. They come from code inspection by subagents. **Nothing was built or run.** Treat them as informed estimates.
- **Extractability**: *standalone* (lifts out as a module), *loose* (needs adapter code), *tangled* (entangled with the host app or framework).
- **Ranking rule**: fit to the requirement and quality come first, then browser-readiness. The target is a GitHub Pages app, so pure JS/TS beats C/C++/Fortran needing a WASM port or rewrite. Fortran/MPI/HPC codes are almost always "algorithm reference only".
- **`†`** marks a claim I checked against the source and corrected, or a claim I could not confirm. See "Corrections to the audits".
- Licenses are recorded only. The brief says to ignore conflicts for now.

## Corrections to the audits and requirements (read first)

1. **orogen is not a multi-projection reference.** I grepped `upstream/orogen`: it implements **equirectangular only**, plus a 3D globe. Its README, `index.html` and `js/planet-mesh.js` all say so, and its own `V1_REVIEW.md` notes pole and antimeridian seam artifacts. The requirements' "orogen is a strong reference for projections" does not hold. It is, however, the strongest repo overall for generation (see below).
2. **Azgaar's audit overstated projections.** It claimed "Mercator, equirectangular, equal-area, equidistant; correct mathematics". A grep of `src/` finds only two d3-geo users: `geoEquirectangular` for the graticule (`renderers/draw-coordinates.ts:25`) and `geoOrthographic` for a 200 px preview globe in the settings UI (`controllers/world-configurator.ts:8`). The map itself is a linear lat/lon box (`utils/commonUtils.ts:245`, `:257`; group 6a A1). I downgraded Azgaar's flat-projection capability to 1/5.
3. **No upstream repo contains browser-ready multi-projection code.** What exists:
   - GPlates: `src/gui/MapProjection.h` offers Rectangular, Mercator, Mollweide, Robinson plus an orthographic globe, via PROJ in C++.
   - CesiumJS: only `WebMercatorProjection` (spherical, on the ellipsoid's maximum radius) and `GeographicProjection` (plate carrée), in `packages/core/Source/` (314 lines with `MapProjection.js`).
   - QGIS and PostGIS: use PROJ but don't contain it. QGIS `QgsCoordinateReferenceSystem::factors` only forwards `proj_factors` (scale factors, Tissot axes).
   - Azgaar: already depends on `d3` 7.9, which ships `d3-geo` (Mercator, Equal Earth, azimuthal and others). That is a third-party package, not an `upstream/` repo.
   - See Decision D1.
4. **CESM is an empty shell in this checkout.** All 21 submodules in its `.gitmodules` (11 components such as cam, clm, mom and mosart, 5 libraries, cime, share and others) are empty, because it is a git-fleximod submodule layout; the 104 files present are build configuration, git-fleximod and five user-guide pages (re-checked in reconciliation group 3). The audit's 5/5 climate ratings describe the real CESM model, not code present here. I treat CESM as a *reference by name only*. The code that is present in other checkouts: MOM6, CTSM, MARBL (MOM6's GSW-Fortran and CVMix submodules and CTSM's FATES submodule are empty too).
5. **QGIS audit said "no flow accumulation / no contouring / hydrology thin".** For native C++ that is true: only `qgsalgorithmupslopearea` and mesh contours. But `python/plugins/grassprovider` wraps GRASS `r.watershed`, `r.terraflow`, `r.fill.dir`, `r.contour`, `r.drain`, and so on. Those need a GRASS installation and are not extractable, so the practical conclusion stands.
6. **Cosmetic**: several agents misreported their own file sizes (e.g. SLiM "1,280 lines", actual 173). All 28 files have the seven required sections and the capability table.
7. **Not reviewed in depth by me**: per-subsystem line counts and individual 1-5 ratings in the audits other than those named above. Spot checks covered the repos that win a row below.

## At a glance: recommended sources

| Capability area | Recommended pick | Language | License | Confidence |
|---|---|---|---|---|
| Tectonics, heightmap, erosion (fast pass) | **orogen** | JS | GPL-3.0 | medium-high |
| Erosion (slow, high-fidelity pass) | **Badlands** (algorithm re-implemented in JS/TS) | Py/Fortran | GPL-3.0 | medium |
| Plate motion kinematics (time evolution) | **GPlates** rotation algebra (ported since Q12; was re-implemented) | C++ | GPL-2.0 | medium |
| Wind, ocean currents, precipitation, temperature, Köppen | **orogen** | JS | GPL-3.0 | medium-high |
| Planet-parameter derivation, seasons, ice-albedo | **VPLanet** (POISE, DistOrb) core equations | C | MIT | medium |
| Rivers, lakes, watersheds | **Azgaar** `river-generator` (adapted to the spherical mesh) | TS | MIT | medium |
| Biomes | **orogen** `koppen.js` plus **Azgaar** biome matrix | JS/TS | GPL-3.0 / MIT | medium |
| Settlements, cities, names, states, trade, resources (static) | **Azgaar** | TS | MIT | medium |
| Globe view | **orogen** (`scene.js`, `planet-mesh.js`); **CesiumJS** as LOD reference | JS | GPL-3.0 / Apache-2.0 | medium |
| Heightmap import | **orogen** `import-main.js` | JS | GPL-3.0 | medium |
| PNG / SVG export, save format | **orogen** (PNG), **Azgaar** (SVG, full-state save) | JS/TS | GPL-3.0 / MIT | medium |
| Flat projections (Mercator, equal-area, ...) | **No upstream repo.** GPlates only as C++ reference (see D1) | n/a | n/a | n/a |
| Soils, minerals, language evolution, history sim, partial-world inference, STL | **Gaps: original code** | n/a | n/a | n/a |

The practical core is **orogen** (generation and climate), **Azgaar** (human layer, SVG, save), **VPLanet** (planet physics), and **Badlands/GPlates** as algorithm references. Everything else is reference only or unusable.

---

## Detailed matrix

Each row ranks the candidates that actually matter and gives my pick. Repos that score 1 or have nothing are omitted from the table but appear in the per-repo audit.

### 1. Tectonics

| Rank | Repo | Rating | Extractability | Lang | License | Note |
|---|---|---|---|---|---|---|
| 1 | orogen | 4 | loose | JS | GPL-3.0 | `plates.js`, `plate-physics.js`, `coarse-plates.js`, `super-plates.js`: farthest-point plate seeding, drift-based boundary classification, stress propagation, density-based subduction. Toy physics, good visual results. |
| 2 | GPlates | 5 (kinematics only) | loose | C++/Qt | GPL-2.0 | Finite-rotation / Euler-pole algebra (`src/maths`, `RotationUtils.h`; the port target) and rotation-model handling (`src/app-logic/Reconstruction*`, reference only because it depends on the feature model). Reconstructs *given* motion; does not generate a world. |
| 3 | tectonics.js (new) | 3 | loose | JS | CC-BY-4.0 | The only forward plate-evolution code in browser JS: rigid plates as 3×3 rotations, subduction by overlap, rifting by gap-fill, age-dependent crust density, Airy isostasy (`Lithosphere.js`, `Plate.js`, `Tectonophysics.js`; isostasy in `FluidMechanics.js:65-76`). Runs; 40,962 cells max (Uint16 ids); 54 ms/step median, measured. The author's own comment calls its velocity model "mostly wrong"; no collision/orogeny/event logic; wall-clock time steps; plate set re-segmented every 150 Myr. Licence is not a blocker (FSF: CC BY 4.0 is GPL-compatible), but the code is of limited use for note 13. Algorithm reference only. |
| 4 | VPLanet | 2 | tangled | C | MIT | Parameterised thermal interior (`thermint.c`): mantle heat flow by Nusselt scaling under a mobile-lid or stagnant-lid regime the user selects (`dStagLid`, `thermint.c:649-708`). It sets plate vigour but does not decide whether plate tectonics is plausible (reconciled 2026-10-18). |
| - | SongsOfFOSS (new) | none | n/a | Lua | MIT (Lua) | Terrain and plates come from a closed Windows binary `libSOTE.dll` (no source). A legacy Lua plate seeder (`game/world-gen/plate-gen.lua`) is dev-only and has no plate interactions. Nothing to use. |
| - | ASPECT | 5 (physics) / 2 (fit) | tangled | C++/MPI | GPL-2.0+ | Mantle convection FEM. Not portable, not procedural. Parameter reference only (rheology, core-evolution and plume-geometry references for note 21; see `docs/reconciliation/group-1.md`). |

**Pick: orogen** for generation. For plate *history* over time, port GPlates' rotation algebra (`src/maths/UnitQuaternion3D`, `FiniteRotation`; allowed since Q12, see Expanded scope) rather than re-implementing it. Original code is needed for forward plate evolution; see Gaps.

Added after the first pass: `tectonics.js` (see `audit/tectonics.js.md`, `docs/spikes/NEW_UPSTREAMS.md`) does not change this pick. It supplies ideas for note 13's detection mesh and crust pools, but not its event schedule, force balance, fast/slow split or keyed RNG.

### 2. Heightmap generation

| Rank | Repo | Rating | Extractability | License | Note |
|---|---|---|---|---|---|
| 1 | orogen | 4 | loose | GPL-3.0 | `elevation.js` (2,615 LOC, verified): tectonic-driven uplift, rifts, back-arc basins, hotspots, island arcs, multi-layer noise. |
| 2 | Azgaar | 3 | loose | MIT | `heightmap-generator.ts`: blob/line templates. Fantasy-plausible, not geophysical. Planar, not spherical. |
| 3 | GAMA | 2 | standalone | GPL-3.0 | Simplex-noise DEM only. |

**Pick: orogen.**

### 3. Erosion

| Rank | Repo | Rating | Extractability | Lang | License | Note |
|---|---|---|---|---|---|---|
| 1 | orogen | 4 | standalone | JS | GPL-3.0 | `terrain-post.js` (958 LOC, verified): glacial, hydraulic (priority-flood), thermal/talus, ridge sharpening, soil creep. |
| 2 | Badlands | 4 | loose | Py/Fortran/C | GPL-3.0 | Five incision laws (detachment-limited and four sediment-flux-dependent forms, `utils/flowalgo.f90` `streampower`), applied explicitly with a CFL-limited step, plus linear and nonlinear hillslope diffusion (`utils/sfd.c`) on a TIN; Braun-Willett stack ordering (`flowalgo.f90` `buildfa`, `flow/flowNetwork.py`). Physically rigorous. |
| 3 | Delft3D | 3 | tangled | Fortran | mixed | Sediment transport formulas (van Rijn); coastal/fluvial scale. Equations only. |

**Pick: orogen** for the fast preview pass. **Re-implement Badlands' stream-power + diffusion in JS/TS** as the slow, realism-first pass behind the fidelity slider. That matches "prioritize realism over speed". The audit estimated 3-4 weeks for the flow network; I have not validated that.

### 4. Hydrology (rivers, lakes, watersheds)

| Rank | Repo | Rating | Extractability | Lang | License | Note |
|---|---|---|---|---|---|---|
| 1 | Azgaar | 3 | loose | TS | MIT | `river-generator.ts`, `lakes.ts`, `features-generator.ts`: D8-style flow routing, discharge-based widths. No deltas. Verified (spike 1b): runs unmodified on orogen's sphere via a 75-line facade; all rivers terminate correctly at 200k. Uint16 flux overflows ≥~200k cells; river generation is superlinear (25 s at 1M). |
| 2 | WRF-Hydro | 4 (channel routing) | loose | Fortran | custom UCAR, no resale | Reach-based Muskingum and Muskingum–Cunge (`SUBMUSKINGCUNGE`, secant depth solve) and gridded diffusive-wave routing (`src/Routing/module_channel_routing.F90`), run continent-wide as the US National Water Model. Small arithmetic kernels: a Phase 7 port candidate since Q12 (single precision natively). |
| 3 | Badlands | 3 | loose | Py/Fortran | GPL-3.0 | Flow accumulation; Planchon–Darboux pit filling with pit volumes and sediment infill (`utils/pdalgo.f90`, `classpd.f90`); no lake water balance. |
| 4 | CTSM / ParFlow | 4 / 3 | tangled | Fortran/C | UCAR / LGPL-2.1 | Soil-water and overland flow. Not river-network *generation*. |
| - | orogen | 2 | loose | JS | GPL-3.0 | Pit-filling only; no explicit river network, lakes, or watersheds. |

**Pick: Azgaar** for river/lake/watershed topology, driven by orogen's elevation and precipitation. Use Badlands flow accumulation for consistency with the slow erosion pass. Real lake and basin hydrology is weak everywhere; see Gaps.

### 5. Climate: temperature

| Rank | Repo | Rating | Extractability | License | Note |
|---|---|---|---|---|---|
| 1 | VPLanet (POISE) | 5 | tangled in C; equations portable | MIT | `src/poise.c` (7,859 LOC, verified): 1D latitudinal energy-balance model with ice sheets and seasonal mode. No longitude dimension. |
| 2 | orogen | 4 | loose | GPL-3.0 | `temperature.js`: ITCZ-based profile, lapse rate, ocean thermal diffusion, tuned against Earth Köppen. No explicit energy balance. |
| 3 | Azgaar | 3 | standalone | MIT | Latitude plus altitude lapse (6.5 °C/km). |

**Pick: orogen** at runtime, **parameterised by VPLanet-derived insolation/albedo** (see Planet-parameter derivation). Porting the EBM *core* is a bounded job; porting all of `poise.c` is not necessary.

### 6. Climate: wind

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | orogen | 4 | `wind.js` (895 LOC): pressure-driven, longitude-varying ITCZ, Coriolis deflection, zonal bands. No frontal systems. |
| 2 | Azgaar | 2 | Six latitude-tier wind angles. |
| 3 | VPLanet | 2 | 1D meridional diffusion (`dDiffusion`, optional `bMEPDiff`), with an optional `bHadley` bump that raises diffusion within about ±25° latitude (`poise.c:2159-2165`; the code notes it is "not self-consistent with rotation rate"). No winds. |

**Pick: orogen.** (CESM's atmosphere code is not in the checkout; MOM6 etc. are ocean-only.)

### 7. Climate: ocean currents

| Rank | Repo | Rating | Extractability | License | Note |
|---|---|---|---|---|---|
| 1 | orogen | 3 | loose | GPL-3.0 | `ocean.js` (389 LOC): rule-based gyres, western boundary intensification, ACC. Not dynamical. |
| 2 | MOM6 | 4 | tangled | Apache-2.0 | Production primitive-equation ocean model, Fortran/MPI, C-grid. Formulation reference; closed-form pieces port: the Roquet et al. (2015) polynomial EOS, tidal astronomy (`src/parameterizations/lateral/MOM_tidal_forcing.F90`) and analytic gyre winds. TEOS-10 (GSW) and CVMix are empty submodules here. |
| 3 | Delft3D | 4 | tangled | mixed | Regional coastal flows only. |
| - | Badlands | 2 | loose | GPL-3.0 | Wave-driven nearshore drift, not currents. |

**Pick: orogen.** A shallow-water or barotropic solver would be original code; see Gaps.

### 8. Climate: precipitation

| Rank | Repo | Rating | Extractability | License | Note |
|---|---|---|---|---|---|
| 1 | orogen | 4 | loose | GPL-3.0 | `precipitation.js` (770), `heuristic-precip.js`: moisture advection plus six mechanisms (ITCZ, frontal, orographic, lee, polar, subtropical), tuned vs Earth. |
| 2 | Azgaar | 3 | standalone | MIT | Wind-shadow heuristic. |
| 3 | PISM | 2 | loose | GPL-3.0 | Orographic precipitation over given topography (Smith & Barstad 2004 by FFTW on a regular grid, `OrographicPrecipitationSerial.cc`). Badlands has the same model with its own FFT (`utils/ormodel.f90`). |

**Pick: orogen.**

**Sections 5–8 (spike 1a):** verified headless. Earth Köppen objective 0.678 (40k) / 0.668 (160k). Bit-identical across Node, Chromium, Firefox, WebKit. Ratings unchanged.

### 9. Climate: seasons

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | VPLanet | 4 | Full seasonal cycle from obliquity/eccentricity/insolation (`poise.c`, `distorb.c`). |
| 2 | orogen | 3 | Summer/winter computed separately with a hemisphere swing; no continuous year. |

**Pick: orogen** for fields; feed it VPLanet-derived seasonal forcing. Continuous seasons would be original glue.

### 10. Biomes

| Rank | Repo | Rating | Extractability | License | Note |
|---|---|---|---|---|---|
| 1 | orogen | 4 | standalone | GPL-3.0 | `koppen.js` (320 LOC, verified): Köppen-Geiger classification, ~30 classes. A climate classification, not an ecological biome model. Two-season (summer/winter) proxy for warmest/coldest month. Measured on Earth topography: 38–40% exact class, 72% major group (spike 1a). |
| 2 | Azgaar | 3 | standalone | MIT | `biomes-generator.ts`: 13 biomes from a temperature x moisture matrix. |
| 3 | LPJmL | 4 | tangled | AGPL-3.0 | Dynamic vegetation (PFTs), C. It consumes climate; does not generate it. Algorithm reference. |
| 4 | CTSM | 4 | tangled | UCAR | CNDV, an LPJ-derived DGVM (`src/biogeochem/CNDV*Mod.F90`), Fortran. Reference. FATES is an empty submodule here. |

**Pick: orogen `koppen.js`** (also needed for calibration) plus **Azgaar's biome matrix** for the playable biome layer.

### 11. Soils

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | LPJmL | 4 | 3-layer soil pools, N cycle, thermal (`src/soil`); needs a soil-type input map. AGPL, C. |
| 2 | CTSM | 4 | C/N cycling; soil properties are input (sand, clay and organic matter, turned into hydraulic parameters by the Cosby et al. 1984 pedotransfer, `src/main/FuncPedotransferMod.F90`). |
| 3 | ParFlow / WRF-Hydro | 3 | Hydraulic properties only. |
| 4 | Badlands | 2 | Lithology tracking, no pedology. |

**Pick: none is usable in a browser.** This is a **gap** for generation. Soil type would be derived from lithology, slope, climate and vegetation using original code, with LPJmL and CTSM as algorithm references.

### 12. Resources

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | Azgaar | 3 | `goods-generator.ts`, `production-generator.ts`: about 60 goods, assigned by biome/height. Economic goods only. |
| 2 | Badlands | 2 | Carbonate platforms only. |

**Pick: Azgaar** for goods. **Mineral and ore resources are a gap** (no repo models geological deposits tied to tectonics).

### 13. Population and settlement

| Rank | Repo | Rating | Extractability | License | Note |
|---|---|---|---|---|---|
| 1 | Azgaar | 2 | loose | MIT | `burgs-generator.ts`, `population-generator.ts`: habitability-based placement. Static after generation. |
| 2 | UrbanSim | 3-4 | loose | BSD-style | Discrete-choice location models, relocation, cohort transition (`models/dcm.py`, `transition.py`). Python/pandas. Design reference. |
| 3 | RangeShiftR | 4 | loose | GPL-3.0 | Individual-based dynamics and dispersal kernels; C++20 + R. Species-ecology oriented. |
| 4 | SLiM | 5 | tangled | GPL-3.0 | Reference individual-based model; C++, no browser path. |
| 5 | SongsOfFOSS (new) | 2 | loose | MIT | Lua. Individual `POP` objects with monthly Bernoulli births and deaths from fixed rates (`society/pop-growth.lua`); carrying-capacity variables are computed but unused. "Migration" is leader-driven colonisation and invasion events (up to 6 families per move), not a demographic model. Unseeded RNG. Contrast case for note 9, not a source. |
| - | FLAMEGPU2, GAMA, LIAM2, OpenSpiel | 2-3 | tangled / n/a | various | Frameworks without a settlement model. |

**Pick: Azgaar** for initial placement. **Dynamic demography is original code**, informed by UrbanSim and RangeShiftR.

### 14. Cities and towns

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | Azgaar | 3 | Burg size, capitals, emblems; no urban morphology. |
| 2 | UrbanSim | 2 | Zone-level price equilibration; not city morphogenesis. |
| 3 | GAMA | 1 | Random footprints. |

**Pick: Azgaar.** City-internal layout and growth over time are not covered by any repo.

### 15. Languages and names

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | Azgaar | 3 | `names-generator.ts`: culture-specific phonological name generation. |
| 2 | SongsOfFOSS (new) | 2 | `entities/language.lua` (187 lines, MIT, loose): phoneme inventory from a fixed frequency-ordered list with geometric drop-off, 7 syllable templates, random suffixes for province, realm and adjective names. Static, unseeded, no sonority rules or lexicon. Culture and religion are colour-and-name labels (66 and 59 lines). |
| 3 | SLiM | 2 | Recipes show cultural-trait transmission; no linguistic structure. |

**Pick: Azgaar for names.** **Actual language evolution (phonology, vocabulary and grammar drift, family trees) is a gap.**

### 16. Political borders

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | Azgaar | 2 | `states-generator.ts`, `provinces-generator.ts`: flood-fill allocation; diplomacy pre-generated, no causation. |
| 2 | PostGIS | 3 | Polygon union/polygonize/topology (C, needs GEOS). Useful for border geometry cleanup. |

**Pick: Azgaar** for initial borders. Border change over time depends on the history sim; see Gaps.

### 17. Trade

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | Azgaar | 2 | `routes-generator.ts`: static network with profit heuristic. |
| 2 | Eurace | 4 | Rich multi-agent economy, **EULA-restricted: do not extract** without legal review. |
| 3 | MESSAGEix | 3 | LP cost-minimization via GAMS. Not portable. |

**Pick: Azgaar** for a static baseline. Dynamic trade is original code; no extractable economic dynamics exist.

### 18. Long-run history / war / economics / politics simulation

| Candidates | Verdict |
|---|---|
| Azgaar (pre-generated flavor), Eurace (EULA; economics only), SLiM / FLAMEGPU2 / LIAM2 / OpenSpiel (frameworks, no domain model), MESSAGEix (energy LP), UrbanSim (forecasting only) | **None cover war, politics, or history.** |
| SongsOfFOSS (new, MIT, Lua; game, not a history engine) | **Partial, usable pieces only.** `Army:attack` (`entities/army.lua`, ~130 lines with `Warband:get_total_strength`): generalised Lanchester attrition with exponent 0.1 between linear and square law, defender advantage, 0.7 rout threshold; no terrain, fortification or supply (3/5, loose). Per-province price ODE with stockpile pressure and neighbour coupling (`economy/realm-economic-update.lua:149-234`, ~40 lines; 3/5, tangled). Monthly bucketed tick order (`world.lua:368-689`). **Absent**: stability, legitimacy, revolt, collapse (zero grep hits), war claims enforcement (`war.claims` never read), currencies, trade routes, religion dynamics, epidemics. RNG is unseeded (196 `love.math.random` calls). |

**Gap: original code.** This is the largest single piece of new work. Ideas can be borrowed from UrbanSim (discrete choice), SLiM (individual-based populations), and the Azgaar generators (initial state), but there is no extractable simulation core.

### 19. Planet-scale plus regional patches (multi-resolution, zoom consistency)

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | orogen | 4 | Resolution-independent ~20,000-region coarse plate pipeline projected to the high-res mesh (README step 5-7; `detail-scale.js`, `coarse-plates.js`). Scale-invariant erosion and noise. Design is built for it, but no true nested refinement. |
| 2 | CesiumJS | 4 | Quadtree LOD *rendering* (`packages/engine/Source/Scene/QuadtreePrimitive.js`, `Globe.js`): screen-space-error selection (`maximumScreenSpaceError` 2); no imagery cross-fade. Streams data; does not generate it. |
| 3 | PostGIS / GPlates | 4 / 4 | Geodetic math and zoom-consistent projections. Math only. |

**Pick: orogen for generation consistency, CesiumJS's quadtree design as the rendering reference.** Making regional patches refine the global field deterministically (a local mesh whose coarse content equals the global result) is original design work; see Gaps.

### 20. Globe view

| Rank | Repo | Rating | Extractability | License | Note |
|---|---|---|---|---|---|
| 1 | orogen | 4 | loose | GPL-3.0 | Three.js sphere, Voronoi cell mesh, atmosphere, poles OK (`scene.js`, `planet-mesh.js`). |
| 2 | Azgaar | 2 (was 4 per audit; group 6a) | standalone | MIT | Three.js 3D view (`renderers/view-3d-renderer.ts`, 1,228 lines): the planar map as a texture on `SphereGeometry(1,64,64)`, or a `PlaneGeometry` heightfield (group 6a A1). |
| 3 | CesiumJS | 4 | loose | Apache-2.0 | WGS84 globe engine; heavy (~50k LOC if extracted). Earth ellipsoid assumptions, but the ECEF axes match the canonical frame (`Ellipsoid.js:326–335`) and `Ellipsoid.UNIT_SPHERE` exists. Shading is Lambert only (no hillshade); slope/aspect/contour/elevation-band materials and imagery colour adjustments are small closed forms (group 6a K2). |

**Pick: orogen.**

### 21. Flat projections (Mercator, equirectangular, equal-area, others)

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | GPlates | 4 | Rectangular, Mercator, Mollweide, Robinson as PROJ calls on the WGS84 ellipsoid (`src/gui/MapProjection.cc:67-71`); no projection maths of its own. Reference only. |
| 2 | CesiumJS | 4 | `WebMercatorProjection` (spherical, clamped at ≈85.0511°) and `GeographicProjection` (plate carrée) only, in `packages/core/Source/` (314 lines with `MapProjection.js`). Golden-value references for d3. |
| 3 | orogen | 2 | Equirectangular only (see correction 1). |
| 4 | Azgaar | 1† | Equirectangular graticule only. |
| - | QGIS / PostGIS | 5 / 4.5 | Delegate to PROJ, which is not in the checkout. QGIS has no projection maths of its own (`src/core/proj/`, 13,665 lines of wrappers). |

**Pick: none from `upstream/`.** Needs a decision (D1): use `d3-geo` (+ `d3-geo-projection`) or `proj4js`, which are third-party packages outside `upstream/`.

### 22. Partial-world inference

No repo infers surrounding tectonic and continental context from a regional map. GPlates handles partial plate circuits but its audit says inference of missing rotations is a heuristic that is not implemented. **Gap: original code.** orogen's coarse-plate stage and the tectonics/climate pipeline are the natural substrate to constrain against.

Spike 1d: orogen's coarse-plate stage accepts pinned plates and land/sea with a ~110-line patch (exact survival; bit-identical when unpinned). Elevation/mountains inside a pinned region are not held by plate pins.

### 23. Whole-world derivation from planet parameters (planet-parameter derivation)

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | VPLanet | 5 | Orbital elements, stellar properties, planetary mass/radius/interior to insolation, albedo, climate state (`distorb.c`, `poise.c`, `stellar.c`, `radheat.c`). MIT. |
| 2 | orogen | 3 | Tunable climate constants and sliders (`climate-config.js`, planet code). Not physical parameters. |
| 3 | GPlates | 3 | Derives tectonics from motion models only. |

**Pick: VPLanet** equations. Needs a mapping layer from physical parameters to orogen's sliders (original glue).

### 24. Import of heightmaps and other layers

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | orogen | 3 | `import-main.js`: equirectangular B&W heightmap (PNG/JPEG/WebP) to full climate simulation. Single layer, fixed 0-255 to -5..6 km mapping. |
| 2 | Azgaar | 3 | PNG grayscale to height; `.map` loading. |
| 3 | QGIS / GAMA / GPlates / PostGIS | 4-5 | GDAL-backed 200+ formats (GeoTIFF, NetCDF, shapefile). GDAL is not in the checkouts; C++. |

**Pick: orogen** for heightmaps. Multi-layer and GeoTIFF import is original code, or a JS decoder library, outside `upstream/`.

### 25. Fidelity/speed slider with same-seed preview

| Candidate | Finding |
|---|---|
| orogen | Closest. The seed and sliders are packed into a deterministic "planet code" (`planet-code.js`); plate layout comes from a fixed-size coarse reference mesh, so the continent layout is resolution-independent by design. RNG is `rng.js` (11-line LCG). **Measured (spike 1c): not faithful below the continent scale.** Land IoU 0.80–0.91, Köppen agreement 41–73%, mountain IoU 0.06–0.49 vs 2.56M; no convergence with N. Continent layout and land fraction are resolution-independent. |
| FLAMEGPU2 / SLiM / CesiumJS | Not applicable or explicitly weak (RunPlan; seed-invariance not guaranteed). |

**Pick: orogen's architecture.** The preview-equals-final guarantee across all subsystems is original design work and must be tested.

### 26. Export

| Format | Best source | Note |
|---|---|---|
| PNG heightmap | orogen | `planet-mesh.js` PNG encoder; up to 65,536 px wide, 16-bit grayscale heightmap. |
| SVG | Azgaar | Native: the map is SVG-based. |
| STL | **none** | No repo has STL export (Godot, GPlates, Azgaar all lack it). **Gap, but small original code.** |
| Other (GeoJSON, PNG tiles) | Azgaar (`export.ts`) | GeoJSON, PNG tiles, JPEG. |
| Other (X3D, GeoJSON, WKT) | PostGIS | C output code; reference. |

### 27. Full-state save / resume format

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | Azgaar | 3 | `save.ts`, `load.ts`: comprehensive versioned serialization. Browser-native. Lossy on reload (pack.cells.h re-derived from grid: 547/4226 cells differ; pop rounded; conf recomputed); no RNG state (spike 1a). |
| 2 | Badlands / PISM / WRF-Hydro / MOM6 | 4 | HDF5 / NetCDF restarts; HPC formats, not portable. |
| - | orogen | 1-2 | Planet code holds seed plus slider values only. It regenerates deterministically; it is not a mid-run checkpoint. |

**Pick: Azgaar's approach** as the template for a MapMaker format. Resuming a long history simulation mid-run needs original schema work (RNG-state capture included).

### 28. Earth-data calibration (elevation, climate, Köppen)

| Rank | Repo | Rating | Note |
|---|---|---|---|
| 1 | orogen | 5 | `tuning/climate/` (verified, run): `optimize.mjs`, `score.mjs`, `koppen-distance.mjs`, `ground-truth.mjs` score the simulation against Kottek et al. 2006 Köppen-Geiger 0.5° (downloaded; not in checkout). The only reusable, JS calibration harness. Headless, <2 s per evaluation at 40k. README's objective formula is stale. |
| 2 | VPLanet | 4 | `examples/EarthClimate`: parameters tuned to modern Earth. |
| 3 | LPJmL | 4 | Calibrated to reanalysis and flux observations; data not bundled. |

**Pick: orogen's tuning harness.** Ground truth is the Kottek ASCII grid (downloaded at tuning time, Q8); `earth.png` is the input heightmap. **Documenting what 0, 1.0 and 1.5 mean for each parameter, as the requirements demand, exists in no repo.** It is original work built on this harness.

### 29. Provenance

No repo provides module-level provenance tracking. `upstream-manifest.json` has repo-level commits and licenses. **Gap, but trivial:** a small script plus a `PROVENANCE.md` convention.

---

## Gaps: where original code is required

These are the capabilities with **no usable implementation in any upstream repo**:

1. **History / war / economics / politics simulation** (the largest item). Nothing models conflict, state formation, diplomacy, or dynamic economies in extractable form.
2. **Language evolution**: only Azgaar's phonological name generator exists.
3. **Partial-world inference** (inferring plausible global tectonic and continental context from a regional map).
4. **Soils** (generation of soil type and fertility), with no browser-ready model.
5. **Mineral and ore resources** tied to geology.
6. **Regional-patch refinement** consistent with the global field (hierarchical, deterministic nesting).
7. **Multi-projection flat maps**: not covered by any `upstream/` repo in browser-ready form (a third-party library is the alternative, see D1).
8. **STL export** (small).
9. **Parameter-scale documentation** (what 0 / 1.0 / 1.5 means for each parameter).
10. **Dynamic population, settlement growth, trade and borders over time** (static versions exist in Azgaar).
11. **Physical-parameter to simulation-parameter mapping** (glue between VPLanet-style inputs and orogen's sliders).
12. **Continuous seasons, real lake/basin hydrology, and dynamical ocean currents**: partial coverage only, with rule-based or heuristic versions in orogen.
13. **Provenance logging tooling** (trivial).

## Expanded scope (2026-10-13, ARCHITECTURE.md Q12–Q13)

Q12 lifted licence restrictions and Q13 widened the scope to every domain in `docs/REQUIREMENTS.md`. This section re-decides the picks that licences had decided and maps the new domains to the audited upstreams. Ratings and paths come from the per-repo audits; they were not re-verified against source in this pass (`upstream/` was not checked out at the time). Rows for the repos covered by `docs/reconciliation/` have since been checked and corrected.

### Picks re-decided after Q12

| Capability | Before Q12 | After Q12 | Note |
|---|---|---|---|
| Plate kinematics and reconstruction | GPlates as math reference; formulas re-implemented | **Port GPlates** `src/maths` (finite rotations, quaternions, interpolation) to TypeScript; `src/app-logic/Reconstruction*` is a reference only (group 1 G3: it depends on the feature model, and note 13 needs one total rotation per plate, not a plate circuit) | 13 |
| River channel routing (time-varying discharge) | Azgaar topology only; WRF-Hydro excluded | Azgaar topology + **WRF-Hydro** reach-based Muskingum–Cunge (`SUBMUSKINGCUNGE`) and level-pool lake outflow (`LEVELPOOL_PHYSICS`) as a Phase 7 port candidate; its diffusive wave is a gridded option | 12 |
| Economics (markets, firms, credit) | Original code; Eurace excluded | **Eurace** goods-market and decision rules as the candidate core for Phase 13b | 1 |
| Vegetation and soil water | LPJmL as algorithm reference (AGPL) | **Port LPJmL** core | 4, 25 |
| Species dispersal | RangeShiftR concepts | **Port RangeShiftR** core for the fine tier | 26 |

### New domains → upstreams

| Domain | Pick | Others | Note |
|---|---|---|---|
| Stars, orbits, moons, tides | **VPLanet** DistOrb, DistRot, EqTide, Stellar (port) | — | 20 |
| Mantle, heat flow, magnetic field | **VPLanet** ThermInt, RadHeat (port) | ASPECT (rheology parameters, `dynamic_core.cc` core evolution; dynamic topography only as a formula reference, since it needs the FEM stress field), tectonics.js (isostasy) | 21 |
| Ice sheets, glaciers, sea level | **PISM** SIA/SSA formulations, exact solutions A–D (port as golden values) and `src/earth/` bed deformation, as references for a new SIA solver on the sphere (PISM's code is PETSc on a regular projected grid) | CTSM snow and glacier formulations (its `GlacierSurfaceMassBalanceMod.F90` only books melt and accumulation from the full energy balance), VPLanet POISE ice, orogen glacial erosion | 22 |
| Ocean circulation | **MOM6** formulations (new solver on the sphere); its Roquet polynomial EOS, tidal astronomy and analytic gyre winds port as closed forms | orogen `ocean.js` (parity), MARBL (productivity rate laws for a per-cell proxy; the full model needs 3D prognostic tracers) | 23 |
| Coasts, deltas, sediment | **Delft3D** sediment-transport formulas (van Rijn 1984/1993/2004, Bijker, Soulsby; `src/utils_gpl/morphology/packages/morphology_kernel/src/`). Its wave engine is a SWAN driver (reference only); landform rules are new | Badlands | 23 |
| Groundwater | **ParFlow** formulations (van Genuchten/Haverkamp closed forms; the Richards solver as a reference) | CTSM hydrology (water table and TOPMODEL-style baseflow, `src/biogeophys/SoilHydrologyMod.F90`) | 12 (no groundwater design yet; an extension of note 12 from these two sources is written before stage 7g, ARCHITECTURE.md Phase 7) |
| Atmosphere dynamics, paleoclimate | New, from published models | VPLanet POISE (paleo EBM), CAM formulations from the published literature (CESM's checkout holds no CAM code or science documentation); candidates ModelE/ROCKE-3D | 24 |
| Vegetation, fire | **LPJmL** (port) | CTSM CNDV and fire | 25 |
| Fauna, ranges | **RangeShiftR** (port) | SLiM spatial maps, GAMA, FLAMEGPU2 | 26 |
| Evolution | New; **SLiM** concepts | RangeShiftR traits; candidate gen3sis | 27 |
| Hazards | New, from published statistics | Delft3D D-Flow FM (surge, as a shallow-water reference; no tsunami code), orogen stress | 28 |
| Disease | New (metapopulation SEIR) | FLAMEGPU2, GAMA, SLiM examples | 29 |
| Prehistory, dispersal | New | SLiM, GAMA, LIAM2, SongsOfFOSS migration | 30 |
| Technology | New | SongsOfFOSS, Eurace capital vintages | 31 |
| Religion, ideology, culture | New | Azgaar t0, UrbanSim logit, SongsOfFOSS, SLiM | 32 |
| Characters, dynasties, chronicle | New | SongsOfFOSS succession and coups, Azgaar names | 33 |
| Town and city plans | Candidate: watabou TownGeneratorOS | UrbanSim, PostGIS geometry, Godot geometry | 34 |
| Cartography and map art | **Azgaar** relief placement (`generators/relief-generator.ts`), coastline (`generators/coastline-generator.ts`, `renderers/coastal-waves.ts`), river paths, label path fitting and the seeded label-overlap solver (`controllers/label-spread.ts`, MIT, DOM text measurement to replace); **QGIS** hillshade renderer (`core/raster/qgshillshaderenderer.cpp`, incl. multi-directional) and **PAL** label placement (`core/pal/`, FALP + chain search; needs GEOS replaced); rule-based styles as design | CesiumJS slope/aspect/contour materials and imagery colour adjustments, orogen colour maps; candidates mapgen4, mewo2/terrain | 18, 19 |
| Editing, undo, plugins | New | Godot undo-redo and plugins (concept references; not a serialisable log), Azgaar editors (behaviour reference; no edit log of its own), QGIS Processing, SLiM Eidos | 16, 37 |
| Parameter registry | New, after **MARBL** settings registry (its metadata fields and ordered categories; MARBL has no ranges or generated documentation and declares each parameter twice) | orogen config and sliders (15 sliders, about 446 constants), Azgaar options (reference only; its zod schema `components/options-schema.ts` is the closest analogue), MESSAGEix (index-set structure only) | 17 |
| Earth test datasets | Downloaded at tuning time (Q8) | orogen tuning harness | 15 |

### Candidate upstreams to audit

These are not in `upstream-manifest.json` yet. Each needs an audit in `audit/` (same template as the others) before it is used. Each audit is now a Prerequisite line of the phase in the last column (ARCHITECTURE.md §7); for the datasets the prerequisite is to record their access route and licence.

| Candidate | Why | Note | Audit before |
|---|---|---|---|
| watabou TownGeneratorOS (Medieval Fantasy City Generator) | Town layouts: wards, walls, streets | 34 | Phase 11b |
| redblobgames mapgen4 | Painterly terrain rendering, fast interactive maps | 18 | **Audited 2026-10-19 (Phase 5c): `audit/mapgen4.md`.** Apache-2.0, in the manifest; reference only, no pick displaced; depth-edge relief outline is the idea to borrow |
| mewo2/terrain (Martin O'Leary) | Fantasy map style and label placement | 18 | **Audited 2026-10-19 (Phase 5c): `audit/mewo2-terrain.md`.** MIT, in the manifest; greedy placement does not beat Azgaar `label-spread.ts`; style reference only |
| gen3sis | Eco-evolutionary simulation on paleo-landscapes | 27 | Phase 9d |
| GISS ModelE / ROCKE-3D, ExoCAM | Exoplanet and paleoclimate GCMs | 24 | Phase 8b |
| FastScape | Fast landscape evolution (couples with ASPECT) | erosion, 21 | Phase 7 |
| CC0 map-asset packs (symbols, textures, fonts) | Asset library | 19 | Phase 10b |
| Glottolog, Seshat, HYDE (datasets) | T4 Earth tests | 15 | Phase 18 |

## License and risk notes

**Since 2026-10-13 (ARCHITECTURE.md Q12), licences do not restrict use:** MapMaker is a personal, non-commercial project. The flags below are kept as a record, not as rules.

| Repo | License (verified in audits) | Flag |
|---|---|---|
| orogen | GPL-3.0 | Core of the plan. |
| Azgaar | MIT | Code only. The bundled heraldry charges (`public/charges/`, 338 SVGs), relief symbols and icons have **no documented licence** (group 6a); verify before bundling. No OGL content. |
| VPLanet | MIT | Verified (`LICENSE`). |
| Badlands | GPL-3.0 | Root `LICENSE` and `pyproject.toml` say GPL-3.0; `COPYING.LESSER` and the two files with headers (`model.py`, `__init__.py`) say LGPL-3.0-or-later; the rest point to a missing `LICENSE.md`. Recorded as GPL-3.0; the manifest entry now notes the LGPL headers (2026-10-18). |
| GPlates | GPL-2.0-only | Verified: `COPYING` preamble says "version 2 ... not any later version". Incompatible with GPL-3.0; was math reference only, may be ported since Q12. |
| QGIS | GPL-2.0-or-later | Verified (group 6a): `COPYING` is the GPL-2 text, but source headers say "version 2 … or (at your option) any later version". The PAL label engine (`src/core/pal/`) is **GPL-3.0-or-later** (libpal, HEIG-VD). Both may be included in GPL-3.0-only MapMaker. |
| CesiumJS | Apache-2.0 | Includes the §3 patent grant. `LICENSE.md` appends 44 third-party entries (NVIDIA FXAA custom terms, OFL font, CC-BY example icons) and lists Cesium patents. |
| LPJmL, FLAMEGPU2 | AGPL-3.0 | Network-copyleft. |
| Eurace | custom EULA | **Do not extract** without legal review. Owner-controlled modification and redistribution (verified in `LICENSE.md`). |
| WRF-Hydro | custom UCAR | **No sale/licensing for a fee of the Software or any work containing it** (verified in `LICENSE.txt` section 1, lines 6–7). Blocks any commercial use; recorded, not enforced, since Q12. `src/Rapid_routing/` is BSD-3-Clause. |
| Delft3D | multi-license | Verified per component: `utils_gpl` (including the morphology formulas) GPL-3.0-only, D-Flow FM AGPL-3.0, `utils_lgpl` LGPL-2.1, SWAN GPL-2.0-or-later; Apache-2.0 only in third-party code. The manifest entry, formerly an incomplete "LGPL-2.1, Apache-2.0, others", now records this breakdown (2026-10-18). |
| CESM, CTSM, MARBL | UCAR, custom | Verified (group 3): CESM's `LICENSE.txt` is a copyright notice, disclaimer and component table with no permission grant, and no CESM code is checked out; CTSM is an NCSA-style grant with three conditions; MARBL an MIT-style grant with two BSD conditions. The CESM and MARBL manifest entries, formerly "BSD-3-Clause-style", now say this (2026-10-18). |
| MOM6 | Apache-2.0 | Verified (`LICENSE`, SPDX headers). Its GSW-Fortran and CVMix submodules are empty, so their licences are unchecked. |

Combined work: the recommended core mixes GPL-3.0 (orogen, Badlands-derived), MIT, GPL-2.0 (GPlates-derived) and Apache-2.0. Per the brief this is ignored for now, but the combined output would effectively be GPL-3.0, and GPL-2.0-only code could not be included under the old rules; since Q12 this is recorded, not enforced.

## Repos with nothing to extract (reference or skip)

ASPECT, CESM (empty checkout), CTSM, Delft3D, MARBL, MOM6, ParFlow, PISM, WRF-Hydro (HPC Fortran/C++, no browser path; physics references only, except small closed-form pieces: WRF-Hydro's channel-routing and level-pool kernels, PISM's exact solutions, Delft3D's transport formulas, MOM6's polynomial EOS and tidal astronomy, CTSM's pedotransfer and baseflow formulas, MARBL's productivity rate laws), MESSAGEix, Eurace, LIAM2, OpenSpiel, FLAMEGPU2, Godot, SLiM, GAMA, RangeShiftR, UrbanSim (domain mismatch or unportable; design references only). QGIS and PostGIS offer ideas and algorithm references (projection handling, terrain filters, geometry) but depend on PROJ/GDAL/GEOS, which are not present; QGIS's hillshade formulas and the PAL placement algorithm are the portable exceptions (group 6a).

## Decisions for you

- **D1. Projections.** Use third-party `d3-geo`/`d3-geo-projection` or `proj4js` (not in `upstream/`), or hand-write the major projections from GPlates/PROJ formulas? I recommend a library, since a hand-rolled version of the inverse transforms is where bugs hide.
- **D2. Is the requirements' orogen-projection claim a wrong assumption to correct in `REQUIREMENTS.md`?** I did not touch it, per the read-only rule.
- **D3. Spherical mesh vs Azgaar's planar grid.** Azgaar's human-layer generators run on a planar Voronoi grid; orogen's mesh is spherical. Adapting them is the main integration risk, and I haven't prototyped it.
- **D4. Fast/slow pass split**: orogen as the fast preview and a Badlands-style stream-power pass as the slow detailed run. This is my recommendation; it is not validated.
