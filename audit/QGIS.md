# Audit: QGIS

> **Reconciled 2026-10-18** for Phases 5 and 5c only, against the source at `901db8d` (`docs/reconciliation/group-6a.md`). Corrected: line counts, the projection verdict (no projection maths; PROJ is not in the checkout), the hillshade pick (the renderer, not the filter), curvature, the labelling engine (PAL, added as §3.6), and the licence (GPL-2.0-or-later headers, PAL GPL-3.0-or-later, `external/` licences). Claims outside that scope were not re-checked.

## 1. Overview
QGIS is a desktop GIS (geographical information system) written primarily in C++ with Python bindings. It provides comprehensive support for spatial data management, analysis, visualization, and cartography. The project is mature, actively maintained (master branch at 901db8dfa858694f90969af78fc0d3f3af3e07f8), with 3,162 `.cpp` and 3,264 `.h` files in `src/` (1,911,784 lines; 2.6M in the whole repo) plus 1,780 Python files in `python/` (2,620 repo-wide). Key subsystems exist for raster analysis, vector analysis, coordinate reference systems (projections), import/export via GDAL/OGR, and 600+ processing algorithms. The architecture is modular: core (32MB) contains data model and projections; analysis (6.8MB) contains algorithms; gui/app (25MB) handles UI.

## 2. Language, runtime, dependencies, build
**Languages & LOC**: C++ 1.91M lines in `src/`, Python 1,780 files in `python/`, small amounts of C. **Runtime/Platform**: Desktop Linux/Windows/macOS via Qt6, requires system C++ compiler (g++, clang). Can generate Python bindings via SIP. **Key dependencies**: Proj (projections), GEOS (geometry), GDAL (raster/vector I/O), Qt6 (GUI), SQLite3, Protobuf, optional OpenCL. **Build**: CMake-based; inspecting CMakeLists.txt shows standard Unix build (cmake, make, ninja). Building requires compiling C++ core (expensive), Python bindings, and GUI. **Browser portability**: HIGH EFFORT. The C++ core (especially projections, raster analysis, geometry) would require WASM compilation (via Emscripten) or complete JavaScript rewrite. Qt GUI dependencies are non-trivial to port. Feasible subsystems to extract: standalone projection transforms, raster analysis algorithms (hillshade, slope, aspect), coordinate system definitions. Would need to isolate and rewrite geometry operations (currently GEOS-dependent). **Build status**: inferred from CMakeLists.txt, CI configs (.github/workflows), and README; not attempted (policy: read-only upstream).

## 3. Subsystem inventory

### 3.1 Projections & Coordinate Reference Systems
- **Where**: `src/core/proj/` (13,665 lines, 25 files). Key files: `qgscoordinatereferencesystem.cpp/h` (180k combined), `qgscoordinatetransform.cpp/h` (90k combined), `qgscoordinatereferencesystemregistry.cpp/h`.
- **What it does**: Defines coordinate reference systems (CRS) via EPSG codes and Well-Known-Text (WKT); handles transformations between CRS via Proj library (wraps libproj C API). Supports datum transforms, time-dependent CRS, custom CRS definitions. Central to all spatial operations.
- **No projection mathematics of its own:** every file wraps PROJ (`proj.h`), which is not vendored (`external/` has no PROJ). `QgsCoordinateReferenceSystem::factors` (`qgscoordinatereferencesystem.cpp:1546`) forwards `proj_factors` (meridional and parallel scale, areal scale, angular distortion, Tissot semi-axes); its field names are a reference for Phase 5's distortion output, nothing more.
- **Quality & realism rating: 5/5** (as a GIS). Wraps the industry-standard Proj library, handles complex datum transforms, widely used in production GIS. Supports ~6k+ EPSG codes via registry.
- **Extractability: not usable for MapMaker.** Without PROJ there is nothing to extract; MapMaker uses d3-geo (ARCHITECTURE D1). Data files needed: EPSG CRS definitions (text files, can be embedded or fetched).
- **Requirements capabilities it could serve**: None directly (PROJ is absent); the `proj_factors` field names inform the distortion output of Phase 5.

