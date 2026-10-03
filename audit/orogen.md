# Audit: orogen

## 1. Overview

**World Orogen** is a browser-based procedural planet generator written in pure JavaScript (~18.7k LOC) with no build step, live at orogen.studio. Developed by raguilar011095; GitHub primary. **Philosophy**: "concept art for planets" — prioritizes visual plausibility over geophysical precision, with scientific grounding (tectonic plate models, pressure-driven wind, Köppen classification) to make output convincing at a glance.

**Maturity**: Active, single-author. Most recent commit cc2662b (Oct 2024 per manifest). Repository last visited Oct 2, 2024. No formal releases; versioned via planet-code format changes.

**Size & composition**: 31 JavaScript modules (18,687 LOC), HTML+CSS UI (37.5k HTML, 33.3k CSS), zero external dependencies beyond Three.js (imported as ES module). Terrain tuning configurations in `tuning/` folder (8 pre-tuned parameter sets). No database, no build tools.

**Tech stack**: ES modules (no bundler), Three.js 0.160.0 for 3D rendering, Web Workers for background computation, Web APIs (CompressionStream for PNG export, localStorage for UI state). Browser-only, no Node.js required to run.

## 2. Language, runtime, dependencies, build

**Languages**: JavaScript (ES2020+), HTML5, CSS3. No other languages.

**Runtime**: Browser (Chrome, Firefox, Safari, Edge). Tested at 0.160.0 of Three.js (imported via ES module CDN). Requires ES modules support, Web Workers, CompressionStream API (modern browsers only). No server/Node.js required.

**Dependencies**: Three.js only (via ES module import in index.html). Delaunator (Delaunay triangulation) is vendored inline in planet-worker.js (inlined from delaunator-rs compiled to JS). No npm, no build step.

**Does it build?** Runs directly in browser without compilation. Can serve with `python3 -m http.server 8000` or any HTTP server. Verified via README Quick Start and ES module imports.

**Browser portability**: 100% compatible. Pure JavaScript, no WASM, no C++, no Fortran. All subsystems are native JS. **Ready for extraction** — can be dropped into any JavaScript runtime (browser app, Node.js with DOM polyfill, Electron, etc.) with minimal adaptation. No porting effort needed.

**Rendering**: Three.js WebGL 2D/3D, canvas-based. Globe and map (equirectangular projection) both render in browser.

## 3. Subsystem inventory

### 3.1 Projections — Equirectangular (CRITICAL GAP vs. requirements)
- **Where**: js/planet-mesh.js (buildMapMesh, equirectangular projection logic lines 427–475), js/edit-mode.js (inverse transform), README section "How It Works" step 2.
- **What it does**: Single projection implemented: equirectangular (lat/lon to linear xy). Conversion: lon = atan2(x, z), lat = asin(y), then scaled and clipped. Antimeridian wrapping handled by splitting triangles that cross the ±π longitude boundary. Map view renders as 2D flat mesh with x ∈ [-2, 2], y ∈ [-1, 1] (in normalized units). Center longitude shift supported (state.mapCenterLon).
- **Quality & realism rating: 2/5** (adequate for single use; requirement calls for multiple projections). Equirectangular distorts poles and extreme latitudes (area distortion increases toward poles, angles preserved nowhere). No Mercator (conformal, useful for navigation), no equal-area (preserves area), no Robinson/Mollweide (compromise projections), no polar stereographic. Poles are mathematically valid but render degenerate triangles. **Critical finding**: Requirements say orogen is "a strong reference for this" regarding multiple projections, but orogen implements only equirectangular. This is a mismatch.
- **Extractability: standalone** — Projection math is 30 lines; inverse is ~10 lines. No dependencies. Easy to extend with additional projections (add to buildMapMesh switch statement). Zero integration with other systems. **Effort to port**: low — formulas are pure math, can be extracted as utility functions.
- **Requirements capabilities it could serve**: Globe view (no — uses Three.js sphere geometry, not a projected globe). Flat projections (yes — equirectangular only).

