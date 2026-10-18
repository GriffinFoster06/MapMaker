# Audit: WRF-Hydro

> **Reconciled 2026-10-18** against the source at `47a64b6` (`docs/reconciliation/group-2.md`). Corrected: code size, the routing options (reach-based Muskingum and Muskingum–Cunge; gridded diffusive wave), single-precision `REAL`, the level-pool scheme, RAPID (matrix Muskingum on PETSc, not Muskingum–Cunge), the grid (projected, e.g. Lambert conformal), and the Q12 status of the licence notes.

## 1. Overview

**WRF-Hydro** is a community hydrologic modeling system developed at NCAR (National Center for Atmospheric Research) for simulating surface and subsurface hydrology, routing, and feedback mechanisms. Version 5.4.0 (National Water Model 3.1 beta); implemented as NOAA's operational National Water Model (NWM) for the continental US in 2016. Active development; well-documented and scientifically published.

249 source files, about 175,000 lines (235 Fortran, 14 C); `src/Land_models/` (Noah, Noah-MP) is 125 files and about 99,000 of those lines, `src/Routing/` 49 files and about 44,000. Mature scientific model designed for HPC clusters. Last commit: 47a64b6e737493589c35317b0698ab21ab8c187d.

## 2. Language, runtime, dependencies, build

**Languages**: Fortran 90/95 (235 files), C (14 files), no Python. Default `REAL` is 32-bit: the GNU flags set no `-fdefault-real-8` (`CMakeLists.txt:214`).

**Build system**: CMake (≥3.24), requires Fortran and C compilers. Primary dependencies: MPI (mandatory for parallel execution), NetCDF (I/O), optional: HDF5. Designed for HPC; single-threaded/serial builds untested in modern versions.

**Runtime**: FORTRAN/C binary compiled for Linux/Unix clusters; requires MPI runtime. Not browser-compatible without complete Fortran-to-WASM/JS port (prohibitively expensive). Does NOT build: cannot be deployed to browser without fundamental rewrite (~100K+ LOC port).

**Can it run in a browser?** No. Porting effort: **VERY HIGH** (~6-12 months for junior team). Requires: (1) Fortran→WASM or JS rewrite; (2) MPI removal or simulation; (3) NetCDF I/O reimplementation; (4) HPC memory model → browser memory constraints. Not feasible for incremental extraction. Best case: extract isolated routing algorithms as reference, rewrite in TypeScript.

## 3. Subsystem inventory

### 3.1 Channel Routing (River Network)
- **Where**: `src/Routing/module_channel_routing.F90` (2,134 lines): `MUSKING` :23 (Muskingum, fixed K and X), `DIFFUSION` :53 (diffusive-wave link flux from Manning conveyance and friction slope), `SUBMUSKINGCUNGE` :130–519 (Muskingum–Cunge with a secant solve for depth: `maxiter = 100`, `mindepth = 0.01` m at :201–202, tolerance 0.01 from :240), `MANNING` :1396, `CRITICALDEPTH` :1413; drivers `drive_CHANNEL` :543 (gridded) and `drive_CHANNEL_RSL` :1613 (reach-based). Options (`src/template/HYDRO/hydro.namelist:143–145`): `channel_option` 1 = Muskingum reach, 2 = Muskingum–Cunge reach, 3 = diffusive wave on the routing grid. Diversions: `src/Routing/Diversions/`.
- **What it does**: Routes discharge through river channel network using Muskingum (linear/nonlinear) and diffusive-wave methods; handles channel geometry, Manning's roughness, infiltration losses, reservoir/dam outflow integration. Matrix-based reach connectivity. Supports multiple channel options (1D full-physics, simplifications).
- **Quality & realism rating: 4/5** — Operationally tested at continental scale (NWM); well-validated against USGS gauges. Uses physical hydraulic equations (continuity, diffusive wave approximation). Some simplifications for performance (e.g., steady-state assumptions in calibration reach lengths).
- **Extractability: loosely coupled** — Routing algorithm core is separable (Muskingum/diffusion functions); requires reach geometry, flow inputs, and channel parameters; I/O and MPI overhead can be removed; the kernels `MUSKING`, `DIFFUSION` and `SUBMUSKINGCUNGE` are about 500 lines of the 2,134-line module, the rest being drivers and I/O. Effort to lift to browser: low to medium; reach-based Muskingum–Cunge updates each reach in upstream-to-downstream order and needs no sparse matrix solve.
- **Requirements capabilities it could serve**: Hydrology (rivers/lakes/watersheds)

