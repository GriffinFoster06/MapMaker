# Audit: CESM

## 1. Overview

CESM (Community Earth System Model) is a sophisticated, production-grade climate and weather simulation system developed by UCAR/NCAR and collaborating institutions. The repository at the checkout (HEAD: ad73796b9cce6982230a36e66a2d32e6ce95910d, branch cesm3.0-alphabranch) is a **metarepository** that primarily manages coupled-model components via git submodules; the actual component implementations (CAM, CLM, CICE, MOM, etc.) are in external repos. In this checkout, all component submodules and libraries are uninitialized (empty directories), so only ~800 LOC of infrastructure Python and XML configuration files are present in the top-level repo. The model is designed for large-scale computing (MPI, HPC clusters, Fortran+C runtime) and cannot run in a browser without radical porting. CESM is mature (CESM2.1.5 is production; 2.2.2 and 3.0 are in active development) and extensively documented.

## 2. Language, runtime, dependencies, build

- **Primary language**: Fortran 2003+ and C (component implementations are in their respective submodules; top-level repo is mostly Python 3, XML, shell scripts).
- **Approximate LOC in top-level repo**: ~800 lines (Python/shell scripts only; actual models are elsewhere).
- **Runtime/platform**: Unix/Linux/macOS only. Requires MPI (Message Passing Interface) for parallel computing, or single-core via mpi-serial library. Designed for supercomputing clusters; cannot run in a browser.
- **Key dependencies** (from .gitmodules and README):
  - Fortran compiler (Fortran 2003 features; tested versions: gfortran, Intel ifort, PGI; see Compiler Test Spreadsheet in docs).
  - C compiler.
  - Python 3 (≥3.8).
  - Perl 5.
  - CMake and gmake.
  - LAPACK + BLAS libraries.
  - NetCDF 4.3+ built with the same compiler.
  - PnetCDF (optional but recommended).
  - MPI environment (OpenMPI, MPICH, Intel MPI, or mpi-serial for single-core).
  - Git 1.8+ and git-fleximod extension.
- **Does it build?** Not attempted in this audit. Per HARD RULES, building CESM is not attempted; the repo is read-only. Assessment inferred from: (1) README explicitly lists compiler and tool requirements; (2) .gitmodules references 12 external components (CAM, CLM, CICE, MOM, CISM, RTM, MOSART, WW3, mizuRoute, CDEPS, CMEPS, FMS/FTorch); (3) `./bin/git-fleximod update` is required to populate submodules before build; (4) `cime_config/` contains test/compile configurations; (5) no submodules are populated in this checkout (all component dirs are empty), so build would fail immediately without running git-fleximod. **Build is feasible on HPC/Linux but requires external infrastructure (compilers, MPI, NetCDF) unavailable on standard systems without setup; porting to browser is not viable without complete rewrite.**
- **Browser/JavaScript feasibility**: **Not feasible as-is.** CESM is a Fortran+C system designed for MPI-parallel compute. Porting would require: (1) transpiling or rewriting hundreds of thousands of LOC from Fortran to JavaScript/WASM; (2) replacing MPI with single-threaded or web-worker-based parallelism; (3) adapting I/O (NetCDF, file-based) to in-memory data structures; (4) replicating climate solver algorithms (atmospheric dynamics, radiative transfer, etc.) in JavaScript, with high risk of numerical instability. Estimated effort: **very high** (months-to-years for a team). Not recommended for extraction.

## 3. Subsystem inventory

**Note**: This checkout has uninitialized git submodules. All component implementations are in external repos and not present locally. The following descriptions are based on CESM documentation, .gitmodules, and config files; **actual code is not audited here.**

### 3.1 Atmosphere (CAM)

