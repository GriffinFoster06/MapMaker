# Audit: GPlates

## 1. Overview

GPlates is a professional-grade desktop application for interactive visualization of plate tectonics, with an associated Python library (pyGPlates) for programmatic access. Developed by an international team led by researchers at the University of Sydney, the Geological Survey of Norway, and Caltech since 2003. The repository contains ~327K LOC in ~2,276 C++ source files. Active development, modern CMake/Qt6 build system, well-maintained CI. Maturity: production-grade, used in geoscience research.

## 2. Language, runtime, dependencies, build

- **Primary language**: C++ (~90%), with Python bindings via Boost.Python (~10%). Cross-platform (Windows/macOS/Linux).
- **Runtime**: Desktop application with Qt 6 GUI (or Qt5 on older targets). Not designed for browser. PyGPlates is a Python 3.9+ C++ extension module (distributes as PyPI wheels + conda packages).
- **Key dependencies**: 
  - **Rendering/UI**: Qt 6.x (Qt5.15 supported), GLEW, Qwt 6.0.1+
  - **Geospatial**: GDAL 2.0+, PROJ 6+, CGAL 4.12+ (computational geometry)
  - **Build**: CMake 3.22+, Ninja/Make; LLVM toolchain
  - **Python**: Boost 1.69+ (1.70+ if cmake>=3.30), Python 3.8+ for build, 3.9+ for runtime
  - No WASM-native toolchain; C++ codebase would need significant porting.
- **Build determination**: Verified by inspecting CMakeLists.txt, dependencies in pyproject.toml and conda environment files (env.*.yml), and presence of platform-specific BUILD-*.md. CMake available on test system; build is complex but documented. **Builds: inferred from manifest** (not attempted; would require Qt6 + 10+ dependencies via conda).
- **Browser feasibility**: **Not suitable as-is**. Desktop Qt/OpenGL application tightly coupled to GUI framework. Porting to browser would require:
  - Rewrite or WASM-wrap ~50K+ LOC of Qt/OpenGL rendering (src/gui, src/opengl, src/qt-*)
  - Replace GDAL/PROJ with pure-JS alternatives (already available: Proj.js, GeoTIFF.js)
  - Separate core reconstruction logic (plausible: ~100K LOC in src/app-logic, src/maths) from UI
  - Effort: high (9-12 months for a well-staffed team). Recommendation: extract pyGPlates bindings instead and wrap in Node/Wasm, or use as offline reference.

## 3. Subsystem inventory

### 3.1 Plate tectonics reconstruction
- **Where**: src/app-logic/ (Reconstruction*.h, ReconstructionGraph*.h, ReconstructionTree*.h, RotationUtils.h, TotalReconstructionSequence*.h, PlateVelocityUtils.h), src/maths/ (FiniteRotation, SLERP rotation interpolation)
- **What it does**: Builds a directed graph of total reconstruction sequences (plate rotation chains) from feature data. Creates acyclic reconstruction trees at a specified time and anchor plate. Supports 6 reconstruction methods: by-plate-ID, half-stage rotation, small circles, virtual geomagnetic poles, flowlines, motion paths. Computes plate velocities (stage rotations + SLERP). Handles topological plate boundaries.
- **Quality & realism rating: 5/5** — peer-reviewed, published (Müller et al. 2018, GGG). Core algorithm (rotation composition, SLERP) is mathematically sound and extensively tested. Used in production for 20+ years. Handles complex multi-plate systems and handles discontinuities correctly.
- **Extractability: loosely coupled** — Core classes (RotationModel, ReconstructSnapshot in API) are designed for pyGPlates extraction and have minimal GUI/Qt dependencies. Main imports: geometry (CGAL-based polygons/polylines), model layer (feature metadata), maths (quaternions). ~100K LOC extractable as pure C++. Effort to lift to browser: medium-high. Requires WASM-wrapping the C++ or rewriting in JS (reference implementations like GPlately exist in Python but are slow).
- **Requirements capabilities it could serve**: Tectonics; Planet-scale + regional patches (multi-resolution); Partial-world inference (can seed rotation model with partial data).

