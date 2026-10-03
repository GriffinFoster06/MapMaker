# Audit: GAMA

## 1. Overview

GAMA is a mature, open-source agent-based modeling (ABM) and simulation platform developed by the GAMA team, led by Alexis Drogoul and contributors. As of October 2024, it is actively maintained (commit 34a8f32...) with ~667k lines of Java code across 2,245 files, organized as a modular Eclipse/OSGi plugin architecture. GAMA is designed for spatially explicit agent-based simulations and includes GIS integration (shapefiles, GeoJSON, OSM, KML), 3D visualization (OpenGL), and a domain-specific language (GAML) for model definition. The platform targets professional researchers and modelers in urban planning, epidemiology, ecology, and traffic simulation, with 18+ extensions covering statistics, physics, databases, networks, and more. It is fundamentally a **desktop application** (Java/SWT UI), not a browser-based tool, and has no built-in world generation, climate simulation, or civilization modeling capabilities.

## 2. Language, runtime, dependencies, build

- **Primary language**: Java (~90–95%), GAML (custom DSL, ~3%), with shell scripts for build/deployment. Rough share: Java core ~120k LOC, extensions ~547k LOC (maths 3.7k, physics 4.8k, stats 3.5k, core agent/simulation framework 119k).
- **Runtime / platform**: **Desktop (Java 21+ JVM, Eclipse/SWT)**, not browser. Requires Eclipse IDE or Maven+Tycho to build; distributions are compiled to macOS/Windows/Linux native apps with bundled JDK. A headless mode exists but still runs on the JVM.
- **Key dependencies** (versions pinned in pom.xml):
  - **Eclipse/OSGi**: Tycho 5.0.2, Eclipse 2026-03 repository (SWT, JDT, Xtext)
  - **Build**: Maven 3.x, JDK 21+ (via Temurin)
  - **Math**: Custom Perlin/Simplex noise (in-tree), no external math libraries (no NumPy, SciPy, etc.)
  - **Physics**: Bullet Physics (likely via libs/; not inspected in detail)
  - **GIS**: GML, OSM, KML, Shapefile support (via built-in I/O, no GDAL/PROJ dependency visible)
  - **3D rendering**: OpenGL (Java binding), custom Java2D fallback
- **Does it build?**: Inferred from structure; not attempted (per rules). Build requires:
  1. Clone repo, install JDK 21
  2. `cd gama.annotations && mvn clean install`
  3. `cd ../gama.processor && mvn clean install`
  4. `cd ../gama.parent && mvn clean install` (full multi-module Tycho build)
  5. Output: `.../gama.product/target/products/` (packaged app for each OS)
  - **Red flags**: Large monolithic repo (70+ modules); Tycho build complex; no npm/pip; unlikely to work in-browser without WASM rewrite of all 667k LOC.
- **Can it run in a browser as-is?** **No**. GAMA is a JVM desktop app with SWT GUI and OpenGL rendering. **Porting to browser would require**:
  - Complete rewrite of UI layer (SWT → HTML/Canvas)
  - WASM compilation of simulation core (unrealistic for 667k Java code; would need GraalVM native-image or equivalent, not standard WASM toolchain)
  - Replacement of OpenGL rendering with WebGL/Three.js
  - Full simulation engine reimplementation in JavaScript/TypeScript would be cheaper than porting.
  - **Effort**: Very high (6–12+ person-months for a production-quality browser version).

## 3. Subsystem inventory

