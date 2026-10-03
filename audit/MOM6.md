# Audit: MOM6

## 1. Overview

MOM6 (Modular Ocean Model, version 6) is a production-grade ocean circulation model developed by NOAA-GFDL and a consortium of institutions. It solves the primitive equations for ocean dynamics on an Arakawa C-grid, with comprehensive parameterizations for physical processes including wind-driven circulation, internal mixing, tidal forcing, and ice shelf coupling. The model is mature (active development, used operationally) and substantial: 245 Fortran source files across 91 directories, ~245 thousand lines of code (primarily Fortran), with comprehensive CI/CD testing and documentation. Latest commit: `f49a00096df607b48354603e2398e14e189fd62e`.

## 2. Language, runtime, dependencies, build

**Primary languages:**
- Fortran 2003+ (~99% of codebase): 245 `.F90` files, ~243,000 LOC
- C/C++ (minimal, <1%): FFI and supporting utilities

**Runtime & platform:**
- Standalone compiled executable (`MOM6`) designed for HPC and climate research
- Requires MPI (distributed-memory parallelism across compute nodes)
- Coupled mode via FMS or NUOPC couplers to atmosphere models and sea-ice (SIS2, CICE)
- Single-node ocean-only simulations possible but not primary use case
- NOT designed for or compatible with browser runtime

**Key dependencies (all pinned in submodules/ac/deps):**
- FMS (Flexible Modeling System) — NOAA framework for Earth system models; required
- netCDF-Fortran — I/O and file format
- MPI (Open MPI or MPICH) — distributed computing
- Fortran compiler (gfortran, Intel ifort, etc.)
- Autoconf/Automake — build system

**Build:**
- **Build command (from README):** Autoconf-based; `cd ac/deps && make -j` (build FMS), then `cd ../.. && mkdir -p build && cd build && ../ac/configure && make -j`
- **Does it build?** Inferred from build files & autoconf. Not attempted in this session (would require MPI + netCDF + Autoconf setup beyond scope). Autoconf/configure present and documented; standard Fortran toolchain. Verification would need full environment.
- **Red flags:** Requires MPI and netCDF, which are not trivial to set up on macOS or Windows without Homebrew/WSL. No CMake fallback. Autoconf available but requires Automake on macOS.
- **Extractability to browser:** WASM porting would require:
  - Rewrite all Fortran to JavaScript or C → massive effort (~245k LOC)
  - Remove all MPI parallelism → sequential solver only (severe performance hit)
  - Replace netCDF I/O with in-memory or JSON structures
  - Port or eliminate FMS framework
  - **Verdict: Not feasible.** Size and MPI dependency make browser port impractical.

## 3. Subsystem inventory

### 3.1 Ocean dynamics core (barotropic & baroclinic)
- **Where:** `src/core/MOM_barotropic.F90`, `src/core/MOM_dynamics_*.F90` (split RK2, unsplit RK3), `src/core/MOM_CoriolisAdv.F90`, `src/core/MOM_continuity*.F90`, `src/core/MOM_PressureForce*.F90`
- **What it does:** Solves the hydrostatic primitive equations on an Arakawa C-grid staggered mesh. Implements barotropic (depth-integrated) and baroclinic (stratified) modes. Barotropic solver uses implicit free-surface; baroclinic uses split RK2, unsplit RK3, or unsplit RK2 time-stepping. Advection via PPM (Piecewise Parabolic Method), continuity via volume conservation. Pressure-gradient force via finite-volume integration.
- **Quality & realism: 5/5** — Reference-grade ocean model used operationally by NOAA and international consortium. Extensively validated against observations and benchmarks. Bitwise-reproducible across architectures. Physics is sound hydrostatics with modern numerics.
- **Extractability: tangled** — Core loops over C-grid cells, heavy MPI communication (domain decomposition), tight coupling to time-stepping infrastructure, FMS framework, and diagnostic system. ~35,000 LOC of dynamics code. Effort to extract: **high** (would require sequential rewrite of implicit solver, pressure-gradient force, and advection schemes).
- **Requirements capabilities it could serve:** Climate – ocean currents (if decoupled from dynamics solver, not feasible).