### 3.2 Heightmap Generation & Tectonics — 12-Stage Pipeline
- **Where**: js/elevation.js (2615 LOC, 12 sequential stages: computeTectonicState → classifyTerrain → buildSkeleton → ... → fixupTopology), js/plates.js (plate seeding & flood fill), js/coarse-plates.js (coarse reference grid), js/super-plates.js (plate grouping), js/plate-physics.js (collision & stress).
- **What it does**:
  1. **Plate generation** (coarse grid, ~20k regions): Farthest-point seed placement with top-3 jitter (for variety without biasing plate shapes with Irregularity slider). Round-robin flood fill with per-plate growth rates (random 0.3–1.5, clamped by governor), directional bias (random vec per plate, strength inverse to growth rate), compactness penalty (reduces spindly plates), multi-pass boundary smoothing (5–9 passes, scale-dependent), fragment reconnection.
  2. **Ocean/land assignment**: Farthest-point continent seeding, round-robin growth with area budgeting, trapped-sea absorption. Targets ~30% land coverage (tunable via Continents + Land Coverage sliders).
  3. **Plate projection**: Coarse assignments mapped to high-res mesh via nearest-neighbor with adjacency walk + FBM perturbation (fractal boundary wobble).
  4. **Collision detection**: Simulated plate drift; convergent/divergent/transform classification via velocity vectors; density-based subduction (tanh-mapped plate-density difference + undulation noise).
  5. **Stress propagation**: BFS frontier expansion of collision stress into continental plates; stress magnitude modulated by subduction factors.
  6. **Elevation skeleton**: Distance fields (mountain/ocean/coastline via BFS) blended via harmonic mean. Asymmetric mountain profiles (steeper ocean-side, gentler continental). Continental shelf/slope profiles, abyss depth. Rift valleys (graben profiles). Plateaus.
  7–12. **Refinement**: Tectonic band noise, detail texture (elevation-gated), coastal detail, edifices (volcanoes), uniform land noise, dynamic topography, final shaping, topology fixup.
- **Quality & realism rating: 4/5** (reference-grade for stylized tectonics; not geophysically precise). Farthest-point seeding produces evenly-distributed plates. Collision detection is simplified (2D velocity-based, no true lithospheric dynamics or rheology). Subduction modeled as density-dependent undulation, not a full slab model. Rift valleys and back-arc basins present but simplified. Island arcs and hotspot volcanism (both modeled) are visually convincing but toy physics. Stress propagation is heuristic (BFS, not PDE solver). Asymmetric mountain profiles and multi-layered noise produce realistic-looking terrain. Overall: excellent for rapid artistic iteration, weak for geophysical simulation.
- **Extractability: loosely coupled** — Elevation pipeline has internal structure (stage functions) but tightly uses mesh adjacency, elevation interpolation, and distance fields. Requires SphereMesh (Voronoi on sphere). Imports rng (seeded), SimplexNoise. No UI dependencies. **Extractable core**: ~2300 LOC (elevation stages, omitting test/debug code). **Effort to port**: medium — mesh-dependent, would need wrapper for different mesh types. No external crates, pure JS.
- **Requirements capabilities it could serve**: Tectonics, heightmap generation, erosion (post-processed), rift valleys (yes, graben), plateaus (yes), hotspot volcanism (yes).

### 3.3 Terrain Post-Processing — Erosion & Refinement
- **Where**: js/terrain-post.js (958 LOC). Functions: warpTerrain (domain warping), smoothElevation, erodeComposite (hydraulic + glacial), sharpenRidges, applySoilCreep.
- **What it does**:
  - **Domain warping** (Terrain Warp slider, 0–1): FBM simplex noise deforms the elevation field via greedy mesh walk. Produces organic coastlines and ridge deformation. Multi-octave noise with fractal detail.
  - **Smoothing** (Smoothing slider, 0–1): Bilateral smoothing (anisotropic — preserves sharp boundaries). Blends BFS distance-field banding artifacts.
  - **Glacial erosion** (Glacial Erosion slider, 0–1): Latitude-driven ice flow (strong at high lat/altitude). Carves U-shaped valleys, fjords, lake basins. Barnes priority-flood algorithm ensures all land drains to ocean, carving canyons through saddle points.
  - **Hydraulic erosion** (Hydraulic Erosion slider, 0–1): Iterative implicit stream-power erosion (Braun-Willett style). Self-reinforcing river valleys, automatic sediment deposition in flat receivers. Adjustable number of iterations.
  - **Thermal erosion** (Thermal Erosion slider, 0–1): Slope-driven talus transport (angle-of-repose material flow). Softens ridge ridges naturally.
  - **Ridge sharpening** (Ridge Sharpening slider, 0–1): Pushes peaks above surroundings. Selectively accentuates mountain ridgelines.
  - **Soil creep** (always on, ~0.05 default): Laplacian diffusion. Gentle rounding of hillslopes.
