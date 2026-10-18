# Audit: MOM6

> **Reconciled 2026-10-18** against the source at `f49a000` (`docs/reconciliation/group-3.md`). Both submodules are empty: `pkg/GSW-Fortran` (TEOS-10) and `pkg/CVMix-src`. The 32 files in `src/equation_of_state/TEOS10/` are symlinks into the empty GSW submodule, so the TEOS-10 EOS, the TEOS-10 freezing point and the seven files that `use` CVMix (including `MOM_vert_friction.F90`) cannot be read in full or built from this checkout. Corrected: file counts, the barotropic scheme (explicit and subcycled, not implicit), the tidal-forcing path (`lateral/`, not `vertical/`), the MARBL interface paths, the licence line count, and the verdict for note 23 (a formulation reference whose closed-form pieces port: the Roquet et al. 2015 polynomial EOS, tidal astronomy and analytic gyre winds).

## 1. Overview

MOM6 (Modular Ocean Model, version 6) is a production-grade ocean circulation model developed by NOAA-GFDL and a consortium of institutions. It solves the primitive equations for ocean dynamics on an Arakawa C-grid, with comprehensive parameterizations for physical processes including wind-driven circulation, internal mixing, tidal forcing, and ice shelf coupling. The model is mature (active development, used operationally) and substantial: 245 Fortran source files in `src/` (245,114 lines) and 323 in the whole repo (280,754 lines, with `config_src/` and `.testing/`), across 75 directories, with comprehensive CI/CD testing and documentation. Latest commit: `f49a00096df607b48354603e2398e14e189fd62e`.

## 2. Language, runtime, dependencies, build

**Primary languages:**
- Fortran 2003+ (~99% of codebase): 245 `.F90` files in `src/` (~245,000 LOC); 323 in the repo
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
- **Tests:** `.testing/` runs invariance tests on small configurations `tc0`–`tc4` (`.testing/README.rst:221–242`): symmetric vs non-symmetric grids, serial vs two-domain layout, restart equivalence, DEBUG vs REPRO builds, NaN initialisation, and dimensional rescaling; plus timing tests (`:31–35`) and optional profiling (`:77`). `tc1` uses gyre winds on the `benchmark` topography (`tc1/MOM_input:169`, `:516`). None compares with an analytic Stommel or Munk solution.
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
- **What it does:** Solves the hydrostatic primitive equations on an Arakawa C-grid staggered mesh. Implements barotropic (depth-integrated) and baroclinic (stratified) modes. The barotropic solver is explicit and subcycled within each baroclinic step (`btstep`, `MOM_barotropic.F90:471–477`: forward–backward for gravity waves, blended toward backward Euler by `bebt`, with forward–backward Coriolis); baroclinic uses split RK2, unsplit RK3, or unsplit RK2 time-stepping. Advection via PPM (Piecewise Parabolic Method), continuity via volume conservation. Pressure-gradient force by finite-volume integration (`MOM_PressureForce_FV.F90`) or the Montgomery potential (`MOM_PressureForce_Montgomery.F90`). Coriolis/PV schemes: Sadourny (1975) energy and enstrophy, Arakawa & Hsu (1990), Arakawa & Lamb (1981), a blend, and WENO variants (`MOM_CoriolisAdv.F90:103–111`).
- **Quality & realism: 5/5** — Reference-grade ocean model used operationally by NOAA and international consortium. Extensively validated against observations and benchmarks. Bitwise-reproducible across architectures. Physics is sound hydrostatics with modern numerics.
- **Extractability: tangled** — Core loops over C-grid cells, heavy MPI communication (domain decomposition), tight coupling to time-stepping infrastructure, FMS framework, and diagnostic system. ~35,000 LOC of dynamics code. Effort to extract: **high** (would require sequential rewrite of the subcycled barotropic solver, pressure-gradient force, and advection schemes).
- **Requirements capabilities it could serve:** Climate – ocean currents (if decoupled from dynamics solver, not feasible).

### 3.2 Vertical mixing & parameterizations
- **Where:** `src/parameterizations/vertical/` — `MOM_CVMix_KPP.F90`, `MOM_CVMix_conv.F90`, `MOM_bkgnd_mixing.F90`, `MOM_bulk_mixed_layer.F90`, `MOM_energetic_PBL.F90` (ePBL, 4,490 lines), `MOM_diabatic_driver.F90`, `MOM_tidal_mixing.F90`
- **What it does:** K-Profile Parameterization (KPP) for boundary-layer mixing via CVMix community library. Convective instability mixing, background/tidal dissipation, interior vertical diffusion. Tidal *forcing* is not here but in `src/parameterizations/lateral/` (§3.3). The `MOM_CVMix_*` files, `MOM_bkgnd_mixing.F90`, `MOM_tidal_mixing.F90` and `MOM_vert_friction.F90` `use` modules from the empty `pkg/CVMix-src` submodule.
- **Quality & realism: 4/5** — Well-tested, based on peer-reviewed parameterizations (KPP, CVMix). Tidal forcing is detailed but tuned for realistic ocean; would oversimplify for fantasy world.
- **Extractability: loosely coupled** — Vertical mixing modules are relatively self-contained but depend on grid, time-stepping, and tracer fields. ~5,000 LOC per module. Effort: **medium** (could extract vertical diffusivity algorithm but lose context-specific tuning).
- **Requirements capabilities it could serve:** Climate – precipitation (if reinterpreted as mixing input; not designed for this).