### 3.2 Overland Routing (Surface Flow)
- **Where**: `src/Routing/Overland/` (6 modules, ~60KB); `src/Routing/Noah_distr_routing_overland.F90` (~36KB)
- **What it does**: Lateral surface water movement on land grid (2D shallow-water-like flow); computes overland flow depth, velocity, infiltration excess, and flux to channel/lake. Routing options: 8-directional, D-infinity, kinematic-wave-like. State: surface head (depth), flux across grid cell faces.
- **Quality & realism rating: 3/5** — Serviceable for large-scale studies; uses reasonable approximations (Manning, local slope-driven routing). Lacks true 2D SWE solver (simplified; suitable for regional, not local-scale detail). Validated at NWM scale but not at sub-meter resolution.
- **Extractability: loosely coupled** — Grid-based routing algorithm is extractable; state stored in flat arrays; depends on land-surface forcing (infiltration rates) and channel/lake connectivity map. ~8K LOC core. Effort: medium (2D routing logic straightforward; I/O heavy lifting).
- **Requirements capabilities it could serve**: Hydrology (rivers/lakes/watersheds)

### 3.3 Subsurface/Groundwater Routing
- **Where**: `src/Routing/Subsurface/` (4 modules, ~40KB); `src/Routing/Noah_distr_routing_subsurface.F90` (38KB); `src/Routing/module_gw_gw2d.F90` (60KB); `src/Routing/module_GW_baseflow.F90` (22KB)
- **What it does**: Lateral subsurface flow (unsaturated/saturated zones); computes water table depth, available water, lateral flow to/from channels, baseflow (slow discharge). Options: 2D groundwater flow equation (simplified Dupuit), 1D vertical percolation, interflow. Highly parameterized (soil permeability, specific yield, depth-to-bedrock).
- **Quality & realism rating: 3/5** — Captures essential physics (vadose/phreatic distinction, water table feedback); simplifications: Dupuit assumption (vertically averaged 2D flow) is reasonable for regional scale but loses local heterogeneity. Baseflow recession curves are empirical. Validated at large scales, not for detailed groundwater dynamics.
- **Extractability: loosely coupled** — State is grid-based (water table depth, soil moisture per layer, baseflow); logic is separable from coupling. ~15K LOC core. Effort: medium-high (2D solver, soil property interpolation, numerical stability for dry/wet transitions).
- **Requirements capabilities it could serve**: Hydrology (rivers/lakes/watersheds); partial: soils (interacts with soil water retention)

### 3.4 Reservoir/Dam Routing
- **Where**: `src/Routing/Reservoirs/` (multiple modules); level pool in `Reservoirs/Level_Pool/module_levelpool.F90` (419 lines): `LEVELPOOL_PHYSICS` :224, weir plus orifice discharge with gravity hard-coded as 9.81 (orifice term in that routine), integrated by a three-stage Runge–Kutta step; lake area is in km² (`sap = ar * 1.0E6`); `src/Routing/module_reservoir_routing.F90` (12KB)
- **What it does**: Impoundment storage, release rules (elevation-dependent tables), spillway/gate operations, losses (evaporation, seepage). Integrates with channel routing. Can link to Noah-MP lake model.
- **Quality & realism rating: 3/5** — Functional for dam operations in regional models; rule-curves are lookup tables (not physics-based); evaporation is crude. Adequate for continental-scale NWM but not for detailed dam engineering.
- **Extractability: standalone** — Isolated lookup-table logic; minimal coupling. ~2K LOC. Effort: low.
- **Requirements capabilities it could serve**: Hydrology (rivers/lakes/watersheds)