### 3.2 Raster Terrain Analysis
- **Where**: `src/analysis/raster/` (6,046 lines in 25 `.cpp`/`.h` files). Key files: `qgsaspectfilter.cpp/h`, `qgsslopefilter.cpp/h`, `qgshillshadefilter.cpp/h`, `qgsruggednessfilter.cpp/h`, `qgsrelief.cpp/h`, `qgsninecellfilter.cpp/h`, `qgsrastercalculator.cpp/h`.
- **Hillshade pick: the renderer, `src/core/raster/qgshillshaderenderer.cpp`** (655 lines). Horn (1981) derivatives with nodata neighbours replaced by the centre cell (`:433–441`; Horn derivatives `:443–445`); the GDAL fast formula (`:447–454`); a multi-directional mode with the USGS 4-azimuth weighting (225/270/315/360°, `:458–489`). Altitude in degrees (zenith = 90 − altitude, `:151`); azimuth clockwise from north (sign flipped for the y-down frame, `:152`); cell size in map units (`:149–150`), so MapMaker must supply metres on the sphere. The filter `qgshillshadefilter.cpp` (76 lines) instead uses its `lightAngle` argument as a zenith angle (`:26–27`), inconsistent with the renderer. An OpenCL path (`resources/opencl_programs/`) computes the same formula in float32.
- **What it does**: Implements 3x3 neighborhood filters for DEM analysis: aspect (compass direction of steepest descent), slope (steepness), hillshade (shaded relief with azimuth/angle params), ruggedness (terrain roughness), total curvature, derivatives (Sobel operators). Base class `QgsNineCellFilter` abstracts sliding-window processing. `QgsRelief` wraps multiple filters. Raster calculator for band math expressions (lexer/parser). Optional OpenCL acceleration.
- **Quality & realism rating: 4/5**. Good, well-established algorithms. 3x3 Sobel-based derivatives are standard; aspect/slope calculations are textbook. Raster calculator adds flexibility. Total curvature from second derivatives exists (`qgstotalcurvaturefilter.cpp:30–45`); plan and profile curvature and flow accumulation do not. All filters are 3x3. Suitable for basic to intermediate terrain analysis.
- **Extractability: standalone**. No external library dependencies beyond GDAL for I/O. Algorithms are mathematical (atan2, sqrt, convolution); each pure kernel is under 160 lines, and the rest is GDAL I/O and the raster calculator. The kernels port to TypeScript through `dmath`. Effort to lift to browser: LOW-MEDIUM. Core algorithms translatable to JS (one-shot port ~2 days). GDAL I/O handling is the pain point (requires raster input/output layer abstraction).
- **Requirements capabilities it could serve**: Heightmap generation (DEM manipulation), erosion (slope/aspect feed into flow models).

### 3.3 Processing Algorithms (634 total)
- **Where**: `src/analysis/processing/` (600+ .cpp/.h pairs + misc). Organized into subdirectories by category (raster, vector, network, mesh). Terrain-related: `qgsalgorithmaspect.cpp/h`, `qgsalgorithmslope.cpp/h`, `qgsalgorithmhillshade.cpp/h`, `qgsalgorithmruggedness.cpp/h`, `qgsalgorithmrelief.cpp/h`, `qgsalgorithmupslopearea.cpp/h`. Plus 600+ other algorithms (buffer, clip, dissolve, interpolation, etc.).
- **What it does**: Unified interface for spatial algorithms via QGIS Processing framework. Each algorithm wraps a specific operation (usually calls raster/vector analysis classes or GEOS). Terrain algorithms wrap the raster filter classes. Includes interpolation (IDW, Kriging), vector operations (buffer, merge, clip), statistics.
- **Quality & realism rating: 3-4/5**. Serviceable, comprehensive breadth. Terrain subset rated 4/5 (solid Sobel-based); other algorithms vary (some simple wrappers, some sophisticated). Interpolation algorithms are basic to moderate (no tension splines, kriging is standard). Ideal for general-purpose GIS but lacks specialized domain expertise (e.g., hydrology algorithms are thin — no flow accumulation, stream ordering).
- **Extractability: tangled**. Processing framework couples algorithms to Qt signals/slots, Python bindings, parameter serialization, UI hints (metadata). Individual algorithms can be extracted but lose the framework. Extractable algorithm cores vary (terrain: ~80 LOC each; complex: 200-500 LOC). Effort to lift: HIGH for full Processing framework, MEDIUM-HIGH to extract individual algorithm logic and re-wrap. Framework itself is not browser-friendly (event-driven, plugin-based).
- **Requirements capabilities it could serve**: Heightmap generation (aspect, slope, relief), erosion (via slope/curvature), hydrology (upslope area calculation, though flow accumulation is incomplete).