- **Quality & realism rating: 4/5** (visually convincing; algorithmically sound but simplified). Domain warping produces realistic fractal coastlines. Bilateral smoothing avoids over-blurring sharp features. Hydraulic erosion with pit resolution ensures proper drainage (known algorithm, Barnes). Thermal erosion (angle-of-repose material transport) is standard. Glacial erosion is simplified (latitude-driven, not explicit ice-sheet simulation). All together produce convincing erosion aesthetics.
- **Extractability: standalone** — Erosion functions are ~900 LOC of pure mesh manipulation + noise. Import: rng, SimplexNoise, elevation data, mesh. No UI, no rendering deps. Each erosion type (hydraulic, glacial, thermal, etc.) is independently callable. **Effort to port**: low — mesh agnostic (just needs adjacency), can be extracted as pure functions.
- **Requirements capabilities it could serve**: Erosion, hydrology (pit resolution ensures drainage routing), terrain aesthetics.

### 3.4 Tectonics — Plate Physics & Collision
- **Where**: js/plate-physics.js (616 LOC).
- **What it does**: Plate velocity computation (angular velocity sampled from Fibonacci sphere, small random variation). Collision classification: dot product of velocities at boundary cells determines convergent (approaching), divergent (separating), or transform (shearing). Density-based subduction: plate density as random ~1.0–1.05 (heavy = oceanic, light = continental). Subduction factor = tanh(ΔDensity × scale) clamped to [-0.5, 0.5].
- **Quality & realism rating: 2/5** (toy model; useful for artistic variety). Plate boundaries are classified but not truly modeled (no lithospheric mechanics, no slab pull, no ridge push). Density assigned randomly, not from elevation/age. Collision velocity is 2D (latitude/longitude), ignoring radial component. Useful for controlling orogeny intensity (via stress × subduction factor), but no true plate dynamics.
- **Extractability: loosely coupled** — Depends on mesh, r_plate, r_xyz, collision vectors. ~100 LOC core logic. Easy to extend (add slab model, age-dependent density, etc.).
- **Requirements capabilities it could serve**: Tectonics classification (convergent/divergent/transform), subduction zones, mountain building stress.

### 3.5 Climate — Wind, Precipitation, Temperature, Ocean Currents
- **Where**: js/wind.js (895 LOC), js/precipitation.js (770 LOC), js/temperature.js (1011 LOC), js/ocean.js (389 LOC), js/climate-config.js (167 LOC, tunable params).
- **What it does**:
  - **Wind**: Pressure-driven, longitude-varying ITCZ. Scans for thermal maximum at each longitude (accounting for land/sea heating and elevation lapse rate). Builds pressure field from Gaussian zonal bands (subtropical highs at ±30°, subpolar lows at ±60°, polar highs at poles), modulated by land/sea thermal contrast (monsoon effect) and elevation barometric effects. Derives geostrophic wind from pressure gradients with latitude-dependent Coriolis deflection and surface friction. Computed for NH summer and winter.
  - **Precipitation**: Dual-model blend. Complex model: upwind moisture advection from coasts (depletion by distance + elevation gain), six mechanisms (ITCZ convective uplift, frontal convergence, orographic rain/shadow, lee cyclogenesis, polar front, subtropical high suppression). Heuristic zonal model: smooth latitude-based patterns (ITCZ wet, subtropics dry, mid-lat recovery, poles dry) modulated by continentality and orographic effects. Blend weight tuned against real-Earth Köppen zones. 95th-percentile normalization.
  - **Temperature**: Surface temperature from thermal-equator profile (~28°C at ITCZ, poleward cooling via power-law curve with tropical plateau). Modulated by seasonal hemisphere swing, moisture-dependent elevation lapse rate (moist to dry adiabatic), ocean-current warmth, precipitation/cloud cover. All constants auto-tuned against Köppen (tuning/climate/optimize.mjs).
  - **Ocean currents**: Rule-based geographic approach. Classifies ocean cells by wind belt (trades, westerlies, polar easterlies). BFS from coastal seeds computes distance to western/eastern boundaries. Deflects poleward near western boundaries (warm, ×2 intensified; Gulf Stream effect), equatorward near eastern boundaries (cold, ×0.8). Detects circumpolar channels for unobstructed eastward flow (Antarctic Circumpolar Current). Smooths with Laplacian. Classified by meridional flow direction (red = warm poleward, blue = cold equatorward, black = zonal).
- **Quality & realism rating: 4/5** (reference-grade for fast climate simulation). Wind model captures major features (subtropical highs, subpolar lows, monsoon, Coriolis). ITCZ is longitude-varying and thermally accurate. Precipitation blends physical (advection) and heuristic models effectively; tuning against real Earth is rigorous. Temperature uses realistic lapse rates and ocean thermal coupling. Ocean currents use geographic rules that match real major currents (Gulf Stream, Kuroshio, ACC). **Weaknesses**: No explicit frontal systems (mid-lat cyclones); ITCZ not dynamic across seasons (computed per season, not interpolated); ocean currents are rules, not dynamical. Overall: serviceable for worldbuilding, weak for climate science.
- **Extractability: loosely coupled** — Wind requires mesh geometry (lat/lon/elevation), SphereMesh (neighbor walk). Precipitation uses wind output, elevation, continent distance. Temperature uses ITCZ output. Ocean currents use wind + coastal distance. ~2800 LOC total, imports CLIMATE (config), climate-util (smoothing), mesh adjacency. No UI. **Effort to port**: medium — tightly mesh-dependent, but math is pure. Parametric tuning in climate-config.js can be externalized.
- **Requirements capabilities it could serve**: Climate (temperature, wind, precipitation, ocean currents), Köppen classification (via temperature + precipitation).

