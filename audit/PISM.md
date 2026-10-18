# Audit: PISM

> **Reconciled 2026-10-18** against the source at `6314953` (`docs/reconciliation/group-2.md`). Corrected: vendored licences (cubature and CalCalcs are GPL, not public domain or BSD), subsystem sizes, the grid (projected Cartesian x/y, with lat/lon from PROJ), the "no glacial erosion" point, and the verdict, which predated the Q13 scope (note 22 uses PISM as the formula and verification reference). `src/earth/` (bed deformation) added.

## 1. Overview

PISM (Parallel Ice Sheet Model) is a research-grade, open-source ice sheet simulation tool jointly developed at the University of Alaska Fairbanks and Potsdam Institute for Climate Impact Research. It models ice sheet dynamics, thermodynamics, and interactions with atmospheric and ocean systems on real Earth ice sheets (Antarctica, Greenland, etc.). The codebase is mature and actively maintained (~143k LOC in C++, ~31k in Python across 326 source files). It is designed for parallel HPC systems using MPI and PETSc, not for browser or fantasy world generation.

## 2. Language, runtime, dependencies, build

**Primary languages:**
- C++ (~112k LOC in src/) with heavy use of PETSc and MPI
- Python (~31k LOC, mostly analysis scripts and bindings)
- Small amounts of Fortran for some legacy routines

**Runtime / platform:**
- Parallel HPC (requires MPI). Single-threaded execution is possible but the architecture assumes distributed-memory parallelism.
- Pure C++/Fortran binary. No browser support whatsoever.
- Runs on Linux, macOS, Unix-like systems. Not tested for Windows in a native sense (Docker is the suggested workaround per examples).

**Key dependencies (heavy scientific stack):**
- PETSc (parallel linear solvers, required): version pinned by CMake
- MPI (MPICH, OpenMPI): required for any build
- GSL ≥1.15 (GNU Scientific Library): required
- FFTW ≥3.1 (Fast Fourier Transform): required
- NetCDF ≥4.7 (data I/O): required
- UDUNITS2 (unit conversion): required
- Optional: PROJ ≥6.0 (for coordinate transforms), YAC (for interpolation), parallel NetCDF4 (pnetcdf)
- Build: CMake ≥3.20

**Does it build?** Determined by inspection. PISM is a standard CMake C++ project. Build would require a full scientific computing stack (PETSc, MPI, GSL, FFTW, NetCDF, UDUNITS2) which is non-trivial to assemble and not practical in a browser context. Build commands from docs: `cmake .. && make install`, but prerequisites are substantial and machine-specific.

**Browser portability:** Not feasible. PISM is a tightly coupled parallel FEM/FD solver for differential equations governing ice sheet mechanics. Porting to WASM would require: (1) replacing PETSc with a browser-compatible linear solver (a massive rewrite); (2) removing MPI; (3) rewriting I/O layers; (4) replacing Fortran/C++ low-level numerics with JS/WASM equivalents. Effort: 6-12 months, unfeasible in practice. This is not a library to extract from; it is a monolithic scientific application.

## 3. Subsystem inventory

