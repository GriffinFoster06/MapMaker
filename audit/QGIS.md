# Audit: QGIS

## 1. Overview
QGIS is a desktop GIS (geographical information system) written primarily in C++ with Python bindings. It provides comprehensive support for spatial data management, analysis, visualization, and cartography. The project is mature, actively maintained (master branch at 901db8dfa858694f90969af78fc0d3f3af3e07f8), with ~412k lines of C++ (3162 .cpp + 3264 .h files) plus 1788 Python files. Key subsystems exist for raster analysis, vector analysis, coordinate reference systems (projections), import/export via GDAL/OGR, and 600+ processing algorithms. The architecture is modular: core (32MB) contains data model and projections; analysis (6.8MB) contains algorithms; gui/app (25MB) handles UI.

## 2. Language, runtime, dependencies, build
**Languages & LOC**: C++ 412k LOC (67%), Python 1788 files (20-25%), small amounts of C. **Runtime/Platform**: Desktop Linux/Windows/macOS via Qt6, requires system C++ compiler (g++, clang). Can generate Python bindings via SIP. **Key dependencies**: Proj (projections), GEOS (geometry), GDAL (raster/vector I/O), Qt6 (GUI), SQLite3, Protobuf, optional OpenCL. **Build**: CMake-based; inspecting CMakeLists.txt shows standard Unix build (cmake, make, ninja). Building requires compiling C++ core (expensive), Python bindings, and GUI. **Browser portability**: HIGH EFFORT. The C++ core (especially projections, raster analysis, geometry) would require WASM compilation (via Emscripten) or complete JavaScript rewrite. Qt GUI dependencies are non-trivial to port. Feasible subsystems to extract: standalone projection transforms, raster analysis algorithms (hillshade, slope, aspect), coordinate system definitions. Would need to isolate and rewrite geometry operations (currently GEOS-dependent). **Build status**: inferred from CMakeLists.txt, CI configs (.github/workflows), and README; not attempted (policy: read-only upstream).

## 3. Subsystem inventory

### 3.1 Projections & Coordinate Reference Systems
- **Where**: `src/core/proj/` (~13.6k LOC). Key files: `qgscoordinatereferencesystem.cpp/h` (180k combined), `qgscoordinatetransform.cpp/h` (90k combined), `qgscoordinatereferencesystemregistry.cpp/h`.
- **What it does**: Defines coordinate reference systems (CRS) via EPSG codes and Well-Known-Text (WKT); handles transformations between CRS via Proj library (wraps libproj C API). Supports datum transforms, time-dependent CRS, custom CRS definitions. Central to all spatial operations.
- **Quality & realism rating: 5/5**. Reference-grade implementation. Wraps industry-standard Proj library, handles complex datum transforms, widely used in production GIS. Supports ~6k+ EPSG codes via registry.
- **Extractability: loosely coupled**. Depends on Proj library (external C dependency), Qt for string handling, modest internal global state for CRS registry. Extractable core ~8k LOC (excluding Qt string ops). Effort to lift to browser: HIGH — requires WASM-compiled libproj or pure JS port of Proj algorithms (complex). Data files needed: EPSG CRS definitions (text files, can be embedded or fetched).
- **Requirements capabilities it could serve**: Flat projections, planet-scale + regional patches (zoom consistency requires proper CRS transforms).

### 3.2 Raster Terrain Analysis
- **Where**: `src/analysis/raster/` (~6k LOC). Key files: `qgsaspectfilter.cpp/h`, `qgsslopefilter.cpp/h`, `qgshillshadefilter.cpp/h`, `qgsruggednessfilter.cpp/h`, `qgsrelief.cpp/h`, `qgsninecellfilter.cpp/h`, `qgsrastercalculator.cpp/h`.
- **What it does**: Implements 3x3 neighborhood filters for DEM analysis: aspect (compass direction of steepest descent), slope (steepness), hillshade (shaded relief with azimuth/angle params), ruggedness (terrain roughness), total curvature, derivatives (Sobel operators). Base class `QgsNineCellFilter` abstracts sliding-window processing. `QgsRelief` wraps multiple filters. Raster calculator for band math expressions (lexer/parser). Optional OpenCL acceleration.
- **Quality & realism rating: 4/5**. Good, well-established algorithms. 3x3 Sobel-based derivatives are standard; aspect/slope calculations are textbook. Raster calculator adds flexibility. Lacks higher-order algorithms (e.g., curvature from 2nd derivatives, flow accumulation). No 5x5+ neighborhoods. Suitable for basic to intermediate terrain analysis.
- **Extractability: standalone**. No external library dependencies beyond GDAL for I/O. Algorithms are mathematical (atan2, sqrt, convolution). Extractable LOC ~4.5k pure algorithm code. Effort to lift to browser: LOW-MEDIUM. Core algorithms translatable to JS (one-shot port ~2 days). GDAL I/O handling is the pain point (requires raster input/output layer abstraction).
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