### 3.4 Layer Model & Data Representation
- **Where**: `src/core/raster/` (35k LOC): `qgsrasterlayer.cpp/h` (core), `qgsrasterlayerrenderer.cpp/h`, elevation/temporal properties. `src/core/vector/` (32k LOC): `qgsvectorlayer.cpp/h`, cache, edit buffer. Base: `src/core/qgsmaplayer.h` (abstract base).
- **What it does**: Abstraction for raster (grid-based) and vector (geometry + attributes) data. `QgsRasterLayer` reads from data providers (GDAL, GRASS, etc.), caches tiles, manages symbology/rendering. `QgsVectorLayer` wraps OGR datasources, manages geometry cache, attribute editing. Both support temporal, elevation, metadata properties. Layers integrate with CRS transforms, styling, and the Qt model/view architecture.
- **Quality & realism rating: 4/5**. Mature, well-integrated. Raster layer handles complex I/O (subsets, resampling, band selection). Vector layer is comprehensive (editing, transactions, spatial indexes). Good separation of concerns. Tight coupling to Qt limits browser reuse.
- **Extractability: tangled**. Core data structures (QgsRasterLayer, QgsVectorLayer) depend on Qt (QObject, signals), GDAL providers, style serialization, and the full layer tree hierarchy. Extractable data model (grid + attributes) is simple; extraction challenge is removing Qt and provider dependencies. Effort: HIGH. Simpler to rebuild layer model in JS than to port these classes.
- **Requirements capabilities it could serve**: Internal data representation for heightmaps, climate data, biomes, resources (all representable as raster or vector layers).

### 3.5 Import/Export & Format Support
- **Where**: `src/providers/` (6.4MB): GDAL provider (integrated into core), plus specialized providers (PostGIS, WFS, WCS, GRASS, etc.). GDAL handles 200+ formats (GeoTIFF, NetCDF, HDF5, etc.). Vector: OGR (Shapefile, GeoPackage, GeoJSON, etc.). Format-specific code in `src/core/io/`, `src/gui/io/`.
- **What it does**: Abstraction layer for reading/writing spatial data in 200+ formats via GDAL/OGR. Lazy loading, caching, coordinate transforms on-the-fly. Supports raster subsets, band selection, vector queries. Symbology import/export (SLD, QML). Save/load projects in XML.
- **Quality & realism rating: 5/5**. Leverages GDAL/OGR, industry standard. Supports essentially all geospatial formats. Excellent robustness.
- **Extractability: loosely coupled**. I/O logic depends on GDAL/OGR (external C libraries, must be WASM-ported or wrapped via JS bindings). Format definitions are in GDAL (not reimplementable in browser). High-level I/O wrapper (layer abstraction) is extractable. Effort: HIGH to rewrite for browser (must choose: WASM-compile GDAL, or implement JS readers for critical formats: GeoTIFF, NetCDF, GeoJSON, Shapefile). Data files needed: none (formats are self-contained).
- **Requirements capabilities it could serve**: Import of heightmaps/layers (all common formats via GDAL), export (PNG, SVG if custom, or via GDAL if WASM-compiled), save/resume (custom format design separate).



### 3.6 Labelling (PAL) and rule-based styles (added 2026-10-18, group 6a)
- **Where**: `src/core/pal/` (10,857 lines: `feature.cpp` 2,878, `pointset.cpp` 1,169, `labelposition.cpp` 947, `pal.cpp` 861, `problem.cpp` 650, `costcalculator.cpp` 280, ...). Rule-based styles: `src/core/symbology/qgsrulebasedrenderer.cpp` (1,752 lines), `src/core/labeling/qgsrulebasedlabeling.cpp` (669).
- **What it does**: PAL generates candidate positions per feature, reduces them (`Problem::reduce`), builds an initial FALP solution (`problem.cpp:150`) and improves it by chain search (`problem.cpp:535`, called at `pal.cpp:725`). POPMUSIC and tabu are declared in `pal.h:66–75` but not implemented. Costs are in `costcalculator.cpp`; curved labels along lines in `feature.cpp:1571` (`curvedPlacementAtOffset`).
- **Quality & realism rating: 4/5**. Production label placement with collision handling (PAL, 10,857 lines). Azgaar's `controllers/label-spread.ts` is a smaller seeded alternative (`docs/reconciliation/review.md` H1).
- **Extractability: tangled**. GEOS is a hard dependency (`qgsgeos.h` in 9 PAL files, `geos_c.h` in `pointset.h`), character metrics come from Qt, and `std::sort` ties are a possible source of nondeterminism. PAL has no RNG. The algorithm ports to TypeScript with its own geometry and stable ordering; the rule-based renderer and labelling are design references (Qt, `QgsExpression`).
- **Requirements capabilities it could serve**: labels with collision handling (note 18, Phase 5c).

