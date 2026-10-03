# Audit: Delft3D

## 1. Overview

Delft3D is a professional-grade hydrodynamics and morphodynamics simulation suite developed by Deltares for modeling coastal, estuarine, and fluvial systems. It contains ~4,700 Fortran source files (~1.55M LOC) and ~1,630 C/C++ files (~166k LOC) organized into multiple coupled engines (D-Flow FM, Delft3D-FLOW, D-Hydrology, D-WAQ, D-Waves, Delft3D-PART) for structured and unstructured grid simulations. The project is mature, actively maintained (commit 38d26033e69776078c09f6985d32840b4d3cf444), and used operationally by hydrological engineering firms worldwide. It is NOT designed for whole-planet world-building or browser deployment.

## 2. Language, runtime, dependencies, build

**Primary languages:**
- Fortran 90/95: ~4,721 files, ~1.55M LOC (87% of codebase)
- C/C++: ~430 files + 1,200 headers, ~166k LOC (9%)
- Build scripts: Python, CMake, Fortran

**Runtime / platform:**
- Command-line binaries only (no UI or web interface)
- Requires native compilation (Windows/Linux/Mac with Intel or GNU Fortran compiler)
- Parallel execution via OpenMP and MPI (PETSc distributed)
- NOT browser-capable; WASM port would require complete rewrite

**Key dependencies (pinned via Conan):**
- HDF5/1.14.2, NetCDF/4.9.2, NetCDF-Fortran/4.6.2 (scientific data I/O)
- GDAL/3.12.1, PROJ/9.3.1, libtiff/4.7.1 (geospatial)
- PETSc/3.25.3 (parallel linear algebra)
- Boost/1.90.0, Eigen/5.0.1 (numerical/utilities)
- preCICE/3.4.1 (coupling)
- zlib, libxml2, expat, Triangle/1.6 (utilities)

**Build system:**
- CMake (minimum version 3.30)
- Conan package manager (conanfile.py specifies all dependencies)
- Separate build configs for Delft3D 4 (d3d4-suite) and Delft3D FM (fm-suite)
- Requires Intel OneAPI Fortran compiler on Windows (environment check in CMakeLists.txt)

**Does it build?**
Inferred from build configuration files; actual build NOT attempted (per policy). Build appears to require:
1. `conan install` to fetch dependencies (heavy: HDF5, PETSc, GDAL, NetCDF)
2. `cmake` with proper Fortran toolchain configuration
3. Substantial compile time (large Fortran codebase, parallel compilation possible)

Red flags: Heavy Fortran/C++ coupling, PETSc dependency (distributed memory), requires licensed Intel compiler on Windows. Linux build likely feasible with gfortran.

**Browser porting:**
NOT FEASIBLE. This is a large, tightly coupled Fortran codebase relying on:
- Compiled linear algebra (PETSc) and I/O libraries (HDF5, NetCDF) not available in browser
- Structured grid solvers (implicit time-stepping, distributed arrays) designed for HPC
- No existing WASM bindings for core dependencies
- Extracting hydrology/morphology logic would require understanding ~hundreds of Fortran modules with implicit state

Estimated effort: 6+ months of expert porting work, or complete algorithmic reimplementation in JS.

## 3. Subsystem inventory

### 3.1 Hydrodynamics – D-Flow FM / Delft3D-FLOW
**Where:** `src/engines_gpl/dflowfm/` (D-Flow FM, ~8 packages), `src/engines_gpl/flow2d3d/` (Delft3D-FLOW, legacy)

**What it does:** Solves shallow-water equations (2D/3D depth-averaged flow) on unstructured (FM) or structured (legacy) grids using implicit finite-volume schemes. Handles wetting/drying, friction, wind forcing, real-time control. D-Flow FM supports 1D–2D coupling via link networks.

**Quality & realism rating: 4.5/5** — Industry-standard coastal/estuarine hydrodynamics. Validated against field data for tides, storm surge, river flow. Suitable for regional scales (km–100s km). Not designed for whole-planet; no atmospheric coupling or global boundary conditions. Sediment transport (next subsystem) is coupled.