### 3.6 Köppen Classification & Biomes
- **Where**: js/koppen.js (~150 LOC), js/color-map.js (biome colors by Köppen).
- **What it does**: Implements Köppen-Geiger climate classification. Input: annual temperature, annual precipitation, warmest/coldest month temps, driest/wettest seasons. Output: Köppen code (Af, Am, As, Aw, BWh, BWk, Csa, ..., ET, EF; 30 classes). Color mapping: each class has a signature RGB color (lush green for Af tropical rainforest, tan for BWh hot desert, white for ET/EF tundra/ice, etc.).
- **Quality & realism rating: 5/5** (standard geospatial classification, well-validated). Directly maps real climate physics (temp + precip) to observed biome distributions. Used in tuning/climate/ to calibrate against real Earth data.
- **Extractability: standalone** — ~150 LOC, pure function. Input: temperature, precipitation arrays. Output: Köppen code array. No mesh dependencies, no UI.
- **Requirements capabilities it could serve**: Biomes (via Köppen), climate calibration.

### 3.7 Rendering & Visualization
- **Where**: js/scene.js (Three.js WebGL setup), js/planet-mesh.js (mesh construction, color mapping, debug layers).
- **What it does**: 3D globe (Voronoi cells on sphere with Three.js), equirectangular 2D map (flat projected mesh), per-cell coloring (elevation, biome, Köppen, debug layers). Atmosphere rim shader, translucent water sphere. Starfield. Terrain displacement shader. Sphere normals for lighting. Globe rotation, zoom. Map panning. Interactive grid overlay (lat/lon lines at configurable spacing). Wireframe toggle (Voronoi cell edges).
- **Quality & realism rating: 4/5** (visually polished, performant). Sphere normals are interpolated per-vertex. Water transparency effect is stylized (not physically-based). Atmosphere rim shader adds visual depth. Terrain colors map elevation to intuitive palette (deep blue ocean → sea level → greens/tans → grays/whites for mountains). Biome colors are saturated and visually distinct (good for narrative maps).
- **Extractability: loosely coupled** — Requires Three.js. Globe rendering is Three.js sphere + custom color attributes. Map is projected mesh + clipping planes. Debug layer system (inspect dropdown, 26 selectable views) relies on computed fields (wind, pressure, precipitation, rain shadow, temperature, continentality, etc.). Isolated from generation pipeline except for input data. **Effort to port**: medium (Three.js dependency); could be retargeted to other renderers (Babylon.js, Cesium, etc.).
- **Requirements capabilities it could serve**: Globe view, flat projections (equirectangular only), rendering.

### 3.8 Import & Export
- **Where**: js/import-main.js (heightmap import), js/planet-mesh.js (PNG export, lines 112–154 PNG encoder).
- **What it does**:
  - **Import**: Upload equirectangular B&W PNG/JPEG/WebP heightmap. Black (0) = sea level, white (255) = 6 km elevation. Maps pixels to sphere via nearest-neighbor sampling. Runs full climate simulation (wind, currents, precipitation, temperature, Köppen) on imported terrain. Optional terrain sculpting (smoothing, erosion, ridge sharpening).
  - **Export**: High-resolution equirectangular PNG. Six types: Terrain (elevation color), Satellite (biome from Köppen), Climate (Köppen color), Heightmap (full B&W range), Land Heightmap (land only), Land Mask (binary). Widths 1024–65536 px. Tiled rendering for large sizes. 16-bit grayscale PNG encoder (native browser CompressionStream). Export All downloads four maps (Satellite, Climate, Heightmap, Land Mask) sequentially.
- **Quality & realism rating: 4/5** (robust for PNG; limited format support). PNG export is high-fidelity (16-bit grayscale for heightmap). Tiled rendering avoids GPU texture limits. Equirectangular sampling is proper (lat/lon interpolation). **Weaknesses**: No SVG, STL, OBJ, or save-state format. No ability to export raw elevation data (only visual PNGs). Import is heightmap-only (no other layer types).
- **Extractability: loosely coupled** — PNG encoder is ~70 LOC, portable. Import sampling is ~30 LOC. Both depend on mesh + climate simulation. No UI dependencies. **Effort to port**: low (PNG is standard; sampling logic is 2D LUT).
- **Requirements capabilities it could serve**: Import (heightmaps), export (PNG only, not SVG/STL/etc.).