### 3.5 RAPID River Routing (Alternative)
- **Where**: `src/Rapid_routing/` (35 .F90 files, 5,478 lines); separate LICENSE (BSD-3-Clause, Cedric H. David)
- **What it does**: Muskingum method (matrix-based or traditional, `rapid_var.F90:56`) for large-scale river routing, not Muskingum–Cunge; built on PETSc (23 files reference it); designed for continental/global networks. Community contribution (not core WRF-Hydro, but integrated option).
- **Quality & realism rating: 3/5** — Simplified but proven at global scale; appropriate for coarse-resolution river networks; less detailed than channel routing module.
- **Extractability: standalone** — Completely independent routing method. ~5K LOC. Effort: low-medium (rewrite existing Muskingum implementation).
- **Requirements capabilities it could serve**: Hydrology (rivers/lakes/watersheds)

### 3.6 Land Surface Model (Noah-MP)
- **Where**: `src/Land_models/NoahMP/` (coupled code, real driver in `src/CPL/NoahMP_cpl/`)
- **What it does**: Soil/vegetation processes (infiltration, ET, photosynthesis, phenology, snow). Feeds forcing to hydrology (infiltration excess, baseflow, water table). Modular land-surface model.
- **Quality & realism rating: 4/5** — Well-maintained; coupled to WRF for atmosphere. Comprehensive (38 vegetation types, 19 soil types, 4 snow layers). Operationally used in NWM.
- **Extractability: tangled** — Tightly coupled to hydrology (infiltration state, water table feedback); depends on atmospheric forcing. Can be extracted but requires forcing interface. ~50K LOC in NoahMP itself; ~30K coupling code.
- **Requirements capabilities it could serve**: Hydrology (infiltration); soils (water content, properties); climate (temperature/precipitation input)

### 3.7 Forcing/I/O and Atmospheric Coupling
- **Where**: `src/Routing/module_lsm_forcing.F90` (122KB); `src/CPL/WRF_cpl/`, `src/CPL/Noah_cpl/`, `src/CPL/NUOPC_cpl/` (atmospheric coupling); `src/Routing/module_HYDRO_io.F90` (435KB, I/O layer)
- **What it does**: Reads meteorological forcing (precip, temp, wind, radiation, humidity), distributes to grid, manages I/O (NetCDF restart/output files), handles MPI communication. Coupling interfaces for WRF atmosphere model, other LSMs (CLM, LIS).
- **Quality & realism rating: 4/5** — Robust I/O; flexible forcing interfaces; operationally proven.
- **Extractability: tangled** — Heavy MPI/NetCDF/HDF5 dependencies; closely coupled to state management. Can be replaced with simpler interfaces. I/O layer is ~400K LOC but mostly configuration/boilerplate; core forcing logic ~10K LOC.
- **Requirements capabilities it could serve**: Climate (precipitation, temperature input); import/export

### 3.8 Nudging/Data Assimilation (Optional)
- **Where**: `src/nudging/` (optional, streamflow nudging)
- **What it does**: Assimilates observed streamflow to correct simulated discharge; optional component.
- **Quality & realism rating: 2/5** — Functional but not sophisticated; simple nudging toward observations; not Kalman filter or EnKF.
- **Extractability: standalone** — Separable from core routing. ~2K LOC.
- **Requirements capabilities it could serve**: Calibration/validation data

## 4. Internal data representation

**Grid/mesh**: Structured 2D regular grid in the driving model's map projection (for NWM, Lambert conformal conic: `module_HYDRO_io.F90:1922`), with a finer routing grid (`AGGFACTRT`, `hydro.namelist:119`). Channel/reach network is 1D graph (reaches as nodes, flow as edges). No unstructured mesh option.

**Resolution**: Configurable; NWM uses ~4 km land grid, network built from ~7.5M National Hydrography Dataset (NHD) reaches aggregated/simplified to ~8.8M compute reaches.