### 3.2 Vertical mixing & parameterizations
- **Where:** `src/parameterizations/vertical/` — `MOM_CVMix_KPP.F90`, `MOM_CVMix_conv.F90`, `MOM_bkgnd_mixing.F90`, `MOM_bulk_mixed_layer.F90`, `MOM_diabatic_driver.F90`, `MOM_tidal_forcing.F90`
- **What it does:** K-Profile Parameterization (KPP) for boundary-layer mixing via CVMix community library. Convective instability mixing, background/tidal dissipation, interior vertical diffusion. Tidal forcing via astronomical frequencies and self-attraction/loading.
- **Quality & realism: 4/5** — Well-tested, based on peer-reviewed parameterizations (KPP, CVMix). Tidal forcing is detailed but tuned for realistic ocean; would oversimplify for fantasy world.
- **Extractability: loosely coupled** — Vertical mixing modules are relatively self-contained but depend on grid, time-stepping, and tracer fields. ~5,000 LOC per module. Effort: **medium** (could extract vertical diffusivity algorithm but lose context-specific tuning).
- **Requirements capabilities it could serve:** Climate – precipitation (if reinterpreted as mixing input; not designed for this).

### 3.3 Lateral mixing & mesoscale eddy parameterization
- **Where:** `src/parameterizations/lateral/` — `MOM_lateral_mixing_coeffs.F90`, `MOM_MEKE.F90`, `MOM_thickness_diffuse.F90`, `MOM_mixed_layer_restrat.F90`, `MOM_Zanna_Bolton.F90`
- **What it does:** Gent-McWilliams/Redi isopycnal and thickness diffusion. Mesoscale eddy kinetic energy (MEKE) budget for eddy-induced momentum and tracer fluxes. Mixed-layer restratification. Data-driven subgrid momentum closure (Zanna-Bolton ML neural network). All operate on C-grid with tensor properties.
- **Quality & realism: 4/5** — Parameterizations are state-of-the-art for ocean GCM. MEKE is novel and well-published; Zanna-Bolton incorporates ML. Tuned for realistic ocean eddies (1–100 km scale).
- **Extractability: loosely coupled** — Diffusion coefficients depend on grid geometry and density gradients but are computed locally. ~2,000–3,000 LOC per module. Effort: **medium** (coefficient calculation could extract, but loses context).
- **Requirements capabilities it could serve:** Climate – ocean currents (parameterized eddy contribution, not suitable for fantasy generation).

### 3.4 Forcing & boundary conditions
- **Where:** `src/core/MOM_forcing_type.F90`, `src/core/MOM_open_boundary.F90`, `src/core/MOM_porous_barriers.F90`; drivers in `config_src/drivers/`
- **What it does:** Forcing type manages wind stress (components + magnitude), heat fluxes (shortwave, longwave, sensible, latent), freshwater fluxes (evaporation, precipitation, runoff, sea-ice melt). Open boundary conditions (OBC) for domain edges. Porous barriers model land/ice obstacle drag.
- **Quality & realism: 4/5** — Comprehensive and modular. Handles realistic forcing pathways. Not generative; consumes external forcing data.
- **Extractability: loosely coupled** — Forcing type is a data structure; calculation depends on couplers or external models. ~3,000 LOC. Effort: **low** (forcing structure is extractable; wind/heat algorithms are in drivers, not here).
- **Requirements capabilities it could serve:** Climate – wind, temperature, precipitation, ocean currents (all as forcing inputs, not generation).