### 3.3 Lateral mixing & mesoscale eddy parameterization
- **Where:** `src/parameterizations/lateral/` — `MOM_lateral_mixing_coeffs.F90`, `MOM_MEKE.F90`, `MOM_thickness_diffuse.F90`, `MOM_mixed_layer_restrat.F90`, `MOM_Zanna_Bolton.F90`, `MOM_tidal_forcing.F90`
- **What it does:** Gent-McWilliams/Redi isopycnal and thickness diffusion. Mesoscale eddy kinetic energy (MEKE) budget for eddy-induced momentum and tracer fluxes. Mixed-layer restratification. Data-driven subgrid momentum closure (Zanna-Bolton ML neural network). All operate on C-grid with tensor properties. Tidal forcing (`MOM_tidal_forcing.F90`): up to 10 constituents (M2, S2, N2, K2, K1, O1, P1, Q1, Mf, Mm), with angular frequencies (`tidal_frequency`, `:154–182`), equilibrium amplitudes and Love numbers (`:413–458`), astronomical longitudes (`astro_longitudes_init`, `:91`), equilibrium phases (`eq_phase`, `:120`) and nodal corrections (`nodal_fu`, `:187`); the spatial structure is the degree-2 harmonics of latitude and longitude (`:290–293`). All closed form.
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
- **Where:** `src/tracer/` — `MOM_tracer_advect.F90`, `MOM_tracer_flow_control.F90`, `MARBL_tracers.F90` and `MARBL_forcing_mod.F90` (the MARBL interface, with stub MARBL modules in `config_src/external/MARBL/`); `config_src/external/GFDL_ocean_BGC/MOM_generic_tracer.F90`
- **What it does:** Advection of tracers (temperature, salinity, passive tracers, biogeochemical species) via PPM. Tracer-specific source/sink terms. Infrastructure for generic tracer addition. MARBL biogeochemistry (algae, nutrients, carbonate) integrated but optional.
- **Quality & realism: 4/5** — Tracer advection is accurate (PPM). Biogeochemistry is research-grade but not a primary focus of MOM6 (delegated to MARBL/external packages).
- **Extractability: loosely coupled** — Advection algorithms are modular (~2,000 LOC each) but depend on grid and velocity field. Effort: **medium** (PPM advection extractable in principle, not ocean-specific).
- **Requirements capabilities it could serve:** Hydrology (if adapted for tracer passive transport; limited), resources (biogeochemistry output).

### 3.6 Equation of state & thermodynamics
- **Where:** `src/equation_of_state/` — `MOM_EOS.F90`, `src/equation_of_state/TEOS10/` (32 symlinks into the empty `pkg/GSW-Fortran` submodule)
- **What it does:** Density calculation from temperature and salinity. Options (`MOM_EOS.F90:175–185`): linear, UNESCO, Jackett–McDougall, Wright (full and reduced), TEOS-10 (needs GSW), the Roquet et al. (2015) density and specific-volume polynomials, and Jackett (2006). The Roquet polynomial (`MOM_EOS_Roquet_rho.F90:194` `density_elem_Roquet_rho`) is a closed-form fit to TEOS-10 in conservative temperature, absolute salinity and pressure, and needs no GSW code. Thermodynamic derivatives for pressure gradient and mixing.
- **Quality & realism: 4/5** — the in-tree options (Roquet polynomial, Wright, Jackett–McDougall, UNESCO, linear) are standard and validated. TEOS-10, the international standard, is **not in the checkout** (the GSW submodule is empty), so it earns no credit here.
- **Extractability: standalone** — EOS is pure function (T,S → ρ, derivatives). 10,107 lines in the twelve `.F90` files of `src/equation_of_state/`; TEOS-10 itself is not in the checkout. Effort: **low** for the in-tree polynomials (extractable as pure functions); TEOS-10 would need the external GSW library.
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

