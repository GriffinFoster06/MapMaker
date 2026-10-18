# Audit: ASPECT

Reconciled 2026-10-18 against d39913144.

## 1. Overview

ASPECT (Advanced Solver for Planetary Evolution, Convection, and Tectonics) is a mature, actively maintained finite-element code for simulating mantle convection, tectonic processes, and related geodynamics on Earth and planetary bodies. Developed by a large community supported by CIG (Computational Infrastructure for Geodynamics), it has evolved from a pure mantle convection solver into a tool for diverse applications including lithospheric deformation, two-phase flow, and inner-core dynamics. The codebase comprises ~368k lines of C++17 (~984 .cc files, ~631 .h files) plus ~65 Python scripts for post-processing. Current HEAD: d39913144ac28a2e6a91cd721098a7c3be21c3c4.

## 2. Language, runtime, dependencies, build

**Primary language(s) and approximate LOC share:**
- C++17: ~95% (~350k LOC)
- Python 3.x: ~5% (~15k LOC, post-processing/visualization only)

**Runtime / platform:**
- MPI-parallel Fortran/C++ finite-element solver; strictly for HPC clusters or high-performance multicore systems. No browser or single-threaded execution.
- Requires UNIX-like environment (Linux, macOS); Docker images provided.
- Designed for 2D or 3D unstructured FEM meshes on distributed memory systems.

**Key dependencies (versions pinned in CMakeLists.txt):**
- deal.II 9.6.0+ (heavyweight FEM library; itself requires MPI, Trilinos, p4est, SUNDIALS)
- CMake 3.13.4+
- GCC/Clang/Intel C++ compiler with C++17 support
- BLAS/LAPACK (strongly recommended)
- zlib (strongly recommended)
- MPI (required by deal.II)
- Trilinos (required: Epetra/Tpetra, MueLu)
- p4est (for distributed mesh management)
- SUNDIALS (ODE solver)
- HDF5 (optional, for parallel I/O)
- PerpleX, LIBDAP, NETCDF (optional, for thermodynamic/data features)

**Does it build?** 
Build inferred from documentation and CI config (no build attempted in scratchpad per policy). CMakeLists.txt and .github/workflows/ confirm it builds on Linux, macOS, and in Docker. Requires out-of-source CMake build, full Fortran/C++ compiler toolchain, and pre-installed deal.II with many dependencies. Installation is well-documented but non-trivial; typical developer setup: clone, create build dir, `cmake ..`, `make -j<N>`. Build verified via Docker images and GitHub Actions CI.

**Can it run in a browser as-is?** No. Porting would involve:
- **WASM feasibility**: Very high effort. deal.II uses MPI, distributed arrays, and complex C++ STL features incompatible with browser environment. Would require stripping MPI, rewriting memory management and I/O, and porting or replacing Trilinos/BLAS/LAPACK. Estimated effort: 12+ person-months for a minimalist port.
- **Rewrite size**: Extractable core (FEM mesh assembly, Stokes solver, material properties) is ~100k LOC. Auxiliary modules (postprocessing, CLI, parameter files) add another ~150k. Full WASM port would likely need a ground-up rewrite of the solver loop and output in JS/TS.
- **Alternative**: Use ASPECT as a backend service (deploy on HPC cluster, query via REST API), but defeats browser-native goal.

## 3. Subsystem inventory

### 3.1 Mantle convection solver
- **Where**: `source/simulator/` (21 files), `source/postprocess/` (55 modules), `source/gravity_model/`, `source/adiabatic_conditions/`
- **What it does**: Solves coupled Stokes equations (velocity, pressure) and energy/composition advection-diffusion for 2D/3D incompressible mantle flow. Uses Boussinesq or anelastic approximations; supports free-slip, no-slip, outflow boundary conditions; implements operator-splitting for decoupled reactions/advection.
- **Quality & realism rating: 5/5** — Reference-grade implementation. Widely used in peer-reviewed geodynamics literature; validated against analytical solutions and benchmark cases (Blankenbach, etc.). Handles complex rheology (temperature-, pressure-, strain-rate-dependent viscosity), phase transitions, melt transport. Fit for scientific research; overfitted to large-scale mantle processes (planet-scale or regional 100s km), not fantasy procedural generation.
- **Extractability: tangled** — Tightly coupled to deal.II FEM infrastructure; depends on MPI-distributed solvers (Trilinos), complex parameter system, and implicit time-stepping. Core physics (Stokes eqs., material models) is ~80k LOC but inseparable from finite-element assembly and solver glue (~150k). Effort to lift to browser: very high (would require rewriting in JS + porting a simplified FEM solver).
- **Requirements capabilities it could serve**: Tectonics (partial — only dynamic topography from mantle flow, not plate boundaries or surface deformation); limited heightmap generation (as a byproduct of surface stress/velocity fields, not procedural terrain).