**Units**: SI (meters, seconds, cubic meters per second for discharge). Elevations in meters above datum. Soil moisture as volumetric fraction (0-1). Temperature in Kelvin.

**Coordinate system**: Projected grid (lat/lon carried as auxiliary fields); internally grid indices (i,j) and reach indices. Projections are prepared by the preprocessing tools. No pole handling (regional only). The reach network is a 1D graph with per-reach length, slope and trapezoidal geometry, independent of the grid.

**Time step**: Configurable; typically 1 hour for NWM (atmospheric coupling), can be finer for standalone hydrology (30 min typical). Fixed timestep throughout simulation.

**Serialization/save format**: NetCDF restart files (HDF5-backed); can save full state (all grid arrays, channel storage/flow, water table, soil moisture). Custom binary format available for performance. State is deterministic (seeded by initial conditions, no explicit RNG state).

**RNG/seed**: No stochastic component; deterministic given forcing and parameters. Reproducible across runs (no randomness in physics).

**Zoom consistency**: No inherent multi-resolution capability. Regional patches must match parent grid; no mosaic/downsampling logic. Would require external nesting scheme (not built-in).

## 5. License

**Verified SPDX**: Custom UCAR non-OSI license (not OSI-approved). File: `LICENSE.txt` at repo root.

**Key terms** (from LICENSE.txt, section 1, lines 3–7):
- Non-exclusive, royalty-free license to use, modify, distribute, publish in source and object form
- **RESTRICTION: "You shall not sell, license or transfer for a fee the Software, or any work that in any manner contains the Software."**
- No warranty, no support (clauses 2-5)
- No endorsement of products/services using UCAR/NCAR names without written permission
- Governed by US law (State of Colorado)

**Vendored/mixed licenses**:
1. **RAPID routing** (`src/Rapid_routing/LICENSE`): BSD-3-Clause (Cedric H. David, 2007-2013) — freely combinable with UCAR license
2. **Crocus snowpack** (referenced in README but not present in current repo): CeCILL-C (Météo-France SURFEX) — would apply only if module included

**Matches manifest?** Yes. Manifest entry lists "Custom (UCAR, non-OSI, no-resale clause)" and notes "review before extracting."

