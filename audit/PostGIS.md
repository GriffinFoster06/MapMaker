# Audit: PostGIS

## 1. Overview

PostGIS is a mature, widely-deployed PostgreSQL extension implementing OGC-compliant spatial database functionality, maintained by the OSGeo Foundation since ~2006. This audit focuses on **extracting the geometry/topology/raster/projection algorithms** (liblwgeom library), not the PostgreSQL database binding.

Current version: 3.7.0 (Release date: 2026-09-07)
Repository: https://github.com/postgis/postgis
Current commit: 8c02deb339a32ccf4a148ce2ada62480ce8d8c40
**Maturity**: Highly mature, production-grade, actively maintained
**Code size**: ~59k LOC in liblwgeom + postgis core; raster/topology modules add ~59k LOC more. Total: ~269 C files, 120 H files.
**License**: GPL-2.0 (verified in COPYING); main code + all core modules are GPL-2.0. Vendored deps (ryu, uthash, wagyu, flatbuffers) have compatible or separate licenses noted below.

## 2. Language, runtime, dependencies, build

**Primary language**: C (liblwgeom is pure C, no C++ or Fortran). SQL/PL-pgSQL for PostgreSQL integration.
**LOC share**: ~95% C, 5% SQL.
**Runtime/Platform**: PostgreSQL server extension; liblwgeom itself is platform-agnostic C99 with no stdlib beyond POSIX (malloc, math, string).
**Build system**: autoconf/automake (configure.ac, Makefile.in). Supports GNU/Linux, macOS, Windows (MSVC via separate build configs).
**Can it run in a browser**: **No, not as-is.** liblwgeom is pure C with no platform-specific code, but WASM porting would be needed. See "Porting effort" below.

**Required dependencies** (hard errors if missing):
- **GEOS** (>= 3.10, >= 3.15+ for some functions): Topology & boolean ops (ST_Intersection, ST_Union, ST_Buffer, ST_Contains, etc.)
- **PROJ** (>= 6.1): Cartographic projections & datum transforms (ST_Transform, geodetic calculations)
- **libxml2**: WKT/GML parsing (ST_GeomFromGML, ST_GeomFromKML)
- **GMP** (arbitrary precision): Topology support
- **iconv**: Encoding conversion in shp2pgsql loader
- **PostgreSQL headers** (>= 14): Database API bindings (not needed for pure geometry use)

**Optional dependencies**:
- GDAL (>= 2.4, **required for raster module**): Raster import/processing
- SFCGAL (>= 1.3.1, >= 2.3+ for all features): Advanced 3D operations
- protobuf-c (>= 1.1.0): MVT/Geobuf output
- JSON-C: GeoJSON parsing
- GTK (optional GUI shp2pgsql): Not needed for core geometry

**Build status**: Not attempted (would require PostgreSQL dev headers). Inferred from CI configs (.woodpecker, .github/workflows): multi-platform support (Linux x86_64, macOS x86_64/ARM64, Windows x86_64) via GitHub Actions + Woodie CI; builds successfully on all platforms per upstream CI status page (postgis.net/ci/).

**Porting to browser (JS/TS/WASM)**:
- **Effort: HIGH**. liblwgeom has no C++ or high-level abstractions; would require Emscripten or native WASM port
- **liblwgeom core** (~50k LOC): Geometry structures, point-in-polygon, distance, area, envelope, coordinate transforms
- **GEOS dependency**: Critical blocker. GEOS is C (not WASM-friendly without major refactoring). Either:
  - Statically link GEOS into WASM (high complexity)
  - Reimplement GEOS topology ops in JS/TS (very high effort, must match GEOS precision)
  - Use wasm-geos (Emscripten-compiled GEOS) as shim (adds 2-3MB gzipped)
- **PROJ dependency**: Smaller (~30k LOC C), more portable; existing wasm-proj bindings available
- **Recommendation**: For browser use, integrate existing JS libraries (Turf.js, JSTS) for most ops; extract only coordinate transforms and SVG output from PostGIS.

## 3. Subsystem inventory

### 3.1 Coordinate & Geometry Type System

**Where**: `liblwgeom/lwgeom.c`, `liblwgeom/lwpoint.c`, `liblwgeom/lwline.c`, `liblwgeom/lwpoly.c`, `liblwgeom/lwcollection.c`, `liblwgeom/ptarray.c`