- **Where**: `components/cam/` (uninitialized submodule; external: ESCOMP/CAM, tag cam6_4_203)
- **What it does**: Computes atmospheric dynamics (wind, pressure, temperature), clouds, precipitation, radiative transfer (solar and longwave), upper atmospheric chemistry (TUV-X), aerosols. Uses spectral/finite-volume dynamical core; RRTMG for radiative transfer. Couples with land, ocean, and ice via mediator.
- **Quality & realism rating: 5/5**. CAM is a reference atmospheric model used in CMIP6 (Coupled Model Intercomparison Project Phase 6) and other major climate studies. Algorithms are validated against observations; physics includes detailed cloud microphysics, aerosol interactions, and stratospheric chemistry. Tuned for Earthlike climates; parameterizations are scale-dependent (works well at ~100 km resolution). Excellent for planet-scale climate and weather.
- **Extractability: tangled**. CAM depends on CIME framework (case management, build system, I/O), CESM_share (coupler interface), FMS (I/O), NetCDF, MPI. Decoupled into Fortran modules, but data flow is tightly bound to the coupler mediator (CMEPS). Estimated core climate code ~200k LOC Fortran. Effort to extract to standalone JavaScript: **high** (would require complete rewrite of dynamical core, radiation, cloud physics).
- **Requirements capabilities it could serve**: Climate (temperature, wind, precipitation, seasons); calibration data.

### 3.2 Land & Soil & Biomes (CLM/CTSM)

- **Where**: `components/clm/` (uninitialized submodule; external: ESCOMP/CTSM, tag ctsm5.4.057)
- **What it does**: Simulates land-surface processes: soil moisture, temperature, transpiration, photosynthesis (carbon cycle), vegetation phenology, snow, surface runoff, infiltration. Includes FATES (Functionally Assembled Terrestrial Ecosystem Simulator) for dynamic vegetation and forest gap-model dynamics. Generates biome-appropriate soil properties, plant traits, albedo. Couples to atmosphere for water/energy fluxes.
- **Quality & realism rating: 4.5/5**. CLM/CTSM is a comprehensive land-surface model. Soil physics is based on van Genuchten and Campbell parameterizations; biogeochemistry (C/N cycles) is detailed and tuned against site observations. FATES adds individual-based forest dynamics (competition, mortality, recruitment). Excellent for realistic biome, soil, and hydrology. Limitation: tuned for 1° resolution; finer regional scales require rescaling and site-specific parameters.
- **Extractability: tangled**. Depends on CIME, CESM_share, NetCDF, MPI for domain decomposition. ~100k+ LOC Fortran. Data is gridded (lat-lon, vertical layers); state includes soil moisture, temperature, vegetation state, carbon pools. To extract: would need to isolate soil/biome logic from I/O and coupler. Effort: **high**.
- **Requirements capabilities it could serve**: Biomes; soils; hydrology (infiltration, runoff); resources (albedo, vegetation type); climate coupling (evapotranspiration, sensible heat). Limited for erosion, rivers/lakes, or landform-dependent processes (DEM required as input).

### 3.3 Ocean (MOM)

- **Where**: `components/mom/` (uninitialized submodule; external: ESCOMP/MOM_interface, tag mi_260909; actual MOM6 in external repo)
- **What it does**: Simulates ocean circulation, temperature, salinity, sea-level pressure, currents, heat transport. Uses Modular Ocean Model (MOM6) from GFDL. Solves primitive equations on staggered grid with realistic parameterizations for vertical mixing, eddies, tidal dissipation.
- **Quality & realism rating: 5/5**. MOM6 is the ocean model in NOAA-GFDL climate models. Circulation patterns, Gulf Stream, thermohaline circulation, upwelling are well-simulated. Tuned for realistic heat/salt transport and sea-surface temperature patterns. Standard in CMIP6.
- **Extractability: tangled**. Requires CIME, CESM_share, NetCDF, MPI domain decomposition. ~50k LOC Fortran. To port: would require rewriting in JavaScript or porting to WASM. Effort: **very high**. Ocean simulation is numerically stiff and sensitive to time-stepping; direct translation unlikely to preserve stability.
- **Requirements capabilities it could serve**: Climate (ocean currents, SST); possibly population/trade (coastal regions). Limited for partial-world inference (ocean state is highly nonlocal).

