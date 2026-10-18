# Audit: CesiumJS

> **Reconciled 2026-10-18** for Phases 5 and 5c only, against the source at `e1d443e` (`docs/reconciliation/group-6a.md`). Corrected: paths (core classes are in `packages/core/Source/`), the projection classes (314 lines; WebMercator is spherical), globe shading (Lambert, no hillshade; slope/aspect/contour materials added), labels (no declutter), geometry size, the RNG, ellipsoid radii and axis convention, LOD (no cross-fade), and the licence (patent grant, third-party appendix). Claims outside that scope were not re-checked.

## 1. Overview
CesiumJS is a mature, actively maintained JavaScript/WebGL library for creating interactive 3D globes and 2D maps in web browsers. Developed and maintained by Cesium GS, Inc., it is widely used in geospatial visualization (GIS, satellite imagery, 3D Tiles streaming, navigation). Version 1.146.0 at HEAD e1d443e8fdaae0535407b96f7560426583483424. Monorepo with ~2,339 JS/TS files across 4 main packages (core, engine, widgets, sandcastle/examples). ~814k LOC JavaScript (349,714 of them in Specs), ~8k LOC TypeScript, 319 GLSL shaders.

## 2. Language, runtime, dependencies, build

**Primary languages and LOC share:**
- JavaScript: ~814k LOC (~99%)
- TypeScript: ~8k LOC (~1%)
- GLSL: 319 shader files (not counted in LOC)

**Runtime / platform:**
- Browser-native: WebGL 1.0/2.0 for rendering, ES2020+ JavaScript/TypeScript
- Node.js ≥22.0.0 for build tools
- Cross-browser, cross-platform (Windows, macOS, Linux)
- No native dependencies; pure JS/WebGL

**Key dependencies:**
- @cesium/core, @cesium/wasm-splats (internal packages)
- draco3d (mesh compression), earcut (polygon triangulation), rbush/kdbush (spatial indexing), topojson-client (TopoJSON parsing)
- pako (zlib), protobufjs (Protocol Buffers), @tweenjs/tween.js, @zip.js/zip.js
- No Fortran, C++, or compiled dependencies; all JS-compatible

**Build:**
- Build system: npm/gulp + esbuild; `npm run build` in root
- Deterministic build: yes; outputs minified assets to Build/
- CI: GitHub Actions (workflows/.github/)
- Inferred as building successfully based on: well-established project, active CI, no third-party compiled modules, npm scripts in package.json match standard patterns

**Browser portability:**
- Runs natively in browsers: yes. No WASM port required; pure JS/WebGL.
- Module system: ES modules with CommonJS fallback (index.cjs)
- Tree-shakeable imports supported

## 3. Subsystem inventory

### 3.1 Globe view and rendering
- **Where**: packages/engine/Source/Scene/Globe.js, GlobeSurfaceTileProvider.js, GlobeSurfaceShaderSet.js; shaders `packages/engine/Source/Shaders/GlobeVS.glsl`, `GlobeFS.glsl`; packages/core/Source/Ellipsoid.js, Cartographic.js, Cartesian3.js
- **Shading (checked 2026-10-18):** Lambert lighting from vertex normals only (`czm_getLambertDiffuse`; `GlobeFS.glsl:431`, `:435`); **no hillshade**. Per-vertex slope `acos(|n·up|)` and aspect measured from east (`GlobeVS.glsl:241–251`) drive the SlopeRamp, AspectRamp, ElevationContour, ElevationRamp and ElevationBand materials (`Shaders/Materials/`). Imagery colour adjustments: brightness, contrast, hue (YIQ rotation), saturation and gamma (`GlobeFS.glsl:233–263`; properties in `ImageryLayer.js`). All are small closed forms, usable as references for Phase 5c.
- **What it does**: Renders a 3D WGS84 ellipsoid globe with configurable terrain (via TerrainProvider abstraction) and imagery layers; handles camera, lighting, atmosphere, shadows, LOD tile management with Quadtree culling. Ellipsoid class implements geodetic coordinate transformations and WGS84 models.
- **Quality & realism rating: 4/5** — Production-grade rendering engine tuned for real geospatial data visualization. Accurate coordinate transforms and ellipsoid models. Supports high-fidelity real-world elevation and imagery. Not a procedural generator; assumes terrain/imagery fed in via providers. Proven in commercial and scientific use.
- **Extractability: loosely coupled** — Core rendering depends on @cesium/core (math, geometry) and WebGL/Renderer modules. No UI or DOM dependencies in Scene core. Terrain rendering decoupled via TerrainProvider abstraction. Approximate extractable core: ~50k LOC (Scene/ + Core/). Effort to port to standalone browser JS: low—already browser-native. Minor refactor to remove Viewer/widgets wrapper if needed.
- **Requirements capabilities it could serve**: Globe view; Planet-scale + regional patches (via tile LOD); Import of heightmaps/layers (via TerrainProvider); Calibration against Earth data (uses WGS84).