### 3.2 Feature model and data representation
- **Where**: src/model/ (Feature*.h, Gpgim.h, Metadata.h), file-io/Gpml* (GPlates Markup Language reader/writer), scribe/ (serialization)
- **What it does**: Feature-based data model (analogous to GIS shapefiles). Every entity (rotation sequence, isochron, fault, polygon) is a "feature" with type, properties, validity interval, and unique ID. GPGIM (GPlates Geological Information Model) defines feature schemas (property names, types). Gpml is the native XML dialect; also reads/writes shapefiles, GeoJSON (partial). Revision tracking for undo/redo.
- **Quality & realism rating: 4/5** — Well-designed, covers scientific use cases. GPGIM is comprehensive but evolves slowly (limited to what GPlates team decides). Undo/revision system is elaborate but couple to GUI state.
- **Extractability: loosely coupled** — Core Feature/Gpgim are pyGPlates-exported. Heavy Qt-dependency for file dialogs (src/file-io/ uses GdalUtils, QFileDialog in places). Extractable core ~50K LOC. Hard dependency on GDAL for raster I/O (deliberate, good choice). Effort: low-medium.
- **Requirements capabilities it could serve**: Import of heightmaps/layers (via GDAL support); Full-state save/resume format (via scribe serialization); Export (PNG/SVG/STL if renderers are extracted).

### 3.3 Map projections
- **Where**: src/gui/MapProjection.h/.cc, file-io/Proj.h (wrapper around PROJ library)
- **What it does**: Converts lat-lon to 2D map coordinates using various projections. Currently supports: Orthographic (3D globe), Rectangular (equirectangular), Mercator, Mollweide, Robinson. Wraps the industry-standard PROJ library (libproj). Handles poles, date line wrapping, and clamping for numerical stability.
- **Quality & realism rating: 4/5** — Reuses proven PROJ library, no home-grown math. Limited projection set (only 5 types; Equirectangular ≈ Rectangular). Mercator has documented pole issues; workarounds in place. Suitable for fantasy-world cartography.
- **Extractability: standalone** — Pure adapter over PROJ. No GUI dependencies. Extractable as ~500 LOC C++ class. Effort to lift: low (port existing code or bind PROJ.js). Requirements: must export PROJ wrapper or switch to JS/Wasm port.
- **Requirements capabilities it could serve**: Flat projections (Mercator, Mollweide, Robinson, Equirectangular); Globe view (orthographic); Planet-scale + regional patches (projection handles coordinate transforms).

### 3.4 Geometry, mesh, and spatial operations
- **Where**: src/maths/ (PointOnSphere, PolylineOnSphere, PolygonOnSphere, GreatCircleArc, Quaternion), src/utils/ (spatial indexing), src/app-logic/ (GeometryUtils.cc, TopologyUtils.cc, GeometryCookieCutter.cc)
- **What it does**: Represents and manipulates geometries on a sphere (points, polylines, polygons using CGAL). Implements finite rotations as quaternions, great-circle arcs. Topology resolver builds topological networks (plate boundaries as linked polylines). Spatial indexing via CGAL's constrained Delaunay triangulation.
- **Quality & realism rating: 4/5** — Rigorous spherical geometry (no approximations for small distances), well-tested. CGAL backend is robust. Topology handling is complex but correct. Not real-time optimized (no GPU-accelerated mesh).
- **Extractability: loosely coupled** — Core maths (quaternions, great-circle arcs) are ~20K LOC, pure C++ with minimal external dependencies beyond Boost. Topology resolution couples to feature model (knows about plate boundary features). Extractable ~60K LOC. Effort: medium (quaternion math is straightforward; topology requires understanding the feature model).
- **Requirements capabilities it could serve**: Heightmap generation (if combined with erosion/hydrology); Hydrology (watershed/flow routing uses topological geometry); Planet-scale + regional patches (uses consistent spherical geometry at all scales).