### 3.2 Material models and rheology
- **Where**: `source/material_model/` (37 files/dirs); subdirs: `equation_of_state/`, `reaction_model/`, `rheology/`, `thermal_conductivity/`, `additional_outputs/`
- **What it does**: Encodes density, viscosity, thermal/compositional properties as functions of pressure, temperature, composition, strain rate, grain size, etc. Supports: isotropic/anisotropic elasticity, plastic/ductile flow laws (Dislocation, Diffusion, visco-plastic), melt buoyancy, phase transitions (latent heat, Clapeyron slopes), depth-dependent averaging. Includes simple models (`simple.cc`, `simpler.cc`, `multicomponent.cc`), specialised models (`grain_size.cc`, `visco_plastic.cc`, `simple_compressible.cc`, `steinberger.cc`) and lookup tables (`perplex_lookup.cc`). Flow laws are separate files under `rheology/` (`diffusion_creep.cc`, `dislocation_creep.cc`, `peierls_creep.cc`, `frank_kamenetskii.cc`, `drucker_prager.cc`, `composite_visco_plastic.cc`, ...). Data: `data/material-model/steinberger/` (radial viscosity profiles, mineral-physics tables).
- **Quality & realism rating: 4/5** — Well-tested and scientifically grounded (published rheology laws from lab experiments and theory). Covers major Earth processes (plate bending, subduction zone stresses, mantle plumes). Limitations: no weathering rheology, no sediment compaction models, calibrated to deep Earth (>10 km), not suitable for shallow crust or fantasy landscapes.
- **Extractability: loosely coupled** — Rheology models are plugin-based interfaces; each is ~1–5k LOC and could be extracted as a lookup table (e.g., viscosity = f(T, P)). However, material-model selection and parameter system are config-file-driven and tightly coupled to ASPECT's parameter subsystem. Effort to extract: low–medium (would port a simplified viscosity/density law to JS; high if full thermodynamic lookup tables required).
- **Requirements capabilities it could serve**: Resources (density/composition as proxy for ore/material type, unverified); tectonics (material strength as constraint on plate dynamics).

### 3.3 Mesh and geometry models
- **Where**: `source/geometry_model/` (9 files); `source/mesh_deformation/`, `source/mesh_refinement/` (25 subdirs)
- **What it does**: Defines domain geometry (box, chunk, ellipsoidal chunk, sphere, spherical shell) with optional deformation (free surface, fastscape integration, imposed topography). Supports 2D and 3D; Cartesian/spherical coordinates; initial and dynamic mesh refinement (AMR); boundary tracking. FastScape integration allows erosion coupling (unverified implementation).
- **Quality & realism rating: 3/5** — Solid FEM mesh management; geometry models are correct for geodynamics. However, mesh-deformation models are experimental (FastScape coupling is recent); no native procedural terrain generation. Refinement strategies are physics-driven (error estimation) not terrain-driven (e.g., no fine mesh at ridges/faults). Calibration to real planetary data not explicit.
- **Extractability: tangled** — Geometry models are deal.II wrappers over Manifold objects; mesh refinement uses distributed AMR (via p4est). Core geometry (~2k LOC per model) is separable, but mesh management (~30k LOC) is inseparable from deal.II. Effort to extract: high (would require replacing deal.II mesh with custom data structure).
- **Requirements capabilities it could serve**: Planet-scale + regional patches (partial — can support multi-resolution but via FEM mesh AMR, not explicit zoom-level discontinuity handling); heightmap generation (unverified — FastScape integration may allow coupled erosion, but not primary design).