### 3.2 Projections and coordinate systems
- **Where**: packages/core/Source/WebMercatorProjection.js (151 lines), GeographicProjection.js (105), MapProjection.js (58, interface); packages/core/Source/Cartographic.js, Cartesian*.js. `packages/engine/Source/Core/Deprecated/` holds re-export shims.
- **What it does**: Implements Web Mercator (EPSG:3857, **spherical** on `ellipsoid.maximumRadius`, `WebMercatorProjection.js:27`; latitude clamped at ≈85.0511°, `:60–65`) and Geographic (plate carrée, x = λa, y = φa, `GeographicProjection.js:53–58`) projections; there are no other projections; converts between geodetic (lat/lon/height), Cartesian (xyz), and projected (xy) coordinate systems. Static utility functions for Mercator angle↔latitude transforms. Ellipsoid handles spheroid math (WGS84 by default).
- **Quality & realism rating: 4/5** for what exists (2/5 as flat-projection coverage, §6) — Mathematically correct implementations of standard projections. Well-tested and widely used. Arbitrary ellipsoids are accepted, but only the maximum radius is used. Mercator is clamped to valid latitude bounds. For MapMaker these are golden-value references for d3 `geoMercator` and `geoEquirectangular`, not code to adopt.
- **Extractability: standalone** — Imports Cartesian3, Cartographic, defined, DeveloperError, Ellipsoid and Math from @cesium/core. 314 lines total. Effort: low—can be dropped into any JS codebase with minimal changes. No WebGL or scene dependencies.
- **Requirements capabilities it could serve**: Flat projections; Globe view; Calibration against Earth data.

### 3.3 Terrain data import and TerrainProvider abstraction
- **Where**: packages/engine/Source/Core/CustomHeightmapTerrainProvider.js, CesiumTerrainProvider.js, HeightmapTerrainData.js, HeightmapTessellator.js, Cesium3DTilesTerrainProvider.js, ArcGISTiledElevationTerrainProvider.js, GoogleEarthEnterpriseTerrainProvider.js, EllipsoidTerrainProvider.js
- **What it does**: Abstract TerrainProvider interface + concrete implementations for loading/streaming terrain from multiple sources (custom heightmap callbacks, 3D Tiles, quantized-mesh, imagery-derived DEMs, web services). Handles tile-based LOD, height quantization/encoding, normal computation, water masking. CustomHeightmapTerrainProvider accepts a callback: (x, y, level) → Float32Array of heights, allowing procedural or imported heightmap data.
- **Quality & realism rating: 4/5** — Robust terrain streaming infrastructure. Integrates well with real elevation data services (USGS, Mapbox, ArcGIS). Quantized-mesh codec is standard in industry. Limitations: no erosion/hydrology; assumes static terrain or pre-processed tiles.
- **Extractability: loosely coupled** — TerrainProvider is an abstract interface; concrete implementations depend on tiling/quadtree (QuadtreePrimitive) and heap/caching. ~15k LOC core (TerrainProvider + CustomHeightmapTerrainProvider + HeightmapTerrainData). Effort to extract: medium—needs geometry tessellation (HeightmapTessellator) and tile protocol parsers (for 3D Tiles/quantized-mesh) if full feature set desired. Can simplify to CustomHeightmapTerrainProvider only (~2k LOC) and ignore service providers.
- **Requirements capabilities it could serve**: Import of heightmaps/layers; Heightmap generation (can feed procedurally generated heights via callback); Terrain visualization.