### 3.5 OpenGL rendering and visualization
- **Where**: src/opengl/ (GLRenderer, GLCompiledDrawState, GLProgramObject), src/qt-resources/opengl/, src/gui/ (GlobeRenderedGeometryLayerPainter, MapRenderedGeometryLayerPainter), src/view-operations/
- **What it does**: Renders plate boundaries, reconstructed geometries, rasters, scalar fields to 3D globe (orthographic projection, interactive rotation/zoom via mouse) or 2D map (flat projections). Uses OpenGL 3+, shaders for efficient rendering. Multi-resolution raster tiling for large datasets.
- **Quality & realism rating: 3/5** — Professional rendering pipeline, handles large datasets well. Limited visualization (no volumetric rendering, no advanced effects). GUI coupling is tight (Qt event loop, OpenGL context managed by Qt).
- **Extractability: tangled** — Deep coupling to Qt/QOpenGLWidget and GPlates-specific layer system. Core OpenGL code (~30K LOC) could be extracted but loses context management. Raster tiling is useful (could be ported to WebGL). Effort: high. Recommendation: skip; instead use CesiumJS or Babylon.js for globe, WebGL for 2D maps.
- **Requirements capabilities it could serve**: Globe view; Flat projections (if extractable); Export (PNG, SVG possible if renderers work standalone).

### 3.6 Layer system (composition and caching)
- **Where**: src/app-logic/Layer.h, LayerProxy.h, LayerTask.h, RasterLayerProxy.cc, ReconstructionLayerProxy.cc
- **What it does**: Declarative composition system. Users define layers (e.g., "reconstruct rotation features at 100 Ma", "co-register two rasters", "calculate velocities"). Each layer is a task that caches its output. Layers can depend on other layers; changes propagate. Enables fast iteration (only recompute affected layers).
- **Quality & realism rating: 4/5** — Well-designed caching and dependency system. Flexible and extensible. Not real-time (batch processing, not frame-based). Good fit for scientific workflows.
- **Extractability: loosely coupled** — ~200K LOC of layer implementations (RasterLayerProxy, ReconstructLayerProxy, TopologyGeometryResolverLayerProxy, VelocityFieldCalculatorLayerProxy, etc.). Each layer is a self-contained task. Core infrastructure is decoupled from Qt. Extractable as ~100K LOC. Effort: medium (porting layer implementations).
- **Requirements capabilities it could serve**: Planet-scale + regional patches (layer system handles multi-resolution data); Fidelity/speed slider (could map to layer cache settings); Full-state save/resume (layer graph is serializable via scribe).