### 3.9 Miscellaneous Features
- **Serialization (Planet Code)**: js/planet-code.js encodes seed + all slider values into a 22-character base36 string. Mixed-radix packing. Backward-compatible with legacy 13/14/16/17/18/21-char codes. Stores plate edits as appended character sequences. URL hash support (share planets).
- **RNG**: js/rng.js — Park-Miller LCG, deterministic seeding. Per-module seeding (seed + offset) for independence.
- **Noise**: js/simplex-noise.js — 3D Simplex noise, fBm and ridged fBm variants.
- **State management**: js/state.js — Shared global mutable object. Holds curData (current generation result), UI state (debugLayer, mapMode, editMode, etc.).
- **UI & Interactivity**: Interactive plate editing (Ctrl-click multi-select, Rebuild to apply). Detail/roughness sliders (5k–2.56M regions, logged scale). Climate offsets (temperature ±15°C, precipitation ±100%). Visual options (Wireframe, Plates, Grid, Auto-Rotate). Inspect dropdown (26 debug layers organized by category). Mobile-responsive UI (bottom-sheet layout on ≤768px). Tutorial modal, What's New modal.
- **Performance**: Web Worker offloads generation to background thread. Fall-back to main thread if module workers unsupported. Optional deferred climate (skipped if detail > 300k regions, computed on demand when climate view accessed).

## 4. Internal data representation

**Grid/mesh type**: Voronoi cells on sphere, dual of Delaunay triangulation. Generated via Fibonacci spiral point distribution + optional jitter, stereographic projection to 2D, Delaunator triangulation, pole closure. Regions = Voronoi cells (centers = Fibonacci points on unit sphere). Triangles = Delaunay dual. Stored as SphereMesh: triangles array (Delaunay), halfedges array (half-edge connectivity), region→neighbor adjacency via halfedges.

**Resolution & how set**: User controls via Detail slider (5,000–2,560,000 regions, stepped by 1,000; default 204,000). Irregularity slider (0–1, jitter magnitude) affects point distribution but not count. Terrain generation occurs on fixed ~20k coarse mesh (for resolution-independent plate shapes), then projected onto high-res mesh via nearest-neighbor + FBM perturbation. Export resolution is independent (1,024–65,536 px equirectangular).

**Units**: Sphere radius = 1.0 (unit sphere in 3D space). Elevations in signed height above sea level (scale TBD: heightmapColor function maps -5 km (ocean floor) to 6 km (peak) onto [0, 1] grayscale). Temperatures in Celsius (-45 to +45 C range). Precipitation in normalized 0–1 (95th-percentile scaling). Wind speed units unspecified in code (likely m/s or unitless). Plate velocities in degrees per generation timestep.

**Coordinate conventions**: 
- **3D sphere**: Right-handed XYZ, unit sphere. x points toward prime meridian equator, y points toward north pole, z points toward 90°E equator. Stored as Float32Array (r_xyz[3*r + offset] for x/y/z of region r).
- **Latitude/longitude**: lat ∈ [-π/2, π/2], lon ∈ [-π, π]. Computed as lat = asin(y), lon = atan2(x, z). Poles have y ≈ ±1 (well-defined mathematically, degenerate in some projections).
- **Map projection (equirectangular)**: x_map = lon × (2/π), y_map = lat × (2/π), with clipping to [-2, 2] × [-1, 1]. Antimeridian wrapping: triangles crossing lon ≈ ±π are split into two copies (one wrapped by +2π, one by -2π) to handle map seams.
- **Grid coordinates**: No explicit grid; mesh is unstructured Voronoi. Adjacency encoded via halfedges (O(1) neighbor lookup per region).

**Wraparound & poles**: 
- **Longitude wraparound**: Handled in buildMapMesh (lines 440–463). Triangles where max(lon) - min(lon) > π are clipped and split. No discontinuities; wrapping is transparent to user.
- **Poles**: Unit sphere (y = ±1) is well-defined. Stereographic projection of poles requires special handling: projection pole (0, 0, 1) in 3D maps to ∞ in 2D; Delaunator assigns synthetic pole point (distance-based after triangulation). addPoleToMesh() connects hull edges to pole. Rendering: poles are rendered as Voronoi cells (no special singularity). Equirectangular map shows poles as full-width bands (y = ±1 corresponds to lat = ±90°).