### 3.4 Sea Ice (CICE)

- **Where**: `components/cice/` (uninitialized submodule; external: ESCOMP/CESM_CICE, tag cesm3_cice6_6_3_22)
- **What it does**: Simulates sea-ice thermodynamics (growth, melt, brine pockets, albedo) and dynamics (ridging, advection). Uses viscous-plastic rheology for ice stress. Couples to ocean and atmosphere for heat/momentum.
- **Quality & realism rating: 4/5**. CICE6 is a widely-used sea-ice model. Thermodynamics are based on mushy-layer theory; dynamics use anisotropic plastic yield curve. Good for polar regions; limitations: ridging parameterization is empirical, ice-ocean drag is tuned to observations.
- **Extractability: tangled**. Depends on CIME, CESM_share, MPI. ~20k LOC Fortran. Extraction effort: **high**. Requires careful handling of time stepping and coupled fluxes.
- **Requirements capabilities it could serve**: Climate (if polar regions are included); not relevant for most fantasy worlds.

### 3.5 Glaciers & Ice Sheets (CISM)

- **Where**: `components/cism/` (uninitialized submodule; external: ESCOMP/cism-wrapper, tag cismwrap_2_2_015; actual CISM in external repo)
- **What it does**: Community Ice Sheet Model. Simulates ice-sheet dynamics (flow, calving, basal melting), ice thickness evolution. Uses shallow-ice approximation or higher-order flow laws. Relevant for Greenland, Antarctica, mountain glaciers over multi-century timescales.
- **Quality & realism rating: 4/5**. CISM is a state-of-the-art ice-sheet model. Good for long-term (1000+ year) ice dynamics. Limitations: shallow-ice approximation has accuracy limits; basal hydrology is simplified.
- **Extractability: tangled**. Requires CIME, CESM_share, NetCDF, MPI. ~30k LOC Fortran. Extraction effort: **high**. Ice-sheet models are computationally expensive; GPU acceleration is being added but not standard.
- **Requirements capabilities it could serve**: Tectonics (if modeling mountain building over geological timescales); not relevant for shorter fantasy-world histories or sea-level rise unless 1000+ year scale.

### 3.6 Rivers & Hydrology (RTM, MOSART, mizuRoute)

- **Where**: `components/rtm/` (RTM, tag rtm1_0_89), `components/mosart/` (MOSART, tag mosart1.1.13), `components/mizuRoute/` (mizuRoute, tag v3.1.1) — all uninitialized submodules.
- **What it does**: 
  - **RTM (River Transport Model)**: Simplified 1D stream routing on a channel network. Transports water from land to ocean. Runoff-routing delay is a few days to weeks (planetary timescale).
  - **MOSART (MOdel for Scale Adaptive River Transport)**: More sophisticated; models floodplains, backwater effects, flow regulation (dams). Better for regional rivers.
  - **mizuRoute**: Standalone hydrologic routing model; can be used to route runoff from CLM to ocean. Handles flood inundation, reservoir storage.
- **Quality & realism rating: 3.5/5** (RTM), **4/5** (MOSART/mizuRoute). RTM is coarse (routing to ocean on monthly-seasonal timescale). MOSART and mizuRoute include more detailed floodplain/backwater physics and can operate on shorter timescales (daily). However, all three assume routing on a prescribed river network (derived from DEM) and do not generate river networks de novo. Limited applicability if a fantasy world requires river emergence from terrain without an input DEM.
- **Extractability: loosely coupled**. RTM, MOSART, mizuRoute depend on CIME/CESM_share but have cleaner interfaces than CAM. ~10-30k LOC Fortran each. mizuRoute is designed to be semi-standalone. Extraction effort: **medium to high** (would need to adapt I/O and coupler calls).
- **Requirements capabilities it could serve**: Hydrology (rivers, lakes, watersheds); calibration against real river networks. Could support partial-world inference if given an upslope contributing-area map.

