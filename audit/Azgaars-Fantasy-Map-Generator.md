# Audit: Azgaars-Fantasy-Map-Generator

## 1. Overview

Azgaar's Fantasy Map Generator is a mature, well-maintained open-source web application for procedurally generating, editing, and visualizing fantasy maps. Built primarily in TypeScript/JavaScript with ~122k LOC across 500 files, it has been actively developed since 2017 (current HEAD: 3d94b809). The tool targets writers, game masters, and cartographers, offering browser deployment via GitHub Pages and an optional Electron desktop wrapper. The codebase is in gradual transition from vanilla JS to TypeScript and follows a four-layer architecture (state, generators, editors, renderers).

## 2. Language, runtime, dependencies, build

**Languages & LOC:**
- TypeScript: ~476 files, ~95% of codebase
- JavaScript: ~24 files, ~5% of codebase
- Total: ~122k LOC

**Runtime:** Browser-first (vanilla JS/TS + Vite bundler) with optional Electron desktop app (v43.5.0).

**Key dependencies:**
- Visualization: D3.js v7.9.0, Three.js v0.184.0 (for 3D globe rendering)
- Geospatial: Delaunator v5.0.1 (Voronoi/Delaunay), Polylabel v2.0.1 (pole of inaccessibility)
- Procedural: Alea v1.0.1 (seedable RNG), Lineclip v2.0.0 (polygon clipping)
- UI: Quill v2.0.3 (rich text), Driver.js v1.4.0 (guided tours), Zod v4.4.3 (validation)
- Build: Vite v8.0.16, TypeScript v5.9.3, Biome v2.5.12 (linting), Playwright v1.57.0 (E2E tests)
- Node requirement: >=24.0.0

**Build verification (inferred, not attempted):**
Build script is `tsc && vite build && node scripts/pwa-precache.mjs`. Dockerfile present (can containerize). GitHub Actions CI enforces linting and Playwright E2E tests on PRs. No external WASM/C++/Python build steps; codebase is pure JS/TS and builds to browser-ready bundle.

**Browser readiness:** Yes, runs directly in modern browsers as PWA. Fully standalone; no external service or WASM compilation required.

## 3. Subsystem inventory

### 3.1 Heightmap generation
- **Where:** `src/generators/heightmap-generator.ts` (~600 LOC)
- **What it does:** Generates initial terrain using blob-based and line-based Perlin-like noise, influenced by user-selected templates (continent, archipelago, pangaea, etc.). Supports interactive painting tools (Hill, Pit, Range, Trough, Strait, Mask, Invert, Add, Multiply, Smooth). Heights discretized to 0–100 scale (sea level = 20).
- **Quality & realism rating: 3/5.** Functional procedural heightmap with flexible blob/line noise parameters tuned per cell count (lookup tables for power factors). Does not model tectonic plate boundaries or realistic mountain-building processes (e.g., orogenic belts, subduction, spreading). Suitable for fantasy maps but lacks structural geology rigor. No erosion model applied during generation itself (see separate relief system).
- **Extractability: loosely coupled.** Imports D3 range utilities and Alea RNG; uses global `options` and `grid` objects. Core heightmap math is standalone (~200 LOC), but initialization and UI mutation require framework context. ~200–300 LOC of pure math extractable to JS/TS. Effort: low to medium.
- **Requirements capabilities it could serve:** Heightmap generation, partial-world inference (can resample from imported heightmap).

### 3.2 Erosion (relief icons)
- **Where:** `src/generators/relief-generator.ts` (~200 LOC)
- **What it does:** Generates relief icons (visual symbols for mountains, hills, conifer forests, etc.) placed on terrain cells based on height, biome, temperature, and density parameters. Not a true erosion simulation (e.g., no stream-power law, no sediment transport); purely visual/symbolic.
- **Quality & realism rating: 2/5.** Decorative icon placement using biome-dependent symbol libraries and density thresholds. No geomorphological processes; terrain already exists from heightmap stage. Useful for cartographic style but not scientific erosion modeling.
- **Extractability: loosely coupled.** Depends on `pack`, `grid`, `styles`, and biome data. Pure placement logic (~150 LOC) extractable to browser JS. Effort: low.
- **Requirements capabilities it could serve:** Visual terrain detail (relief overlay); does not satisfy heightmap/erosion requirements on its own.