### 3.4 Imagery providers and layer management
- **Where**: packages/engine/Source/Scene/{ArcGisMapServerImageryProvider, BingMapsImageryProvider, GoogleEarthEnterpriseImageryProvider, OpenStreetMapImageryProvider, WebMapServiceImageryProvider, MapboxImageryProvider, ...}.js; ImageryLayer.js, ImageryLayerCollection.js
- **What it does**: Pluggable source adapters for remote imagery (satellite, street maps, custom tiles) via web services or local files; handles tiling, reprojection to globe, blending, transparency, false-color rendering (e.g., elevation ramp visualization).
- **Quality & realism rating: 4/5** — Production-ready integration with major map tile services. Good support for standard tiling schemes (Web Mercator, Geographic). Not for procedural generation; assumes imagery supplied externally.
- **Extractability: tangled** — Tight coupling to Globe, Scene, Renderer, and specific web APIs (CORS, Bing Maps SDK, etc.). ~20k LOC. Effort to decouple: high—would require re-architecting layer composition. For MapMaker, can skip imagery providers if using custom heightmap/procedural texture; globe rendering works without them (fallback to white).
- **Requirements capabilities it could serve**: Import of heightmaps/layers; Globe view.

### 3.5 Geometry and shapes (Primitives)
- **Where**: packages/core/Source/{Box, Circle, Corridor, Cylinder, Ellipse, Polygon, Polyline, Rectangle, Wedge, ...}Geometry.js; packages/engine/Source/Scene/{Billboard, Path, Model, Primitive, ...}.js
- **What it does**: Procedurally generates tessellated meshes for common geometric shapes (boxes, spheres, circles, corridors, polygons, polylines) on a WGS84 ellipsoid. Used for drawing entities (points, lines, areas) on the globe. Includes outline variants and custom appearance/materials.
- **Quality & realism rating: 3/5** — Correct geometric algorithms for ellipsoidal surfaces; suitable for small features (cities, roads, borders). Not designed for high-resolution terrain or terrain distortion; too fine-grained for planet-scale feature placement.
- **Extractability: loosely coupled** — Geometry classes are self-contained in @cesium/core, with utility functions for ellipsoid math. 96 `*Geometry.js` files, 20,289 lines. Effort to extract: low—grab desired Geometry*.js files, keep ellipsoid utilities, discard Viewer/Scene wrapping.
- **Requirements capabilities it could serve**: Political borders (Polygon geometry); Cities & towns (Billboard/Point visualization); Languages & names (labels via canvas/text: `Scene/Label.js`, `LabelCollection.js`, SDF glyphs via `bitmap-sdf`; **no declutter or collision avoidance**, only `disableDepthTestDistance`); Resources (point/marker visualization).

### 3.6 3D Tiles support
- **Where**: packages/engine/Source/Core/Cesium3DTileset.js, Cesium3DTilesContent.js, Cesium3DTilesFeatures.js; packages/engine/Source/Scene/Cesium3DTileset*.js
- **What it does**: Streaming loader and renderer for OGC 3D Tiles (tileset.json + glTF/b3dm/i3dm/pnts/etc.); handles implicit tiling, feature selection, styling, shader customization. Integrates LOD and feature-level picking.
- **Quality & realism rating: 4/5** — De-facto industry standard for 3D geospatial data (buildings, point clouds, models). Well-maintained spec implementation. Good performance for large datasets.
- **Extractability: tangled** — Deeply integrated with Scene, Renderer, Camera, WebGL context. ~25k LOC. Not easily separable. For MapMaker: useful for visualization of pre-computed 3D data (e.g., city models, terrain meshes), but requires entire CesiumJS scene graph. Effort to extract: high.
- **Requirements capabilities it could serve**: Cities & towns (3D models); Resources (point cloud visualization); Export (can export to 3D Tiles tileset format).