### 3.1 Terrain generation
- **Where**: `gama.core/src/gama/gaml/operators/Random.java` (lines 1128–1210, ~250 LOC), wrapped by `gama.core/src/gama/core/outputs/layers/MeshLayerStatement.java` for rendering.
- **What it does**: `generate_terrain(seed, width, height, details, smoothness, scattering)` produces a 2D field (matrix) of elevation values (0–1) using **Perlin/Simplex noise** (in-tree implementation, probably based on Perlin's reference but not attributed). Parameters control octave count (details: 1–10 octaves), smoothing (roughness via 1-smoothness), and spatial scale (scattering: 0.0001–0.01). Result is typically scaled by 10–20 to simulate elevation in game units. Single-octave mode produces features ~500+ units apart; high-octave mode gives finer detail. No flow routing, no hydrology, no climate feedback. Purely procedural; seed-driven for reproducibility.
- **Quality & realism rating: 2/5**. Simplex noise is a proven terrain baseline (used in Minecraft, No Man's Sky prototypes), and the operator is fast and seed-deterministic, which is good. However, it lacks: erosion modeling, flow routing, geological plausibility (no ridge/valley coherence), hydrological feedback, or calibration to real elevation statistics. Suitable for fantasy terrain at regional scale (if artistic rather than scientific plausibility is the goal), but unsuitable for realistic worlds or multi-scale consistency. Tested only informally (no unit tests visible); no tuning for specific biomes or climates.
- **Extractability: standalone**. The noise implementation is pure Java, self-contained (~250 LOC). Could be extracted as a standalone Java library or ported to JavaScript in ~1–2 days (Perlin noise ports exist for JS). Minimal external dependency: only uses `gama.core.util.Maths.floor()` and constants. No global state, no UI coupling. Effort to lift to browser JS: **low** (~4–8 hours for a basic noise-based heightmap generator).
- **Requirements capabilities it could serve**: Heightmap generation (basic); Erosion (not implemented, would need layering). Biomes (not implemented). Calibration (not implemented; no Earth-data reference).

### 3.2 Physics simulation (terrain interaction)
- **Where**: `gama.extension.physics/src/gama/extension/physics/gaml/PhysicalSimulationAgent.java`, `gama.extension.physics/src/gama/extension/physics/common/IShapeConverter.java`, `gama.extension.physics/src/gama/extension/physics/gaml/PhysicsSkill.java`, and bundled Bullet library (~4.8k LOC Java wrappers).
- **What it does**: Integrates Bullet Physics engine (C++ library, JNI wrapped) for rigid-body dynamics. Allows agents to have 3D physics properties (mass, friction, collision shapes). Supports a `terrain` field (matrix of elevations) that can be converted to a collision surface (mesh/heightfield), so agents can walk/slide on procedurally generated terrain. Also simulates gravity, forces, collisions. Intended for realistic 3D agent movement on uneven ground.
- **Quality & realism rating: 4/5**. Bullet Physics is production-grade (used in video games, Blender). Terrain-as-heightfield is standard in game engines. Collision detection and dynamics are robust. However: (a) terrain is static (no deformation from erosion or water); (b) no fluid dynamics, only rigid bodies; (c) calibration to real-world gravity/friction is minimal. Good for gameplay/visualization, less suitable for geological realism.
- **Extractability: loosely coupled**. Physics is a plugin extension. Core agent-simulation loop is decoupled; physics agents opt-in via `PhysicsSkill`. Extraction would require: (1) Bullet JNI bindings (already cross-platform, ~1k LOC wrapper); (2) reimplementation in WebGL shaders or Cannon.js (JavaScript physics library, mature, compatible). No rendering dependency (Bullet outputs forces/velocities; rendering is separate). Effort to extract: **medium**. Bullet itself is ~7k LOC C++; recompiling to WASM is feasible (Cannon.js achieves similar results in JS). Code to extract from Java: ~500–1k LOC physics bindings. Effort to browser: **medium-high** (recompile Bullet WASM or use existing JS physics engine, ~2–4 weeks).
- **Requirements capabilities it could serve**: Physics-based erosion (not yet implemented in GAMA); flood simulation (could be layered on top); terrain deformation.

### 3.3 PDE/Diffusion (hydrology potential)
- **Where**: `gama.extension.maths/src/gama/extension/maths/pde/diffusion/statements/DiffusionStatement.java` (~250 LOC), supporting classes in same directory.
- **What it does**: Implements a numerical diffusion solver (finite-difference scheme, likely D8 or similar neighborhood) for partial differential equations. Allows defining a field variable and applying diffusion/flow operators (e.g., `diffuse` statement with convolution masks). Primarily designed for heat/pollution/population density flow, but can model shallow-water flow or sediment transport by reinterpreting field values. Supports masking and multi-pass convolution (smoothing).
- **Quality & realism rating: 2/5** for hydrology. The diffusion framework is mathematically sound but generic. River/stream generation would require: (a) flow direction routing (D8, D-infinity, or similar—not visible in GAMA code); (b) accumulation/discharge calculation; (c) downslope channel incision logic. GAMA's diffusion is passive (smooths/spreads values), not active (doesn't cut channels or simulate erosion feedback). Could serve as a base for watershed modeling but significant work needed. Not tested for hydrology specifically.
- **Extractability: loosely coupled**. Diffusion is a GAML operator, not tightly bound to GUI or agent framework. Extraction would be ~500–1k LOC Java. Can be ported to JavaScript (finite-difference schemes are simple) in ~2–3 days. No heavy dependencies; works on any grid/field. Effort: **low-to-medium** (~1–2 weeks to a working JS watershed solver, if custom).
- **Requirements capabilities it could serve**: Hydrology (rivers/lakes/watersheds) — foundational only, needs major augmentation.

### 3.4 GIS & spatial data import (GML, OSM, Shapefile, GeoJSON, KML)
- **Where**: `gama.extension.gml/`, `gama.extension.osm/`, `gama.core/src/gama/core/util/file_loading/` (GeoTIFF, CSV import).
- **What it does**: Reads vector (GML, Shapefile, GeoJSON, KML) and raster (GeoTIFF, PNG, JPEG as grid) from disk; converts to GAMA geometries (polygons, polylines, points) with CRS awareness (lat/lon ↔ meters, supports multiple UTM zones, Mercator, etc.). Can overlay multiple layers. Supports GeoJSON FeatureCollections and attribute tables. OSM extension can download and parse OpenStreetMap data (roads, buildings, landuse).
- **Quality & realism rating: 4/5**. Import/export is mature and tested (used in real urban-modeling studies). CRS handling is solid. Major limitation: no raster arithmetic (can't compute slope/aspect/curvature from DEMs natively), no vector topology repair (self-intersecting polygons not auto-fixed), and OSM import is not deep (no full semantic understanding of building types, road hierarchies, etc.). Good for bringing real-world data in, not for deriving features from it.
- **Extractability: loosely coupled**. GIS I/O is module-based. Core logic (~2k LOC per format) could be extracted. JavaScript equivalents exist (Turf.js for vector, GeoTIFF.js for raster). Effort to extract GAMA GIS: **low-to-medium** (~1–2 weeks to a JS GIS loader that matches GAMA's capability). CRS transformations are slightly tricky; use Proj4.js library.
- **Requirements capabilities it could serve**: Import of heightmaps/layers; Import/Export (SVG, PNG export needs custom code). Calibration (if paired with real DEM imports, e.g., SRTM, GEBCO).

### 3.5 Visualization & rendering (3D/2D, OpenGL, WebGL potential)
- **Where**: `gama.ui.display.opengl/`, `gama.ui.display.java2d/`, `gama.ui.display.opengl4/` (OpenGL 4.x layer).
- **What it does**: Renders agents, fields, and geometries to screen. Supports layers (species display, mesh/grid overlay, labels), camera control (free camera, top-down, isometric, 3D), lighting (Phong shading, ambient/directional lights, shadows). Mesh rendering for terrain DEMs. Texture mapping for 3D objects (Procedural City example uses this). Video codec support for screen recording. Multiple backends: OpenGL (primary), Java2D (fallback for headless/weak GPUs).
- **Quality & realism rating: 4/5**. Rendering is smooth and professional-looking. Lighting is basic (no PBR, no BRDF) but adequate for visualization. Terrain mesh rendering is efficient (LOD not visible, so large meshes may slow). Shadow mapping is supported. Major limitation: no true 3D terrain LOD (all vertices rendered every frame), no atmospheric scattering, no cloud/weather visualization. Suitable for agent visualization and scientific outputs, not for real-time open-world games.
- **Extractability: tangled**. Rendering is tightly bound to SWT event loop and OpenGL context management (Java/LWJGL bindings). Extracting the shader/scene graph logic would require: (a) replacing LWJGL with WebGL, (b) rewriting camera/input handling (SWT → HTML/Canvas), (c) porting shaders (GLSL → WebGL GLSL, mostly compatible). Core scene-graph logic (~1k LOC) could be salvaged; but UI coupling is significant. Effort: **high** (~4–8 weeks for a functional Three.js/Babylon.js replacement with feature parity).
- **Requirements capabilities it could serve**: Globe view; Flat projections; Export (PNG screenshots already supported; SVG export via vector backend would need custom code).

### 3.6 GIS/topology utilities: topology, coordinate reference systems, projections
- **Where**: `gama.core/src/gama/core/geometry/`, `gama.core/src/gama/core/topology/`.
- **What it does**: Manages CRS (coordinate reference systems) and projections. Supports UTM, lat/lon, Mercator, Lambert Conformal, equal-area, etc. (via built-in conversions or Proj4 library). Handles geodetic calculations (distance on sphere, bearings, area). Topology classes support spatial indexing (R-tree, quadtree) for fast neighbor queries.
- **Quality & realism rating: 4/5**. CRS support is comprehensive and correct. Spatial indexing is efficient. Limitation: no true geodetic datum handling (assumes WGS84 in most cases), no ellipsoidal calculations (uses spherical approximations). Adequate for regional simulations; not production GIS (no datum transformations, no precise surveying support).
- **Extractability: standalone**. Topology and CRS logic is largely independent (~3k–4k LOC). JavaScript ports exist (Proj4.js, Turf.js, rbush for spatial indexing). Effort: **low** (~1–2 weeks to extract and port basic topology to JS).
- **Requirements capabilities it could serve**: Planet-scale + regional patches (multi-resolution/zoom consistency) — would need layering on top of terrain gen. Globe view (if projections module is used). Flat projections (already supported).

### 3.7 Statistics & analysis (Stats extension)
- **Where**: `gama.extension.stats/src/gama/extension/stats/` (~3.5k LOC).
- **What it does**: Descriptive statistics (mean, variance, std dev), clustering (k-means, hierarchical), spatial statistics (Moran's I, spatial autocorrelation, kernel density), regression. Designed for post-hoc analysis of simulation outputs, not real-time world simulation.
- **Quality & realism rating: 3/5** for world generation context. Statistics are correct but not exotic (standard algorithms). Not suited for climate/biome inference, or for calibration. Would need domain-specific stats (e.g., Köppen classification thresholds, precipitation-elevation relationships) for realism.
- **Extractability: standalone**. Statistics code is pure Java, no framework coupling. Porting to JavaScript: use ml.js or simple-statistics (both mature). Effort: **low** (~3–5 days).
- **Requirements capabilities it could serve**: Calibration (foundational; needs domain-specific logic). Earth-data calibration (if stats used to fit parameters to real data).

### 3.8 Models & recipes (Toy Models, Data Importation, Visualization)
- **Where**: `gama.library/models/Toy Models/`, `gama.library/models/Data/`, `gama.library/recipes/`.
- **What it does**: Example GAML programs demonstrating GAMA capabilities. Categories:
  - **Toy Models**: Ants, Boids, Schelling segregation, predator-prey, traffic, urban growth, flood simulation, economy, epidemiology, procedural city (random buildings), waterflow (diffusion-based).
  - **Data**: Importation (shapefiles, GeoJSON, rasters), exportation (to GIS formats), CRS transformations.
  - **Recipes**: DEM Generator (terrain via simplex noise), visualization tricks.
- **Quality & realism rating: 2–3/5**. Toy models are academic proof-of-concept, not production simulations. Procedural City is pure aesthetics (random building footprints, no urban planning logic). Waterflow uses diffusion (no true river/sediment dynamics). Urban growth is Cellular Automaton–style, not agent-based with realistic settlement dynamics. Economy model is not documented (inspected path does not reveal its depth). Flood simulation: unknown depth (file not found).
- **Extractability: varies**. Models are GAML (domain-specific language), not portable. Would need: (a) GAML→JS transpiler (doesn't exist; GAMA has a custom compiler), or (b) manual reimplementation in JavaScript. For simple CA/diffusion models, manual port ~1–2 weeks per model. Complex co-models (multi-level simulation) would take longer.
- **Requirements capabilities it could serve**: Urban growth / settlement patterns (foundational, not realistic). Trade/economy (unknown). Long-run history simulation (not present).

### 3.9 Agent-based simulation framework (core)
- **Where**: `gama.core/src/gama/core/agent/`, `gama.core/src/gama/core/simulation/`, `gama.core/src/gama/core/population/`.
- **What it does**: Runtime engine for agent creation, interaction, step scheduling, and state management. Supports species definitions (agent types), reflexes (condition-action rules), actions (subroutines), and global state. Simulation clock manages cycles. Multi-threading and parallel execution of agent reflexes. No built-in economics, warfare, culture, or historical tracking.
- **Quality & realism rating: 4/5**. Framework is robust, well-tested, and scales to millions of agents (used in large epidemiology and traffic models). Limitation: agents are simple state machines; no emergent social behavior, no cultural evolution, no memory/learning (unless scripted in GAML).
- **Extractability: tangled**. Core framework is ~119k LOC Java, deeply embedded in Eclipse/OSGi architecture (plugin system, dependency injection, annotations). Extracting would require reimplementation in JavaScript; reusing the Java runtime via GraalVM is possible but complex. Effort: **very high** (~3–6 person-months for a JS agent engine with similar features).
- **Requirements capabilities it could serve**: Population & settlement (framework available, logic not present). Trade/economy (would need to be written from scratch). Long-run history simulation (framework capable, domain logic missing).

### 3.10 Notable absences
- **No climate simulation**: No temperature, precipitation, wind, or seasonal models. No atmospheric dynamics, no ocean currents, no weather generation.
- **No erosion modeling**: No stream-power law, no hillslope processes, no valley formation. Diffusion is passive smoothing, not active incision.
- **No biome/ecosystem modeling**: No vegetation patterns, no soil types, no resource distribution tied to climate/geology. "Biome" concept not present in codebase.
- **No civilization/history simulation**: No cultural evolution, no trade networks, no warfare, no language generation, no political dynamics. ABM framework exists but domain logic is absent.
- **No calibration to Earth data**: No Köppen climate zones, no elevation/slope statistics, no precipitation-elevation relationships. Some real-world data can be imported (GIS layers), but no automatic calibration.
- **No partial-world inference**: No mechanism to infer context outside a regional map; importing a heightmap does not automatically generate surrounding climate/biomes.
- **No seed preview / fidelity slider**: No fast-vs-slow generation modes (though simplex noise is already fast). Terrain generation takes ~100–500ms even for 2000x2000 grids.

## 4. Internal data representation

- **Grid type**: Regular 2D Cartesian raster (`IField` interface). Single or multi-layer 2D matrices of doubles. Each cell is addressed by (x, y) integer coordinates; values are floating-point (typically 0–1 for normalized heights, or user-scaled).
- **Agent spatial representation**: Agents are separate from the grid; each agent has a `.location` (Point in the coordinate system) and a `.shape` (Geometry: polygon, polyline, point, box, etc.). Can query neighbors via spatial index (R-tree).
- **Resolution**: User-defined at simulation init (e.g., 250x250 cells). No multi-resolution support built-in (single LoD per simulation). No automatic LoD switching. Terrain generation is fast enough (~100–500ms for 2000x2000) that regenerating at different scales is feasible, but consistency across zoom levels requires manual logic (not provided).
- **Units**: Model-defined (no standard). Elevation values are typically 0–1 (normalized) or 10–200 (scaled game units); no SI units by default. Users must establish their own unit conversions (e.g., "1 cell = 100 meters").
- **Coordinate conventions**: 
  - **Plane mode**: (x, y) Cartesian, origin at bottom-left or top-left depending on display layer. CRS-aware: can be in lat/lon, UTM meters, or arbitrary units.
  - **Sphere mode**: lat/lon (degrees), but not deeply integrated (simulation happens in projected plane). No true 3D globe/icosahedral mesh (would use 3D agent positions on a sphere, not an intrinsic grid).
  - **Wraparound/poles**: No automatic handling. If modeling a wrapping world (east/west wrap), user must script it.
- **Time representation**: Discrete time-steps (cycles), integer-indexed. No continuous time within a cycle; reflexes fire once per cycle. Cycle duration is user-defined (e.g., 1 cycle = 1 day, 1 month, 1 year).
- **Serialization**: GAML has no built-in save format. User must manually save agent state to files (CSV, XML, JSON via extensions). No snapshot/resume capability built-in; simulations restart from `init`. The serialize extension provides some JSON/XML serialization but is not comprehensive.
- **RNG / seed**: Simulation has a global `.seed` variable (default: random). All stochastic operators draw from this seed (Mersenne Twister RNG). Setting `.seed` before simulation init makes the run deterministic. Useful for same-seed preview (run with coarse parameters at seed S, then fine parameters at same S), but no built-in fidelity slider.

**Implications for requirements**:
- Grid representation is suitable for regional terrain (10–10k km scales at sub-1km resolution).
- No native multi-scale consistency (would need custom tile/chunk system, not provided).
- No native save/resume (significant work to add).
- Seed determinism is good; no fidelity/speed slider provided, but could be scripted.
- CRS support is strong; projections (Mercator, equal-area) are supported.

## 5. License

- **SPDX**: GPL-3.0 (GNU General Public License, version 3)
- **File path**: `/Users/griffinfoster/Projects/MapMaker/upstream/GAMA/LICENSE` (standard GPL-3.0 boilerplate, 34.3 KB, ~20 sections).
- **Mixed/vendored licenses**: Not inspected exhaustively, but likely:
  - Bullet Physics (distributed in libs/) — BSD/Zlib (permissive, compatible with GPL).
  - Eclipse/OSGi dependencies — EPL 2.0 (Eclipse Public License, compatible with GPL in aggregate).
  - No obvious GPL conflicts; standard for Eclipse platform.
- **Matches manifest?** Yes. Upstream manifest lists `license: GPL-3.0`; actual file confirms.
- **Practical notes**: 
  - **Copyleft strength**: GPL-3.0 is strong copyleft. Any derivative work or linked library must also be GPL-3.0 (or compatible). Extracted modules ported to JS would inherit GPL-3.0 if derived from GAMA source.
  - **Patent clauses**: GPL-3.0 includes patent termination clause; safe for use but not favorable to patentees.
  - **EULA restrictions**: None (open-source license, no proprietary terms).
  - **Conflict**: If MapMaker uses a non-copyleft license (MIT, Apache 2.0), extracted GAMA code must be clearly marked and attributed, or GPL-3.0 must be adopted for the entire project. The project brief says "License conflicts are ignored," so this is a recorded observation, not a blocker.

**Git HEAD**: `34a8f322811d2742a85262868fb26425d494a21a`

## 6. Capability coverage summary (machine-readable table)

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | No plate dynamics, no continental generation, no volcanism. |
| Heightmap generation | yes | 2/5 | standalone | `Random.java:1128–1210`, `DEM Generator.gaml` | Simplex noise only; procedural, not realistic; lacks geological constraints. |
| Erosion | no | — | — | — | No stream-power, no hillslope processes, no feedback from water/weather. |
| Hydrology (rivers/lakes/watersheds) | partial | 2/5 | loosely coupled | `DiffusionStatement.java`, `pde/` folder | Diffusion framework present; flow routing and channel incision not implemented. |
| Climate – temperature | no | — | — | — | No temperature model, no altitude/latitude gradients, no seasonal variation. |
| Climate – wind | no | — | — | — | No wind model, no Hadley cells, no storm simulation. |
| Climate – ocean currents | no | — | — | — | No ocean dynamics, no thermohaline circulation. |
| Climate – precipitation | no | — | — | — | No precipitation model, no orographic effects, no interannual variability. |
| Climate – seasons | no | — | — | — | No seasonal calendar, no solstice/equinox effects. |
| Biomes | no | — | — | — | No classification, no vegetation patterns, no soil types. |
| Soils | no | — | — | — | No soil property layers, no weathering/fertility dynamics. |
| Resources | no | — | — | — | No resource generation or distribution tied to geology/climate. |
| Population & settlement | partial | 2/5 | tangled | `gama.core/agent/`, `gama.library/models/Urban Growth`, `Comodels/Urban...` | ABM framework available; no realistic settlement generation, no economic logic. |
| Cities & towns | partial | 1/5 | tangled | `Procedural City.gaml`, `Urban Growth/` | Random building footprints (Procedural City); CA-based growth (Urban Growth); not rule-based urban planning. |
| Languages & names | no | — | — | — | No language generation, no naming conventions, no cultural patterns. |
| Political borders | no | — | — | — | No state formation, no territorial logic, no border dynamics. |
| Trade | no | — | — | — | No trade route generation, no economic flow, no market simulation (Economy model unknown depth). |
| Long-run history/war/economics/politics sim | no | — | — | — | No historical time scale (simulation is cycles, not millennia), no warfare, no cultural evolution, no governance. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | Single resolution per simulation; no built-in LoD or tile-based patching. CRS/projection support strong, but consistency across zoom manual. |
| Globe view | partial | 3/5 | tangled | `gama.core/geometry/`, `gama.core/topology/` | Lat/lon supported; no native icosahedral or sphere mesh. True globe rendering would require custom agent positioning on sphere. |
| Flat projections | yes | 4/5 | loosely coupled | `gama.core/geometry/CRS.java`, projection operators | Mercator, UTM, equal-area, Lambert Conformal supported natively. |
| Partial-world inference | no | — | — | — | No mechanism to infer surrounding context from a regional heightmap. |
| Import of heightmaps/layers | yes | 4/5 | loosely coupled | `gama.extension.gml/`, `gama.extension.osm/`, GeoTIFF I/O | Shapefiles, GeoJSON, OSM, GeoTIFF, PNG/JPEG as grids supported. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No built-in fast/slow modes; simplex terrain is already fast (~100–500ms). Same seed available but no slider UI. |
| Export (PNG/SVG/STL/other) | partial | 3/5 | loosely coupled | `gama.core/outputs/`, rendering layers | PNG screenshots native; SVG export via vector backend (limited); STL export not visible. Custom export would need scripting. |
| Full-state save/resume format | no | — | — | — | No built-in snapshot format. Manual serialization via extensions required (incomplete). |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | Can import Earth layers (GIS) but no automatic calibration of parameters. No Köppen, no climate regression. |
| Planet-parameter derivation | no | — | — | — | No inference of world properties from a set of seed parameters (e.g., axial tilt → climate). |

## 7. Verdict

- **What to extract**: 
  - **Simplex terrain noise** (~250 LOC) — fast, seed-deterministic, easy to port to JS. Use as a starting point for heightmap generation, but plan to layer erosion/hydrology on top.
  - **GIS import/export infrastructure** (~2–3k LOC) — Shapefile, GeoJSON, GeoTIFF support is solid. Worth extracting for bringing real-world data into MapMaker. Effort: low-medium (1–2 weeks).
  - **CRS/projection utilities** (~1k LOC) — Mercator, UTM, equal-area already implemented. Easy to port (Proj4.js available). Effort: low.
  - **Spatial indexing** (R-tree, quadtree in topology module) — efficient neighbor queries. Porting to JS (rbush library) is straightforward. Effort: low.

- **What to skip**:
  - **Full agent framework** — extracting 119k LOC core simulation engine is not cost-effective; reimplementing a lightweight JS agent loop is faster (~2–4 weeks).
  - **Physics (Bullet)** — if realism is not critical, skip. If needed, use Cannon.js (JS physics) instead of porting GAMA's Bullet bindings.
  - **Procedural City & Urban Growth models** — not sophisticated enough for realistic city generation. Requires from-scratch urban planning logic (street grids, zoning, realistic footprints).
  - **GAML language & compiler** — do not attempt to port GAMA's entire DSL. Build MapMaker's generation logic directly in JS.
  - **UI/rendering (SWT/OpenGL)** — replace with WebGL/Three.js. Not worth extracting GAMA's layer system.

- **Biggest risks**:
  - **Language barrier (Java → JS)**: GAMA is 100% Java. Extracting subsystems requires manual porting or WASM, both labor-intensive.
  - **Copyleft license (GPL-3.0)**: Any extracted code must be GPL-3.0 or else carefully isolated and clearly attributed. If MapMaker uses a permissive license, this becomes a compliance issue.
  - **Monolithic architecture**: GAMA is tightly integrated (plugins, dependency injection, annotations). Extracting one subsystem often requires dependencies on others, leading to scope creep.
  - **No Earth realism**: GAMA excels at ABM but not world generation. Terrain is procedural, not realistic. Climate, erosion, and hydrology are absent. Extracting terrain generation alone is not enough for a credible fantasy world generator.

- **Open questions / unverified**:
  - Does the Economy model (Toy Models) include realistic trade/merchant simulation? (File not inspected; path suggests toy-scale only.)
  - What does the Flood Simulation model do exactly? (File not found in explore; may be in different path.)
  - Are there any hidden climate or biome extensions not listed in the manifest? (Grep for "climate", "biome" found only toy models; likely no hidden extensions.)
  - How well does GAMA handle multi-scale terrain (planet ↔ regional patch)? (No native support; would be manual, untested.)
  - Is there any GIS data (e.g., Earth DEMs) bundled for calibration? (Data folder exists; contains only example shapefiles and CRS utilities, not Earth rasters.)

---

**Recommendation**: GAMA is a mature, well-engineered ABM platform suitable for agent-based research (traffic, epidemiology, urban dynamics). **It is not suitable as a world-generation engine for MapMaker.** Extract: terrain noise, GIS I/O, projections. Build from scratch: climate, erosion, hydrology, biomes, civilization. The overlap (ABM framework, spatial indexing) is useful but not critical; a bespoke JS stack would be faster and more focused for fantasy world generation.