## 4. Internal data representation
**Grid/mesh type**: Raster = regular rectangular grid (row/column). Vector = OGR feature collection (point/line/polygon geometries + attributes). No unstructured mesh native support (3D meshes via separate mdal provider). **Resolution & setting**: Raster resolution set per layer via pixel size (X/Y) and extent; no automatic multi-resolution (zoom consistency requires external tile pyramid or level-of-detail system). **Units**: Typically degrees (lat/lon) or meters; CRS defines coordinate units. **Coordinate conventions**: Follows EPSG standard: lon/lat (axis order 2) for geographic CRS, X/Y for projected. Sphere vs plane: handled per CRS (geographic CRS use spheroid defined in EPSG). Wraparound: no native handling (dateline wrapping managed by client code). Poles: EPSG definitions handle pole singularities in conformal projections. **Time & RNG**: No native temporal grid (raster) — temporal properties are metadata only. RNG: seed handling not built-in (determinism left to algorithm provider). **Serialization**: Projects saved as .qgs (XML). Rasters: pixel data via GDAL (GeoTIFF, etc.), metadata embedded. Vectors: OGR native formats. **Relevance to zoom**: CRS transforms maintain coordinate fidelity across zoom levels, but raster resolution must be managed externally (pyramid/LOD); vector geometries preserve precision.

## 5. License
**Verified SPDX**: GPL-2.0 (file: `COPYING` at repo root, matches manifest). **File path verification**: COPYING contains full GNU GPL v2 text. All source files carry GPL-2.0 notice (see header in any .cpp/.h). **Mixed/vendored licenses**: `external/` directory contains vendored libraries with own licenses: spatialindex (LGPL-2.0), wintoast (BSD-3), odbccpp (BSD-2), qhull (Qhull license, non-GPL but compatible). These are build-time dependencies, not runtime-linked as separate packages. **Matches manifest?** Yes, manifest states GPL-2.0, verified in COPYING. **Practical notes**: GPL-2.0 means any extracted/modified code must be released under GPL-2.0 or compatible (e.g., LGPL, BSD, MIT). Dependencies (Proj, GEOS, GDAL) are separate licenses (Proj: MIT, GEOS: LGPL, GDAL: MIT/Apache/others per component) — no conflict if extracted as separate modules. No commercial re-sale restriction. Reuse in MapMaker is feasible under GPL-2.0 copyleft (MapMaker must be GPL-2.0 or relicense terms agreed).

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
| Flat projections | yes | 5/5 | loose | src/core/proj/ (6k+ EPSG via Proj) | Mercator, equirectangular, equal-area, 200+ via EPSG; relies on Proj library. |
| Partial-world inference | no | — | — | — | No plate boundary inference, continental reconstruction. |
| Import of heightmaps/layers | yes | 5/5 | loose | src/providers/, GDAL | 200+ raster/vector formats; GeoTIFF, NetCDF, Shapefile, GeoJSON, GeoPackage, etc. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No algorithm parameter variation, seed-locked preview. |
| Export (PNG/SVG/STL/other) | partial | 3/5 | loose | src/core/io/, GDAL | PNG/GeoTIFF via GDAL; SVG possible (custom); no STL native. |
| Full-state save/resume format | partial | 2/5 | tangled | .qgs XML format | Projects save state; not designed for stateful world resume or seed replay. |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3/5 | loose | src/core/proj/ (EPSG data) | CRS/EPSG calibrated to Earth; no Earth climate/elevation ingestion tools. |
| Planet-parameter derivation | no | — | — | — | No parameter inference from planet physics, orbital elements, interior models. |



## 7. Verdict

- **Extract & adapt**: Projections (EPSG database + Proj wrapping, 13.6k LOC) are reference-grade and directly reusable for flat projections and zoom consistency. Raster terrain analysis algorithms (slope, aspect, hillshade, ruggedness, relief; ~4.5k LOC pure math) are solid, proven, easily ported to JS. Coordinate transform logic (~8k LOC) is essential for planet-scale to regional consistency. GDAL/OGR I/O framework is valuable reference if WASM-porting is feasible; otherwise, hand-pick JS readers for critical formats (GeoTIFF, NetCDF, GeoJSON, Shapefile). Layer model structure (raster + vector abstraction) is useful but tightly Qt-coupled; simpler to rebuild in TypeScript following QGIS architecture loosely.

- **Skip**: Full Processing framework (600+ algorithms, complex Qt/Python integration, and only ~8-10 are terrain-relevant). GUI/styling code (wholly desktop-UI-focused). Project save format (.qgs XML) — design MapMaker's own stateful save. Database providers (PostGIS, Oracle, etc.) — unnecessary for client-side generation.

- **Biggest risks**: (1) Proj library porting — high-quality C library with ~20k LOC, complex ellipsoid math; WASM compilation is feasible but adds build complexity; pure-JS Proj port would be incomplete rewrite. (2) GDAL/OGR — 200+ formats is infeasible to port; mitigate by WASM-compiling GDAL (adds 10MB+ to bundle) or committing to ~5 key formats (GeoTIFF, NetCDF, Shapefile, GeoJSON, GeoPackage) in JS. (3) Qt removal — CRS registry, layer model, I/O wrappers all assume Qt; extraction requires careful decoupling or rewrite. (4) Raster I/O abstraction — GDAL's band-based lazy loading is complex to replicate in JS; plan for eager load or tile-based architecture.

- **Open questions**: Will MapMaker define its own CRS/ellipsoid parameters (e.g., custom world radius) or use Earth EPSG? Are Sobel-based terrain derivatives (standard, 3x3 kernel) sufficient for fantasy world detail (e.g., terrain at 1-10 km resolution), or do you need higher-order curvature (2nd derivatives) or flow accumulation? Which export formats are critical (PNG ✓, SVG ✓, STL ?, GeoJSON ?, custom formats?). Should saved worlds include full raster data (storage cost) or regenerate from seed (compute cost)?