### 3.7 Climate Mediator (CMEPS)

- **Where**: `components/cmeps/` (uninitialized submodule; external: ESCOMP/CMEPS, tag cmeps1.1.73)
- **What it does**: Community Mediator for Earth Prediction Systems. Central coupler that exchanges fluxes between atmosphere, ocean, land, ice, and wave models. Handles regridding, flux calculations (e.g., from land to atmosphere), time-stepping synchronization.
- **Quality & realism rating: 4/5**. CMEPS is a sophisticated coupler. Regridding methods are conservative; flux calculations follow energy/mass conservation. Tested across multiple model configurations.
- **Extractability: tangled**. CMEPS is tightly integrated into CESM. Removing it would require reimplementing coupler calls in each component separately. Extraction effort: **very high** (would need a standalone coupler library or component-specific rewrites).
- **Requirements capabilities it could serve**: Infrastructure only (not directly applicable to MapMaker unless CESM components are used as-is).

### 3.8 Data & Forcing (CDEPS)

- **Where**: `components/cdeps/` (uninitialized submodule; external: ESCOMP/CDEPS, tag cdeps1.0.111)
- **What it does**: Coordinated Data Exchange and Production System. Provides atmospheric forcing data (reanalysis, observational), land-use/land-cover data, and mediates input for non-coupled runs. Allows CESM to ingest external datasets (e.g., MERRA2, ERA5 forcing).
- **Quality & realism rating: 4/5**. CDEPS integrates real observational datasets. Useful for calibration and evaluation against Earth data.
- **Extractability: loosely coupled**. CDEPS reads NetCDF files and interfaces to model components. ~20k LOC Fortran. Extraction effort: **medium** (would need to adapt data I/O).
- **Requirements capabilities it could serve**: Calibration data (Earth climate patterns); import of real heightmaps/climate layers.

### 3.9 Waves (WW3)

- **Where**: `components/ww3/` (uninitialized submodule; external: ESCOMP/WW3_interface, tag main_0.1.1)
- **What it does**: WaveWatch III. Models ocean surface waves (wave height, period, direction). Couples to ocean and atmosphere for wind input and wave-induced mixing.
- **Quality & realism rating: 3.5/5**. WW3 is operational (used by NOAA). Good for coastal hazards and weather. Limitations: computationally expensive; high-frequency waves require fine spatial grids.
- **Extractability: tangled**. Depends on CIME, CESM_share. ~50k LOC Fortran. Extraction effort: **high**.
- **Requirements capabilities it could serve**: Climate (not directly useful for fantasy world generation); possibly coastal aesthetics if waves are visualized.

### 3.10 I/O & Libraries (FMS, ParallelIO, tuv-x, mpi-serial)

- **Where**: `libraries/FMS/`, `libraries/parallelio/`, `libraries/tuv-x/`, `libraries/mpi-serial/`, `libraries/FTorch/` — all uninitialized submodules.
- **What it does**:
  - **FMS (Flexible Modeling System)**: I/O library and utilities for NetCDF, regridding, time management.
  - **ParallelIO (PIO)**: Parallel NetCDF I/O for HPC.
  - **tuv-x**: Upper-atmosphere radiation & chemistry (photolysis, ozone). Standalone radiative-transfer module.
  - **mpi-serial**: Dummy MPI library for single-core runs.
  - **FTorch**: Fortran interface to PyTorch (ML integration, optional).
- **Quality & realism rating**: N/A (infrastructure). 4/5 for maturity and correctness.
- **Extractability**: Varies. FMS and ParallelIO are tightly coupled to CESM/CIME. tuv-x is relatively standalone. Effort: **high** to extract.
- **Requirements capabilities it could serve**: I/O infrastructure; radiative transfer (tuv-x).