### 3.3 Hydrology (rivers, lakes, watersheds)
- **Where:** `src/generators/river-generator.ts` (~700 LOC), `src/generators/lakes.ts` (~120 LOC), features in `features-generator.ts` (~400 LOC)
- **What it does:** Rivers generated via downhill flow (D8 flow routing on Voronoi cells), then meandered. Discharge computed from cell flux (precipitation proxy). River width derived from discharge using a power-law formula. Lakes assigned to depressions; fresh/salt/dry/frozen subtypes. Watersheds implicitly defined by flow direction. Flux and evaporation tracked per cell; river source/mouth identified.
- **Quality & realism rating: 3/5.** Hydrologically sensible: flow follows steepest descent, discharge accumulates, width scales with flow. D8 routing is a standard approximation. Lacks: true depression-filling (uses simplified resolution), meandering realism (parametric curves only), sediment load effects, river delta formation. Suitable for fantasy maps at 1:1M+ scale.
- **Extractability: loosely coupled.** Heavy use of global `pack`, `grid` objects; imports D3 utilities, Alea RNG, pathfinding helpers. Core downhill/flux logic (~300 LOC) extractable to standalone JS module. Meandering and styling tightly coupled to SVG rendering. Effort: medium.
- **Requirements capabilities it could serve:** Hydrology (rivers/lakes/watersheds), flow-based biome influence (moisture).

### 3.4 Climate – temperature
- **Where:** `src/generators/temperature-generator.ts` (~80 LOC)
- **What it does:** Computes sea-level temperature from latitude (three-tier gradient: tropics, temperate, polar). Temperature drop with altitude (6.5°C per km). Stores as Int8Array (°C, -128 to 127 range). Uses map latitude bounds and cell heights.
- **Quality & realism rating: 3/5.** Simplified but realistic: latitude-driven baseline, altitude lapse rate (~6.5°C/km matches observed). Lacks ocean currents, seasonal variation, albedo/cloud effects. Adequate for global fantasy map biome classification.
- **Extractability: standalone.** Pure math; no DOM/SVG/framework dependencies. Imports only utilities and Alea. ~80 LOC easily extracted. Effort: low.
- **Requirements capabilities it could serve:** Climate – temperature.

### 3.5 Climate – wind
- **Where:** `src/generators/precipitation-generator.ts` (wind direction lookup and wind tier computation in `getWinds()`, ~40 LOC logic)
- **What it does:** Six wind tiers (30° latitude bands, north to south) with configurable angles (0–360°). Easterly and westerly bands identified from angle; feed precipitation model. No explicit wind vector field; wind is implicit in precipitation pattern.
- **Quality & realism rating: 2/5.** Rudimentary: fixed latitude tiers, user-specified angles, no Coriolis/conservation dynamics. No velocity field. Purely parametric; suitable for stylized fantasy maps but not Earth-calibrated climate model.
- **Extractability: standalone.** Computation is pure math (~40 LOC). Effort: low.
- **Requirements capabilities it could serve:** Climate – wind (very basic).

### 3.6 Climate – ocean currents
- **Where:** Not implemented.
- **Quality & realism rating: 0/5.** Absent. No ocean current simulation; no warm/cold current effects on coastal climate.
- **Extractability: N/A.** Not present.
- **Requirements capabilities it could serve:** None; is a gap.

### 3.7 Climate – precipitation
- **Where:** `src/generators/precipitation-generator.ts` (~160 LOC)
- **What it does:** Wind-based precipitation model: six prevailing wind bands carry humidity across the map, losing water over terrain (especially mountains). Humidity replenishes over water. Latitude-dependent modifiers (Hadley cells approximation: dry subtropics ~30°, wet tropics ~5°, wet mid-latitudes ~50°). Permafrost zones (temp < -5°C) block precipitation.
- **Quality & realism rating: 3/5.** Heuristic but effective: wind shadow effects, latitude moisture zones, altitude blocking plausible. Lacks real vapor pressure, latent heat, convective models. Empirically tuned for fantasy maps. Sufficient for biome classification.
- **Extractability: standalone.** Imports D3 utilities and Alea RNG; no DOM/SVG dependencies. Pure computational core (~140 LOC easily extracted). Effort: low.
- **Requirements capabilities it could serve:** Climate – precipitation.