## 4. Internal data representation
**Grid/mesh type**: Raster = regular rectangular grid (row/column). Vector = OGR feature collection (point/line/polygon geometries + attributes). No unstructured mesh native support (3D meshes via separate mdal provider). **Resolution & setting**: Raster resolution set per layer via pixel size (X/Y) and extent; no automatic multi-resolution (zoom consistency requires external tile pyramid or level-of-detail system). **Units**: Typically degrees (lat/lon) or meters; CRS defines coordinate units. **Coordinate conventions**: Follows EPSG standard: lon/lat (axis order 2) for geographic CRS, X/Y for projected. Sphere vs plane: handled per CRS (geographic CRS use spheroid defined in EPSG). Wraparound: no native handling (dateline wrapping managed by client code). Poles: EPSG definitions handle pole singularities in conformal projections. **Time & RNG**: No native temporal grid (raster) — temporal properties are metadata only. RNG: seed handling not built-in (determinism left to algorithm provider). **Serialization**: Projects saved as .qgs (XML). Rasters: pixel data via GDAL (GeoTIFF, etc.), metadata embedded. Vectors: OGR native formats. **Relevance to zoom**: CRS transforms maintain coordinate fidelity across zoom levels, but raster resolution must be managed externally (pyramid/LOD); vector geometries preserve precision.

## 5. License
**Verified SPDX**: GPL-2.0-or-later. `COPYING` at the repo root is the GNU GPL v2 text; the sampled source headers say "either version 2 of the License, or (at your option) any later version" (e.g. `src/analysis/raster/qgshillshadefilter.cpp:9–13`). The manifest's "GPL-2.0" is less precise. **PAL is GPL-3.0-or-later**: the libpal files (© 2008 Maxence Laurent, HEIG-VD; `src/core/pal/pal.cpp:1–20`) say "version 3 … or (at your option) any later version"; `costcalculator.*` and `palrtree.h` are GPL-2.0-or-later. **Mixed/vendored licenses**: `external/` directory contains vendored libraries with their own licences, among them spatialindex (MIT since 1.8.0, formerly LGPL), wintoast (MIT), odbccpp (Apache-2.0), delaunator-cpp and rectpack2D (MIT), kdbush (ISC-style), o2 (BSD-style) and freespa (GPL-3.0). There is no qhull. These are build-time dependencies, not runtime-linked as separate packages. **Matches manifest?** Yes, manifest states GPL-2.0, verified in COPYING. **Practical notes**: GPL-2.0 means any extracted/modified code must be released under GPL-2.0 or compatible (e.g., LGPL, BSD, MIT). Dependencies (Proj, GEOS, GDAL) are separate licenses (Proj: MIT, GEOS: LGPL, GDAL: MIT/Apache/others per component) — no conflict if extracted as separate modules. No commercial re-sale restriction. Reuse in MapMaker (GPL-3.0-only) is permitted: GPL-2.0-or-later and GPL-3.0-or-later code can be included in a GPL-3.0-only work.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | No plate dynamics, geological models. |
| Heightmap generation | partial | 3/5 | loose | src/analysis/raster/qgs*filter.* | DEM analysis (slope, aspect, relief) but not generative; filters only. |
| Erosion | partial | 2/5 | loose | src/analysis/raster/, src/analysis/processing/qgsalgorithm{aspect,slope,relief}.* | Slope/aspect available; missing flow accumulation, stream power, mass balance. |
| Hydrology (rivers/lakes/watersheds) | partial | 2/5 | tangled | src/analysis/processing/qgsalgorithmupslopearea.* | Upslope area only; no flow routing, stream networks, lake filling, watershed delineation. |
| Climate – temperature | no | — | — | — | No climate models, temperature interpolation, seasonal cycles. |
| Climate – wind | no | — | — | — | No wind models. |
| Climate – ocean currents | no | — | — | — | No ocean circulation models. |
| Climate – precipitation | no | — | — | — | No precipitation models or interpolation. |
| Climate – seasons | no | — | — | — | No seasonal/annual cycle models. |
| Biomes | no | — | — | — | No biome classification, ecoclimatic zones. |
| Soils | no | — | — | — | No soil classification, pedogenesis models. |
| Resources | no | — | — | — | No resource generation, mining, material distribution. |
| Population & settlement | no | — | — | — | No population dynamics, settlement growth, demographics. |
| Cities & towns | no | — | — | — | No urban growth, city generation, infrastructure. |
| Languages & names | no | — | — | — | No name generation, linguistic models. |
| Political borders | no | — | — | — | No border delineation, state/polity models. |
| Trade | no | — | — | — | No trade networks, economic models, supply chains. |
| Long-run history/war/economics/politics sim | no | — | — | — | No multi-millennial simulation, warfare, economics. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | partial | 3/5 | loose | src/core/proj/qgscoordinatetransform.* | CRS transforms maintain coordinate fidelity; no native multi-res pyramid or LOD. |
| Globe view | no | — | — | — | Desktop only; no WebGL globe rendering. |
| Flat projections | yes (via PROJ) | 5/5 | not usable | src/core/proj/ (wrappers) | All projections are PROJ calls; PROJ is not in the checkout, so nothing is extractable. |
| Partial-world inference | no | — | — | — | No plate boundary inference, continental reconstruction. |
| Import of heightmaps/layers | yes | 5/5 | loose | src/providers/, GDAL | 200+ raster/vector formats; GeoTIFF, NetCDF, Shapefile, GeoJSON, GeoPackage, etc. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No algorithm parameter variation, seed-locked preview. |
| Export (PNG/SVG/STL/other) | partial | 3/5 | loose | src/core/io/, GDAL | PNG/GeoTIFF via GDAL; SVG possible (custom); no STL native. |
| Full-state save/resume format | partial | 2/5 | tangled | .qgs XML format | Projects save state; not designed for stateful world resume or seed replay. |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3/5 | loose | src/core/proj/ (EPSG data) | CRS/EPSG calibrated to Earth; no Earth climate/elevation ingestion tools. |
| Planet-parameter derivation | no | — | — | — | No parameter inference from planet physics, orbital elements, interior models. |