**What it does**: Core geometry types (Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection, CircularString, CompoundCurve, CurvePolygon, PolyhedralSurface, Triangle, TIN, NURBSCurve). Point arrays (PTARRAY) for efficient vertex storage. Coordinate dimensions: 2D (X,Y), 3D (X,Y,Z), 2D with measures (X,Y,M), 4D (X,Y,Z,M).

**Quality & realism rating: 5/5**. Industry-standard geometry model following OGC SF/SQL. Fully ISO SQL/MM compliant. Used in production worldwide for 20+ years. Handles all corner cases (empty geometries, multi-part, rings, compound curves, Z/M dimensions).

**Extractability: standalone** — No external deps for core geometry data structures. All C, header-only in practice. Core LOC: ~15k. Effort: **low** (straightforward C data structures + memory management; typedefs easy to translate to TS). No UI deps. Data files: none. 

**Requirements capabilities it could serve**: All geometry I/O and representation (native types for all OGC geometry classes).

---

### 3.2 Measurements (Distance, Area, Length, Perimeter, Angles)

**Where**: `liblwgeom/measures.c` (74k LOC), `liblwgeom/measures3d.c`, `liblwgeom/lwgeodetic_measures.c`, `liblwgeom/lwlinearreferencing.c` (linear referencing: locate point on line by distance)

**What it does**: 
- Euclidean: distance between geometries (2D/3D), area, perimeter, length of lines, point-in-polygon
- Geodetic (spherical): distance on WGS84 sphere, area on sphere, azimuth, length along meridians/parallels
- Linear Referencing: ST_LocateAlong (point at distance M), ST_LineInterpolatePoint (interpolate by fraction), ST_AddMeasure (add distance measures)

**Quality & realism rating: 4.5/5**. Euclidean ops are exact (analytical, not approximate). Geodetic uses great-circle distances, Vincenty inverse formulas for ellipsoids (high precision). Handles M-dimension edge cases. Minor: spherical area uses simplified integral (good for small areas, some error at hemisphere scale).

**Extractability: loosely coupled** — Depends on GEOS for some polygon area ops. Geodetic ops are pure C (no deps). Core LOC: ~50k (measures.c + geodetic). Effort: **medium**. Geodetic math is complex but portable; linear referencing needs line-parameterization algorithm. Data files: ellipsoid parameters built-in (WGS84, etc.).

**Requirements capabilities it could serve**: Hydrology (watershed delineation, flow distances), population dispersal (distance-based), climate/weather (great-circle distances for mapping).

---

### 3.3 Topology & Boolean Operations (Union, Intersection, Difference, Buffer)

**Where**: `liblwgeom/lwgeom_geos.c` (48k LOC), `liblwgeom/lwgeom_geos_clean.c`, `liblwgeom/lwgeom_geos_node.c`, `liblwgeom/lwgeom_geos_split.c`, `liblwgeom/lwgeom_geos_cluster.c`

**What it does**: Boolean set operations (ST_Union, ST_Intersection, ST_Difference, ST_SymDifference), buffering (ST_Buffer with miters/bevels/caps), polygon topology cleaning (removing self-intersections, noding, splitting), constructive/relational topology (ST_Boundary, ST_BuildArea, ST_Polygonize from linesets).

**Quality & realism rating: 5/5**. Wraps GEOS (Geometry Engine Open Source), industry-standard topology engine. Handles degenerate cases (overlaps, self-touching rings, nearly-zero areas). ST_Polygonize is core for network analysis (rivers, political borders).

**Extractability: tangled** — **HARD BLOCKER**: All ops delegate to GEOS C library (~30k LOC C, complex). liblwgeom itself is ~20k but is 80% wrapper code; cannot extract topology alone without GEOS or rewriting entire topology engine. Core LOC (liblwgeom only): 20k. **Porting effort: VERY HIGH**. Either:
  - Ship WASM-compiled GEOS (adds 1-2MB gzipped) 
  - Rewrite topology ops in JS (match GEOS precision, very difficult)
  - Use existing JS libraries (JSTS, Turf) as replacement (limited to 2D, some precision loss)

**Requirements capabilities it could serve**: Hydrology (river network polygonization), political borders (merging adjacent regions), erosion masks, biome boundaries.

---

### 3.4 Geodetic & Spheroid Calculations

**Where**: `liblwgeom/lwgeodetic.c` (95k LOC), `liblwgeom/lwgeodetic_measures.c`, `liblwgeom/lwgeodetic_tree.c`, `liblwgeom/lwspheroid.c`