**Extractability: tangled** — Core solver (`dflowfm_kernel`, ~20k LOC) depends deeply on unstructured mesh management (`gridgeom`), NetCDF I/O, PETSc linear algebra. Coupled with D-Morphology via state arrays. No clean API; extraction would require wrapping entire solver or reimplementing in JS (high effort).

**Requirements capabilities it could serve:** Hydrology (rivers/lakes/watersheds), partial-world inference (if regional flow inferred from surrounding topography).

### 3.2 Morphodynamics / Sediment Transport
**Where:** `src/utils_gpl/morphology/packages/` (data/kernel modules), coupled into `flow2d3d` and `dflowfm`

**What it does:** Models bedload and suspended-load sediment transport using empirical transport formulas (van Rijn, Watanabe, etc.), bed roughness evolution, bank erosion, and morphological acceleration (time-step multiplication for faster bed changes). Includes limitations: primarily for non-cohesive sediment, tropical rivers, coastal zones; NOT for deep-time/tectonic erosion.

**Quality & realism rating: 3/5** — Useful for engineering timescales (days–years) and coastal/fluvial morphodynamics. Limited to small sediment size ranges and moderate flow. Does NOT include: hillslope/landscape erosion, regolith production, tectonic interactions, vegetation effects on erosion. Calibrated for real rivers but not suitable for fantasy world generation (which typically needs broader parameter ranges and less tuning data).

**Extractability: tangled** — Morphology kernel is a set of modules (`morphology_data_module`, transport formula subroutines) tightly coupled to flow solver via shared state (bed elevation, velocity arrays, cell connectivity). Heavy Fortran module dependencies. Would require porting flow solver too.

**Requirements capabilities it could serve:** Erosion (limited scope: river/coastal, not hillslope).

### 3.3 Hydrology – D-Hydrology
**Where:** `src/utils_gpl/dhydrology/packages/` (dhydrology_kernel, dhydrology_io)

**What it does:** Rainfall-runoff model with soil infiltration, groundwater storage, and streamflow routing. Integrable into D-Flow FM for 1D river networks and 2D floodplains. Limited to regional scale (km–10s km).

**Quality & realism rating: 2.5/5** — Serviceable but basic. Implements simplified bucket-model soil water balance and linear reservoir routing. Suitable for operational hydrology (day-to-day forecasting) but simplified compared to land-surface models (no vegetation, no radiation balance, calibrated for specific catchments). NOT suitable for global climate-driven hydrology or diverse biomes.

**Extractability: loosely coupled** — D-Hydrology is a plugin/utility module with its own I/O layer (dhydrology_reader, dhydrology_io). More modular than morphology but still Fortran-based, using NetCDF I/O. Could potentially extract infiltration and routing algorithms if reimplemented in JS; core logic is ~1–2k LOC.

**Requirements capabilities it could serve:** Hydrology (rivers/lakes/watersheds), climate (precipitation routing).

### 3.4 Water Quality – D-WAQ (Delft3D-WAQ)
**Where:** `src/engines_gpl/waq/` (largest subsystem: waq_kernel, waq_computation, waq_preprocessor, waq_netcdf, waq_process, etc.)

**What it does:** Lagrangian and Eulerian mass-balance transport for nutrients, tracers, pollutants, dissolved oxygen, algae growth, etc. Couples to hydrodynamic solution (flow/water levels) via pre-computed mass-flux arrays or live link.

**Quality & realism rating: 3/5** — Comprehensive biogeochemistry but specialized for water quality engineering (eutrophication, pollutant fate). NOT relevant to fantasy world generation; designed for real-world calibration against field chemistry data. Does not model ocean/atmosphere cycles.

**Extractability: tangled** — ~22 subdirectories, heavy Fortran modules, tight coupling to hydrodynamic output format (NetCDF). No clean subsetting.

**Requirements capabilities it could serve:** None directly relevant (water quality not in MapMaker scope).

### 3.5 Wave Modeling – D-Waves / Delft3D-WAVE
**Where:** `src/engines_gpl/wave/`

**What it does:** Wave generation, growth, refraction, and dissipation. Wrapper around SWAN (Simulating WAves Nearshore, third-party Fortran library in `src/third_party_open/swan/`). Provides 2D spectral wave model for coastal/estuarine applications.