### 3.11 Configuration & Build System (CIME)

- **Where**: `cime/` (uninitialized submodule; external: ESMCI/cime, tag cime6.6.2)
- **What it does**: Common Infrastructure for Modeling the Earth. Handles model configuration, case creation, build, submission to job schedulers (SLURM, PBS), post-processing. Provides Python-based scripting and XML-based configuration.
- **Quality & realism rating: 4/5**. CIME is mature and widely used across multiple modeling projects (E3SM, CESM, UK Met Office). Good abstractions for portability.
- **Extractability: Not applicable**. CIME is infrastructure, not a simulation engine. Extraction would mean using CIME to build a different model, not extracting simulation logic.
- **Requirements capabilities it could serve**: Build/config infrastructure only (not directly applicable to MapMaker).

## 4. Internal data representation

- **Grid type**: Regular lat-lon (Gaussian or regular) for atmosphere, staggered B-grid for ocean, land uses same lat-lon as atmosphere.
- **Resolution(s)**: Configurable; common resolutions are 1° (f09, e.g., 96×144 points), 0.25° (f05), ~2° (T31 spectral truncation). Regional high-resolution runs (0.1°) are possible but computationally expensive.
- **Units**: SI units throughout (meters, Kelvin, Pascal, kg/m³, W/m²). Elevation in meters above sea level (absolute).
- **Coordinate conventions**: 
  - Sphere: latitude (-90 to +90), longitude (-180 to +180 or 0 to 360).
  - Vertical: model levels (sigma or hybrid, pressure-based). Ocean uses z-level or isopycnal coordinates.
  - Time: model time steps (e.g., 30 minutes for atmosphere, coupled to land/ocean).
  - Pole handling: reduced Gaussian grid or regular lat-lon; pole singularity managed by spectral truncation (CAM) or other methods.
- **Time representation**: Integer time steps (coupling timestep, often 30 min to 1 hour for full model). Year/month/day tracking via CIME calendar. No built-in support for "same-seed preview" across fidelity levels (though CESM can be configured to run different resolutions).
- **Serialization**: NetCDF4 (HDF5-based), with CF conventions (Climate and Forecast metadata). Restart files capture model state (temperature, moisture, etc.) at a given time step.
- **RNG/seed handling**: CESM uses fixed seeds for reproducibility in forecast modes. Ensemble runs use perturbed initial conditions. No built-in "fidelity slider" with same-seed preview across resolutions.
- **Multi-resolution consistency**: CESM does not natively support zoom/patch consistency across scales. If running regional high-res, boundary conditions must be supplied (e.g., from a coarse global run). No automatic downscaling inference.

## 5. License

- **SPDX**: BSD-3-Clause-style (custom UCAR license, not standard SPDX).
- **File**: `LICENSE.txt` (at repo root).
- **Match to manifest**: Yes; manifest lists "BSD-3-Clause-style (custom UCAR)", which matches the file.
- **Details**: 
  - Top-level CESM framework: BSD-3-Clause-style terms (UCAR disclaimer, no liability).
  - Components have mixed licenses:
    - **CAM, CLM, CICE, MOM, CISM, CMEPS, CDEPS, FMS**: Copyrighted by UCAR/NCAR/Los Alamos/other US institutions; BSD-3-Clause or similar permissive terms.
    - **CISM**: Also listed as GNU LGPLv3 in LICENSE.txt.
    - **AER RRTMG**: Copyrighted by AER Inc.; proprietary radiative-transfer code (terms are permissive for research use but unclear for commercial redistribution).
    - **ESMF**: University of Illinois/NCSA Open Source License.
    - **tuv-x**: Part of NOAA/EPA. License not fully specified in top-level LICENSE.txt (refer to submodule).
  - **Vendored/third-party**: Various radiative-transfer, cloud-physics, and chemistry modules are vendored from AER, NCAR, EPA, NOAA. Each may have different copyright.