### 3.8 Climate – seasons
- **Where:** Not implemented.
- **Quality & realism rating: 0/5.** Absent. Temperature, wind, and precipitation are static annual means; no seasonal variation.
- **Extractability: N/A.** Not present.
- **Requirements capabilities it could serve:** None; is a gap.

### 3.9 Biomes
- **Where:** `src/generators/biomes-generator.ts` (~150 LOC)
- **What it does:** Classifies cells into 13 biomes (Marine, Hot Desert, Cold Desert, Savanna, Grassland, Tropical Seasonal Forest, Temperate Deciduous Forest, Tropical Rainforest, Temperate Rainforest, Taiga, Tundra, Glacier, Wetland) using a lookup table indexed by temperature and moisture bands. Moisture computed from precipitation and nearby rivers. Special rules for wetlands (high moisture) and permafrost (temp < -5°C).
- **Quality & realism rating: 3/5.** Plausible classification matching Köppen-ish zones. Uses a discrete 5×26 biome matrix (moisture vs temperature). Lacks soil effects, disturbance history, biome gradients. Suitable for fantasy map scale; matches Earth biomes qualitatively.
- **Extractability: standalone.** Pure data-driven lookup; imports only D3 mean and utils. No DOM/SVG. ~150 LOC, fully extractable. Effort: low.
- **Requirements capabilities it could serve:** Biomes.

### 3.10 Soils
- **Where:** Not implemented.
- **Quality & realism rating: 0/5.** Absent. No soil type classification, horizons, nutrient content, or soil erosion modeling.
- **Extractability: N/A.** Not present.
- **Requirements capabilities it could serve:** None; is a gap.

### 3.11 Resources (goods/trade)
- **Where:** `src/generators/goods-generator.ts` (~800 LOC), `src/generators/production-generator.ts` (~900 LOC), routes in `src/generators/routes-generator.ts` (~900 LOC)
- **What it does:** Defines ~60 goods (wheat, wine, iron, furs, etc.) with biome/climate affinities and production costs. Assigns goods to burgs based on cell height/biome/features, calculates production quantity (burg population × good production rate). Trade routes connect burgs via shortest-path networks (military/trade cost models), with profit/price calculations. Markets (hub burgs) aggregate trade flows.
- **Quality & realism rating: 3/5.** Good diversity and biome-linked production (plausible). Trade network and profit model basic but functional. Lacks: supply/demand dynamics, price discovery, mercantile AI, economic conflict, historical trade disruption. Suitable for worldbuilding flavor and trade-route visualization, not economic simulation.
- **Extractability: loosely coupled.** Heavy use of global `pack`, `grid`, and routing helpers (D3 quadtree). Core good/production definitions (~200 LOC) standalone. Route-finding and profit calculation (~400 LOC) refactorable but needs graph structure. Effort: medium.
- **Requirements capabilities it could serve:** Resources, trade (partial), population settlement (via habitability).

### 3.12 Population & settlement
- **Where:** `src/generators/burgs-generator.ts` (~900 LOC), `src/generators/population-generator.ts` (~100 LOC)
- **What it does:** Generates burgs (settlements) on habitable cells, with population based on cell habitability (biome-dependent), distance to sea, river access, and cluster effects. Assigns burg types (capital, town, village). Populations linked to good production and tax base.
- **Quality & realism rating: 2/5.** Heuristic habitability rules; plausible spatial distribution. Lacks: historical growth/decline, migration, disease, conflict impacts, economic carrying capacity. Populations static once generated; no demographic simulation.
- **Extractability: loosely coupled.** Uses `pack`, `grid`, D3 spatial utilities. Core placement logic (~300 LOC) extractable to JS. Population calculation simple formula. Effort: medium.
- **Requirements capabilities it could serve:** Population & settlement, cities (burg placement).

### 3.13 Cities & towns
- **Where:** Burgs (settlements) are classified by size (capital, town, village, etc.) in `burgs-generator.ts`. Names generated in `names-generator.ts` (~300 LOC). Emblems (coats of arms) in `emblems-generator.ts` (~600 LOC).
- **What it does:** Burg size derived from population. Each burg has name (drawn from culture-specific name lists), emblem (procedural heraldic shield), and position. State capitals assigned manually or auto-selected from largest burg.
- **Quality & realism rating: 3/5.** Visually rich (emblems, names, hierarchy). Names culturally themed. Lacks city growth models, infrastructure, defense/fortification details.
- **Extractability: loosely coupled.** Name/emblem generation moderately coupled to UI and `pack`. Core generators refactorable. Effort: medium.
- **Requirements capabilities it could serve:** Cities & towns, names.