**Quality & realism rating: 3.5/5** — SWAN is a well-validated spectral wave model (used operationally by NOAA, many coastal authorities). Good for regional coastal applications. NOT for global/planetary ocean dynamics.

**Extractability: very tangled** — SWAN is a large, coupled Fortran code with its own time-stepping. Wrapping it requires understanding wave physics (spectral growth, dispersion, refraction). WASM conversion difficult. Architectural mismatch for fantasy generation (which would need simple wind-to-wave transfer or skip waves entirely).

**Requirements capabilities it could serve:** Climate (wind-wave coupling) — but at wrong scale (coastal, not global).

### 3.6 Particle Tracking – Delft3D-PART
**Where:** `src/engines_gpl/part/`

**What it does:** Lagrangian particle advection and dispersion in 2D/3D flow fields. Used for sediment tracing, pollutant plume modeling, larval transport.

**Quality & realism rating: 2.5/5** — Adequate for engineering applications (tracing). Limited to passive/weakly-interacting particles; not suitable for agent-based population modeling or emergent behavior.

**Extractability: loosely coupled** — Particle logic is modular but depends on reading hydrodynamic output (NetCDF). Could potentially extract advection-diffusion kernel if flow fields are provided externally.

**Requirements capabilities it could serve:** Possibly population/settlement (if reimagined as agent movement), but weak fit.

### 3.7 Utilities: Grid Geometry, I/O, Mesh Generation
**Where:** `src/utils_lgpl/gridgeom/`, `src/utils_lgpl/delftio/`, `src/utils_lgpl/nefis/`, `src/utils_lgpl/io_netcdf/`, plus external tool references (MeshKernel, QUICKPLOT, dfm_tools)

**What it does:** Unstructured/structured grid management, NetCDF/HDF5/NEFIS (legacy format) I/O, mesh refinement via Triangle library.

**Quality & realism rating: 3/5** — Solid utility libraries; nefis/delftio are Deltares-specific but widely used in hydro modeling. gridgeom handles complex mesh topologies (good for unstructured FEM).

**Extractability: standalone** (I/O utilities); **loosely coupled** (gridgeom) — These utilities are more separable than engines. NetCDF I/O could be used in a JS environment via existing libraries (netcdf.js). Mesh geometry ops could potentially be extracted as a reference (triangulation, polygon winding, etc.). Estimated extractable LOC for a slim gridgeom port: ~2–3k.

**Requirements capabilities it could serve:** Import of heightmaps/layers (if mesh gen extracted), data persistence (if NetCDF adopted).

### 3.8 1D Flow & Implicit Routing
**Where:** `src/utils_gpl/flow1d/`, `src/utils_gpl/flow1d_implicit/`

**What it does:** 1D shallow-water solver for channel/river networks, with option for implicit (unconditionally stable) time-stepping. Designed to couple with 2D domains via link nodes.

**Quality & realism rating: 3/5** — Serviceable 1D hydraulics; used operationally. Not novel; standard de St. Venant equations solver.

**Extractability: loosely coupled** — 1D flow is somewhat decoupled from 2D; could potentially be extracted as a separate river-routing engine. Heavy Fortran use; reimplementation in JS feasible but requires care with Courant stability, implicit schemes.

**Requirements capabilities it could serve:** Hydrology (river/stream routing); could be core to a simplified planetary hydrology engine if reimplemented.

### 3.9 Real-Time Control & Feedback Control
**Where:** `src/engines_gpl/rtc/`, `src/engines_gpl/fbc/`

**What it does:** Control logic for water management (gates, pumps, weirs). Evaluates rule-based or PID control strategies and applies them to flow structures.

**Quality & realism rating: 1/5** — Specialized for operational water management (not relevant to fantasy world). Engineering-focused, not scientific.

**Extractability: not applicable** — Out of scope for MapMaker.

**Requirements capabilities it could serve:** None.

### 3.10 Rainfall-Runoff & Drainage (D-Rainfall-Runoff)
**Where:** `src/engines_gpl/rr/` (includes reference to external CAPSIM engine)

**What it does:** Lumped rainfall-runoff model with abstract reservoirs and flow paths.