### 3.7 Clock and time
- **Where**: packages/core/Source/Clock.js, JulianDate.js, ClockRange.js, ClockStep.js
- **What it does**: High-precision Julian date arithmetic and a Clock object for managing animation/playback time. Supports time ranges, speed multipliers, playback modes (loop, clamped, etc.).
- **Quality & realism rating: 4/5** — Accurate astronomical time representation (Julian calendar + leap seconds). Useful for long-run simulations requiring precise date tracking.
- **Extractability: standalone** — ~1k LOC, no external dependencies beyond basic math. Can extract Clock.js + JulianDate.js as independent module.
- **Requirements capabilities it could serve**: Long-run history/war/economics/politics sim (time tracking); Seasons (calendar-aware generation).

### 3.8 Math and utilities
- **Where**: packages/core/Source/Math.js, Matrix*.js, Plane.js, Ray.js, Quaternion.js, Spline.js, easing functions, etc.
- **What it does**: Comprehensive linear algebra (vectors, matrices, quaternions), plane/ray geometry, cubic splines, numerical utilities, random-number support via the npm `mersenne-twister` package (seedable: `CesiumMath.setRandomNumberSeed`, `packages/core/Source/Math.js:983`). No game physics engine, but solid computational geometry.
- **Quality & realism rating: 4/5** — Standard, well-tested implementations. Suitable for game/sim math.
- **Extractability: standalone** — ~50k LOC core math, self-contained in @cesium/core. Easy to grab subsets (e.g., Matrix3, Quaternion, Ray).
- **Requirements capabilities it could serve**: Underlying math for all subsystems.

### 3.9 Data loading and parsing
- **Where**: packages/engine/Source/Core/Resource.js, createWorldTerrainAsync.js, Zip.js integration, GeoJSON/CZML/GPX/KML data source loaders
- **What it does**: Generic resource loader (HTTP/local files) with caching and retry. Format-specific parsers for GeoJSON, CZML (Cesium Language), GPX, KML, TopoJSON. Not a universal import framework; focused on geospatial formats.
- **Quality & realism rating: 3/5** — Works well for standard geospatial data; no custom format or procedural generation support. Limited to existing format specs.
- **Extractability: loosely coupled** — Resource.js is standalone (~2k). Format parsers depend on @cesium/core and DataSource abstractions. Effort: low for Resource, medium for format parsers if needed separately.
- **Requirements capabilities it could serve**: Import of heightmaps/layers (GeoJSON, TopoJSON); Data calibration (load Earth data).

### 3.10 World generation and procedural systems
- **Where**: Not found
- **What it does**: No subsystem for procedural terrain generation, erosion simulation, climate modeling, hydrology, biomes, settlement patterns, trade networks, or history simulation.
- **Quality & realism rating: 0/5** — CesiumJS is a visualization and data-streaming engine, not a world simulator. Terrain, climate, and civilization must be generated externally (e.g., by orogen, custom algorithms, or other upstream repos) and imported as heightmaps/imagery.
- **Extractability: N/A**
- **Requirements capabilities it could serve**: None directly; can only visualize externally generated worlds.

## 4. Internal data representation

**Grid / mesh type**: Quadtree of tiles over WGS84 ellipsoid. Each terrain tile is a heightmap (regular 2D grid) tessellated to a mesh. Imagery is raster. Vectors (polylines, polygons) are discretized to polylines on the ellipsoid surface.

**Resolution**: Configurable per TerrainProvider; typically terrain tiles are 32×32 or 64×64 samples per tile, with LOD selecting tile level (0 = planet, 1..30 = zoom). Imagery same LOD scheme.

**Units**: Height in meters (SI, WGS84 reference ellipsoid). Positions in radians (latitude/longitude) or meters (Cartesian ECEF). Ellipsoid radii: WGS84 (6378137, 6378137, 6356752.3142451793) (`Ellipsoid.js:763`); `Ellipsoid.UNIT_SPHERE` (`:772`).