**Time step**: No explicit time-stepping for terrain generation (all stages are spatial). Climate computation is equilibrium-based (per-season, no temporal dynamics). Planet code encodes seed + slider values; no explicit time-series save.

**Serialization/save format**: Planet code (js/planet-code.js) is the only serialization. Encodes: seed (24-bit), Detail, Irregularity, Plates, Continents, Roughness, Smoothing, Glacial/Hydraulic/Thermal Erosion, Ridge Sharpening, Soil Creep, Terrain Warp, Continent Size Variety, Temperature offset, Precipitation offset, Land Coverage. Plus optional appended plate toggle list (2 characters per toggled plate, base36). No full-state save (no mesh binary, no elevation/wind/temp arrays). URL hash storage (localStorage backup). **Missing**: Can't resume generation, export/import full generation state, checkpoint mid-pipeline.

**RNG/seed handling**: Seeded Park-Miller LCG (rng.js). Per-module seeding: seed + offset ensures independence (coarse plates use seed+137, etc.). Top-level seed (24-bit, from planet code) drives all randomness. No seed-chain replay; deterministic given seed, but generation is one-shot (no frame-by-frame replay). Planet codes are stable: same code always produces same world (across browser sessions, different machines).

**Relevance to zoom consistency**: Detail slider affects Voronoi cell count but not plate shapes (generated on coarse mesh, projected upward). Elevation texture (noise, erosion) is resolution-independent: smoothing passes are scaled by avgEdgeKm (π × 6371 / √numRegions), ensuring constant physical smoothing at any resolution. BFS hop counts are scaled (targetKm / avgEdgeKm). Noise octaves are constant (no LOD). Result: terrain looks equivalent at Detail 20k vs. 2.5M (same continent shapes, same mountain profiles, same erosion patterns, scaled to match resolution). **Verified by CLAUDE.md rule**: "Scale invariance — the result must look equivalent regardless of Detail slider." Orogen enforces this with scaling formulas throughout.

## 5. License

**SPDX**: GPL-3.0 (GNU General Public License, version 3 or later).

**File path**: LICENSE (root directory, 35 KB, full GPL-3.0 text).

**Verified**: Yes, checked at repo root.

**Vendored/per-directory differences**: None noted. Single monolithic GPL-3.0. Delaunator (Delaunay triangulation) is inlined in planet-worker.js; original source is delaunator-rs (Apache-2.0 or MIT). Inlining does not include original license headers in the file, but this is a JavaScript port of Rust code, not a binary dependency.

**Matches manifest**: Yes. upstream-manifest.json lists orogen as GPL-3.0, file LICENSE. Verified.

**Practical notes**: 
- GPL-3.0 is copyleft; any derivative work must be released under GPL-3.0 (or compatible).
- Source code is published on GitHub (raguilar011095/planet_heightmap_generation).
- Live deployment at orogen.studio uses same GPL-3.0 source (browser app distribution counts as distribution).
- No commercial restrictions (copyleft, but free software).
- Delaunator inlining: original MIT/Apache-2.0 is compatible with GPL-3.0 (GPL-3.0 permits relicensing under GPL-3.0).