### 3.10 Open-source dependencies (submodules, both empty here)
- **TEOS-10 (GSW):** referenced, not vendored. `src/equation_of_state/TEOS10/` holds 32 symlinks into the `pkg/GSW-Fortran` submodule (commit `29e64d6`), which is empty here, so its licence cannot be checked in this checkout. `MOM_EOS_TEOS10.F90:8–11` and `MOM_TFreeze.F90:12` `use gsw_mod_toolbox`.
- **CVMix:** submodule `pkg/CVMix-src` (commit `fce4221`), empty here; used by seven files in `src/parameterizations/vertical/`. Licence not checkable here.
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
- Arakawa C-grid: regular lat-lon or tripolar (reduced-pole stereographic), logically rectangular, with geographic latitude and longitude in degrees (east-positive longitude, as in MapMaker's canonical frame). The discretisations are C-grid finite volumes, so they transfer to MapMaker's Voronoi sphere mesh only as continuous equations; the solver on the mesh is new code. Tracers at cell centers; u-velocities at east face; v-velocities at north face.
- Staggered in vertical: interface depths at tracer points, layer thicknesses (H, in ALE mode).
- Resolution: user-specified; typical range 1/4° to 1/12° global, or refined regional (1/60° to 1/100°).
- Units: SI (meters, seconds, Kelvin, PSU salinity) internally; unit scaling (Z, H, L, T, Q, R; `src/framework/MOM_unit_scaling.F90`) allows dimensional consistency testing (`.testing` `test.dim`).

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

**SPDX identifier:** Apache-2.0 (verified from `LICENSE` file, 177 lines)

**File path:** `/Users/griffinfoster/Projects/MapMaker/upstream/MOM6/LICENSE`

**License content:** Standard Apache License 2.0 text.

**Vendored/mixed licenses:**
- TEOS-10 (`src/equation_of_state/TEOS10/`): symlinks into the empty GSW-Fortran submodule; licence not checkable here.
- CVMix (empty submodule): licence not checkable here.
- Every MOM6 source file read carries `SPDX-License-Identifier: Apache-2.0` (e.g. `src/core/MOM_barotropic.F90:3`).
- FMS: External dependency; built separately. Licensed under multiple terms (contact NOAA-GFDL); typically open-source for academic use.

**Practical notes:**
- Apache-2.0 is permissive, non-copyleft. Permits commercial use, modification, distribution.
- No patent clauses beyond standard grant. No EULA restrictions.
- The GSW-Fortran and CVMix licences are unverified (empty submodules); FMS license should be verified for distribution.
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
| Resources | partial | 2/5 | loose | `src/tracer/MARBL_tracers.F90` | Optional biogeochemistry; not game resources |
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
| Earth-data calibration (elevation/climate/Köppen) | partial | 2/5 | loose | `src/equation_of_state/` (TEOS-10 itself not in checkout), parameter files | EOS calibrated; climate parameters tunable; no automated calibration |
| Planet-parameter derivation | no | — | — | — | Parameters specified externally |

## 7. Verdict

**What is worth extracting for MapMaker:**

1. **Equation of state** — the Roquet et al. (2015) polynomial (`MOM_EOS_Roquet_rho.F90`) or Wright: closed-form (T,S,p → ρ, derivatives), portable through `dmath`. TEOS-10 proper needs GSW-Fortran, which is not in the checkout. **Effort: low. Gain:** note 23's thermohaline proxy needs surface density from temperature and salinity. Rating: 5/5, standalone.

2. **Vertical mixing coefficients (KPP)** — Boundary-layer turbulence parameterization (needs CVMix, an empty submodule here). Modular, ~2,000 LOC per module. **Effort: medium. Gain: limited** (could parameterize mixing in lakes/oceans, but tuned for Earth ocean; requires domain knowledge to recontextualize). Rating: 4/5, loose.

3. **Grid infrastructure (ALE, tripolar)** — Coordinate system and remapping. Sophisticated, ~4,000 LOC. **Effort: medium. Gain: moderate** (multi-resolution hierarchy useful for zoom consistency; ALE supports terrain-following). Rating: 4/5, loose.

4. **Tidal astronomy** (`src/parameterizations/lateral/MOM_tidal_forcing.F90`, §3.3) — constituent frequencies, equilibrium amplitudes, Love numbers, astronomical longitudes, phases and nodal factors. Closed form, portable through `dmath`, for note 23 §3.3. **Effort: low.**

5. **Analytic gyre wind stress** (`config_src/drivers/solo_driver/MOM_surface_forcing.F90:471` `wind_forcing_2gyre`, `:506` `wind_forcing_1gyre`, `:540` `wind_forcing_gyres`) — forcing for note 23's idealised-basin tests. **Effort: low.**

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

**Not recommended for integration.** Since Q12 and the Q13 scope, note 23 uses MOM6 as its formulation reference and ports only the closed-form pieces in §7.