### 3.14 Languages & names
- **Where:** `src/generators/names-generator.ts` (~300 LOC), culture-specific name lists in data.
- **What it does:** Generates names for cultures, burgs, states, features, and regions. Names procedurally constructed from syllable lists or drawn from user-defined culture templates. Implements name transformation rules (prefixes/suffixes/adjectives).
- **Quality & realism rating: 3/5.** Phonologically plausible; culturally varied. Names map to culture (e.g., Elvish, Dwarven, Human patterns). Lacks linguistic depth (no grammar rules, no semantic meaning, no historical etymology).
- **Extractability: loosely coupled.** Pure procedural text generation; minimal dependencies. ~200 LOC of core name logic extractable. Effort: low to medium.
- **Requirements capabilities it could serve:** Languages & names.

### 3.15 Political borders (states/provinces)
- **Where:** `src/generators/states-generator.ts` (~1200 LOC), `src/generators/provinces-generator.ts` (~400 LOC)
- **What it does:** States (political entities) generated from Voronoi cells around capitals (burgs). Cell ownership assigned via flood-fill from capital. State properties: form (Monarchy, Theocracy, Republic, etc.), color, expansionism, taxes, military regiments, and diplomatic relations. Provinces optional sub-divisions. States have neighbors, campaigns (historical wars), diplomacy status (Ally, Rival, Vassal, etc.).
- **Quality & realism rating: 2/5.** State formation is spatial (capital-based); form/taxes/diplomacy procedurally assigned. No historical causation or geopolitical constraint. Campaigns and diplomacy are static pre-generated labels, not simulated. Suitable for fantasy map aesthetics, not political simulation.
- **Extractability: tangled.** Heavy use of global `pack`, `grid`, D3 spatial functions. State mutation, neighbor tracking, and diplomacy deeply woven. ~500 LOC of core state allocation logic refactorable; diplomacy and campaigns require substantial refactoring. Effort: high.
- **Requirements capabilities it could serve:** Political borders, partial history simulation (pre-generated campaigns only, not dynamic).

### 3.16 Trade (routes/economy)
- **Where:** `src/generators/routes-generator.ts` (~900 LOC), goods/production (see 3.11).
- **What it does:** Computes optimal trade routes between burgs using a cost model (travel distance, military control, feature crossings). Routes connect to markets (hub burgs). Profit/loss per route calculated from good value and distance. Routes drawn as SVG paths.
- **Quality & realism rating: 2/5.** Functional route-finding; profit heuristic plausible. Lacks dynamic pricing, supply-chain elasticity, caravan AI, route disruption. Routes are static, pre-computed; no merchant simulation. Flavor for worldbuilding only.
- **Extractability: loosely coupled.** Route-finding uses D3 and `pack` globals; core path algorithm refactorable. Effort: medium.
- **Requirements capabilities it could serve:** Trade (routes/economy, partial).

### 3.17 Long-run history/war/economics/politics simulation
- **Where:** Campaigns and diplomacy in `states-generator.ts` (~100 LOC of generation logic).
- **What it does:** Procedurally generates campaign names, dates, and diplomatic relationships between states. Campaigns are static records with start/end year and warring parties; no actual war simulation. Diplomacy is pre-computed relationship matrix (Ally, Rival, Vassal, etc.); no dynamic change.
- **Quality & realism rating: 1/5.** Label-based, not simulated. Campaigns and diplomacy are fixed at world generation; no causality, no feedback, no decision-making. Generated for flavor/narrative context only. Entirely unsuitable for long-run simulation.
- **Extractability: loosely coupled.** Generation logic is ~100 LOC; could be extracted. But system itself is not a simulation, so extraction is of a label generator, not a useful simulation engine.
- **Requirements capabilities it could serve:** None (this is a gap).

