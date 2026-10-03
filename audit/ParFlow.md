# Audit: ParFlow

## 1. Overview

ParFlow is an open-source, modular, parallel integrated hydrologic model that couples surface and subsurface flows, jointly developed by Colorado School of Mines, Lawrence Livermore National Lab, University of Bonn, and UC Berkeley since 1995. It is highly mature (v3.15.0), actively maintained, and widely used for hydrogeological research and engineering. The codebase is ~144K lines in the simulator (pfsimulator/), ~66K in tools (pftools/), split across C, Fortran, and C++ for HPC parallelization.

## 2. Language, runtime, dependencies, build

- **Languages**: C (168 .c files), Fortran (2 .F files, 67 .F90 files, ~144K lines total in pfsimulator/). Tools include TCL, Python, C. Mixed allocation: ~70% C, ~25% Fortran, ~5% C++/tools.
- **Runtime**: HPC-centric compiled executable with MPI parallelization; runs on Linux, macOS, Windows (with caveats); laptop-scale to supercomputer. No browser/Node.js capability.
- **Key dependencies** (versioned where pinned):
  - MPI (OpenMPI, MPICH, or vendor MPI; required for default builds)
  - NetCDF (parallel HDF5-backed)
  - HDF5 (with parallel I/O)
  - Tcl (required for pftools)
  - Optional: CUDA (GPU acceleration), Kokkos (vendor-neutral GPU programming), OpenMP, HYPRE (algebraic multigrid), SILO, PDI, SUNDIALS (ODE solver)
  - Third-party bundled: mesh simplification (MIT), TCLAP (OpenSource), plus vendored code in pftools/third-party/
- **Does it build?** CMake-based build verified by inspection. Requires cmake ≥3.22, Fortran compiler (gfortran/ifort), C compiler, and MPI installation. No build attempted (per hard rules), but CI passes on Linux (GitHub Actions badge in README). Complexity: moderate to high (MPI, parallel I/O dependencies).
- **Can it run in a browser?** No. ParFlow is a compiled HPC simulator requiring MPI, NetCDF, HDF5, and Fortran runtime. **Porting to browser would require a complete rewrite** of the solver and I/O stack from C/Fortran to JS/WASM (effort: very high; estimated 500K+ LOC rewrite for core solver alone). Extracting subsystems is possible (e.g., overland flow kernel) but would still need numerical solvers and grid management ported.

## 3. Subsystem inventory