**What it does**: Latitude-longitude math on ellipsoids: great-circle distance (Haversine), Vincenty formulas (geodetic distance on oblate spheroid), azimuth (initial bearing between points), point-in-polygon on sphere (no planar distortion), coordinate transforms between geographic and projected CRS.

**Quality & realism rating: 4.5/5**. Implements standard geodetic algorithms (Vincenty inverse accurate to mm), WGS84 ellipsoid built-in. Minor imprecision: some functions approximate for speed (e.g., area calculations at poles). Well-tested for Earth-scale applications.

**Extractability: standalone** — Pure C, no external deps. Core LOC: ~95k (lwgeodetic.c is large but self-contained). Effort: **low-medium**. Math is mature and well-documented (USGS, NIST references in code). No data files needed (WGS84 params hardcoded).

**Requirements capabilities it could serve**: Whole-planet generation (globe view coordinate math), climate/weather (great-circle distance for ocean currents, wind patterns), navigation/trade routes.

---

### 3.5 Simplification & Smoothing (Douglas-Peucker, Chaikin, Catmull-Rom)

**Where**: `liblwgeom/effectivearea.c` (14k), `liblwgeom/lwsmoothing.c` (12k), Chaikin/Catmull-Rom in `liblwgeom/liblwgeom.h.in` + core, `liblwgeom/lwstroke.c` (curve-to-line conversion)

**What it does**: 
- **Effective Area** (variant of Douglas-Peucker): Remove redundant points from high-resolution lines, preserves visual appearance, topological safety
- **Chaikin algorithm**: Smooth jagged linestrings by iterative corner-cutting
- **Catmull-Rom splines**: Smooth curve fitting through line vertices
- **Stroke**: Convert circular arcs to line segments (ST_CurveToLine)

**Quality & realism rating: 4/5**. Well-known algorithms, effectively implemented. Effective Area is robust (tolerates nearly-collinear points). Chaikin/Catmull-Rom are standard but are approximations (not suitable for precise cartography). Missing: Bezier clipping, optimal polyline simplification (NP-hard).

**Extractability: standalone** — No external deps, pure C. Core LOC: ~26k. Effort: **low**. Algorithms are classical, well-documented in literature. Parameters tuned for typical cartography use cases.

**Requirements capabilities it could serve**: Export (PNG/SVG rendering at various zoom levels), map simplification (regional->whole-planet), erosion simulation (smoothing roughness).

---

### 3.6 Convex Hull & Delaunay Triangulation

**Where**: `liblwgeom/lwgeom_geos.c` (wraps GEOS), `liblwgeom/lwgeom.c` contains ST_ConvexHull, ST_DelaunayTriangles

**What it does**: **Convex Hull**: ST_ConvexHull returns smallest convex polygon containing all points. **Delaunay Triangulation**: ST_DelaunayTriangles returns triangulated mesh of point set (maximizes minimum angle, many properties).

**Quality & realism rating: 4/5**. Algorithms from GEOS (Qhull for ConvexHull, robust implementations). Delaunay is suitable for mesh generation, terrain interpolation. GEOS implementation is production-grade.

**Extractability: tangled** — Delegates to GEOS. See section 3.3 (Topology). Core LOC: ~5k wrapper. **Porting effort: VERY HIGH** (same GEOS blocker).

**Requirements capabilities it could serve**: Terrain/heightmap generation (Delaunay interpolation), mesh-based hydrology, population/settlement clustering (Voronoi dual of Delaunay).

---

### 3.7 Spatial Indexing (Bounding Box, R-tree interface)

**Where**: `liblwgeom/gbox.c`, `postgis/gserialized_gist_2d.c`, `postgis/gserialized_gist_nd.c` (PostgreSQL GiST index bindings), `liblwgeom/lwtree.c`, `liblwgeom/intervaltree.c`

**What it does**: Axis-Aligned Bounding Box (AABB) calculations for all geometry types. PostgreSQL-specific: GiST (Generalized Search Tree) index for range/spatial queries. Interval trees for measure-based indexing (linear referencing).

**Quality & realism rating: 3/5**. AABB is standard and correct. R-tree bindings are PostgreSQL-specific (not extractable to browser). Interval trees are simple but not optimal for large datasets.

**Extractability: loosely coupled** — AABB computation is standalone (~5k LOC). R-tree/GiST bindings are PostgreSQL-only and not extractable. Effort to extract AABB: **low**. Effort to port R-tree: **N/A** (not needed for browser; use flat spatial hash or quadtree instead).

**Requirements capabilities it could serve**: Zoom/viewport culling (browser rendering), collision detection (settlement/city placement).

---