- **Practical notes**:
  - CESM is open-source and free for research/academic use.
  - Copyleft (LGPL) component (CISM) does not infect the whole system (LGPL is library-specific; as long as derivative works link to CISM as a library, copyleft applies only to CISM modifications).
  - Extracting individual components and relicensing downstream (e.g., under GPL or proprietary) may require review of sub-component licenses.
  - No patent clauses or EULA restrictions; suitable for open-source projects like MapMaker.
  - License complexity suggests checking with legal if integrating into commercial products.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | No tectonic modeling; input maps required. |
| Heightmap generation | no | — | — | — | No terrain generation; DEM must be input. |
| Erosion | no | — | — | — | No erosion model; CLM soil model does not simulate fluvial/hillslope erosion. |
| Hydrology (rivers/lakes/watersheds) | partial | 3/5 | loose | components/{rtm,mosart,mizuRoute} | RTM/MOSART route runoff on prescribed channels; do not generate river networks. mizuRoute more sophisticated but still routing-only. |
| Climate – temperature | yes | 5/5 | tangled | components/cam, components/clm | CAM (atmosphere), CLM (land surface); coupled heat transport. Realistic. |
| Climate – wind | yes | 5/5 | tangled | components/cam | CAM spectral/FV dynamical core computes wind fields. Realistic. |
| Climate – ocean currents | yes | 5/5 | tangled | components/mom | MOM6 simulates realistic ocean circulation. |
| Climate – precipitation | yes | 5/5 | tangled | components/cam, components/clm | CAM cloud/precip physics; CLM infiltration. Realistic. |
| Climate – seasons | yes | 5/5 | tangled | components/cam | Orbital forcing (eccentricity, obliquity, precession) drives seasonal cycles. Realistic. |
| Biomes | yes | 4/5 | tangled | components/clm (CTSM), components/fates | CLM/FATES simulate vegetation type, PFT (plant functional type), phenology. Tuned for Earth; requires calibration for fantasy. |
| Soils | yes | 4/5 | tangled | components/clm (CTSM) | Soil moisture, temperature, infiltration, runoff; soil texture parameterized. Good for realism. |
| Resources | partial | 2/5 | tangled | components/clm | Albedo, vegetation type (as proxy); no explicit ore/mineral/biotic resource model. |
| Population & settlement | no | — | — | — | No demographic or settlement model. |
| Cities & towns | no | — | — | — | No urban model (CLM has basic urban albedo/thermal properties but no city layout). |
| Languages & names | no | — | — | — | No linguistics or naming module. |
| Political borders | no | — | — | — | No political/administrative geography. |
| Trade | no | — | — | — | No economic model. |
| Long-run history/war/economics/politics sim | no | — | — | — | No civilization/history simulation. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | partial | 2/5 | tangled | cime_config (configuration), components/cam | CESM can run at multiple resolutions; no built-in zoom/patch consistency or downscaling inference. Boundary conditions must be supplied externally. |
| Globe view | no | — | — | — | No visualization or rendering; NetCDF output only. |
| Flat projections | no | — | — | — | No map projection rendering. |
| Partial-world inference | no | — | — | — | No inference engine; regional runs require global boundary conditions or face unrealistic edge effects. |
| Import of heightmaps/layers | partial | 3/5 | loose | components/cdeps, components/clm | CDEPS can ingest external datasets (e.g., GEBCO elevation, MERRA2 forcing); CLM can read land-use maps. Infrastructure exists but requires reformatting to NetCDF/lat-lon. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No built-in multi-fidelity mode with seed preservation across resolutions. |
| Export (PNG/SVG/STL/other) | no | — | — | — | Outputs are NetCDF4 (HDF5). External tools (NCO, Python xarray/cartopy) needed to convert to PNG/SVG/STL. |
| Full-state save/resume format | yes | 4/5 | tangled | cime_config, libraries/FMS | Restart files (NetCDF) capture full model state; resumable. Serialization is NetCDF4 (complex, requires proper library). |
| Earth-data calibration (elevation/climate/Köppen) | yes | 5/5 | loose | components/cdeps | CESM can be forced with reanalysis (MERRA2, ERA5), observational climate data, and real topography. Excellent for tuning. |
| Planet-parameter derivation | partial | 2/5 | tangled | components/cam, components/clm | Orbital parameters (eccentricity, obliquity, etc.) are inputs; solar constant, GHG levels are configurable. No automated "derive planet from parameters" (e.g., from stellar type, age). |