**Quality & realism rating: 2/5** — Very simplified; more a teaching tool or rapid scoping model than a production engine.

**Extractability: loosely coupled** — Small module; could extract the routing logic if needed.

**Requirements capabilities it could serve:** Hydrology (precipitation → runoff routing).

## 4. Internal data representation

**Grid / mesh type:**
- Delft3D 4: Structured curvilinear grids (logically rectangular, orthogonal projection)
- Delft3D FM: Unstructured triangular/polygonal cells + 1D network links
- No icosahedral or cubed-sphere grids; no multiresolution quadtree/octree

**Resolution(s) & setting:**
- User-specified uniform or nested grids; typical range: 10 m (coastal) to 100+ km (river reaches)
- No hierarchical multi-resolution or zoom consistency built-in; different scales require separate model instances

**Units:**
- SI units (meters, seconds, kg/m³)
- Elevation in absolute elevation (m above sea level or datum), not normalized
- Water depth positive, bed elevation signed

**Coordinate conventions:**
- Latitude/longitude or projected coordinates (via PROJ library)
- Cartesian x, y with optional 3D z (depth layers for 3D models)
- No explicit pole handling for global models; limited to regional domains

**Time representation:**
- Continuous absolute time (seconds since reference date, typically 1970-01-01 or user-specified)
- Time step fixed or adaptive (for stability); typical range: 0.1–10 sec for flow, 1–100 sec for morphology
- No built-in accelerated time (unlike some landscape evolution codes)

**State serialization (save format):**
- NetCDF + map-format binary files (proprietary .map files) for snapshots
- HDF5 for restart files (internal state dump)
- No unified "replay/resume" format; restart requires knowledge of model structure (grid, time indices)

**RNG / seed handling:**
- Deterministic (no RNG in core solvers); initial conditions and boundary conditions set externally
- Some turbulence/dispersion models include stochastic terms but are seeded at compile-time or via parameter files
- NOT designed for "same-seed preview" workflows (would require manual code refactoring)

**Multi-resolution / zoom consistency:**
- Not built-in; requires explicit nesting procedures (offline interpolation or 2-way coupling via preCICE)
- No continuous detail across scales; different grid resolutions produce different results

## 5. License

**Verified from `/Users/griffinfoster/Projects/MapMaker/upstream/Delft3D/LICENSE`:**

- **Deltares-authored code:**
  - GPL-3.0 or AGPL-3.0 (simulation engines: D-Flow FM, Delft3D-FLOW, D-Morphology, D-WAQ, D-Waves, D-Part, Real-Time Control, Rainfall-Runoff)
  - LGPL-2.1 (utility libraries: gridgeom, nefis, delftio, io_netcdf, waq_hyd_data, deltares_common, etc.)

- **Third-party bundled code:**
  - SWAN wave model: GPL-3.0 (in `src/third_party_open/swan/`)
  - METIS graph partitioning: Apache 2.0 or custom (in `src/third_party_open/metis/`)
  - Triangle mesh generator: license in `src/third_party_open/triangle/` (custom, see LICENSE file)
  - FLAP Fortran library: GPL-3.0, BSD-2, BSD-3, or MIT (user choice; in `src/third_party_open/FLAP/`)
  - spherepack (spherical harmonics): MIT (in `src/third_party_open/spherepack/`)
  - fortrangis (Fortran GIS bindings): GPL-3.0 (in `src/third_party_open/fortrangis/`)
  - kdtree2: GPL-2.0 or MIT (in `src/third_party_open/kdtree2/`)
  - Various others: pugixml, doxygen, xsd, Xerces-C (see LICENSE files in respective dirs)

- **Per-component verification:**
  - `src/engines_gpl/` directories: GPL-3.0 and AGPL-3.0 (confirmed by file headers and LICENSE annotations)
  - `src/utils_gpl/` directories: GPL-3.0
  - `src/utils_lgpl/` directories: LGPL-2.1
  - `src/plugins_lgpl/` directories: LGPL-2.1
  - `src/tools_gpl/` directories: GPL-3.0 and LGPL-2.1 (mixed)