**Practical notes**: 
- The **no-resale clause** is unambiguous: a build containing WRF-Hydro-derived code cannot be sold or licensed for a fee. Since ARCHITECTURE.md Q12 (personal, non-commercial project) this is recorded, not a blocker; a port must keep the UCAR notice and be logged in `PROVENANCE.md`.
- RAPID subset is separately licensable (BSD) if isolated; but RAPID is optional integration, not core.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Not in scope; WRF-Hydro is hydrology-focused |
| Heightmap generation | no | — | — | — | Expects pre-existing DEM input |
| Erosion | no | — | — | — | No erosion model; uses static channel/floodplain geometry |
| Hydrology (rivers/lakes/watersheds) | **yes** | **4** | loosely coupled | `src/Routing/module_channel_routing.F90`, `Overland/`, `Subsurface/`, `Rapid_routing/` | Core strength: channel routing (Muskingum/diffusive), overland flow, subsurface routing, reservoirs |
| Climate – temperature | partial | 3 | tangled | `src/Land_models/NoahMP/`, `src/CPL/` | Input forcing only; no climate generation. Noah-MP uses temp for snow/phenology. |
| Climate – wind | partial | 2 | tangled | `src/Routing/module_lsm_forcing.F90` | Forcing input for canopy interactions; not generated |
| Climate – ocean currents | no | — | — | — | Not in scope |
| Climate – precipitation | partial | 3 | tangled | `src/Routing/module_lsm_forcing.F90` | Forcing input; distributed to grid via interpolation; not generated |
| Climate – seasons | no | — | — | — | Uses input forcing with seasonal variation; no cycle generation |
| Biomes | no | — | — | — | Not in scope; optional vegetation coupling via Noah-MP |
| Soils | partial | 3 | loosely coupled | `src/Land_models/NoahMP/soil_routines`, `module_gw_gw2d.F90` | Soil water content, permeability, depth-to-bedrock for routing; static properties, no soil genesis |
| Resources | no | — | — | — | Not in scope |
| Population & settlement | no | — | — | — | Not in scope |
| Cities & towns | no | — | — | — | Not in scope |
| Languages & names | no | — | — | — | Not in scope |
| Political borders | no | — | — | — | Not in scope |
| Trade | no | — | — | — | Not in scope |
| Long-run history/war/economics/politics sim | no | — | — | — | Not in scope |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | partial | 2 | tangled | Network routing is global-capable (NHD), grid is regional; no zoom framework | NWM covers continental US; mosaic/nesting external; no zoom consistency mechanism |
| Globe view | no | — | — | — | Not in scope; web/GIS output only |
| Flat projections | no | — | — | — | Expects input on a projected grid prepared by preprocessing tools |
| Partial-world inference | no | — | — | — | No inference; requires full domain + boundary conditions |
| Import of heightmaps/layers | yes | 4 | loosely coupled | `src/Routing/module_HYDRO_io.F90`, `module_lsm_forcing.F90` | Reads DEM, land-use, soil type, channel network from NetCDF/GIS formats |
| Fidelity/speed slider with same-seed preview | no | — | — | — | Single timestep only; no seeded preview mode |
| Export (PNG/SVG/STL/other) | yes | 2 | loosely coupled | `src/Routing/module_NWM_io.F90` | NetCDF output standard; GeoTIFF/visualization require post-processing |
| Full-state save/resume format | yes | 4 | loosely coupled | `src/Routing/module_HYDRO_io.F90` | NetCDF restart files preserve all state; deterministic replay |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3 | loosely coupled | Network built from NHD+, forcing from NLDAS/Stage IV precip, reference sites from USGS gauges | Parameters validated against CONUS obs.; not automated calibration |
| Planet-parameter derivation | no | — | — | — | No parameter generator; requires domain-specific calibration/data |

## 7. Verdict

- **Port the routing kernels, not the model** (updated for Q12): the full model is not browser-deployable, but `SUBMUSKINGCUNGE`, `MUSKING`, `DIFFUSION` and `LEVELPOOL_PHYSICS` are small, self-contained arithmetic (`sqrt`, `**(2/3)`, `**(5/3)`, `**(3/2)`) and port directly to TypeScript through `dmath`. Native output is single precision, so it can serve only as a tolerance oracle, not a bitwise one. Estimated effort: 2-3 person-months for a solid TypeScript hydrology engine.

- **What to skip**: Do not extract Noah-MP land-surface code (tangled, ~80K LOC, heavy MPI); rewrite minimal LSM (infiltration, ET) as needed. Do not attempt Fortran→WASM port (uneconomical). Shipping WRF-Hydro-derived code is allowed since Q12; MapMaker is non-commercial.

- **Biggest risks**: (1) License restriction is real and unambiguous—legal review required if commercial path considered. (2) WRF-Hydro assumes HPC infrastructure; scaling to browser (~10K nodes in continental US) will require aggressive simplification of channel network. (3) Forcing data (precipitation, temperature) must come from pre-computed sources or simplified generators; WRF-Hydro is a driver, not an atmosphere model.

- **Open questions**: (1) What is the target domain extent (globe vs. regional)? WRF-Hydro network is designed for 4 km land grid; fine grids (< 1 km) require nesting or alternative DEM processing. (2) Will MapMaker couple to an atmosphere model, or use forcing libraries (e.g., ERA5, synthetic)? (3) Can you tolerate simplified routing (Muskingum without 2D detail) for browser speed?

- **Alternative**: **ParFlow** (LGPL-2.1, `upstream-manifest.json`) is a more physics-complete integrated hydrology model (surface + subsurface + coupling) but even more complex to extract. Badlands (GPL-3.0, erosion) offers erosion + hydrology coupling if terrain evolution is needed. Consider **orogen** for heightmap generation and projection reference.