### 3.5 Tracer transport & biogeochemistry infrastructure
- **Where:** `src/tracer/` — `MOM_tracer_advect.F90`, `MOM_tracer_flow_control.F90`, `MOM_MARBL_tracers.F90`, `MOM_generic_tracer.F90`
- **What it does:** Advection of tracers (temperature, salinity, passive tracers, biogeochemical species) via PPM. Tracer-specific source/sink terms. Infrastructure for generic tracer addition. MARBL biogeochemistry (algae, nutrients, carbonate) integrated but optional.
- **Quality & realism: 4/5** — Tracer advection is accurate (PPM). Biogeochemistry is research-grade but not a primary focus of MOM6 (delegated to MARBL/external packages).
- **Extractability: loosely coupled** — Advection algorithms are modular (~2,000 LOC each) but depend on grid and velocity field. Effort: **medium** (PPM advection extractable in principle, not ocean-specific).
- **Requirements capabilities it could serve:** Hydrology (if adapted for tracer passive transport; limited), resources (biogeochemistry output).

### 3.6 Equation of state & thermodynamics
- **Where:** `src/equation_of_state/` — `MOM_EOS.F90`, `src/equation_of_state/TEOS10/` (Gibbs Seawater library, vendored)
- **What it does:** Density calculation from temperature and salinity. Multiple EOS options (linear, Wright, TEOS-10). Thermodynamic derivatives for pressure gradient and mixing.
- **Quality & realism: 5/5** — TEOS-10 is international standard. Implementations are validated.
- **Extractability: standalone** — EOS is pure function (T,S → ρ, derivatives). ~1,500 LOC core + TEOS-10 functions. Effort: **low** (fully extractable as a library).
- **Requirements capabilities it could serve:** Climate – temperature (EOS table lookups), hydrology (if salinity/density tracking used).

### 3.7 Initialization & I/O
- **Where:** `src/initialization/` — `MOM_grid_initialize.F90`, `MOM_state_initialization.F90`, `MOM_shared_initialization.F90`, `src/core/MOM.F90` (main driver)
- **What it does:** Grid generation (lat-lon, tripolar, mercator). Initial condition setup from files (temperature, salinity, velocities) or idealized profiles. Restart file I/O. Parameter file parsing.
- **Quality & realism: 4/5** — Flexible, handles many grid types and initial scenarios. Restart system is robust.
- **Extractability: loosely coupled** — Grid generation is modular (~3,000 LOC). Initialization code is driver-dependent. Effort: **medium** (grid setup extractable; initialization logic tied to solver).
- **Requirements capabilities it could serve:** Heightmap generation (irregular grids), planet-scale + regional patches (multi-resolution framework present), export (restart format is HDF5 via netCDF).

### 3.8 Diagnostics & output
- **Where:** `src/diagnostics/` — `MOM_diagnostics.F90`, `src/framework/MOM_diag_mediator.F90`
- **What it does:** Registers and computes diagnostic fields (kinetic energy, enstrophy, transport, vorticity, etc.). Posts to central diagnostics system. Handles time-averaging and unit conversion. Coupled to FMS I/O.
- **Quality & realism: 4/5** — Comprehensive, well-tested. Not domain-specific.
- **Extractability: tangled** — Diagnostics are defined per-module and posted via mediator. Removing diagnostics would require rewriting most modules. Effort: **high** (extracting specific diagnostics is feasible but labor-intensive).
- **Requirements capabilities it could serve:** Export (diagnostics → output fields).

### 3.9 Vertical coordinate & ALE remapping
- **Where:** `src/ALE/` — `MOM_ALE.F90`, `MOM_ALE_sponge.F90`, `MOM_coord_initialization.F90`
- **What it does:** Arbitrary Lagrangian-Eulerian (ALE) vertical coordinate. Supports z*, σ (terrain-following), and hybrid coordinates. Regridding/remapping of velocities and tracers to target coordinate during time-step.
- **Quality & realism: 5/5** — ALE framework is sophisticated and well-tested. Enables flexible coordinate choices.
- **Extractability: loosely coupled** — ALE remapping is a distinct phase in time-stepping (~4,000 LOC). Depends on grid and time-step. Effort: **medium** (could extract as a library but tightly integrated into step).
- **Requirements capabilities it could serve:** Heightmap generation (topography-following coordinates).