**Manifest match:** ✓ Yes. Upstream-manifest.json lists "Multiple (LGPL-2.1, Apache-2.0, others per component)" which is accurate.

**Copyleft strength:**
- GPL-3.0 (engines): Strong reciprocal; any derivative must be released under GPL-3.0 or compatible.
- AGPL-3.0 (D-Flow FM, D-Morphology): Network use clause; if Delft3D used as a service (e.g., cloud API), source must be offered to users.
- LGPL-2.1 (utilities): Weak reciprocal; can link from proprietary code if library unmodified or modifications shipped as separate object files.

**Patent clauses:** None explicitly stated; GPLv3 includes anti-Tivoization clause (relevant if deploying on restricted hardware).

**EULA restrictions:** LICENSE file is standard GPL/LGPL; no proprietary EULA unlike some other repos (e.g., WRF-Hydro).

**Practical notes for MapMaker:**
- Extracting GPL/AGPL code requires MapMaker to adopt same license or ship as separate executable
- LGPL utilities (gridgeom, I/O) are more permissive; can be used if unmodified or packaged separately
- Complex multi-license setup; legal review recommended before extraction

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | No | — | — | — | Not addressed; no plate dynamics or crustal models. |
| Heightmap generation | Partial | 2/5 | Loose | `src/utils_lgpl/gridgeom/`, `src/utils_lgpl/nefis/`, examples/ | Mesh generation and raster I/O present; not designed for procedural landscape. |
| Erosion | Partial | 3/5 | Tangled | `src/utils_gpl/morphology/`, `src/engines_gpl/flow2d3d/`, `src/engines_gpl/dflowfm/` | Bedload/suspended-load transport formulas (van Rijn, etc.); coastal/fluvial scale; not hillslope erosion. |
| Hydrology (rivers/lakes/watersheds) | Yes | 3.5/5 | Loose/Tangled | `src/utils_gpl/dhydrology/`, `src/utils_gpl/flow1d/`, `src/engines_gpl/dflowfm/packages/dflowfm_kernel/` | Flow routing, infiltration, streamflow; regional scale (km–100s km); coupled to hydrodynamics. |
| Climate – temperature | No | — | — | — | Not included; CESM/CTSM upstream repos handle this. |
| Climate – wind | Partial | 2/5 | Tangled | `src/engines_gpl/wave/`, `src/third_party_open/swan/` | Wind stress on water surface (SWAN wave model); not wind field generation or spatial distribution. |
| Climate – ocean currents | Yes | 4/5 | Tangled | `src/engines_gpl/dflowfm/packages/dflowfm_kernel/` | D-Flow FM solves for velocity fields in coastal/estuarine domains; high-fidelity but regional scale only. |
| Climate – precipitation | Partial | 2.5/5 | Loose | `src/utils_gpl/dhydrology/packages/`, `src/engines_gpl/rr/` | Accepts precipitation time series as boundary condition; no generation or spatial modeling. |
| Climate – seasons | No | — | — | — | Not addressed; requires external climate driver. |
| Biomes | No | — | — | — | Not included; LPJmL upstream repo handles this. |
| Soils | No | — | — | — | Not included; CTSM upstream repo handles soil hydrology. |
| Resources | No | — | — | — | Not addressed. |
| Population & settlement | No | — | — | — | Particle tracking (PART) is passive; not suitable for population dynamics. |
| Cities & towns | No | — | — | — | Not addressed. |
| Languages & names | No | — | — | — | Not addressed. |
| Political borders | No | — | — | — | Not addressed. |
| Trade | No | — | — | — | Not addressed. |
| Long-run history/war/economics/politics sim | No | — | — | — | Not addressed; designed for hydrological/coastal engineering timescales (hours–years). |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | No | 1/5 | — | — | Requires separate model instances per scale; no continuous detail hierarchy or consistent inferred context. |
| Globe view | No | — | — | — | Designed for regional/coastal domains; no spherical geometry or global coupling. |
| Flat projections | Partial | 3/5 | Loose | `src/utils_lgpl/gridgeom/`, PROJ dependency | Structured curvilinear + Cartesian grids; PROJ library supports many projections; no built-in projection UI. |
| Partial-world inference | No | — | — | — | No mechanisms to infer tectonic/oceanographic context from a regional heightmap. |
| Import of heightmaps/layers | Yes | 3/5 | Loose | `src/utils_lgpl/delftio/`, `src/utils_lgpl/io_netcdf/`, GDAL | Can read GeoTIFF, HDF5, NetCDF; requires manual mesh generation and setup. |
| Fidelity/speed slider with same-seed preview | No | 1/5 | — | — | Designed for fixed-fidelity runs; no built-in coarse-to-fine progression or preview mode. |
| Export (PNG/SVG/STL/other) | Partial | 2/5 | Loose | `src/utils_lgpl/delftio/`, `src/utils_lgpl/nefis/` | Exports to NetCDF, HDF5, map-format binary; post-processing required for PNG/SVG/STL (not in-engine). |
| Full-state save/resume format | Partial | 2/5 | Loose | Restart file logic in HDF5 modules | Proprietary restart format (.rst, NetCDF-based); can resume hydrodynamic runs but not full-world state. |
| Earth-data calibration (elevation/climate/Köppen) | Partial | 3/5 | Loose | Real-world examples in `examples/delft3d4/`, `examples/dflowfm/` | Calibrated to real coastal/river systems; tools for parameter tuning; not designed for global earth-system calibration. |
| Planet-parameter derivation | No | — | — | — | Not addressed; requires climate models (CESM) or empirical rules. |