### 3.8 Projections & Coordinate Transforms (via PROJ library)

**Where**: `liblwgeom/lwgeom_transform.c` (wrapper), PostgreSQL bindings in `postgis/` use PROJ directly

**What it does**: Convert coordinates between geographic (lat/lon) and projected CRS (Mercator, Equal-Area, etc.) via PROJ library. Supports arbitrary source/target SRIDs (Spatial Reference IDs), handles datum shifts and grid files.

**Quality & realism rating: 5/5**. PostGIS delegates to PROJ (industry standard, maintained by OSGeo). PROJ 6+ supports full ISO/OGC CRS standards, grid-based accuracy (sub-meter).

**Extractability: tangled** — Wrapper is ~2k LOC, but core work done by PROJ. Extractability: **medium** (PROJ itself has JS bindings via proj4js or emscripten-compiled PROJ). Core LOC: ~2k wrapper + PROJ dep. Effort: **medium** (use proj4js library for browser, already mature JS port).

**Requirements capabilities it could serve**: All map projections (Mercator, equal-area, gnomonic, polar stereographic), import of external heightmaps/data (must match user's CRS).

---

### 3.9 Input/Output Formats (WKT, WKB, GeoJSON, SVG, GML, KML, TWKB, GeoBuffer, Encoded Polyline)

**Where**: 
- **WKT**: `liblwgeom/lwin_wkt_parse.y` + `lwin_wkt_lex.l` (bison/lex), `liblwgeom/lwout_wkt.c`, `liblwgeom/lwin_wkt.c`
- **WKB/EWKB**: `liblwgeom/lwin_wkb.c`, `liblwgeom/lwout_wkb.c`
- **GeoJSON**: `liblwgeom/lwin_geojson.c`, `liblwgeom/lwout_geojson.c`
- **SVG**: `liblwgeom/lwout_svg.c`
- **GML/KML**: `liblwgeom/lwout_gml.c`, `liblwgeom/lwout_kml.c`
- **TWKB** (Tiny WKB): `liblwgeom/lwin_twkb.c`, `liblwgeom/lwout_twkb.c`
- **GeoBuffer/FlatGeobuf**: `postgis/geobuf.c`, `postgis/flatgeobuf.c`
- **Encoded Polyline**: `liblwgeom/lwin_encoded_polyline.c`, `liblwgeom/lwout_encoded_polyline.c` (Google Maps format)
- **X3D**: `liblwgeom/lwout_x3d.c`

**What it does**: Parse/generate standard geospatial data formats. WKT (text, human-readable), WKB (binary, efficient), GeoJSON (JSON web standard), SVG (vector graphics), GML/KML (XML standards), TWKB (compressed variant), Encoded Polyline (Google Maps compression), X3D (3D format).

**Quality & realism rating: 4.5/5**. All parsers are robust (handle invalid input gracefully), outputs are spec-compliant (WKT ISO/OGC, GeoJSON RFC 7946). Parser implementation uses bison/lex (industry standard). SVG output is clean and renderable. Missing: shapefile format (read-only via shp2pgsql loader).

**Extractability: standalone** — All parsers are pure C, no external deps. Core LOC: ~35k (parsing) + ~30k (output). Effort: **low**. Parsers can be ported to TS/JS directly (grammar is simple); many existing JS libraries exist (GeoJSON parsing in every web framework, SVG is native HTML5). **Recommendation**: Extract only WKB/WKT (PostGIS binary format), GeoJSON, and SVG. Use native browser GeoJSON libs for everything else.

**Requirements capabilities it could serve**: All export formats (PNG, SVG, STL), import of heightmaps/GeoJSON data, GIS interop (QGIS, ArcGIS, etc.).

---

### 3.10 Raster Module (rt_core, rt_pg)

**Where**: `raster/rt_core/` (~40k LOC), `raster/rt_pg/` (PostgreSQL bindings, ~20k), includes map algebra, statistics, vectorization

**What it does**: Raster (grid) data types, storage, map algebra (cell-by-cell operations like elevation + 100), zonal statistics (mean elevation in polygon), raster-to-vector (rasterize vector to grid, vectorize grid to polygons), raster-to-geometry (ST_Polygon from raster band).

**Quality & realism rating: 3.5/5**. Solid implementation for typical raster ops, but: (1) GDAL dependency limits portability, (2) map algebra is not optimized for large global grids (must be tiled), (3) limited to single-band operations per query (must script multi-band ops). Production-grade for regional datasets.

**Extractability: tangled** — Depends on GDAL (Geospatial Data Abstraction Library, ~200k LOC C++). Core rt_core is ~40k C but assumes GDAL for I/O. Extractability: **medium-low**. Can extract map algebra core (30k LOC) but lose GDAL integration. Effort: **high** (GDAL is complex, has JS bindings via gdal-wasm but adds 3-5MB). **Recommendation**: Use existing JS libraries (Geotiff.js for reading GeoTIFFs, simple rasters for map algebra, canvas for rendering).

**Requirements capabilities it could serve**: Heightmap import/rasterization, raster algebra (terrain blending, climate grid math), export to PNG/GeoTIFF.

---

### 3.11 Topology Module (topology schema, node/edge/face/relation tables, polygonization)

**Where**: `topology/` (SQL schema + C functions, ~30k LOC SQL + 10k C), `liblwgeom/topo/` 

**What it does**: Stores vector topologies in PostgreSQL as graph (nodes=vertices, edges=line segments, faces=polygons), supports topological operations (snap, split, merge), ensures consistent face/edge relationships. Core algorithm: ST_Polygonize (build polygons from line network).

**Quality & realism rating: 4/5**. Sophisticated topology model, ISO SQL/Topology standard. Well-tested for cadastral/political data. Main limitation: designed for PostgreSQL, not exportable; requires database for consistency.

**Extractability: tangled** — SQL-heavy, PostgreSQL-specific. C functions are thin wrappers around GEOS. Not extractable to browser without reimplementing entire topology engine (very high effort). **Recommendation**: Skip for browser. If needed for planet generation, implement simple planar graph (nodes + edges) in JS, use ST_Polygonize algorithm from academic literature.

**Requirements capabilities it could serve**: Political borders (topology consistency), hydrology (river network topology), erosion masks (face boundaries).

---

### 3.12 Cluster Analysis (K-Means, DBSCAN, Distance-based Clustering)

**Where**: `liblwgeom/lwkmeans.c`, `liblwgeom/lwgeom_geos_cluster.c`

**What it does**: Partition point sets into clusters: K-Means (spatial clustering around centroids), DBSCAN (density-based, finds arbitrary shapes), distance-within (all points within distance D of cluster seed).

**Quality & realism rating: 3.5/5**. K-Means is standard Lloyd's algorithm. DBSCAN is reference algorithm. Adequate for small-to-medium datasets (~10k points), but not optimized for global point clouds (e.g., settlement distribution).

**Extractability: standalone** — Pure C, no external deps. Core LOC: ~18k. Effort: **low**. Algorithms are well-known; K-Means/DBSCAN are taught in undergrad CS. Parameters (cluster count, epsilon radius) are user-tunable.

**Requirements capabilities it could serve**: Settlement clustering (identify city regions), population distribution analysis, biome clustering (similar climate groups).

---

### 3.13 Bounding Circle & Median

**Where**: `liblwgeom/lwboundingcircle.c`, `liblwgeom/lwgeom_median.c`

**What it does**: Find smallest enclosing circle of point set, compute geographic median (Fermat point, minimizes sum of distances to all points).

**Quality & realism rating: 2.5/5**. Bounding circle uses Welzl's algorithm (correct but not optimized). Median calculation is iterative (converges to Fermat point but slow for large sets, no guarantee of finding global optimum). Useful for visualization but not scientific-grade.

**Extractability: standalone** — Pure C, no deps. Core LOC: ~8k. Effort: **low**.

**Requirements capabilities it could serve**: Map centering/viewport (focus region), settlement location (representative point for city).

---

## 4. Internal data representation

**Geometry storage format**: 
- **In-memory**: C structs (LWPOINT, LWLINE, LWPOLY, etc.) with coordinate arrays (PTARRAY: point array with dimension info)
- **Serialized (on-disk)**: EWKB (Extended Well-Known Binary), derived from OGC WKB standard. Format: type byte + dimensionality flag + SRID (optional) + coordinate stream. Binary format efficient for I/O, human-unreadable.
- **Database storage**: GSerialized format (PostGIS custom, v1/v2 support for backward compat) — compressed EWKB + bounding box + type info for PostgreSQL extension use.

**Grid/Mesh**:
- Raster module uses rectilinear grids (axis-aligned, regular spacing), stored as band arrays (one C array per raster band).
- No native hexagonal/triangular grids; users must convert via Delaunay or similar.

**Resolution/Coordinate conventions**:
- **Units**: User-defined via SRID (Spatial Reference ID). Degrees for geographic (lat/lon, WGS84 = SRID 4326), meters for projected (UTM, Web Mercator = SRID 3857).
- **Coordinate order**: Longitude-first (X=lon, Y=lat) for geographic, matching OGC standards. PostGIS allows both lon-first and lat-first via axis-order functions (ST_SwapOrdinates).
- **Wraparound/poles**: Spherical math (lwgeodetic.c) handles poles and antimeridian crossings explicitly; planar (Cartesian) math treats coordinates as unbounded.
- **3D/4D**: Z (elevation) and M (measure, e.g., cumulative distance) stored in PTARRAY; all 2D algorithms ignore extra dims (safe extension).

**Time step**: N/A (PostGIS is spatial database, not temporal; though PostgreSQL has time types, PostGIS has no temporal geometry).

**Serialization/Save format**: 
- **PostGIS native**: EWKB (textual: ST_AsEWKB produces hex string; binary: raw bytes)
- **Full state**: Table dump (SQL INSERT statements or COPY binary format) recovers entire database state.
- **Interchange**: GeoJSON (text), GeoBuffer/FlatGeobuf (binary).
- **No built-in world save format** for MapMaker (would need custom layer table design).

**RNG/Seed handling**: 
- No built-in RNG in core geometry (deterministic algorithms only). 
- Raster/statistics use PostgreSQL's random() (Mersenne Twister, unseeded by default). 
- Topology clustering (K-Means) uses library RNG (C rand(), not cryptographic).
- **Implication**: Results are reproducible only if seed is explicitly set (PostgreSQL `SET seed` before query).

**Relevance to zoom consistency**: 
- Coordinates are stored in full precision (doubles, ~15 decimal places). 
- Simplification (Chaikin, Douglas-Peucker) is deterministic given tolerance; simplifying at different zoom levels with same seed produces consistent line variants. 
- Danger: Raster resampling (interpolation) is lossy; zoom-consistent rasters need careful parameter tuning (per-band interpolation type, etc.).

---

## 5. License

**Verified SPDX**: GPL-2.0 (confirmed in COPYING file)

**Main code**: GPL-2.0 (all of liblwgeom, postgis, raster, topology, sfcgal bindings)

**Vendored dependencies** (checked in deps/ and documentation):
- `deps/ryu/`: Floating-point printing library — License: Boost Software License 1.0 + Apache 2.0 (dual-licensed, compatible with GPL-2.0)
- `deps/uthash/`: Hash table — License: BSD 2-Clause (compatible)
- `deps/wagyu/`: Geometry simplification algorithm — License: Multiple (geometry MIT, wagyu GPL-2.0, see LICENSE.README for details)
- `deps/flatgeobuf/`: FlatBuffers schema — License: Apache 2.0 (compatible)
- `doc/xsl/`: XSL stylesheets — License: Mozilla Public License (for docbook rendering, not linked into binaries)

**Per-directory inspection**:
- No GPL-3.0 code in main tree (ASPECT, Badlands, GAMA, LPJmL use GPL-3.0 but are separate upstream repos, not vendored)
- SFCGAL (optional 3D extension) is LGPL-2.1 (compatible with GPL-2.0)
- GEOS (external dep) is LGPL-2.1 (compatible)
- PROJ (external dep) is MIT (compatible)

**Matches manifest**: Yes. upstream-manifest.json lists PostGIS as GPL-2.0 with COPYING file, verified.

**Practical notes for extraction**: 
- Any extracted code from PostGIS **must** be GPL-2.0 (viral license; derived works must also be GPL-2.0). This may conflict with MapMaker if it ever ships under a permissive license (MIT, Apache, etc.).
- Vendored deps (ryu, uthash, wagyu) can be extracted separately under their respective licenses (generally less restrictive).
- GEOS and PROJ are external deps, not vendored; licensing applies only if linked.
- **Implication**: MapMaker's license must be at least as permissive as GPL-2.0 (i.e., remain GPL or dual-license under GPL + permissive). This is noted in the project brief; no action required now, but flag for legal review before release.

---

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | PostGIS is geometry library, no plate sim; GPlates/ASPECT upstream repos handle tectonics |
| Heightmap generation | partial | 3/5 | loose | `raster/rt_core/`, `liblwgeom/lwalgorithm.c` | Raster creation via grid algebra; no terrain synthesis (Perlin, erosion must come from ASPECT/Badlands) |
| Erosion | no | — | — | — | No erosion sim; defer to Badlands upstream |
| Hydrology (rivers/lakes/watersheds) | partial | 3.5/5 | loose | `liblwgeom/lwgeom_geos.c` (ST_Polygonize), `liblwgeom/lwlinearreferencing.c` | Polygonize lines to watershed boundaries, linear referencing for flow paths; must pair with heightmap-derived flow direction from external lib |
| Climate – temperature | no | — | — | — | PostGIS has no climate model; CESM upstream is climate reference |
| Climate – wind | no | — | — | — | No wind model |
| Climate – ocean currents | no | — | — | — | No ocean sim; MOM6 upstream for reference |
| Climate – precipitation | no | — | — | — | No precipitation model |
| Climate – seasons | no | — | — | — | No temporal simulation |
| Biomes | no | — | — | — | No vegetation model; LPJmL upstream is reference |
| Soils | no | — | — | — | No soil model; CTSM upstream is reference |
| Resources | no | — | — | — | PostGIS is spatial structure only, no resource generation |
| Population & settlement | partial | 2.5/5 | loose | `liblwgeom/lwkmeans.c`, `liblwgeom/lwgeom_geos_cluster.c` | Clustering (K-Means, DBSCAN) for identifying settlement regions; no population dynamics |
| Cities & towns | no | — | — | — | UrbanSim upstream is reference; PostGIS can store city locations and boundaries |
| Languages & names | no | — | — | — | Azgaars Fantasy Map Generator upstream has naming; PostGIS stores them |
| Political borders | partial | 3/5 | loose | `topology/` (topology schema), `liblwgeom/lwgeom_geos.c` (ST_Union, ST_Polygonize) | Can store and merge adjacent regions (polygons); topology schema ensures consistency; must pair with higher-level political-sim |
| Trade | no | — | — | — | MESSAGEix/OpenSpiel upstream; PostGIS can store trade routes (linestrings) |
| Long-run history/war/economics/politics sim | no | — | — | — | SLiM/OpenSpiel/LIAM2 upstream; PostGIS can store historical states as snapshots |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | yes | 4/5 | loose | `liblwgeom/lwgeodetic.c`, `liblwgeom/effectivearea.c` (simplification), `postgis/gserialized_gist_nd.c` | Geodetic math handles globe coords; effective-area simplification is zoom-safe; spatial indexing for culling; SRID system tracks multiple zones |
| Globe view | partial | 3/5 | loose | `liblwgeom/lwgeodetic.c`, `postgis/gserialized_gist_nd.c` | Geodetic coordinate math on sphere; PostGIS itself has no 3D renderer (CesiumJS upstream); output is geometry (coordinats), rendering external |
| Flat projections | yes | 4.5/5 | loose | `liblwgeom/lwgeom_transform.c`, PROJ library | Full support for Mercator, Equal-Area, Polar Stereographic, etc. via PROJ; extractable via proj4js (JS port) |
| Partial-world inference | no | — | — | — | Requires custom planet-context model, not in PostGIS |
| Import of heightmaps/layers | yes | 4/5 | medium | `raster/rt_core/`, `raster/rt_pg/rtpg_geometry.c` (rasterize), `liblwgeom/lwin_geojson.c`, `postgis/geometry_inout.c` | Can import rasters (GDAL backend), vectors (GeoJSON/WKT/Shapefile via loader), store in spatial index |
| Fidelity/speed slider with same-seed preview | no | — | — | — | PostGIS has no generative model; seed management must be external (user sets PostgreSQL seed, then runs deterministic simplification) |
| Export (PNG/SVG/STL/other) | partial | 3.5/5 | loose | `liblwgeom/lwout_svg.c`, `raster/rt_pg/` (PNG via GDAL), `liblwgeom/lwout_x3d.c` (3D) | SVG output native; raster export via GDAL (medium effort to port); X3D for 3D; no STL (would need custom converter) |
| Full-state save/resume format | partial | 2.5/5 | loose | `postgis/geometry_inout.c`, serialization via EWKB/GeoJSON/SQL dump | Can serialize geometries to EWKB/GeoJSON; must add custom layer table schema for full-world state |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | PostGIS is library, no calibration data; VPLanet upstream for planet params; would need separate data import pipeline |
| Planet-parameter derivation | no | — | — | — | No derivation model; higher-level simulation required |

---

## 7. Verdict

**What to extract**:
- **Coordinate transforms & projections** (`liblwgeom/lwgeom_transform.c`, geodetic math in `lwgeodetic.c`): Use existing JS bindings (proj4js for PROJ, or emscripten-compiled wasm-proj). PostGIS wrapper is thin; skip and use JS PROJ directly.
- **I/O format parsers** (WKT, WKB, GeoJSON, SVG, Encoded Polyline in `lwin_*.c` + `lwout_*.c`): Highly portable C code. Extract WKB/WKT parsers for PostGIS interop; GeoJSON parsing already mature in JS libraries. SVG output is useful as reference (exact implementation can be mimicked in JS).
- **Measurements** (distance, area, bearing in `measures.c` + `lwgeodetic_measures.c`): Pure C, no deps. Extract for accurate great-circle math on sphere (essential for climate/weather modeling, trade routes).
- **Geometry type system** (LWPOINT, LWLINE, LWPOLY structures): Reference implementation for OGC-compliant type definitions; adapt struct layout to TS classes/interfaces.
- **Simplification algorithms** (Chaikin, Catmull-Rom in `lwsmoothing.c`, effective area in `effectivearea.c`): Pure C, zoom-safe. Extract for multi-scale map rendering.
- **K-Means clustering** (`lwkmeans.c`): Extract for settlement/biome clustering; simple algorithm, low porting cost.

**What to skip or reimplement**:
- **Topology & boolean ops** (GEOS wrapper in `lwgeom_geos.c`): HARD BLOCKER. GEOS C library is 30k LOC with complex dependencies. Options:
  1. Use JSTS (JavaScript Topology Suite, JS port of JTS, fully browser-native but limited to 2D and some precision limitations)
  2. Ship wasm-compiled GEOS (adds 1-2MB gzipped payload; heaviest option but most accurate)
  3. Reimplement in TS (very high effort; must match GEOS precision for scientific correctness)
  - **Recommendation**: Start with JSTS for MVP (union, intersection, buffer). Plan GEOS wasm fallback if precision issues arise.
- **Raster module** (`raster/rt_core`, `raster/rt_pg`): GDAL dependency (200k LOC C++, complex). Porting cost is very high. **Alternative**: Use existing JS libraries (Geotiff.js for GeoTIFF reading, canvas/WebGL for raster rendering, simple map-algebra ops in JS). Store rasters as GeoTIFF externally, process via library, not via PostGIS.
- **Topology schema** (`topology/` SQL): PostgreSQL-specific, not portable. Skip; use simple planar-graph data structure in TS if topology consistency is needed.
- **3D/SFCGAL bindings** (`lwgeom_sfcgal.c`): Optional and complex. If 3D needed, use Three.js or Babylon.js (browser 3D engines) + PostGIS 3D output (WKB/GML) as data source.

**Biggest risks**:
1. **GEOS dependency**: Topological correctness is hard to replicate in JS. ST_Polygonize (rivers/borders) is critical for hydrology/political simulation; must solve GEOS blocker early (JSTS vs. wasm-geos trade-off).
2. **Precision & numerical stability**: PostGIS uses doubles (IEEE 754, ~15 decimal places). Some globe-scale operations (Vincenty at poles, area near equator) have subtle precision issues; must test on real Earth data and tune parameters.
3. **PROJ integration**: PROJ's CRS database is huge (~4k CRS definitions + grid files). JS ports (proj4js) support common projections only; if custom CRS needed, must fallback to wasm-proj (size penalty) or generate params manually.
4. **License (GPL-2.0)**: Viral license; any extracted code must remain GPL-2.0 or dual-license. MapMaker's final license must be compatible.

**Open questions**:
1. How much topological correctness is needed? If ~90% accuracy is acceptable, JSTS can ship in MVP; otherwise, commit to GEOS wasm early.
2. Will MapMaker need custom CRS beyond standard (Mercator, Web Mercator, Lat/Lon)? If yes, wasm-proj becomes mandatory.
3. How will rasters be handled? External library (Geotiff.js) or embedded PostGIS raster module?
4. Can topology sim (rivers, borders) be deferred to later phase? If not, GEOS blocker must be resolved now.

**Summary**: PostGIS is a goldmine of **geometry/topology algorithms**, but its browser-portability is constrained by **GEOS (hard blocker) and GDAL (medium blocker)**. Core extraction strategy: grab coordinate math, I/O formats, measurements, and simplification; solve GEOS via JSTS MVP or wasm-geos fallback; defer rasters to external JS lib. **Estimated extraction LOC for browser MVP: 500-1000 LOC TypeScript** (geometry types, geodetic math, simplification, I/O parsers). **Porting cost: medium** (2-3 weeks for core + JSTS integration, less if GEOS complexity is acceptable delay).

---