## 7. Verdict

- **Bottom line**: CESM is an excellent production climate model for Earth-like conditions but is fundamentally mismatched to MapMaker's needs. It is designed for HPC supercomputers in Fortran+MPI, not for browser-based generation or fantasy worlds. No subsystem is readily extractable to JavaScript without a complete rewrite. The model is powerful but the integration cost is prohibitively high.

- **Worth extracting**: **None of the physics engines directly.** However, algorithmic ideas and calibration data are valuable:
  - CAM's radiative-transfer (RRTMG) logic could inspire a lighter JS port for temperature/insolation.
  - CLM soil/vegetation parameterizations provide excellent calibration targets for a simpler fantasy-world soil/biome model.
  - River routing (RTM/MOSART/mizuRoute) algorithms are standard; a simpler reimplementation in JS for small worlds is feasible.
  - CESM's orbital-forcing mechanics (seasons, day-length) are canonical and easily reimplemented in JS.
  - CDEPS dataset ingestion shows how to calibrate against Earth data; valuable as reference.

- **Skip entirely**: Atmosphere dynamics (CAM), ocean circulation (MOM), ice-sheet dynamics (CISM), wave models (WW3), and the full CIME/CESM build system. These are too large, too coupled, and too domain-specific.

- **Biggest risks**:
  - **Language barrier**: Fortran/C to JavaScript is a massive rewrite. WASM is an option but adds complexity and limits interactivity.
  - **Coupling complexity**: Every component in CESM is tightly bound to the mediator (CMEPS) and I/O system (FMS/NetCDF/MPI). Extracting one in isolation is difficult.
  - **Scale mismatch**: CESM is tuned for 0.5°–2° lat-lon resolution (50–200 km). Fantasy-world geomorphology often targets finer scales (1–10 km); parameterizations may break down.
  - **Lack of terrain generation**: CESM assumes a fixed DEM. If MapMaker needs to generate terrain, CESM cannot do it; a standalone terrain-gen model (e.g., based on tectonic-diffusion or FastScape erosion) is required.
  - **No zoom/patch consistency**: CESM does not generate high-res regional details consistent with a coarse global state. MapMaker's requirement for "consistent detail across zoom levels" is not natively supported.

- **Unverified points**:
  - Actual source-code complexity and coupling of CAM/CLM/MOM (submodules are uninitialized; review based on documentation only).
  - CESM's support for custom planets (non-Earth orbital parameters, different stellar forcing). Unclear how easily these can be configured without source modifications.
  - Performance profiling: no data on CPU/memory usage for a minimal run or scaling behavior.

- **Recommendation for MapMaker**: Use CESM for **calibration and validation** (compare generated climate to CESM output, validate Köppen zones, temperature/precip ranges). Do **not** attempt to integrate CESM components into the browser app. Instead, build or adapt simpler climate and terrain models in JavaScript, using CESM as a reference. Consider: (1) a simple spectral energy-balance model (EBM) for temperature; (2) simplified moisture transport for precipitation; (3) standalone river-routing library (JavaScript port of mizuRoute or similar); (4) vegetation/soil parameterizations inspired by CLM but simplified. This approach is more maintainable and browser-compatible than fighting CESM's complexity.