## 7. Verdict

**Top-line:** Delft3D is a production hydrodynamics/morphodynamics suite, NOT a world generator. Too specialized, scale-mismatched, and tightly coupled for direct extraction into MapMaker. Limited value except as an algorithmic reference.

**Worth extracting:**
1. **Flow routing logic** (if reimplemented in JS): 1D/2D shallow-water equations or simplified quasi-2D routing could inspire a fast regional hydrology engine. Estimated extraction: weeks–months of algorithmic study + JS reimplementation (medium effort).
2. **Sediment transport formulas** (bedload/suspended): Van Rijn, Watanabe coefficients are well-documented empirical relationships; worth adapting if MapMaker needs regional-scale erosion. Estimated extraction: days (documentation only; no code reuse).
3. **Mesh/grid utilities** (gridgeom): Unstructured mesh topology ops (triangulation, neighbor-finding, area/length calcs) could be extracted or replaced with existing JS libraries (Delaunay.js, turf.js). Estimated extraction: low (reference only; use JS equivalents).

**Skip:**
- Entire hydrodynamic solver (too heavy, Fortran-based)
- WAQ/wave/particle tracking (wrong scope for fantasy world)
- Real-time control logic (not relevant)
- WASM porting (unfeasible cost; reinvention cheaper)

**Biggest risks:**
1. **Porting risk (HIGH):** GPL-3.0/AGPL-3.0 copyleft + Fortran → MapMaker must either adopt same license, ship Delft3D as separate service, or reimplement in JS. No middle ground.
2. **Coupling risk (MEDIUM):** Hydrology, morphology, flow are deeply interdependent; extracting one without the others is fragile and incomplete.
3. **Scale mismatch (HIGH):** Delft3D is optimized for 10 m – 100+ km regional domains (days–years timescales). Whole-planet generation (required by MapMaker) needs different algorithms, data structures, and parameter ranges. Direct reuse will produce inaccurate or nonsensical results at planetary scale.
4. **Unverified:** Exact separation of per-module licenses not audited at file level; spot-checks show stated licenses in headers, but exhaustive per-file check deferred.

**Open questions:**
- Can D-Hydrology hydrology kernel be isolated and ported without the full flow solver? (Needs deeper code inspection; estimated feasibility: 50%)
- Are there standalone implementations of van Rijn sediment transport in JS/TS? (Likely yes; recommend searching npm before extracting Fortran)

**Recommendation:** Use Delft3D as an *algorithmic and validation reference* (for equations, parameter ranges, test cases). Do NOT attempt code extraction. Invest in a custom JS/TS hydrology + erosion engine drawing on published scientific literature (cited in Delft3D docs, e.g., van Rijn 1984, Watanabe 1987) and simpler, more modular architectures (e.g., inspired by orogen, ASPECT's approach to geodynamics).