### 3.1 Ice Sheet Dynamics (Stress Balance)
- **Where:** `src/stressbalance/` (63 files, 17,163 lines with headers): `sia/SIAFD.cc` (954 lines; surface gradient on a staggered grid by the Mahaffy method or variants, `:158–188`), `ssa/SSAFD.cc` (649; Picard iteration with a PETSc KSP solve, `:47`), `ssa/SSAFEM.cc` (1,245); diffusivity CFL step `max_timestep_diffusivity` (`timestepping.cc:201–205`)
- **What it does:** Solves the momentum balance for ice flow using various stress balance approximations: Shallow Ice Approximation (SIA), Shallow Shelf Approximation (SSA), and higher-order models. Uses finite-difference and finite-element methods on a regular grid.
- **Quality & realism rating: 5/5** — Reference-grade ice sheet physics validated against EISMINT, ISMIP benchmarks, and real-world ice sheets. Solves equations derived from first principles (Glen's flow law, momentum conservation). Tuned for paleoclimate and modern ice sheet contexts at km-scale resolution.
- **Extractability: tangled** — Completely dependent on PETSc for solvers, MPI for parallelism, and PISM's own Grid/Context/Config infrastructure. ~15k LOC of core physics + ~10k supporting infrastructure. Effort to extract: very high (months). Cannot run standalone without wholesale rewrite.
- **Requirements capabilities it could serve:** Cryosphere (design note 22, added by the Q13 scope): the SIA formulation, the Mahaffy staggered-grid diffusivity and the CFL rule are the reference for a new SIA solver on the sphere mesh. The code itself (PETSc arrays, regular grid) is not portable as is.

### 3.2 Ice Thermodynamics (Energy)
- **Where:** `src/energy/` (~5000 LOC)
- **What it does:** Solves conservation of energy within ice sheets using an enthalpy-based scheme. Models basal melt, cold ice, polythermal conditions, geothermal flux. Coupled to the atmosphere model for surface mass balance.
- **Quality & realism rating: 4/5** — Scientifically sound, widely used for paleoclimate studies. Enthalpy formulation avoids phase-change numerical issues. Resolution-dependent (100m-1km typical).
- **Extractability: tangled** — Requires PETSc solvers, MPI, PISM's Field infrastructure (NetCDF-backed arrays with ghost cells for parallel communication). ~3k LOC pure numerics + ~2k supporting glue.
- **Requirements capabilities it could serve:** Reference for note 22 (temperate versus frozen beds, which switch basal sliding on).

### 3.3 Atmosphere Coupling
- **Where:** `src/coupler/atmosphere/` (33 files, 3,801 lines); orographic precipitation in `OrographicPrecipitation.cc` (127 lines, the wrapper) and `OrographicPrecipitationSerial.cc` (299 lines: Smith & Barstad 2004 transfer function at `:258–263`, solved with FFTW plans `fftw_plan_dft_2d` at `:101–103` on a padded regular grid; inputs wind speed and direction, lapse rates, conversion and fallout times, `:65–72`)
- **What it does:** Pluggable interface to atmospheric models. Provides delta-T/delta-P forcing, orographic precipitation (serial implementation over a given topography), cosine yearly cycles, anomalies from reference datasets. Does NOT generate climate; couples to external climate input or applies simple parameterizations.
- **Quality & realism rating: 2/5** — Functional but very specialized to ice sheet needs. Orographic precipitation is a simple hydrostatic model (not full atmospheric dynamics). No wind-driven climate system, no ocean currents, no general GCM coupling. Suitable only for ice sheet mass balance forcing, not for standalone world generation.
- **Extractability: loosely coupled** — Atmosphere models inherit from a base `AtmosphereModel` class (~1k LOC). Each implementation is 0.5-2k LOC. Could extract individual models (e.g., `OrographicPrecipitation`) with moderate effort, but they assume ice sheet domain context and require PISM's I/O and grid infrastructure.
- **Requirements capabilities it could serve:** Potential for climate (precipitation), but only as a simple orographic model tied to existing topography; no generation of wind, ocean currents, or global climate patterns.

### 3.4 Ocean Coupling
- **Where:** `src/coupler/ocean/` (48 files, 6,310 lines)
- **What it does:** Pluggable interface for ocean forcing. Includes constant ocean conditions, anomalies, parameterizations of subshelf melt (Holland-Jenkins, PICO model). Does NOT generate oceans; reads forcing data or applies simple process-based models.
- **Quality & realism rating: 1/5** — Domain-specific to ice sheet cavities and marine ice sheet interfaces. No ocean circulation, no current generation, no salinity/stratification. Entirely empirical/parameterized for ice-ocean boundary layer.
- **Extractability: loosely coupled** — Similar structure to atmosphere models. Individual implementations are 1-3k LOC. But they assume ice sheet geometry, require PISM's infrastructure.
- **Requirements capabilities it could serve:** None for fantasy world generation. Ocean forcing for ice sheets is orthogonal to world climate/ocean generation.

### 3.5 Hydrology (Subglacial)
- **Where:** `src/hydrology/` (12 files, 4,041 lines)
- **What it does:** Solves for subglacial water pressure and routing beneath ice sheets. Models filling and emptying of subglacial lakes, pressure-driven flow (not purely fluvial). Does NOT model surface/river hydrology or general watershed systems.
- **Quality & realism rating: 1/5** — Highly specialized to ice sheet hydrology. Uses a distributed system model for subglacial water; not applicable to open-surface hydrology or river networks on land.
- **Extractability: tangled** — Tightly coupled to ice geometry, pressure solver (PETSc), and PISM's grid. ~3k LOC core + ~3k infrastructure.
- **Requirements capabilities it could serve:** None; subglacial hydrology is not relevant to fantasy worlds.

### 3.6 Geometry and Mesh
- **Where:** `src/geometry/` (14 files, 3,619 lines, including `GeometryEvolution.cc`, 1,343 lines, the mass-transport step)
- **What it does:** Manages ice sheet geometry (thickness, surface elevation, bed topography). Tracks grounding line position, calving fronts, and floating ice. Handles vertical and lateral interpolation for coupling to atmosphere/ocean.
- **Quality & realism rating: 3/5** — Adequate for ice sheet modeling. Uses a regular Cartesian grid in projected x/y metres. Does not generate topography; reads it from input files or uses idealized benchmarks.
- **Extractability: tangled** — Integral to PISM's data structure (Field/Array infrastructure). Hard to extract without keeping the entire framework.
- **Requirements capabilities it could serve:** Mass-transport reference for note 22 (`GeometryEvolution.cc`); it does not generate terrain.

### 3.7 Utility Infrastructure (Grid, I/O, Configuration)
- **Where:** `src/util/` (~60 files, ~40k LOC)
- **What it does:** Grid representation (2D regular grid in projected x/y: `Lx`, `Ly`, `x0`, `y0`, `Mx`, `My`, `src/util/Grid.hh:95–130`; lat/lon computed through PROJ, `compute_lon_lat` in `src/util/Projection.cc:436`), NetCDF I/O with CF conventions, configuration system (pulls from PISM config files and command-line arguments), logging, profiling, error handling.
- **Quality & realism rating: 3/5** — Well-engineered infrastructure for scientific computing; NetCDF I/O is robust. Not suitable for browser use due to MPI/PETSc dependencies.
- **Extractability: tangled** — Every PISM module depends on Grid, Config, Context, and I/O layers. Extracting would require rewriting the entire infrastructure.
- **Requirements capabilities it could serve:** Potentially GridService or I/O abstractions, but only if completely rewritten for browser (not practical).

### 3.8 Verification and Validation
- **Where:** `src/verification/` (29 files, 4,582 lines), exact solutions in `src/verification/tests/` (`exactTestsABCD.c`: `exactA` :55, `exactB` :86 = Halfar 1983, the λ = 0 Bueler et al. 2005 similarity solution (comment at :68–69), `exactC` :123 and `exactD` :203 = Bueler et al.; `exactTestsFG.cc`, `exactTestH.c` … `exactTestP.cc`; test K uses GSL root finding, test L solves an ODE), `test/` (~200+ test files)
- **What it does:** Analytical solutions to simplified ice sheet problems (used for code verification), radially symmetric on a flat bed (r in metres, t in seconds). Regression test suite.
- **Quality & realism rating: 4/5** — Comprehensive test coverage.
- **Extractability: standalone** — Tests A–D are closed-form C functions with no PETSc dependency; they port to TypeScript through `dmath` as golden values. On the sphere they hold only to a curvature tolerance (R0 = 750 km domes, `exactTestsABCD.c:66`).
- **Requirements capabilities it could serve:** Verification of note 22's SIA solver; note 15's Earth test suite.

### 3.9 Bed deformation (`src/earth/`)
- **Where:** `src/earth/` (1,678 lines): `LingleClark.cc`/`LingleClarkSerial.cc` (elastic plate over the Lingle & Clark viscous half-space, `greens.cc:123`; FFTW, `LingleClarkSerial.cc:21`), `PointwiseIsostasy.cc`, `greens.cc` (elastic load response).
- **What it does:** Bed uplift and subsidence under ice load. `BedDef.hh:27` says bed erosion is planned ("(soon) bed erosion"); there is no glacial erosion code.
- **Requirements capabilities it could serve:** Glacial isostatic adjustment for note 22 §3.4 (reference only; regular grid and FFT).

## 4. Internal data representation

**Grid and mesh:** Regular 2D Cartesian grid in projected x/y metres (any PROJ projection, polar stereographic typical; lat/lon are derived fields). Single resolution per simulation run (typically 100m–5km for ice sheet applications). No multiresolution or quadtree structures.

**Units:** SI units throughout (meters for elevation/thickness, seconds for time, Kelvin for temperature, kg/m³ for density). Grid spacing and domain size specified in meters or kilometers.

**Coordinate conventions:** 
- Horizontal: planar x/y in metres on a map projection (user-selectable through PROJ); not the sphere.
- Vertical: z-coordinate (height above sea level or reference bedrock).
- Origin: ice sheet center (e.g., Greenland ice sheet center) or user-specified.
- No wraparound for poles (regional domains only).

**Time representation:** Simulation time in seconds since a reference epoch. Time stepping uses adaptive schemes to respect CFL and accuracy constraints. Output is written to NetCDF files with CF-compliant metadata.

**Serialization:** Full model state saved to NetCDF files with all prognostic and diagnostic variables. Allows resuming simulations. No custom binary format; relies on NetCDF standard.

**RNG/seeding:** PISM does not use pseudorandom number generation for deterministic physics simulations. Some inverse modeling and ensemble runs use RNG, but no procedural generation seeding.

**Multiresolution consistency:** Not addressed. PISM runs at a single resolution per simulation. No provision for consistent detail across zoom levels (a key MapMaker requirement).

## 5. License

**SPDX: GPL-3.0** ✓ matches manifest

**File:** `/COPYING` contains full GPL v3 text

**Vendored code:** 
- `src/external/cubature/` (integration library): GPL-2.0-or-later (`cubature.c:1–12`, Steven G. Johnson, with parts from HIntLib and GSL, both GPL)
- `src/external/nlohmann/` (JSON library, `json.hpp`): MIT License
- `src/external/calcalcs/` (calendar calculations): GPL-3.0-or-later (`calcalcs/README:31–33`, David W. Pierce)

`src/external/README.rst` lists both cubature and CalCalcs as GPL. All are GPL-3.0-compatible; no conflict.

**Practical notes:** 
- GPL-3.0 is a strong copyleft license. Any derivative work or modified version used in MapMaker must be open-source and GPL-3.0 (or later). This would apply to extracted ice sheet modules (if feasible to extract).
- No patent clauses; no EULA restrictions.
- For MapMaker's stated policy of ignoring license conflicts for now, PISM itself presents no conflict, but extraction would trigger copyleft obligations if the extracted code is used in a closed-source MapMaker product.

**Git HEAD:** `6314953b1f7b5d194bc6c76069aba04e770b4644` (verified via `git -C upstream/PISM rev-parse HEAD`)

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | No tectonic simulation; ice sheet models fixed bedrock. |
| Heightmap generation | no | — | — | — | Reads topography; does not generate it. |
| Erosion | no | — | — | — | No erosion of any kind (subshelf melt is ocean melting, not erosion; bed erosion is only planned, `src/earth/BedDef.hh:27`). |
| Hydrology (rivers/lakes/watersheds) | partial | 1/5 | tangled | `src/hydrology/*.cc` | Subglacial hydrology only; no surface/river networks. |
| Climate – temperature | partial | 2/5 | loosely coupled | `src/coupler/atmosphere/Delta_T.cc` | Surface forcing parameterization; no T field generation. |
| Climate – wind | no | — | — | — | No wind field; ocean currents from external data. |
| Climate – ocean currents | no | — | — | — | No current generation; subshelf melt parameterized. |
| Climate – precipitation | partial | 2/5 | loosely coupled | `src/coupler/atmosphere/OrographicPrecipitation*.cc` | Orographic model over given topography; no general precip generation. |
| Climate – seasons | partial | 2/5 | loosely coupled | `src/coupler/atmosphere/CosineYearlyCycle.cc` | Simple cosine cycle; no full seasonal climate simulation. |
| Biomes | no | — | — | — | No biome modeling. |
| Soils | no | — | — | — | No soil model. |
| Resources | no | — | — | — | No resource allocation or scarcity model. |
| Population & settlement | no | — | — | — | No demographic or settlement simulation. |
| Cities & towns | no | — | — | — | No urban modeling. |
| Languages & names | no | — | — | — | No name generation or linguistic modeling. |
| Political borders | no | — | — | — | No political or geopolitical simulation. |
| Trade | no | — | — | — | No economic or trade modeling. |
| Long-run history/war/economics/politics sim | no | — | — | — | No historical or long-run civilization simulation. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | partial | 1/5 | tangled | `src/regional/IceRegionalModel.cc` | Regional simulations exist but are separate runs, not nested or zoom-consistent. |
| Globe view | no | — | — | — | No spherical rendering; regional projected grids only. |
| Flat projections | partial | 1/5 | tangled | `src/util/Grid.cc`, `src/util/Projection.cc` | Projection metadata through PROJ; the model grid itself is planar. |
| Partial-world inference | no | — | — | — | No inference engine; regional models require boundary conditions from larger domains. |
| Import of heightmaps/layers | yes | 3/5 | loosely coupled | `src/util/InputInterpolation*.cc` | Reads NetCDF files; can interpolate external data (DEM, climate fields). |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No parameterized fidelity slider; single-resolution runs. |
| Export (PNG/SVG/STL/other) | partial | 2/5 | loosely coupled | Various utility scripts in `util/` and `examples/` | Exports to NetCDF, can be post-processed to images; no native PNG/SVG/STL export. |
| Full-state save/resume format | yes | 4/5 | loosely coupled | NetCDF I/O in `src/util/io/` | NetCDF with CF conventions; full model state serialization supported. |
| Earth-data calibration (elevation/climate/Köppen) | yes | 4/5 | tangled | `src/coupler/atmosphere/SeariseGreenland.cc`, Earth data files | Calibrated to Greenland/Antarctic ice sheets; no global bioclimatic or Köppen calibration. |
| Planet-parameter derivation | no | — | — | — | No parameter-from-physics derivation; ice sheet parameters tuned by hand. |

## 7. Verdict

PISM is a specialized research tool for ice sheet modeling, not a world generator. The following findings:

- **Not suitable for browser use:** Requires MPI, PETSc, and a scientific computing stack. Porting to WASM is infeasible (6–12 months, requires wholesale rewrite). Cannot be deployed on GitHub Pages.

- **Minimal capability overlap with MapMaker:**
  - Hydrology and climate subsystems exist (there is no erosion) but are tightly coupled to ice sheet physics and do not solve general landscape or world-scale problems.
  - No tectonics, heightmap generation, biomes, resources, population, cities, languages, political simulation, or trade.
  - No procedural generation logic; entirely data-driven (reads input files or uses idealized benchmarks).
  - Regional models are not nested or zoom-consistent; no multiresolution infrastructure.

- **Extract costs are prohibitively high:**
  - All subsystems are tangled with MPI/PETSc and PISM's Grid/Config/I/O layers.
  - Extracting even small pieces (e.g., orographic precipitation) would require rewriting 50%+ of the infrastructure.
  - Cannot be done without months of work and would still leave a disconnected fragment with no clear integration path into MapMaker.

- **Recommendation (updated 2026-10-18 for the Q13 scope):** do not port PISM's code (PETSc, MPI, regular projected grid). Use it as the formula and verification reference for note 22: the SIA (Mahaffy) diffusivity and CFL rule from `SIAFD.cc` and `timestepping.cc`, SSA as a later option, the closed-form exact solutions A–D as golden values, and `src/earth/` for glacial isostatic adjustment. For orographic precipitation (note 14), PISM's Smith–Barstad code is a reference that depends on FFTW; Badlands has the same model with a self-contained FFT (`audit/Badlands.md` §3.7).

- **License:** GPL-3.0 (verified). No conflicts with manifest. If any code is extracted, the derivative must be GPL-3.0 or later.

- **Unverified:** Whether PISM builds successfully on the current system (not attempted due to infrastructure requirements). Assumed buildable per CI/documentation but not tested.