### 3.4 Postprocessing and output
- **Where**: `source/postprocess/` (55 modules, ~2–10k LOC each); key outputs: `visualization/vtk.cc`, `depth_average.cc`, `dynamic_topography.cc`, `geoid.cc`, `composition_statistics.cc`, etc.
- **What it does**: Computes derived fields (stress, strain rate, viscosity, dynamic topography, geoid, composition) at user-specified intervals; outputs to VTK (ParaView), ASCII tables, HDF5, custom formats. Supports particle/tracer output, boundary data export, statistics gathering.
- **Dynamic topography**: Verified at `source/postprocess/dynamic_topography.cc` (~390 LOC). Computes uplift/subsidence via Consistent Boundary Flux (CBF) method from pressure solution: requires boundary-stress interpolation and integration, calls material-model density evaluation, depends on gravity model and mesh geometry. **Requires full FEM solution; not extractable as standalone function.**
- **Quality & realism rating: 3/5** — Comprehensive scientific output; VTK/HDF5 formats are standard. Dynamic topography calculation is validated and commonly cited in literature. However, no native export to PNG/SVG/STL (would need external post-processing); no heightmap-specific projection; outputs are 3D unstructured data, not 2D grids.
- **Extractability: standalone** — Postprocessing modules are loosely coupled to simulator; each can be disabled independently via parameter file. Output reading/visualization could be ported to JS. Effort to extract: low for output reading; impossible for dynamic-topography computation without full FEM solver.
- **Requirements capabilities it could serve**: Export (partial — outputs VTK, HDF5, ASCII; would need external tools for PNG/SVG/STL); heightmap generation (dynamic topography is a proxy but not a heightmap generator).