### 3.18 Planet-scale + regional patches (multi-resolution/zoom consistency)
- **Where:** Entire generator pipeline; examples: heightmap resampling in `resample.ts` (~600 LOC), regional patch inference in contexts (not fully implemented).
- **What it does:** Heightmap can be resampled at different resolutions; same seed produces consistent but level-appropriate detail. Voronoi grid can be generated at different cell counts. No explicit multi-resolution structure; each zoom level is a fresh generation with same seed.
- **Quality & realism rating: 2/5.** Seed-based consistency good; but no true hierarchical LOD (level-of-detail) structure. Resampling is interpolation, not truly consistent multi-scale geology. Regions can be zoomed into, but no hard constraint on tectonic continuity across zoom transitions.
- **Extractability: loosely coupled.** Resampling logic is ~200 LOC in `resample.ts`, refactorable. Voronoi grid generation modular. Effort: medium.
- **Requirements capabilities it could serve:** Planet-scale + regional patches (partial).

### 3.19 Globe view
- **Where:** `src/renderers/view-3d-renderer.ts` (~600 LOC), Three.js 3D rendering.
- **What it does:** Renders heightmap as a 3D globe or flat orthographic projection using WebGL (Three.js). Allows rotation, zoom, and texture mapping (satellite imagery, river flow). Supports both globe and flat views (equirectangular, Mercator, equidistant, etc.).
- **Quality & realism rating: 4/5.** Smooth 3D rendering, multiple projections, good visual quality. Limited to WebGL performance (no WASM heightfield compute). Can handle globe-scale maps.
- **Extractability: standalone (for 3D rendering).** Three.js integration is well-encapsulated. Effort: low to medium (Three.js is external dependency).
- **Requirements capabilities it could serve:** Globe view, projections.

### 3.20 Flat projections
- **Where:** Projection logic distributed in export/rendering; examples in `export.ts` (GeoJSON export uses lat/lon), view-3d renders Mercator/equirectangular.
- **What it does:** Supports Mercator, equirectangular, equal-area, and other projections. Conversions between canvas coords and geographic coords (lon/lat). Integrated into 3D view and GeoJSON export.
- **Quality & realism rating: 3/5.** Multiple projections available; mathematically correct. Lacks some exotic projections (e.g., Mollweide, sinusoidal). Sufficient for standard cartography.
- **Extractability: loosely coupled.** Projection math is ~100 LOC, refactorable. Dependent on map bounds (options object). Effort: low.
- **Requirements capabilities it could serve:** Flat projections.

### 3.21 Partial-world inference
- **Where:** Not explicitly implemented; regional heightmap import possible, but no inference of surrounding continental structure.
- **Quality & realism rating: 0/5.** Absent. Users can import regional heightmaps and generate around them, but no algorithm infers plausible tectonic/climate context from partial map.
- **Extractability: N/A.** Not present.
- **Requirements capabilities it could serve:** None; is a gap.

### 3.22 Import of heightmaps/layers
- **Where:** `src/services/io/load.ts` (~400 LOC), heightmap import dialog and handlers in controllers.
- **What it does:** Users can import heightmaps as PNG/image (grayscale luminance → height), or load existing .map files (full state serialization). Imports can be used as seed for further generation.
- **Quality & realism rating: 3/5.** PNG import straightforward (luminance to height). .map loading preserves exact state. Lacks: multi-layer import, layer blending, import validation/warnings.
- **Extractability: loosely coupled.** Image parsing and state loading are modular. Effort: low to medium.
- **Requirements capabilities it could serve:** Import of heightmaps/layers.

### 3.23 Fidelity/speed slider with same-seed preview
- **Where:** Not implemented.
- **Quality & realism rating: 0/5.** Absent. Generation options (cell count, seed, etc.) are fixed; no preview or fidelity slider. Users must regenerate with different options to see changes.
- **Extractability: N/A.** Not present.
- **Requirements capabilities it could serve:** None; is a gap.

### 3.24 Export (PNG/SVG/STL/other)
- **Where:** `src/services/io/export.ts` (~900 LOC)
- **What it does:** Exports to SVG (full map vector graphic), PNG (raster at configurable resolution), JPEG (legacy), PNG tiles (tiled map), and GeoJSON (cells, routes, rivers, markers, zones). STL export not present.
- **Quality & realism rating: 3/5.** SVG/PNG exports high quality; GeoJSON useful for GIS. Missing STL (3D model for 3D printing). PNG tiles support web tile serving (e.g., Leaflet).
- **Extractability: loosely coupled.** Export logic is functional and modular; SVG rendering dependencies on DOM. Core export logic ~400 LOC refactorable. Effort: medium.
- **Requirements capabilities it could serve:** Export (PNG/SVG/other formats, but not STL).