## 7. Verdict

- **Extract & adapt**: The hillshade renderer formulas (single and multi-directional) and the PAL label-placement algorithm (with new geometry) for Phase 5c. Projections are not extractable (PROJ wrappers only; see §3.1). Raster terrain analysis kernels (slope, aspect, hillshade, ruggedness, total curvature; each under 160 lines) are solid and easily ported. GDAL/OGR I/O framework is valuable reference if WASM-porting is feasible; otherwise, hand-pick JS readers for critical formats (GeoTIFF, NetCDF, GeoJSON, Shapefile). Layer model structure (raster + vector abstraction) is useful but tightly Qt-coupled; simpler to rebuild in TypeScript following QGIS architecture loosely.

- **Skip**: Full Processing framework (600+ algorithms, complex Qt/Python integration, and only ~8-10 are terrain-relevant). GUI code (wholly desktop-UI-focused); rule-based styling is a design reference only. Project save format (.qgs XML) — design MapMaker's own stateful save. Database providers (PostGIS, Oracle, etc.) — unnecessary for client-side generation.

- **Biggest risks**: (1) PAL depends on GEOS and Qt font metrics; a port needs its own geometry and stable sorting to stay deterministic. (2) GDAL/OGR — 200+ formats is infeasible to port; mitigate by WASM-compiling GDAL (adds 10MB+ to bundle) or committing to ~5 key formats (GeoTIFF, NetCDF, Shapefile, GeoJSON, GeoPackage) in JS. (3) Qt removal — CRS registry, layer model, I/O wrappers all assume Qt; extraction requires careful decoupling or rewrite. (4) Raster I/O abstraction — GDAL's band-based lazy loading is complex to replicate in JS; plan for eager load or tile-based architecture.

- **Open questions**: Will MapMaker define its own CRS/ellipsoid parameters (e.g., custom world radius) or use Earth EPSG? Are Sobel-based terrain derivatives (standard, 3x3 kernel) sufficient for fantasy world detail (e.g., terrain at 1-10 km resolution), or do you need higher-order curvature (2nd derivatives) or flow accumulation? Which export formats are critical (PNG ✓, SVG ✓, STL ?, GeoJSON ?, custom formats?). Should saved worlds include full raster data (storage cost) or regenerate from seed (compute cost)?