**Coordinate conventions**: 
- Geodetic: latitude [-π/2, π/2] rad, longitude [-π, π] rad, height m (above ellipsoid)
- Cartesian ECEF: x, y, z meters in earth-centered-fixed frame; the surface normal is (cosφ cosλ, cosφ sinλ, sinφ) (`Ellipsoid.js:326–335`): +Z north, +X at (0°, 0°), +Y at (0°, 90°E), identical to MapMaker's canonical frame
- Projected (Web Mercator): x, y in meters (pseudo-Mercator), Z = height m

**Time representation**: JulianDate (proleptic Gregorian calendar, TAI seconds since noon Jan 1, 4713 BC). Precision: ~15 decimal digits (sub-millisecond for dates near J2000).

**Serialization**: No native save/resume format. Viewer state (camera, entity positions) can be serialized to CZML or custom JSON; terrain/imagery must be re-streamed from providers on load.

**RNG / seed handling**: Includes mersenne-twister for random numbers (seedable through `setRandomNumberSeed`); no seed-based preview mechanism. Not suitable for deterministic same-seed regeneration without external wrapper.

**Multi-resolution consistency**: Quadtree tile LOD by screen-space error (`QuadtreePrimitive.js`, `maximumScreenSpaceError` 2, `:113`) provides consistent detail across zoom; there is no imagery cross-fade. Vertex skirts prevent seams at tile boundaries. Height quantization uniform across all tiles (matches terrain provider precision).

## 5. License

**SPDX identifier**: Apache-2.0 (verified from LICENSE.md in repo root and package.json)

**File path**: /LICENSE.md (root), also in packages/engine/LICENSE.md

**Mixed/vendored licenses**: `LICENSE.md` (890 lines) appends a "Third-Party Code" section from line 209 with 44 entries: 30 code entries (among them NVIDIA FXAA under custom terms, Source Sans Pro under OFL 1.1, and bitmap-sdf, mersenne-twister, earcut, topojson-client, Draco) and 14 example data and asset entries (including CC-BY 3.0 icons). It also lists Cesium patents (`:205–207`). No NOTICE file; `ThirdParty.json` exists. `packages/engine/Source/ThirdParty/` holds only the basis transcoder and the Google Earth dbroot parser. Earlier spot-check:
- topojson-client: BSD-3-Clause (compatible)
- earcut: ISC (compatible)
- Draco: Apache-2.0 (compatible)
- No GPL or incompatible licenses detected in dependency manifests

**Matches manifest**: Yes. Manifest lists "Apache-2.0"; verified as accurate.