### 3.10 Open-source dependencies (vendored)
- **TEOS-10 (GSW):** Seawater equation of state, pure Fortran (~3,000 LOC), fully contained. License: LGPL (checked in `src/equation_of_state/TEOS10/`).
- **CVMix:** Vertical mixing community library, Fortran 2003, included via submodule. License: Apache-2.0 (consistent).
- **FMS:** External dependency, not vendored in MOM6 repo, built separately.

### Missing subsystems relative to MapMaker requirements
- **Tectonics:** None. MOM6 is oceanographic; plate tectonics are out of scope.
- **Heightmap generation:** No procedural terrain generation. Grid is defined externally or via simple initialization.
- **Erosion:** None. Not a hydrodynamic ocean model concern (would be a land/river model).
- **Hydrology (rivers/lakes/watersheds):** None. MOM6 is ocean-only; runoff is a boundary condition.
- **Biomes, soils, resources:** Biogeochemistry is optional via MARBL; no biome/soil/resource generation.
- **Population/settlement/cities/languages/political borders/trade/history:** None. MOM6 is not a civilization simulator.
- **Globe view, flat projections:** Grid can represent different projections, but rendering is not in MOM6; diagnostics output to files.
- **Partial-world inference:** No. MOM6 requires full or large domain specification.
- **Import of heightmaps/layers:** MOM6 can read bathymetry (seafloor depth) from files but is not designed for arbitrary heightmap ingestion.
- **Fidelity/speed slider with same-seed preview:** None. MOM6 does not have a preview mode; runs to completion.
- **Export (PNG/SVG/STL):** None. MOM6 exports to netCDF/HDF5 only; post-processing required.
- **Calibration against Earth data:** MOM6 uses realistic physical parameters and can be tuned to observations, but no automated calibration subsystem.

## 4. Internal data representation

**Grid structure:**
- Arakawa C-grid: regular lat-lon or tripolar (reduced-pole stereographic). Tracers at cell centers; u-velocities at east face; v-velocities at north face.
- Staggered in vertical: interface depths at tracer points, layer thicknesses (H, in ALE mode).
- Resolution: user-specified; typical range 1/4° to 1/12° global, or refined regional (1/60° to 1/100°).
- Units: SI (meters, seconds, Kelvin, PSU salinity) internally; unit scaling (Z, H, L, T, Q, R) allows dimensional consistency testing.

**Vertical coordinate:**
- ALE frame: arbitrary vertical coordinate as function of (x, y, time). Supports z* (z-level), σ (terrain-following), hybrid, isopycnal. Each layer has thickness H.

**Time:**
- Time-stepping: split barotropic (external gravity waves, small Δt) and baroclinic (larger Δt). Typical Δt: 60–600 s for regional; 1800 s for global.
- Time axis: FMS time_type (integer seconds + day offset).

**State variables:**
- Tracers: temperature (T), salinity (S), passive tracers (dyes, age, etc.). Stored at cell centers, 3D array (ni, nj, nk).
- Velocities: u (zonal), v (meridional), stored at face locations. 3D arrays.
- Thickness/depth: H (layer thickness, ALE); depth integrated for barotropic.
- Free surface: η (sea surface height) or diagnostic depending on solver mode.

**Save format (restart):**
- netCDF/HDF5 via FMS I/O. Fields include: velocities, tracers, layer thicknesses, model state (time, iteration). Self-describing; includes dimensional and coordinate metadata.
- Seed/reproducibility: No explicit RNG state. Model is deterministic given initial conditions and forcing; bitwise reproducible across serial/parallel/architecture via careful arithmetic and checksums.

**RNG & seeding:**
- Stochastic parameterizations (SKEB, stochastic lateral mixing) use optional seeded random number generation. Seed is a parameter; model output is reproducible given seed and parameters.