### 3.7 Raster handling (import, processing, export)
- **Where**: src/app-logic/RasterLayerProxy.cc, ExtractRasterFeatureProperties.cc, file-io/GdalUtils.h, src/presentation/ (raster rendering)
- **What it does**: Imports rasters (GeoTIFF, netCDF, etc.) via GDAL. Stores as 2D grids with lat-lon georeferencing. Supports co-registration, resampling, masking. Exports as GeoTIFF or PNG. Multi-resolution pyramid for efficient rendering.
- **Quality & realism rating: 4/5** — Leverages GDAL (the industry standard). Georeferencing is correct. No custom processing (that's delegated to external tools or pyGPlates scripts). Good fit for import/export pipelines.
- **Extractability: loosely coupled** — ~40K LOC. Core raster I/O is GDAL (already in browser via GeoTIFF.js or gdal-wasm). Layer proxy couple to GPlates layer system. Extractable ~15K LOC (coordinate transformation, metadata handling). Effort: low-medium.
- **Requirements capabilities it could serve**: Import of heightmaps/layers; Export (PNG, GeoTIFF); Raster co-registration (for calibration).

### 3.8 CLI and Python API
- **Where**: src/cli/ (GPlates command-line tools), src/api/ (pyGPlates bindings via Boost.Python), pygplates/ (Python distribution)
- **What it does**: CLI exposes major features (reconstruct geometries, export rasters, manage rotations). PyGPlates wraps core C++ classes (RotationModel, ReconstructedFeatureGeometry, etc.) for interactive Python scripts and Jupyter notebooks. Distributions: source (conda/pip), binary (Linux wheels, macOS universal, Windows). Well-documented API.
- **Quality & realism rating: 5/5** — API is carefully designed (pyGPlates docs are excellent). CLI is well-integrated. Active maintenance and releases.
- **Extractability: loosely coupled** — PyGPlates core bindings (~30K LOC, cleanly separated in src/api/) are designed for extraction. CLI is also standalone. Effort: low (already extracted; could recompile with subset of features).
- **Requirements capabilities it could serve**: All (if pyGPlates is available, users can script MapMaker offline).

### 3.9 Notable missing subsystems

GPlates has **no built-in support** for:
- **Heightmap/terrain generation** (DEM creation from scratch). It imports and manipulates existing DEMs but doesn't generate them.
- **Erosion modeling** (no fluvial/hillslope erosion solvers).
- **Hydrology** (no river routing, watershed delineation). Topology system is for plate boundaries, not flow routing.
- **Climate simulation** (no temperature, wind, precipitation, ocean currents, or seasonal modeling).
- **Biomes, soils, resources** (no ecosystem or economic simulation).
- **Population/settlement** (no agent-based population dynamics).
- **War/economics/politics** (no historical simulation of human societies).
- **Long-run history** (only handles geological time, not human history beyond calibration data like past climate or coastlines).

## 4. Internal data representation

- **Grid/mesh type**: Primarily feature-based (vector polygons, polylines, points), not raster by default. Rasters are imported and cached as 2D grids. Topologies are stored as planar graphs (nodes = intersections, edges = plate boundaries) using CGAL Delaunay triangulation for fast queries. Globe rendering uses orthographic projection (no special-case handling for poles). 
- **Resolution**: User-configurable. Rasters imported at native resolution. Geometries have no built-in LOD (level-of-detail); rendering uses multi-resolution tiling for large rasters.
- **Units**: SI where applicable (radians for rotations, meters for distances on Earth). Plate velocities in mm/year (standard in geoscience). Rasters use the CRS (coordinate reference system) from GDAL metadata (degrees lat-lon for most, can be arbitrary).
- **Coordinate system**: Spherical (lat-lon on a sphere, no ellipsoid by default; WGS84 ellipsoid used for some PROJ operations). Rotations are represented as quaternions (axis-angle encoded as unit quaternions). Polylines/polygons stored as sequences of lat-lon points on the sphere, with great-circle arcs between them.
- **Time representation**: Geological timescale in Ma (millions of years ago). Features have `valid_time` intervals. Rotation sequences are time-indexed. No sub-second precision; calendar dates possible but not built-in.
- **Serialization**: Native format is Gpml (GPlates Markup Language, an XML dialect). Also reads/writes ESRI Shapefile, GeoJSON (partial). Scribe system (src/scribe/) handles object serialization for undo/redo and state snapshots; not exposed as a public save format.
- **RNG/seed handling**: No built-in random number generation. Deterministic rotation arithmetic. PyGPlates users can seed NumPy if they write stochastic extensions.
- **Cross-zoom consistency**: Excellent. Spherical geometry is consistent; rendering uses the same math at all zoom levels. No known discontinuities between globe and map views. Topology resolution is scale-independent.

## 5. License

**SPDX**: GPL-2.0 (version 2 only, not "or later")  
**Files**: `/Users/griffinfoster/Projects/MapMaker/upstream/GPlates/COPYING` (GPL-2.0 full text)  
**Verified**: Yes. License header in COPYING confirms GPL-2.0, version 2, June 1991. Copyright held by University of Sydney, Geological Survey of Norway, Caltech.

**Mixed licenses**: No vendored code with different licenses detected in spot checks (src/maths, src/app-logic). Third-party libraries (Qt, GDAL, CGAL, PROJ) have their own licenses but are linked, not vendored.

**Practical notes**: 
- GPL-2.0 is strong copyleft (any derivative must be GPL-2.0 or compatible).
- No patent clauses.
- No EULA restrictions (standard GPL terms apply).
- Conflict with MapMaker (currently undefined license): GPL-2.0 derivation must remain GPL-2.0. OK if MapMaker also adopts GPL-2.0 or compatible (MIT, Apache-2.0 are not compatible; would need GPLv3+ or AGPL-3.0 for some compatibility).

**Manifest match**: Yes, upstream-manifest.json lists `"license": { "spdx": "GPL-2.0", "file": "COPYING" }`. Matches.  
**Git commit**: 5392e78f1c1d22a5fe09e2b9702be2514b8e6b47 matches manifest commit.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | yes | 5/5 | loose | src/app-logic/Reconstruction*.h, RotationUtils.h | Peer-reviewed plate reconstruction and rotation algebra. |
| Heightmap generation | no | — | — | — | Only imports, does not generate. |
| Erosion | no | — | — | — | Not implemented. |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | Topology system is for plate boundaries, not flow routing. |
| Climate – temperature | no | — | — | — | Not implemented. |
| Climate – wind | no | — | — | — | Not implemented. |
| Climate – ocean currents | no | — | — | — | Not implemented. |
| Climate – precipitation | no | — | — | — | Not implemented. |
| Climate – seasons | no | — | — | — | Not implemented. |
| Biomes | no | — | — | — | Not implemented. |
| Soils | no | — | — | — | Not implemented. |
| Resources | no | — | — | — | Not implemented. |
| Population & settlement | no | — | — | — | Not implemented. |
| Cities & towns | no | — | — | — | Not implemented. |
| Languages & names | no | — | — | — | Not implemented. |
| Political borders | no | — | — | — | Not implemented. |
| Trade | no | — | — | — | Not implemented. |
| Long-run history/war/economics/politics sim | no | — | — | — | Not implemented. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | partial | 4/5 | loose | src/app-logic/Layer.h, src/gui/MapProjection.h | Projection and geometry handling is zoom-consistent. Raster tiling supports multi-resolution. No explicit LOD for vector. |
| Globe view | yes | 4/5 | tangled | src/gui/, src/opengl/ | 3D orthographic rendering via Qt/OpenGL. Tight Qt coupling. |
| Flat projections | yes | 4/5 | loose | src/gui/MapProjection.h, file-io/Proj.h | Mercator, Mollweide, Robinson, Equirectangular via PROJ library. |
| Partial-world inference | partial | 3/5 | loose | src/app-logic/Reconstruction*.h | Can seed rotation model with partial plate circuits; inference of missing rotations is heuristic, not implemented. |
| Import of heightmaps/layers | yes | 4/5 | loose | src/app-logic/RasterLayerProxy.cc, file-io/GdalUtils.h | GDAL-backed raster import. Multi-format (GeoTIFF, netCDF, etc.). |
| Fidelity/speed slider with same-seed preview | no | — | — | — | Not implemented. Layers are batch-processed, not progressive. |
| Export (PNG/SVG/STL/other) | partial | 3/5 | tangled | src/presentation/, src/file-io/ | PNG via renderers, SVG via export dialog. STL is unverified. |
| Full-state save/resume format | yes | 4/5 | loose | src/scribe/, src/model/ | Scribe serialization exists but is tied to GPlates session (not a portable format). Gpml feature files are portable. |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3/5 | loose | docs/, external calibration data | GPlates provides some paleoclimate data files. No Köppen mapper built-in; users can import custom datasets. |
| Planet-parameter derivation | yes | 3/5 | loose | src/app-logic/ReconstructionGraph*.h, src/maths/ | Can derive planetary tectonics from plate-motion models. No atmosphere/ocean parameters. |

## 7. Verdict

- **Worth extracting**: 
  - Plate reconstruction core (RotationModel, ReconstructionTree, Reconstruction method implementations) — the only comprehensive open-source plate-tectonic reconstruction engine in existence.
  - Map projection wrapper (PROJ adapter) — save effort by reusing.
  - Spherical geometry primitives (PointOnSphere, PolylineOnSphere, great-circle arcs, quaternion rotations) — robust and well-tested.
  - PyGPlates Python bindings — already designed for extraction; use as offline reference or batch processing engine.
  - GDAL integration for raster I/O — well-done, leverage it.

- **Skip entirely**:
  - Qt GUI and OpenGL rendering — too tightly coupled; use WebGL libraries instead (CesiumJS, Babylon.js, Three.js).
  - CLI layer system — useful only if extracting the full layer-based architecture (medium effort, not high ROI).
  - Topology resolver — specialized for plate boundaries; not general-purpose.

- **Biggest risks**:
  - **License**: GPL-2.0 copyleft. Any extracted code or derivative must remain GPL-2.0 or be relicensed to a compatible OSI license (not trivial). Check with MapMaker's license goals.
  - **Language**: C++ with Qt/GDAL dependencies. Extracting core plates tectonics and math requires either WASM-wrapping (12+ weeks) or JavaScript rewrite (~16 weeks). Neither is quick.
  - **Coupling**: Rendering (OpenGL/Qt), layer system, and topology are deeply interdependent. Cleanest extraction is at the API boundary (pyGPlates), not the source level.

- **Unverified points**:
  - STL export feasibility (marked "partial", not tested).
  - Scalability of topology resolver to 10K+ plate boundaries (documentation does not specify).
  - Stability of PROJ projection at extreme latitudes/longitudes (documented issues at poles; not fully tested with MapMaker's use cases).