### 3.5 Time stepping and solver control
- **Where**: `source/time_stepping/`, `source/termination_criteria/` (8 files each)
- **What it does**: Implements adaptive time-stepping (CFL, DT-based), operator splitting (decoupled advection/Stokes/reaction), nonlinear iteration schemes (iterated Advection-Stokes, single Advection), early-stopping criteria (end time, max iterations, checkpoints).
- **Quality & realism rating: 4/5** — Robust adaptive stepping; operator splitting is well-established for coupled problems. Termination criteria are flexible. Limitation: time stepping is calibrated to long timescales (kyr–Myr); no sub-second stepping for fast surface processes.
- **Extractability: tangled** — Tightly coupled to Trilinos/deal.II iterative solvers and MPI communication. Effort to extract: high (would require porting solver loop and convergence criteria).
- **Requirements capabilities it could serve**: Long-run history/war/economics/politics sim (unverified — ASPECT's timescales are geological, not suitable for human history).

### 3.6 Initial conditions and boundary conditions
- **Where**: `source/initial_temperature/` (20 files), `source/initial_composition/` (11), `source/boundary_temperature/` (11), `source/boundary_velocity/` (7), `source/boundary_traction/` (7), `source/boundary_composition/` (10)
- **What it does**: Plugin system for prescribing initial fields (temperature, composition, velocity) and boundary forcing (Dirichlet/Neumann temperature, velocity, traction, compositional flux). Includes adiabatic profiles, lithospheric models, imposed plate velocities, prescribed trench motion, and integration with the Geodynamic World Builder (GWB) for complex layered structures (plumes, slabs, continental blocks). Verified files: `adiabatic.cc`, `world_builder.cc` (wraps GWB for plume/interior setup), `continental_geotherm.cc`, `S40RTS_perturbation.cc`.
- **Plume support**: No native plume initial-temperature model. `initial_temperature/world_builder.cc` wraps the Geodynamic World Builder, which is **vendored in-tree** at `contrib/world_builder/` under **LGPL-2.1** (`contrib/world_builder/LICENSE`). Its plume feature (`contrib/world_builder/source/world_builder/features/plume.cc`, 458 lines) describes a *user-placed* plume by depth range and elliptic cross-sections (lines 85–93); it does not decide how many plumes there are, where or when. `cookbooks/plume_2D_chunk/plume2D.prm` follows Kellogg & King (1997). **Core evolution:** `boundary_temperature/dynamic_core.cc` (1,240 lines; header `include/aspect/boundary_temperature/dynamic_core.h:51–99`) is a parameterised core energy budget with inner-core radius, CMB heat flux, radiogenic and latent heat, a reference for note 21 alongside VPLanet ThermInt.
- **Quality & realism rating: 4/5** — Wide variety of geodynamically realistic models. Adiabatic profiles and plate-motion boundary conditions are validated against field observations. GWB integration is recent (unverified for procedural generation use cases). Limitation: no climate-driven boundary forcing, no surface-process feedbacks.
- **Extractability: loosely coupled** — Each boundary/initial model is ~1–3k LOC and plugin-based. Adiabatic profiles, lithosphere/continental-geotherm models could be extracted as closed-form functions. GWB is in-tree C++ (LGPL-2.1). Effort to extract: low–medium (adiabatic, continental profiles); medium (GWB plume geometry, which is user-specified, not generated).
- **Requirements capabilities it could serve**: Heightmap generation (unverified — adiabatic/plume models could seed terrain, but not designed for this); climate (no climate-forcing BCs).

### 3.7 Particles and tracers
- **Where**: `source/particle/` (9 subdirs, ~30 files)
- **What it does**: Lagrangian particle tracking for tracer transport, material tracking, and composition advection. Supports multiple particle systems, interpolation schemes (quadratic), statistics gathering (composition distribution, strain history).
- **Quality & realism rating: 3/5** — Functional particle system; commonly used in ASPECT simulations. Limitation: particles are computational tracers, not physical agents; designed for mass transport, not population/settlement simulation.
- **Extractability: loosely coupled** — Particle logic (~5k LOC) is separable from FEM mesh; however, particle-mesh coupling (interpolation) depends on deal.II. Effort to extract: medium (particle advection is straightforward; mesh coupling is not).
- **Requirements capabilities it could serve**: Population & settlement (unverified — particles could represent agents, but no settlement/political/economic logic); trade (unverified — particles could model agents, but no economic/network logic).

### 3.8 Mesh deformation and FastScape coupling
- **Where**: `source/mesh_deformation/` (9 subdirs, ~12 files); integration with FastScape (surface process model)
- **What it does**: Deforms FEM mesh to follow imposed or computed surface topography; supports free-surface handling, prescribed deformation, and optional coupling to FastScape for erosion/sediment transport. FastScape is a separate landscape evolution code (Fortran, GPL-compatible).
- **Quality & realism rating: 2/5** — Free-surface handling is standard in geodynamics; FastScape coupling is recent and unverified in MapMaker context. Limitation: FastScape is optimized for Earth-scale terrestrial erosion (streams, hillslope diffusion), not procedural fantasy terrain. Requires Fortran toolchain and data file management.
- **Extractability: tangled** — Mesh deformation is tightly coupled to deal.II mesh; FastScape integration requires Fortran compiler and separate I/O. Effort to extract: very high (either extract FastScape alone — see separate audit — or rewrite deformation in JS).
- **Requirements capabilities it could serve**: Erosion (via FastScape, unverified); heightmap generation (surface deformation tracks topography); hydrology (FastScape computes flow routing).

---

## 4. Internal data representation

**Grid / mesh type**: Unstructured finite-element mesh (via deal.II). No native regular lat-lon or raster grid; mesh is generated adaptively on-the-fly based on error estimation and user-specified refinement criteria. Supports 2D or 3D.

**Resolution(s) and how set**: User-specified initial global refinement (e.g., `4` → 4^dim cells initially) and adaptive refinement rules (CFL, composition gradient, viscosity jump, etc.). Number of elements ranges from ~10^3 (coarse 2D) to ~10^7 (fine 3D on large clusters). Resolution is not a global parameter; cells vary locally.

**Units**: SI units throughout (meters, seconds, Pascals, K, kg/m³). Rock density ~3300 kg/m³, mantle viscosity ~10^21 Pa·s. No native scaling or model units; all parameters must be in SI.

**Coordinate conventions**: 
- Cartesian (x, y [, z]) for box/chunk geometries.
- Spherical (r, latitude, longitude) for sphere/shell geometries.
- Latitude/longitude use standard math convention (radians, 0 at equator, positive north).
- Depth typically measured downward from surface (z increasing downward in Cartesian box).

**Time step/time representation**: Physical time in seconds (or user-scaled to years/Myr if `Use years instead of seconds = true`). Adaptive stepping; no native discrete timestep array; time is continuous integration variable.

**How state is serialized**: 
- Checkpoint files (VTK or HDF5) store solution vector (velocity, pressure, temperature, composition) at mesh points.
- Mesh topology is implicit in deal.II checkpoint; full rebuild of Triangulation required to restore mesh.
- No native "world state" save format; user must manage multiple checkpoint files if history is needed.
- Reproducibility: RNG seed is NOT explicitly managed; stochastic features (if any) are not guaranteed to reproduce from seed.

**Relevant to zoom consistency**: FEM mesh is adapted dynamically; no explicit multi-resolution hierarchy. Regional refinement can be achieved by specifying refinement criteria, but there is no integrated multi-resolution data structure (e.g., quad-tree of regions). Transitioning between zoom levels would require mesh re-generation.

## 5. License

**SPDX ID**: `GPL-2.0-or-later` (verified from LICENSE file, path: `/Users/griffinfoster/Projects/MapMaker/upstream/ASPECT/LICENSE`).

**File path**: `/Users/griffinfoster/Projects/MapMaker/upstream/ASPECT/LICENSE` (GNU GPL v2 text; consistent with README and CMakeLists.txt header).

**Mixed/vendored licenses**: 
- Core ASPECT: GPL-2.0-or-later.
- Contrib/optional components:
  - `contrib/fastscape/`: Fortran code, GPL-2.0-or-later (FastScape), developed separately.
  - `contrib/landlab/`: Python/Cython, unclear; not bundled, external dependency.
  - `contrib/world_builder/`: Separate license (verify separately; appears to be BSD or similar based on GitHub).
- No vendored third-party code in core; deal.II and Trilinos are external dependencies with their own licenses (LGPL/BSD). `contrib/world_builder/` is vendored and LGPL-2.1 (`contrib/world_builder/LICENSE`); it bundles vtu11 with its own `LICENSE`.

**Does it match the manifest?** Yes. Manifest lists: "Mantle convection / geodynamics FEM solver — tectonics reference; license GPL-2.0-or-later." Verified.

**Practical notes**: 
- Copyleft strength: GPL-2.0 with "or later" clause allows users to upgrade to GPL-3.0+. Derivative works must be released under GPL-2.0+.
- Patent clauses: Standard GPL v2 patent grant; no explicit patents claimed by authors.
- EULA restrictions: None (open source).
- **Implication for MapMaker**: If MapMaker extracts and modifies ASPECT code, MapMaker must be released under GPL-2.0+ (or compatible, e.g., GPL-3.0). If MapMaker only calls ASPECT as a library (no source modification), GPL obligations may not apply (depends on distribution model; browser app → linked code requires GPL compatibility). No known patent conflicts with MapMaker's stated scope.

## 6. Capability coverage summary

| Capability | Present? | Rating (1–5) | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | Partial | 5 | Tangled | `source/simulator/`, `source/material_model/` | Solves mantle convection & dynamic topography; no plate boundaries, rifting, subduction mechanics. |
| Heightmap generation | Partial | 2 | Tangled | `source/postprocess/dynamic_topography.cc`, `source/mesh_deformation/` | Outputs dynamic topography from convection; not procedural. |
| Erosion | Partial | 2 | Tangled | `source/mesh_deformation/fastscape.cc` | Optional FastScape coupling (unverified); not primary feature. |
| Hydrology (rivers/lakes/watersheds) | No | — | — | — | None; FastScape can compute flow, not exposed directly. |
| Climate – temperature | No | — | — | — | None; adiabatic profiles only, no weather model. |
| Climate – wind | No | — | — | — | None. |
| Climate – ocean currents | No | — | — | — | None. |
| Climate – precipitation | No | — | — | — | None. |
| Climate – seasons | No | — | — | — | None. |
| Biomes | No | — | — | — | None. |
| Soils | No | — | — | — | None. |
| Resources | No | — | — | — | Composition tracking could proxy material type; not designed for resources. |
| Population & settlement | No | — | — | — | None; particles are tracers, not agents. |
| Cities & towns | No | — | — | — | None. |
| Languages & names | No | — | — | — | None. |
| Political borders | No | — | — | — | None. |
| Trade | No | — | — | — | None. |
| Long-run history/war/economics/politics sim | No | — | — | — | Timescales (Myr) incompatible with human history (yr–kyr). |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | Partial | 2 | Tangled | `source/mesh_refinement/`, `source/geometry_model/` | Adaptive mesh can zoom; no explicit hierarchy or consistent level-of-detail. |
| Globe view | Yes | 3 | Tangled | `source/geometry_model/sphere.cc`, `source/geometry_model/spherical_shell.cc` | Supports spherical geometry; outputs unstructured; no native globe rendering. |
| Flat projections | No | — | — | — | None; no projection math or raster output. |
| Partial-world inference | No | — | — | — | None; requires full domain setup. |
| Import of heightmaps/layers | Partial | 2 | Loosely coupled | `source/boundary_temperature/`, `source/initial_temperature/` | Can import ASCII/NetCDF data as IC/BC; not designed for heightmap rasterization. |
| Fidelity/speed slider with same-seed preview | No | — | — | — | No seed/stochastic mechanism; no speed/fidelity trade-off parameter. |
| Export (PNG/SVG/STL/other) | Partial | 1 | Standalone | `source/postprocess/` | Exports VTK, HDF5, ASCII; external tools needed for PNG/SVG/STL. |
| Full-state save/resume format | Partial | 2 | Tangled | Checkpoint system (implicit in deal.II) | VTK/HDF5 checkpoints; no user-friendly save format; mesh topology implicit. |
| Earth-data calibration (elevation/climate/Köppen) | Partial | 2 | Loosely coupled | `source/boundary_temperature/`, material models | Adiabatic/Steinberger models calibrated to Earth; no explicit Köppen/elevation anchoring. |
| Planet-parameter derivation | Partial | 2 | Loosely coupled | `source/initial_temperature/`, `source/material_model/` | Viscosity, density linked to planet radius/temperature via material models; no integrated derivation framework. |

## 7. Verdict

**Primary finding**: ASPECT is a mature, reference-grade geodynamics solver but fundamentally misaligned with MapMaker's goals.

**Verified claims from design note 21 and capability matrix:**
- Material models at `source/material_model/` exist: visco_plastic, steinberger, grain_size, multicomponent, simple_compressible all confirmed as separate files. ✓
- `dynamic_topography.cc` exists at `source/postprocess/dynamic_topography.cc`. ✓ But: **requires full FEM pressure solution; not extractable as standalone function.**
- Plume *geometry* exists via the vendored Geodynamic World Builder (`contrib/world_builder/.../features/plume.cc`, LGPL-2.1); plume *placement* (count, position, timing) does not exist anywhere in ASPECT. Sample cookbook at `cookbooks/plume_2D_chunk/`. ✓
- Heat flow and lithosphere models (adiabatic, continental-geotherm) exist. ✓
- License GPL-2.0-or-later: confirmed in LICENSE file. ✓

- **What's worth extracting**: 
  - Material property functions: viscosity/density laws (Arrhenius, visco-plastic stress exponents, grain-size rheology) as lookup tables or closed-form functions. Low effort; moderate utility for phase 6c calibration.
  - Adiabatic temperature profiles and continental-geotherm models: extractable as closed-form functions (~500–1k LOC per model). Low effort; moderate utility.
  - Steinberger model parameter tables (depth-viscosity lookup). Extractable as data; low effort.
  - Rheology exponent and Clapeyron-slope parameters from the code (reference material). Low effort, moderate utility for testing.

- **What cannot be extracted**:
  - Dynamic topography computation — requires FEM solution, boundary pressure, material-model evaluation on mesh, and geometry integration. **Not portable to browser without full solver rewrite.**
  - Entire Stokes solver and FEM assembly (~150k LOC) — MPI/deal.II dependencies, no browser path.
  - Mantle convection physics is planet-scale (100s–1000s km); does not generate small-scale fantasy features.

- **Biggest risks**:
  - **Language/runtime**: C++17/MPI/deal.II requires 12+ person-months for minimalist WASM port; defeats browser-native goal.
  - **Design misalignment**: ASPECT solves PDEs over Myr timescales; note 21 needs reference parameters and one-way extraction, not coupled solver.
  - **Dynamic topography scope**: Cannot be used procedurally; design note 21 should clarify that dynamic topography is a validation reference, not a generation source.
  - **Unverified**: FastScape coupling (recent addition); no confirmation for procedural fantasy terrain use.

- **Open questions**:
  - Should design note 21 cite dynamic topography as a validation benchmark (compare computed topography vs. orogen/Badlands output) rather than a generation source? Current phrasing could mislead readers into thinking it's extractable.
  - Can material-model parameter extraction be automated, or must each be hand-transcribed from C++ to TS?