### 3.1 Subsurface (saturated/unsaturated) groundwater flow
- **Where**: pfsimulator/parflow_lib/ (core solver ~50+ files), including nl_function_eval.c, saturation_eval.c, Richards equation discretization
- **What it does**: Solves coupled surface-subsurface flow via Richards equation (variably saturated flow) with heterogeneous hydraulic conductivity tensors on structured grids; includes wells, boundary conditions, storage, and source/sink terms. Parallel assembly and solve via HYPRE/KINsol or custom iterative solvers.
- **Quality & realism rating: 5/5** — Reference-grade hydrogeological model published in peer-reviewed literature (Ashby & Falgout 1996, Jones & Woodward 2001, Kollet & Maxwell 2006). Extensively validated on field sites and benchmarks. Solves real physics (mass conservation, Darcy's law) on real domains.
- **Extractability: loosely coupled** — Solver is self-contained in nl_function_eval.c and related files (~15K LOC); imports grid, vectors, problem data structures, and material properties. Depends on HYPRE/KINsol and custom matrix/vector backends. To extract: ~200 LOC core loop, ~5K LOC for discretization, full solver ~10K LOC. Porting to JS/WASM is feasible but non-trivial (requires JS linear algebra library, e.g., stdlib, and numerical solver adaptation). Effort: medium–high.
- **Requirements capabilities it could serve**: Hydrology (subsurface component only).

### 3.2 Overland flow (surface flow)
- **Where**: pfsimulator/parflow_lib/overlandflow_eval*.c (diffusive and kinematic wave approximations)
- **What it does**: 2D diffusive-wave and kinematic-wave approximations for overland flow on the top surface of the domain, with Manning's roughness coefficient (n) and slope-based routing. Includes depth-averaged flow, infiltration coupling to subsurface, and transverse mixing. Used to model surface runoff and water table connectivity.
- **Quality & realism rating: 4/5** — Physically-based shallow-water approximations; well-tested in coupled surface-subsurface applications. Manning's equation is industry standard for engineering. Limitations: 2D grid-aligned flow (not true 2D mesh or Voronoi), no explicit stream network generation or channel formation, assumes sheet flow or shallow water.
- **Extractability: standalone** — ~500 LOC for diffusive wave eval, ~300 LOC for kinematic. Depends on slope data (pre-computed), Manning's n field, and pressure/depth. Grid-dependent but could be extracted with minimal external state. Effort to port to JS: low (straightforward finite-difference solver, ~200 LOC JS equivalent).
- **Requirements capabilities it could serve**: Hydrology (overland/surface routing), partial Climate (connects to rainfall forcing via CLM).

### 3.3 Land-surface processes coupling (CLM — Community Land Model)
- **Where**: pfsimulator/clm/ (67 Fortran90 files, ~45K LOC)
- **What it does**: Integrates NCAR's Community Land Model to compute energy balance, snow, canopy interception, soil water stress on plant transpiration, soil temperature, and albedo. Driven by atmospheric forcings (air temperature, wind, humidity, precipitation, radiation). Provides land-surface boundary conditions and feedbacks to ParFlow's subsurface.
- **Quality & realism rating: 4/5** — CLM is a mature, widely-used global climate model land component; good physics (energy, water, carbon cycles). However, ParFlow uses it as a land-surface flux calculator, not as a generative model. Requires pre-computed or externally-provided atmospheric forcings (i.e., does not generate climate from first principles; takes temperature/wind/rain as input). Not suitable as a standalone climate generator for MapMaker without driving data.
- **Extractability: tangled** — CLM is tightly integrated into pfsimulator via Fortran modules and shared state (clmtype.F90, drv_couple.F90). Decoupling requires substantial refactoring. CLM itself has ~40K LOC and was designed for Earth-system models, not browser runtime. **Porting CLM to browser would be a separate multi-month effort.**
- **Requirements capabilities it could serve**: Climate (temperature, wind, precipitation, seasons) — but only as a coupler to external forcings, not as a generator.

### 3.4 Discretization, grid, and solver infrastructure
- **Where**: pfsimulator/parflow_lib/{grid.h, grgeometry.c, matrix.c, vector.c, communication.c, solver.c, etc.}
- **What it does**: Structured grid management (regular Cartesian grid with optional terrain-following coordinates), matrix/vector abstraction layers for parallel linear algebra, communication layer (AMPS: Abstraction of MPI and parallel structures), and nonlinear solver (Newton-Krylov with optional HYPRE preconditioners).
- **Quality & realism rating: 4/5** — Solid infrastructure; regular grids are limiting (no Voronoi, unstructured meshes, or adaptive refinement), but well-engineered for the intended use.
- **Extractability: loosely coupled** — Grid and matrix/vector layers are modular. However, communication layer is MPI-centric and would need rework for single-threaded browser use. Estimated ~10K LOC for grid/linear algebra, ~5K LOC for solver. Porting: medium (JS linear algebra library + Newton-Krylov in JS).
- **Requirements capabilities it could serve**: Infrastructure (multi-resolution grid management, but limited to regular grids).

### 3.5 I/O and data formats
- **Where**: pfsimulator/parflow_lib/{write_parflow_binary.c, read_parflow_binary.c, write_parflow_netcdf.c, etc.}, pftools/
- **What it does**: Reads/writes problem definitions (.pfidb — custom binary database), outputs fields in binary (.pfb), NetCDF, HDF5, and SILO (visualization). Python/Tcl tools for preprocessing and plotting.
- **Quality & realism rating: 3/5** — Functional and widely-used, but proprietary formats (.pfidb, .pfb) and heavy dependency on external libraries. NetCDF/HDF5 output is standard.
- **Extractability: standalone** — I/O is well-separated. Binary .pfb readers could be extracted (~500 LOC). NetCDF support depends on NetCDF library (external). Porting: low for binary formats, medium if NetCDF support is needed.
- **Requirements capabilities it could serve**: Export (NetCDF, HDF5, binary), Import (if .pfb file format is adopted).

### 3.6 Geometry and input processing
- **Where**: pfsimulator/parflow_lib/{geometry.c, grgeometry.c}, pftools/
- **What it does**: Parses solid files and geometry definitions (boxes, cylinders, polygons, raster DEM input), applies material properties, manages boundary patches. Supports 3D heterogeneous domains.
- **Quality & realism rating: 3/5** — Adequate for engineering problems but not designed for natural-looking terrain. DEM import is basic (samples a 2D raster to define top surface).
- **Extractability: loosely coupled** — Geometry parsing is ~2K LOC and imports materials, regions, boundary conditions. Depends on problem data structure. Porting: low–medium (mostly string parsing and data structure construction).
- **Requirements capabilities it could serve**: Import (DEM/heightmap), if extended; not suitable for terrain generation.

### 3.7 Material properties and spatial heterogeneity
- **Where**: pfsimulator/parflow_lib/{geostats.c, background.c, and material property input handlers}
- **What it does**: Assigns hydraulic conductivity, specific storage, porosity, van Genuchten/Brooks-Corey retention curves via spatially-varying fields. Supports geostatistical sampling (indicator kriging via geostats.c) to generate realizations from a covariance model.
- **Quality & realism rating: 3/5** — Hydrogeologically sound (van Genuchten, Brooks-Corey) but not integrated with climate, terrain, or biomes. Geostatistical capability is useful but limited to kriging on pre-defined domains.
- **Extractability: standalone** — Material property assignment and kriging are ~3K LOC. Depends on geostatistical libraries (external). Porting: medium (kriging is computational; would need JS implementation or lookup tables).
- **Requirements capabilities it could serve**: Soils (if extended to couple with biomes and climate); Hydrology (hydraulic properties).

### 3.8 Numerical solver (nonlinear and linear algebra)
- **Where**: pfsimulator/parflow_lib/{kinsol/ (KINsol driver), solver.c, nl_function_eval.c}
- **What it does**: Newton-Krylov nonlinear solver (wraps SUNDIALS' KINsol) with configurable Krylov solver and preconditioner; supports implicit time stepping. AMPS communication layer abstracts MPI.
- **Quality & realism rating: 4/5** — Industry-standard SUNDIALS; well-proven in HPC. However, not suitable for real-time browser simulation (Newton-Krylov requires many linear solves per time step).
- **Extractability: loosely coupled** — Solver driver is ~2K LOC. Depends on SUNDIALS (external library, C). Porting to JS would require a JS implementation of Newton-Krylov or use of a JS numerical library (e.g., TensorFlow.js, but not designed for PDE solvers). Effort: high.
- **Requirements capabilities it could serve**: Infrastructure (solver); not suitable for browser latency requirements without significant optimization.

## 4. Internal data representation

- **Grid type**: Regular Cartesian grid in x, y, z with optional terrain-following coordinates (σ-coordinate transformation available). No Voronoi, icosahedral, or cubed-sphere support.
- **Resolution**: User-specified uniform grid spacing (NX, NY, NZ cells); typical applications range from 50³ to 500³ cells on workstations, up to 10,000³+ on supercomputers. Terrain-following coordinates allow finer resolution near the surface.
- **Units**: SI (meters, seconds, kg/m³, Pa, etc.). Pressures in Pa; permeabilities in m²; specific storage in 1/Pa.
- **Coordinate system**: Cartesian (x, y, z); can be mapped to lat/lon via preprocessing. No native spherical coordinates or multi-patch support.
- **Time representation**: Explicit time stepping with configurable time step (seconds); no built-in seasonal cycles (seasonal forcing must come from external data).
- **Serialization**: Native .pfb (ParFlow binary) format (grid values at each timestep); also outputs NetCDF, HDF5, SILO. Custom Python/Tcl tools for inspection. State saving: full domain dump (.pfb files) + simulation log; resumable only via restart feature (not a first-class design goal).
- **RNG/seeding**: Geostatistical kriging uses random field generation; seeding is available but not emphasized for reproducibility across runs (no first-class "same seed" feature like MapMaker requires). Parallel RNG state management is implicit in AMPS layer.
- **Multi-resolution and zoom consistency**: Not supported. Regular Cartesian grid only; no built-in hierarchy or level-of-detail mechanism. Would require custom implementation to support MapMaker's planet + regional patches with consistent detail.

## 5. License

**SPDX**: LGPL-2.1 (verified in /LICENSE.txt, lines 1–408)
**File path**: /LICENSE.txt
**Mixed licenses in bundled code**:
- Mesh Simplification (Sven Forstmann): MIT License
- TCLAP (Michael E. Smoot, Daniel Aarno, Google Inc.): OpenSource (unspecified; files in pftools/third-party/)
- Main ParFlow code: LGPL-2.1 (copyright Lawrence Livermore National Lab)
**Matches manifest**: Yes; manifest lists "LGPL-2.1" for hydrology reference.
**Practical notes**: LGPL-2.1 is a weak copyleft license permitting static/dynamic linking of proprietary code, but any modifications to ParFlow itself must be redistributed under LGPL-2.1. No patent clause. No EULA restrictions. Suitable for open-source integration in MapMaker (license compatibility noted but not a conflict per project brief).

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | No plate-tectonic simulation. |
| Heightmap generation | no | — | — | — | DEM import only; no terrain generation algorithm. |
| Erosion | no | — | — | — | No erosion model (stream power, hillslope diffusion, etc.). |
| Hydrology (rivers/lakes/watersheds) | partial | 3 | loose | pfsimulator/parflow_lib/overlandflow_eval*.c | Overland flow routing and subsurface flow, but no explicit stream network, channel formation, or lake generation. |
| Climate – temperature | partial | 2 | tangled | pfsimulator/clm/{clm.F90, clm_thermal.F90} | CLM computes energy balance and soil temperature from atmospheric forcings; does not generate climate. |
| Climate – wind | partial | 2 | tangled | pfsimulator/clm/clm_obult.F90 | Turbulent boundary-layer wind profile; requires external wind forcing input. |
| Climate – ocean currents | no | — | — | — | Not modeled. |
| Climate – precipitation | partial | 2 | tangled | pfsimulator/clm/clmtype.F90, drv_getforce.F90 | Processes precipitation input via CLM; does not generate precipitation fields. |
| Climate – seasons | no | — | — | — | Seasonal cycles must be imposed via external forcing data; no emergent seasonality. |
| Biomes | no | — | — | — | No biome classification or generation. |
| Soils | partial | 3 | loose | pfsimulator/parflow_lib/geostats.c, background.c | Hydraulic properties (van Genuchten, Brooks-Corey) for hydrology; no soil classification (e.g., USDA taxonomy), carbon, or fertility. |
| Resources | no | — | — | — | No mineral, ore, or resource generation. |
| Population & settlement | no | — | — | — | No population dynamics or settlement modeling. |
| Cities & towns | no | — | — | — | No urban or settlement generation. |
| Languages & names | no | — | — | — | Not applicable. |
| Political borders | no | — | — | — | No geopolitical simulation. |
| Trade | no | — | — | — | No economic or trade modeling. |
| Long-run history/war/economics/politics sim | no | — | — | — | Not applicable. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | Cartesian grid only; no multi-resolution hierarchy or patch system. |
| Globe view | no | — | — | — | No spherical coordinate support or globe rendering. |
| Flat projections | no | — | — | — | Cartesian grid only; projections would require external mapping. |
| Partial-world inference | no | — | — | — | No context inference algorithm. |
| Import of heightmaps/layers | partial | 2 | loose | pfsimulator/parflow_lib/grgeometry.c | Basic DEM sampling to define top surface; no multi-layer import, attribution preservation, or validation. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No multi-fidelity or preview modes. Solver is fixed; parallel efficiency precludes interactive preview. |
| Export (PNG/SVG/STL/other) | partial | 2 | loose | pftools/prepostproc/, write_parflow_*.c | NetCDF/HDF5/binary export; PNG/SVG/STL would require external post-processing tools. |
| Full-state save/resume format | partial | 2 | loose | pfsimulator/parflow_lib/write_parflow_binary.c | .pfb binary snapshots + restart capability; not designed as a human-readable full-state archival format. |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | No built-in calibration against global datasets. |
| Planet-parameter derivation | no | — | — | — | No algorithmic derivation of planet parameters; requires manual input. |

## 7. Verdict

**Bottom line**: ParFlow is a world-class hydrogeological simulator for subsurface and coupled surface-subsurface flow, but **not suitable as a source for MapMaker's terrain generation, biome, or civilization systems**. It offers no capability for terrain generation, tectonics, erosion, biome modeling, or social/economic simulation. Its CLM coupling provides climate forcing but requires external atmospheric data and is not a generative climate model.

**Worth extracting?**
- **Hydrology subsystem (overland + subsurface flow)**: Potentially useful for a detailed, physics-based hydrology module if MapMaker chooses realism over speed. Overland flow kernel is extractable (~500 LOC) with medium porting effort (JS numerical solver + grid integration). **Verdict**: Extract only if MapMaker commits to river/lake simulation with realistic subsurface interaction (low probability).
- **CLM coupling**: Not recommended for extraction. Too tightly integrated, Fortran-heavy, and requires external climate forcing. If climate generation is desired, seek a true generative climate model (e.g., a spectral energy balance model or GCM emulator).
- **All other subsystems**: Skip. No terrain, tectonics, erosion, biomes, soils, resources, population, or civilization modeling.

**Biggest risks**:
- **Language and runtime**: C/Fortran/MPI compiled program; no browser path without a complete rewrite (estimated 500K+ LOC, 6–12 months effort).
- **Scope mismatch**: ParFlow solves a narrowly-scoped, well-defined problem (subsurface flow on a fixed domain); MapMaker's scope (whole-world fantasy simulation) is orthogonal.
- **Extractability**: Solver depends on HYPRE, SUNDIALS, NetCDF, HDF5, MPI. Porting the entire stack to JS is infeasible; partial extraction of small kernels (e.g., Manning's overland flow) is possible but low-impact.

**Unverified points**:
- Actual build/CI status not tested in situ (inferred from GitHub CI badge and CMake structure).
- CLM version and feature set not fully audited; assumed current as of ParFlow 3.15.0.
- Performance characteristics on browser-scale problems (e.g., <1M grid cells) not estimated.