## 5. License

**SPDX identifier:** Apache-2.0 (verified from `LICENSE` file, 178 lines)

**File path:** `/Users/griffinfoster/Projects/MapMaker/upstream/MOM6/LICENSE`

**License content:** Standard Apache License 2.0 text.

**Vendored/mixed licenses:**
- TEOS-10 (in `src/equation_of_state/TEOS10/`): LGPL (noted in files). Compatible with Apache-2.0 for linking (weak copyleft).
- CVMix (submodule, external): Apache-2.0 (stated in README). Consistent.
- FMS: External dependency; built separately. Licensed under multiple terms (contact NOAA-GFDL); typically open-source for academic use.

**Practical notes:**
- Apache-2.0 is permissive, non-copyleft. Permits commercial use, modification, distribution.
- No patent clauses beyond standard grant. No EULA restrictions.
- TEOS-10 LGPL does not restrict derivative use of MOM6 (weak copyleft applies to TEOS library, not downstream); FMS license should be verified for distribution.
- License matches manifest entry (Apache-2.0).

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Out of scope for ocean model |
| Heightmap generation | no | — | — | — | Requires external input |
| Erosion | no | — | — | — | Not a hydrodynamic concern |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | Ocean-only; runoff is boundary input |
| Climate – temperature | partial | 3/5 | loose | `MOM_forcing_type.F90`, `MOM_EOS.F90` | Consumes as forcing; models thermodynamics; no generation |
| Climate – wind | partial | 3/5 | loose | `MOM_forcing_type.F90`, `src/core/MOM_CoriolisAdv.F90` | Consumes wind stress; no generation |
| Climate – ocean currents | yes | 4/5 | tangled | `src/core/MOM_barotropic.F90`, `src/core/MOM_dynamics_*.F90` | Solves for currents; production-grade; not extractable |
| Climate – precipitation | no | — | — | — | Treated as freshwater boundary input |
| Climate – seasons | no | — | — | — | Forcing is time-varying but no seasonal generation |
| Biomes | no | — | — | — | No biome model |
| Soils | no | — | — | — | Ocean-only; no land surface |
| Resources | partial | 2/5 | loose | `src/tracer/MOM_MARBL_tracers.F90` | Optional biogeochemistry; not game resources |
| Population & settlement | no | — | — | — | Out of scope |
| Cities & towns | no | — | — | — | Out of scope |
| Languages & names | no | — | — | — | Out of scope |
| Political borders | no | — | — | — | Out of scope |
| Trade | no | — | — | — | Out of scope |
| Long-run history/war/economics/politics sim | no | — | — | — | Out of scope |
| Planet-scale + regional patches | partial | 3/5 | loose | `src/initialization/MOM_grid_initialize.F90`, `src/ALE/MOM_ALE.F90` | Supports multi-grid; no zoom-consistency logic |
| Globe view | no | — | — | — | No rendering; post-processing required |
| Flat projections | partial | 3/5 | loose | `src/core/MOM_grid.F90` | Supports tripolar & mercator grids; rendering external |
| Partial-world inference | no | — | — | — | Requires full domain specification |
| Import of heightmaps/layers | partial | 2/5 | loose | `src/initialization/MOM_state_initialization.F90` | Can read bathymetry files; not designed for general layer import |
| Fidelity/speed slider + same-seed preview | no | — | — | — | No preview mode |
| Export (PNG/SVG/STL/other) | no | — | — | — | netCDF/HDF5 only; post-processing required |
| Full-state save/resume format | yes | 4/5 | loose | FMS I/O, `src/core/MOM.F90` | netCDF restart files; comprehensive |
| Earth-data calibration (elevation/climate/Köppen) | partial | 2/5 | loose | `src/equation_of_state/TEOS10/`, parameter files | EOS calibrated; climate parameters tunable; no automated calibration |
| Planet-parameter derivation | no | — | — | — | Parameters specified externally |