### 3.25 Full-state save/resume format
- **Where:** `src/services/io/save.ts` (~300 LOC), `load.ts` (~400 LOC), export-json.ts (~300 LOC)
- **What it does:** Entire world state (grid, pack, options, styles) serialized to `.map` file (text-based JSON-like format). Reload reconstructs exact state. State includes all generator outputs: cells, rivers, biomes, states, burgs, routes, etc.
- **Quality & realism rating: 4/5.** Comprehensive serialization. Format is stable and backward-compatible (version check on load). Ideal for resumable generation and collaborative editing.
- **Extractability: loosely coupled.** Serialization logic is data-driven and modular. ~200 LOC of core serialization refactorable. Effort: low to medium.
- **Requirements capabilities it could serve:** Full-state save/resume format.

### 3.26 Earth-data calibration (elevation/climate/Köppen)
- **Where:** Calibration parameters embedded in generators (e.g., temperature lapse rate 6.5°C/km in `temperature-generator.ts`, sea level = height 20, height scale 0–100).
- **What it does:** Height/temperature/precipitation scales are loosely calibrated to Earth (e.g., 6.5°C/km lapse rate is real). Biome matrix loosely matches Köppen zones. No formal calibration against global datasets.
- **Quality & realism rating: 2/5.** Informal calibration; reasonable but not validated. No systematic comparison to Earth data (e.g., ETOPO, WorldClim, Köppen boundaries). No parameter derivation from real-world data.
- **Extractability: N/A.** Not a module; scattered across generators.
- **Requirements capabilities it could serve:** Earth-data calibration (partial, minimal).

### 3.27 Planet-parameter derivation
- **Where:** `src/components/options-schema.ts` and related option dialogs.
- **What it does:** Users set world parameters (size, seed, sea level, temperature equator/poles, wind angles, precipitation level, etc.) via UI. Parameters feed into generators.
- **Quality & realism rating: 2/5.** Parameters are intuitive (e.g., "temperature at equator") but lack physical grounding. No derivation from planet mass, axial tilt, solar constant, etc. Purely empirical tuning.
- **Extractability: N/A.** UI-driven configuration, not a simulation module.
- **Requirements capabilities it could serve:** None directly (this is configuration, not derivation).

## 4. Internal data representation

**Grid / mesh type:** Regular jittered square grid with Voronoi diagram. ~1,000–100,000 cells configurable. Voronoi cells are the atomic unit (stored as adjacency lists and polygons).

**Resolution:** User selects cell count (e.g., 10,000 cells). Spacing derived from desired cell density. No hierarchical or adaptive refinement.

**Units:** Heights: 0–100 scale (20 = sea level). Temperature: °C (-128 to 127 as Int8Array). Precipitation: arbitrary 0–255 scale (Uint8Array). Distances: arbitrary map units (map width/height in pixels).

**Coordinate conventions:** Canvas coordinates (x, y in pixels, origin top-left). Also stores lat/lon (geographic coordinates based on map bounds: latN, latS, lonW, lonE). Voronoi vertices and cell centers stored as [x, y] tuples.

**Time representation:** Calendar year (configurable epoch and current year, e.g., year 1000). Campaigns have start/end years. No sub-year or seasonal time steps.

**State serialization:** JSON-like `.map` file format; entire `grid` and `pack` objects persisted (compressed in production). Fields are TypedArrays (Uint8Array, Int8Array, Uint16Array) for efficiency; serialized as base64 or hex.

**RNG & seed handling:** Alea v1.0.1 seeded RNG; all procedural generation reseedable with same seed produces identical output (critical for same-seed preview, currently unimplemented but infrastructure in place).

**Multi-resolution consistency:** Seed-driven determinism ensures that zooming into region with same seed produces consistent detail, but no hard inter-scale constraints (e.g., tectonic boundaries do not necessarily align across zoom levels).

## 5. License

**SPDX:** MIT (Apache 2.0 compatible, permissive, no copyleft).

**File path:** `LICENSE` (verified).

**Copyright:** 2017–2024 Max Haniyeu (Azgaar).

**Vendored code / third-party:** Checked `public/libs/` for legacy vendored code (e.g., objexporter.min.js). No vendored production code in `src/`; all deps from npm. Note: project uses some Open Game License (OGL) content for name lists and reference material (not code), but all source is MIT.