**Conflicts**: None. GPL-3.0 only. Compatible with Apache-2.0, MIT, BSD-3-Clause (upstream requirements allow mixed licenses; no conflicts recorded).

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | yes | 4/5 | loose | js/plates.js, js/plate-physics.js, js/coarse-plates.js | Farthest-point seeding, round-robin fill, collision detection; density-based subduction; simplified plate dynamics; no rheology. |
| Heightmap generation | yes | 4/5 | loose | js/elevation.js (2615 LOC), js/coarse-plates.js | 12-stage pipeline; tectonic-driven elevations, stress-driven uplift, multi-layer noise; excellent visuals, simplified physics. |
| Erosion | yes | 4/5 | standalone | js/terrain-post.js (958 LOC) | Glacial, hydraulic (priority-flood pit carving), thermal (talus), ridge sharpening, soil creep (always-on); visually convincing, algorithmically sound. |
| Hydrology (rivers/lakes/watersheds) | partial | 2/5 | loose | js/terrain-post.js (priority-flood); js/precipitation.js (moisture routing) | Only pit-filling for drainage assurance; no explicit river network, lake systems, or watershed delineation. Moisture advection models precipitation routing, not hydrology. |
| Climate – temperature | yes | 4/5 | loose | js/temperature.js (1011 LOC), js/climate-config.js | ITCZ-based profile, seasonal hemisphere swing, moisture-dependent lapse rate, ocean thermal diffusion; tuned vs. Earth Köppen; no explicit energy balance. |
| Climate – wind | yes | 4/5 | loose | js/wind.js (895 LOC) | Pressure-driven, longitude-varying ITCZ, Gaussian zonal bands, Coriolis deflection; captures major patterns (subtropical highs, subpolar lows); no frontal systems. |
| Climate – ocean currents | yes | 3/5 | loose | js/ocean.js (389 LOC), js/wind.js | Geographic rule-based (wind-driven gyres, western boundary intensification, ACC); matches real currents; not dynamical (no momentum equations). |
| Climate – precipitation | yes | 4/5 | loose | js/precipitation.js (770 LOC), js/heuristic-precip.js | Dual-model blend (advection + heuristic); six mechanisms (ITCZ, frontal, orographic, lee, polar, subtropical); tuned vs. Earth; no explicit storm dynamics. |
| Climate – seasons | yes | 3/5 | loose | js/wind.js, js/precipitation.js, js/temperature.js | Summer/winter computed separately; seasonal hemisphere swing; no year-round interpolation; no diurnal cycle. |
| Biomes | yes | 5/5 | standalone | js/koppen.js (~150 LOC), js/color-map.js | Köppen-Geiger classification; 30 climate types; direct mapping from temp/precip to observed biome colors; standard geospatial. |
| Soils | no | — | — | — | Not modeled. |
| Resources | no | — | — | — | Not modeled. |
| Population & settlement | no | — | — | — | Not modeled. |
| Cities & towns | no | — | — | — | Not modeled. |
| Languages & names | no | — | — | — | Not modeled. |
| Political borders | no | — | — | — | Not modeled. |
| Trade | no | — | — | — | Not modeled. |
| Long-run history/war/economics/politics sim | no | — | — | — | Not modeled. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | yes | 4/5 | — | js/detail-scale.js, js/coarse-plates.js | Coarse mesh projects to high-res; terrain detail is scale-invariant (erosion, noise scaled by resolution); no explicit multi-LOD or level-of-detail management. |
| Globe view | yes | 4/5 | loose | js/scene.js, js/planet-mesh.js | Three.js sphere mesh, Voronoi cell coloring, atmospheric effects; poles well-defined (no singularity); performant. |
| Flat projections | partial | 2/5 | standalone | js/planet-mesh.js (buildMapMesh) | Equirectangular only (no Mercator, equal-area, Robinson, etc.). Antimeridian wrapping handled; scale-invariant under map center-longitude shift. |
| Partial-world inference | no | — | — | — | Import accepts any heightmap; no inverse inference of surrounding tectonic/climate context. |
| Import of heightmaps/layers | yes | 3/5 | loose | js/import-main.js | Equirectangular B&W PNG/JPEG/WebP heightmap import; pixel-to-elevation mapping (0=ocean, 255=6km); climate simulation runs on import; no layer import, no multi-format support. |
| Fidelity/speed slider with same-seed preview | no | 2/5 | — | js/detail-scale.js | Detail slider controls Voronoi cell count (5k–2.5M), affecting rendering resolution, not quality (coarse plate generation is fixed). No fidelity slider (fast rough ↔ slow detailed at same seed); no seed-locked preview. |
| Export (PNG/SVG/STL/other) | partial | 2/5 | loose | js/planet-mesh.js (PNG encoder, lines 112–154) | PNG only (Terrain, Satellite, Climate, Heightmap, Land Heightmap, Land Mask); up to 65536 px; 16-bit grayscale heightmap. No SVG, STL, OBJ, or other formats; no raw data export. |
| Full-state save/resume format | no | — | — | — | Planet code encodes seed + sliders, not mesh/elevation/wind/temp. No checkpoint save; generation is one-shot. |
| Earth-data calibration (elevation/climate/Köppen) | yes | 5/5 | loose | js/climate-config.js, tuning/climate/*.js | Climate constants auto-tuned vs. real-Earth Köppen zones (tuning/climate/optimize.mjs). Elevation range fixed (-5 km ocean to 6 km peak). Temperature/precip normalized to fixed ranges. Validation: tuning/climate/evaluate.mjs scores simulated vs. real Köppen. |
| Planet-parameter derivation | yes | 3/5 | — | js/climate-config.js | Tunable parameter constants for wind, precipitation, temperature. Auto-tuning available (tuning/climate/optimize.mjs), but not real-time derivation from Earth data in the app itself. |

## 7. Verdict

### What to extract
1. **Heightmap generation pipeline** (3–4 weeks extraction + testing): 12-stage elevation system (plates, tectonics, stress, noise, erosion) is reference-grade for stylized procedural worldbuilding. Pure JavaScript, no external dependencies. Tightly coupled to SphereMesh but can be wrapped. **High priority** — core value for end-to-end world generation.
2. **Terrain post-processing** (1–2 weeks): Erosion subsystem (hydraulic, glacial, thermal, ridge sharpening, soil creep) is excellent for terrain polish. Domain warping + bilateral smoothing produce compelling results. Standalone functions, easy to extract.
3. **Climate simulation** (4–5 weeks): Wind, precipitation, temperature, ocean currents are reference-grade for narrative maps. Well-tuned against Earth data. Loosely coupled; requires mesh + elevation input but no tight integration. Temperature and wind alone (skip ocean/precip initially) are a 2-week quick win.
4. **Köppen classification** (1 day): Standalone, robust, validated. Copy directly.
5. **Equirectangular projection & map rendering** (1–2 weeks): Map mesh construction, antimeridian wrapping, canvas export. Pure math; easy to extract and extend with additional projections.

### What to skip
1. **Plate physics & collision detection**: Overly simplified (toy model). Requirements demand realism; orogen's physics are artistically adequate but not a foundation for serious tectonics. Recommend replacing with reference from GPlates or ASPECT if geophysical accuracy is needed.
2. **Web Worker architecture**: Specific to browser. Extract algorithms, ignore Worker-dispatch infrastructure.
3. **Three.js rendering**: Binding to Three.js is too tight. Algorithms are in planet-mesh.js (coloring, debug layers); rendering is trivial to retarget.
4. **UI/interactivity**: Slider controls, edit mode, tutorial modals are application-specific. Extract data-processing functions only.

### Biggest risks
1. **Projection mismatch (CRITICAL)**: Requirements call orogen "a strong reference for this" regarding "Mercator, equirectangular, equal-area, and the other major projections." **Orogen implements only equirectangular.** This is a significant misalignment. Either the brief is outdated (orogen never had multiple projections), or orogen was misidentified as the reference. **Action**: Use orogen for equirectangular only; source Mercator/equal-area/Robinson reference from QGIS, PostGIS, or Proj library (C/C++, requires porting).
2. **Missing hydrology**: No explicit river/watershed system. Pit-filling ensures drainage, but no named river networks, lake identification, or hydrological routing. Requirements demand "hydrology (rivers, lakes, watersheds)." Orogen can provide the drainage backbone; implement river detection + lake ID as post-processing.
3. **No multi-resolution rendering**: Elevation/climate generation produces single-LOD result. No level-of-detail for global zoom (expensive at 2.5M regions on mobile). Required: implement regional patch LOD + zoom-consistent caching.
4. **Climate model is 2-season**: Only summer/winter; no spring/fall gradients, no 12-month calendar. Adequate for narrative maps, insufficient for detailed climate sim or ecosystem modeling.
5. **RNG determinism relies on seed**: Planet code stores 24-bit seed; replay is deterministic but no frame-by-frame checkpoint. Large seeds (16777216 possible) give few unique planets if used casually. Recommend salt + hash for full search space.

### Open questions
1. **Plate editing persistence**: Planet code stores edited plate selections (appended characters). Does re-editing the same seed recreate plate state, or are toggles permanent per code? (Code parsing suggests toggles accumulate.)
2. **Noise octave count**: FBM uses fixed octaves (code not fully read). At ultra-high resolution (2.5M regions), do octaves decay fast enough to avoid aliasing? (Likely yes, given scale-invariance rule in CLAUDE.md.)
3. **Island arc realism**: Island arcs are modeled but parameters (ridge noise, peak floor, spacing) appear hand-tuned. Are they validated against real arc morphology?
4. **Ocean current transport**: Currents visualized as "warm/cold" arrows but what is the actual thermal diffusion mechanism? Is ocean warmth advected, or just a classification heuristic? (Code suggests heuristic — warmth is rule-based, not advected.)
5. **Export quality at 65536 px**: Tiled rendering avoids texture limits, but does quality degrade at extreme sizes (artifacts, memory exhaustion)? Not tested in audit.

### Summary
**Orogen is an excellent stylized procedural world generator, not a geophysical simulator.** Extract the heightmap/tectonics/erosion pipeline as the core engine; climate is reference-grade but requires tuning for specific Earth-like targets. **Critical gap**: No multiple projections (only equirectangular) — requirements ask for Mercator/equal-area/Robinson/etc., but orogen provides only equirectangular. Equirectangular is extractable, but additional projections must come from other sources (QGIS, Proj library). **No hydrology, soils, resources, settlement, or history sim.** Browser-native JavaScript makes extraction trivial (no WASM porting needed). **Recommendation**: Use orogen for heightmap + climate generation (4/5 reference-grade); supplement with separate hydrology, settlement, and multi-projection systems from other upstream repos (Delft3D for hydrology, UrbanSim for settlement, QGIS for projections).