## 7. Verdict

**What is worth extracting for MapMaker:**

1. **Equation of state (TEOS-10)** — Pure thermodynamic function (T,S → ρ, derivatives). Fully standalone, ~1,500 LOC core. **Effort: low. Gain: limited** (useful for ocean salinity/density if MapMaker includes water properties, but not essential for fantasy world generation). Rating: 5/5, standalone.

2. **Vertical mixing coefficients (KPP)** — Boundary-layer turbulence parameterization. Modular, ~2,000 LOC per module. **Effort: medium. Gain: limited** (could parameterize mixing in lakes/oceans, but tuned for Earth ocean; requires domain knowledge to recontextualize). Rating: 4/5, loose.

3. **Grid infrastructure (ALE, tripolar)** — Coordinate system and remapping. Sophisticated, ~4,000 LOC. **Effort: medium. Gain: moderate** (multi-resolution hierarchy useful for zoom consistency; ALE supports terrain-following). Rating: 4/5, loose.

**What to skip:**

1. **Ocean dynamics (barotropic/baroclinic solver)** — 35,000+ LOC of tightly coupled Fortran. Requires MPI, netCDF, FMS. **Not extractable.** Even if ported to WASM, sequential solver would be too slow for interactive preview.
2. **Forcing/surface coupling infrastructure** — Designed for coupled models; specific to ocean physics. Only marginal reuse for fantasy world.
3. **Diagnostics system** — Tightly integrated into every module; removing it requires rewriting MOM6.
4. **Tracer biogeochemistry (MARBL)** — Specialized for seawater; not generalizable to fantasy resources.

**Biggest risks:**

1. **Language & compilation:** Fortran + MPI + netCDF + Autoconf are not browser-compatible. Any extraction would require a rewrite to JavaScript/TypeScript or WASM + JavaScript FFI. **High effort, high risk of bugs in translation.**
2. **Coupling tightness:** Core solver is deeply embedded in MOM infrastructure (domains, diagnostics, I/O). Lifting subsystems risks breaking invariants (e.g., C-grid staggering).
3. **Tuning & calibration:** All parameterizations (mixing, diffusion, advection) are tuned to realistic ocean dynamics. Adapting them to fantasy worlds (lower gravity? no Coriolis? exotic fluids?) requires rethinking assumptions. No facility for parameter discovery.
4. **Operationalization risk:** MOM6 is a research model; it assumes sophisticated users. Documentation is dense; parameter space is vast. Integrating into a game-like tool would require significant UX/parameter simplification work.

**Open questions / unverified points:**

- FMS license compatibility with downstream distribution (not verified; contact NOAA-GFDL).
- Can MOM6 run in ocean-only mode without MPI (uniprocessor)? (Likely yes, but not standard use case; would need testing.)
- What is the typical simulation time for a fantasy-world-scale ocean (e.g., 10,000 km × 10,000 km at 10 km resolution, 100 years)? Unverified; would depend on hardware and parameterizations.

## Recommendation

**MOM6 is a poor fit for MapMaker.** It is purpose-built for high-fidelity offline simulation of Earth's oceans, not generative world-building. The only extractable subsystems (EOS, mixing, grid infrastructure) provide marginal value relative to extraction cost. A fantasy world generator would be better served by:

1. **For ocean currents:** Simplified geostrophic circulation (wind-driven gyres + Ekman spirals), or a shallow-water equations solver (far simpler than MOM6, more suitable for WASM).
2. **For climate:** Parameterized wind/temperature based on latitude, topography, and ocean-atmosphere coupling (e.g., Hadley cells, monsoons). MOM6's resolution and physics are overkill.
3. **For grid & rendering:** Use an existing WebGL globe library (Cesium, Babylon.js, Three.js) and separate generative backend (Python/Node.js), not coupled to an ocean model.

**Not recommended for extraction or integration.**