**Mixed licenses:** None detected in source code. All TS/JS is MIT.

**Practical notes:** MIT is maximally permissive; derivatives (including MapMaker extractions) can be relicensed or closed-source. No patent clauses. No EULAs or restrictions on generated maps.

## 6. Capability coverage summary (machine-readable table)

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | (none) | No plate tectonics or crustal simulation. |
| Heightmap generation | yes | 3/5 | loose | `heightmap-generator.ts` | Blob/line noise with templates; lacks geological realism. |
| Erosion | partial | 2/5 | loose | `relief-generator.ts` | Visual relief icons only; no geomorphic erosion model. |
| Hydrology (rivers/lakes/watersheds) | yes | 3/5 | loose | `river-generator.ts`, `lakes.ts`, `features-generator.ts` | D8 flow routing, discharge-based widths, watershed implicit; lacks delta formation. |
| Climate – temperature | yes | 3/5 | standalone | `temperature-generator.ts` | Latitude-driven baseline + altitude lapse (6.5°C/km); lacks currents/albedo. |
| Climate – wind | partial | 2/5 | standalone | `precipitation-generator.ts` (`getWinds()`) | Six latitude-tier wind angles; no vector field or dynamics. |
| Climate – ocean currents | no | — | — | (none) | Not implemented. |
| Climate – precipitation | yes | 3/5 | standalone | `precipitation-generator.ts` | Wind shadow + latitude modifiers + altitude blocking; heuristic but effective. |
| Climate – seasons | no | — | — | (none) | Not implemented; all climate is annual mean. |
| Biomes | yes | 3/5 | standalone | `biomes-generator.ts` | 13 biomes via temperature × moisture lookup (Köppen-ish); lacks gradients. |
| Soils | no | — | — | (none) | Not implemented. |
| Resources | yes | 3/5 | loose | `goods-generator.ts`, `production-generator.ts` | ~60 goods assigned to burgs by biome/height; production quantities calculated. |
| Population & settlement | yes | 2/5 | loose | `burgs-generator.ts`, `population-generator.ts` | Habitability-based burg placement; populations static post-generation. |
| Cities & towns | yes | 3/5 | loose | `burgs-generator.ts`, `emblems-generator.ts`, `names-generator.ts` | Size, name, emblem, capital designation; lacks infrastructure/defense. |
| Languages & names | yes | 3/5 | loose | `names-generator.ts` | Culture-specific phonological name generation; lacks linguistic depth. |
| Political borders | yes | 2/5 | tangled | `states-generator.ts`, `provinces-generator.ts` | Flood-fill state allocation, form/diplomacy pre-generated; no historical causation. |
| Trade | yes | 2/5 | loose | `routes-generator.ts`, goods/production | Static trade network with profit calculation; no mercantile simulation. |
| Long-run history/war/economics/politics sim | no | 1/5 | loose | `states-generator.ts` (campaigns/diplomacy only) | Pre-generated labels only; no simulation, causality, or dynamics. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | partial | 2/5 | loose | `resample.ts`, entire pipeline | Seed-driven consistency; lacks hierarchical LOD or hard inter-scale constraints. |
| Globe view | yes | 4/5 | standalone | `view-3d-renderer.ts` | Three.js WebGL 3D globe and orthographic projections. |
| Flat projections | yes | 3/5 | loose | projection logic in export, 3D view | Mercator, equirectangular, equal-area, equidistant; correct mathematics. |
| Partial-world inference | no | — | — | (none) | Not implemented; no algorithm infers surrounding continental context from partial map. |
| Import of heightmaps/layers | yes | 3/5 | loose | `load.ts`, import dialogs | PNG grayscale-to-height; .map file loading; lacks multi-layer blending. |
| Fidelity/speed slider with same-seed preview | no | — | — | (none) | Not implemented; no real-time preview or fidelity control. |
| Export (PNG/SVG/STL/other) | partial | 3/5 | loose | `export.ts` | SVG, PNG, JPEG, PNG tiles, GeoJSON; missing STL (3D model). |
| Full-state save/resume format | yes | 4/5 | loose | `save.ts`, `load.ts`, `export-json.ts` | Comprehensive JSON-like serialization; backward-compatible versioning. |
| Earth-data calibration (elevation/climate/Köppen) | partial | 2/5 | — | scattered (temperature-generator, biomes-generator) | Informal calibration (6.5°C/km lapse, KöPpen-ish biomes); no systematic validation. |
| Planet-parameter derivation | no | — | — | (none) | No derivation from physical parameters (mass, axial tilt, solar constant); empirical tuning only. |