**Practical notes**: Apache-2.0 is permissive, allows commercial use, requires attribution and includes a patent grant (§3, `LICENSE.md:75`). No copyleft. Safe to extract and modify for MapMaker.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|-----------|----------|--------|-----------------|-----------|------|
| Tectonics | no | — | — | — | CesiumJS is a renderer, not a world generator |
| Heightmap generation | partial | 2/5 | loose | CustomHeightmapTerrainProvider.js | Can accept procedurally generated heights via callback; does not generate them |
| Erosion | no | — | — | — | No erosion simulation |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | No hydrological algorithms |
| Climate – temperature | no | — | — | — | No climate modeling |
| Climate – wind | no | — | — | — | No wind simulation |
| Climate – ocean currents | no | — | — | — | No ocean current modeling |
| Climate – precipitation | no | — | — | — | No precipitation simulation |
| Climate – seasons | no | — | — | — | No seasonal modeling |
| Biomes | no | — | — | — | No biome generation; can visualize via imagery layers |
| Soils | no | — | — | — | No soil modeling |
| Resources | no | — | — | — | No resource generation; can place markers via primitives |
| Population & settlement | no | — | — | — | No settlement generation; can visualize via 3D Tiles |
| Cities & towns | partial | 2/5 | tangled | Cesium3DTileset.js, Billboard.js | Can render city models (3D Tiles) and labels; does not generate them |
| Languages & names | no | — | — | — | No language/naming generation |
| Political borders | partial | 2/5 | loose | PolygonGeometry.js | Can draw polygon boundaries; generation is external |
| Trade | no | — | — | — | No trade/economy simulation |
| Long-run history/war/economics/politics sim | no | — | — | — | No civilization simulation |
| Planet-scale + regional patches (multi-res/zoom) | yes | 4/5 | loose | Globe.js, QuadtreePrimitive.js, TerrainProvider.js | Quadtree LOD ensures consistent detail across zoom; tile-based streaming |
| Globe view | yes | 4/5 | loose | Globe.js, Scene/Core rendering, WebGL | High-quality WGS84 ellipsoid rendering with atmosphere, lighting |
| Flat projections | partial | 2/5 | standalone | WebMercatorProjection.js, GeographicProjection.js | Spherical Web Mercator and plate carrée only (314 lines); golden values for d3 |
| Partial-world inference | no | — | — | — | No inference engine; visualization only |
| Import of heightmaps/layers | yes | 4/5 | loose | TerrainProvider.js, ImageryLayer.js, GeoJSON/CZML parsers | Can import heightmaps (CustomHeightmapTerrainProvider, quantized-mesh), imagery (tile services, GeoJSON/TopoJSON vectors) |
| Fidelity/speed slider with same-seed preview | partial | 1/5 | tight | — | Clock.js can drive playback speed; no deterministic seed-based preview (no RNG seed control) |
| Export (PNG/SVG/STL/other) | no | — | — | — | No export; renders to WebGL canvas (can screenshot via canvas.toDataURL for PNG) |
| Full-state save/resume format | no | — | — | — | No native serialization format; CZML/JSON export possible but incomplete |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3/5 | loose | Ellipsoid.js (WGS84), terrain providers (USGS, Mapbox, ArcGIS services) | WGS84 ellipsoid baked in; can load real elevation/imagery from web services; no climate/Köppen |
| Planet-parameter derivation | no | — | — | — | No parameter generator |

## 7. Verdict

- **What to extract**: (1) Projection classes (WebMercatorProjection, GeographicProjection) — compact (314 lines); d3-geo already provides both, so they serve as golden-value cross-checks, not code to adopt. Slope, aspect, contour and elevation-band material formulas and the imagery colour adjustments are small references for Phase 5c. (2) Ellipsoid and coordinate math (@cesium/core/Ellipsoid.js + Cartesian*.js) — essential for multi-resolution planet/regional consistency. (3) CustomHeightmapTerrainProvider — thin wrapper for terrain-from-callback pattern; useful as a reference for importing procedurally generated or user-provided heightmaps. (4) TerrainProvider abstract interface — defines the contract for terrain sources, valuable for integrating MapMaker's generators.

- **What to skip**: (1) Scene rendering stack (Globe, Viewer, WebGL Renderer) — heavyweight, tightly coupled. MapMaker will likely build custom rendering around Babylon.js or Three.js or direct WebGL. (2) Imagery provider ecosystem — overkill for a fantasy world (no Bing/Google maps needed); can defer or skip. (3) 3D Tiles full stack — useful only if MapMaker wants to export/import tilesets; low priority. (4) All real-world service integrations (Cesium ion, ArcGIS, Google).

- **Biggest risks**: (1) **License scope**: Apache-2.0 is permissive but requires attribution; ensure extracted modules include CONTRIBUTORS.md and LICENSE.md. (2) **Monorepo coupling**: @cesium/core is a dependency of @cesium/engine; extracting engine subsystems (e.g., TerrainProvider) requires keeping core. (3) **No world generation**: CesiumJS is 100% visualization/data-streaming. All procedural generation (terrain, climate, erosion, biomes, history) must come from orogen, Nandi, Artifice, or original code. (4) **Seed reproducibility**: No built-in RNG seed control; if same-seed preview required, wrap generators in seeded PRNG (e.g., seedrandom.js).

- **Open questions**: (1) Will MapMaker use CesiumJS's scene graph, or build a custom renderer? (Affects whether to extract Globe.js.) (2) Does export to 3D Tiles tilesets matter? (Low priority; defer.) (3) Will calibration against Earth data include importing Cesium ion terrain, or use custom data? (Suggests extracting CustomHeightmapTerrainProvider over full CesiumTerrainProvider.)