## 7. Verdict

**What is worth extracting:**

1. **Heightmap/terrain generation** (moderate effort, ~300 LOC standalone core): D3-free blob/line noise procedural heightmap is reusable and battle-tested. Caveat: lacks geological realism (no tectonic/orogenic modeling); suitable for fantasy maps but would need extension for Earth-calibrated simulation.

2. **Hydrology/river system** (medium effort, ~400 LOC refactor): D8 flow routing, discharge accumulation, meander logic are solid. Extractable to browser. Missing: depression-filling robustness, delta formation, sediment transport. Useful foundation for MapMaker's river/watershed needs.

3. **Climate generators** (low to medium effort, ~300 LOC combined): Temperature, precipitation, wind generators are lightweight, seedable, and decoupled. Simple but effective for fantasy-scale climate. Immediately useful.

4. **Biomes classification** (low effort, ~150 LOC): Lookup-table biome assignment is portable and works. Lacks complexity but suitable for fantasy maps.

5. **Export infrastructure** (medium effort): SVG/PNG/GeoJSON export logic is modular and production-hardened. Three.js 3D globe is excellent. Reuse export.ts as-is, adapt rendering.

6. **Full-state serialization** (low effort, ~200 LOC core): `.map` file format and serialization logic are clean and versioned. Good model for MapMaker's save format.

**What to skip or approach cautiously:**

1. **Political borders / state allocation** (tangled, 1200+ LOC): Heavily coupled to global state; diplomatic/campaign systems are non-simulated labels (unfit for long-run simulation requirement). Extract only the spatial flood-fill algorithm (~200 LOC), discard the rest.

2. **Trade/routes** (3/5 rating but limited realism): Useful for flavor, but profit model is too simple for economic simulation. Extract if easy; don't invest heavily.

3. **Tectonics/erosion** (absent or toy): Entirely absent (no plate boundaries, no structural geology). Relief icons are visual-only. Not worth porting; would require new research/implementation from scratch.

4. **Long-run history/war/economics simulation** (1/5, non-existent): Campaigns and diplomacy are pre-generated labels with no causality. **Not suitable for MapMaker's requirement for "a long-run simulation of war, economics, politics, and full human history across thousands of years."** Would need to be built from scratch.

5. **Partial-world inference** (absent): No algorithm exists to infer surrounding continental context from partial maps. Gap for MapMaker's "partial-world mode" requirement.

6. **Fidelity/speed slider** (absent): Infrastructure (Alea RNG seeding) is in place, but UI and preview logic not implemented. Would require new development.

**Biggest risks:**

1. **License:** MIT is clean and unrestricted; no legal risk.

2. **Language/coupling:** Codebase is ~95% TypeScript and browser-ready; very low friction for extraction. Global state (`pack`, `grid` objects) are pervasive but can be refactored to explicit parameters incrementally.

3. **Scope mismatch:** Azgaars is a *fantasy map generator*; it does not attempt long-run civilization simulation, tectonics, or Earth calibration. MapMaker's requirements demand these. Large subsystems (history sim, tectonic simulation, partial-world inference) will require *new* development, not extraction.

4. **Code quality:** Codebase is well-maintained and professional. Gradual JS→TS migration is sound. No architectural rot detected.

**Open questions / unverified:**

1. Does Azgaars' Voronoi grid scale well to >100k cells for regional detail (MapMaker's zoom consistency)?
2. How much refactoring is needed to lift global `pack`/`grid` to explicit parameters?
3. Can the three.js 3D renderer be extended to true 3D terrain (heightfield geometry, not just texture mapping)?
4. What is the licensing status of the name/culture data (OGL content)?

**Summary:** Azgaars is a mature, production-grade fantasy map generator with excellent UI/UX and solid procedural generation for *fantasy-scale* climate, biomes, hydrology, and trade networks. Core subsystems are extractable to browser JS/TS with low to medium effort. However, it is not a planet-scale physical simulation tool; MapMaker's requirements for tectonics, long-run history sim, and Earth calibration will require substantial new development. Use Azgaars as a foundation for terrain/climate/hydrology/trade subsystems; build new modules for tectonics, history sim, and calibration.

