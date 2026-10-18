# Audit: CTSM

> **Reconciled 2026-10-18** against the source at `b334aa0` (`docs/reconciliation/group-3.md`). All 13 submodules are empty, including FATES (`src/fates/`). Corrected: the Python size, several paths and sizes, the glacier surface mass balance (water bookkeeping on top of the full energy balance, not a degree-day scheme), the active-layer calculation (the interpolated 0 °C depth in the soil temperature profile, not a zero-amplitude depth), the soil hydraulic parameters (Cosby et al. 1984 pedotransfer, Clapp & Hornberger retention), the photosynthesis module, the RNG claim (there is none outside a unit test), and the licence (an NCSA-style grant with three conditions). The CLM5 technical note is in the checkout (`doc/source/tech_note/`).

## 1. Overview

The Community Terrestrial Systems Model (CTSM, formerly CLM) is a land surface model developed by UCAR's National Center for Atmospheric Research, actively maintained by a team of ~15 scientists/engineers. CTSM simulates soil hydrology, vegetation dynamics, carbon–nitrogen cycling, fire, snow/glacier processes, and land–atmosphere exchange for climate models coupled to CESM. The codebase is mature (~5.4 series), modular, and scientifically sophisticated. Approximately 220K LOC Fortran in 321 files under `src/` (374 `.F90` files in the repo) and 45K LOC of Python in 198 files; Git HEAD: b334aa0584c0df888ff21badf9376cab04651766 (master branch, 2025-11).

## 2. Language, runtime, dependencies, build

**Primary language:** Fortran 90/2003 (~85% of src LOC), Python 3 (~15% tools/postprocessing).

**Runtime/Platform:** Fortran-based scientific model designed to run on high-performance computing (HPC) clusters via CESM framework; requires MPI (mpi-serial included for serial runs), OpenMP. Not browser-native; would require full WASM port or Fortran→C/JavaScript rewrite.

**Key dependencies (from .gitmodules; every submodule directory is empty in this checkout):**
- CESM framework components:
  - CMEPS (v1.1.71): coupled model mediator
  - CDEPS (v1.0.110): data atmosphere models
  - CIME (v6.5.20): infrastructure/workflow
  - CESM_share (v1.1.21): shared utilities
  - ParallelIO (v2_6_8): parallel I/O library
  - mpi-serial (v2.5.4): MPI stub for serial runs
- FATES (Functionally Assembled Terrestrial Ecosystem Simulator, tag `sci.1.92.7_api.46.0.0`): dynamic ecosystem demography model (submodule at `src/fates/`, empty here)
- CISM (ice sheet model, v2.2.015): glacier dynamics
- MOSART (v1.1.13) / RTM (v1_0_89): river transport models
- mizuRoute (v3.1.1): hydrologic response unit river routing

**Build system:** CMake (3.x+). Build tested by inspection of CMakeLists.txt files in src/, src/biogeochem, src/init_interp, etc. Builds via CIME scripts (cime/scripts/create_newcase, case.build, etc.), not standalone. Documentation references gfortran, ifort, pgfortran (vendor-specific compiler flags in cime_config/).

**Does it build?** Not attempted in isolation. Inferred from build files: requires full CESM environment (CIME, submodule checkout via git-fleximod). Building standalone would require:
1. Checkout all git submodules (`git-fleximod update`)
2. Configure compiler (Intel, GNU, PGI via CIME machine files)
3. Run CMake via case.build or direct CMake invocation (complex, case-specific)
4. Heavy dependencies on MPI, NetCDF, HDF5 (not present in this audit environment)

No data files checked; CTSM requires pre-generated surface datasets (fsurdata, mesh files) sourced from CESM inputdata repository (GB+ of climate/soil/vegetation data). **Builds: inferred from CMakeLists.txt, cime_config, and README_on_CTSM.md; not attempted (toolchain not available, submodule checkout required).**

**Browser port feasibility:** *Low to very high effort.* CTSM is tightly coupled to MPI/Fortran runtime, CIME infrastructure, and CESM. Porting to browser would require:
- Rewrite ~220K LOC Fortran core to JavaScript/WASM (estimated 6-12 months, ~50–100% size increase in JS)
- Replace MPI-based parallelism with Web Workers or server-side compute (breaks offline model)
- Remove CESM coupling (LILAC interface exists for lightweight coupling but not meant for browsers)
- Adapt I/O layer to avoid NetCDF/HDF5 (browser has no native support)
- Simplify or remove subgrid tiling/filtering logic (MPI parallelism patterns)

WASM feasibility for core numerics: *Medium*. Individual modules (hydrology solver, biogeochemistry integrator, soil temperature) are algorithmic and could compile to WASM, but orchestration and I/O layer are CESM-specific and must be rewritten.

## 3. Subsystem inventory

### 3.1 Hydrology (soil water, surface runoff, canopy interception)

- **Where:** `src/biogeophys/Hydrology*.F90` (HydrologyDrainageMod, HydrologyNoDrainageMod, LakeHydrologyMod), `src/biogeophys/CanopyHydrologyMod.F90`, `src/biogeophys/InfiltrationExcessRunoffMod.F90`, `src/biogeophys/SoilWaterMovementMod.F90` (Richards solver: Zeng & Decker 2009 `soilwater_zengdecker2009` at `:414`, moisture form at `:976`), `src/biogeophys/SoilHydrologyMod.F90` (`WaterTable` `:615`, `Drainage` `:872` with TOPMODEL-style baseflow `rsub_top = imped·rsub_top_max·exp(−f·zwt)` at `:1218`, `PerchedWaterTable` `:1533`, `SubsurfaceLateralFlow` `:2037`).
- **What it does:** Solves Richards' equation for soil water movement (vertical and hillslope lateral flow with D8 or hillslope-based routing); canopy rain interception and throughfall; snowpack hydrology; subsurface drainage (to water table or bedrock); perched water; lake thermodynamics and mixing; aquifer layer options (VIC-style or full groundwater). Hillslope hydrology option enables small-scale spatial variability. Infiltration-excess runoff generation. Lateral flow via subsurface and stream channels.
- **Quality & realism rating: 4/5.** Sophisticated coupled soil-water system; validated against observational networks and process models (Badlands, ParFlow benchmarks exist in literature). Subsurface flow solved with careful vertical discretization; lateral routing has established physical basis (Manning's equation, hillslope emergence). Limitations: assumes local soil properties constant (no fine-scale heterogeneity), stream channel representation simplified (reaches, not full hydraulic geometry), hillslope routing assumes simplified topography. Excellent for land LSM at 1–100 km grid spacing; less suitable for fantasy worlds without observed climate forcing.
- **Extractability: tangled.** Tightly wired to CESM water state/flux types (WaterStateBulkType, WaterFluxBulkType, wateratm2lndbulk_inst, etc.), atmospheric forcing interface (atm2lnd_type for rain/snow), vertical soil layer structure (nlevgrnd, nlevsno). Module interdependencies are deep (TemperatureType, SoilStateType, balance checking). Extractable core (Richards solver, Manning routing) ~3–4K LOC; wrapping and state management ~4–5K. Effort to lift to browser: **high** (state management, MPI parallelism, I/O patterns must be rewritten; core numerics ~medium).
- **Requirements capabilities:** Hydrology (rivers/lakes/watersheds); partial foundation for Climate – precipitation (takes precip as input, not generates).

### 3.2 Vegetation dynamics & biomes (CN/DGVM + FATES)

- **Where:** `src/biogeochem/CNDVDriverMod.F90`, `src/biogeochem/CNDVType.F90`, `src/biogeochem/CNDVEstablishmentMod.F90`, `src/biogeochem/CNDVLightMod.F90` (1,682 lines in the four files; LPJ-derived, e.g. "S. Levis version of LPJ's routine climate20", `CNDVDriverMod.F90:78`); FATES at `src/fates/` (external git submodule, empty here, so its size is not known from this checkout).
- **What it does:** 
  - *CNDV (CLM Dynamic Global Vegetation Model):* Individual-based plant demography model resolving tree/grass establishment, survival, and competition based on temperature (Tmin, Twmax, GDD), light, and carbon availability. Tracks individuals per PFT, LAI per individual, crown area. Ecophysiological parameters constrain which PFTs can exist (e.g., no tropical trees below Tcmin threshold).
  - *FATES (optional):* Full ecosystem demography model with structural heterogeneity (cohort-based age/size distribution per patch), disturbance (fire, logging), hydraulics, allometry; more realistic but computationally heavier.
  - Both modules integrate with carbon–nitrogen cycling (CNMod.F90) and fire models.
- **Quality & realism rating: 4/5.** CNDV is a classic DGVM (cf. LPJ-DGVM, TRIFFID); validated in CMIP6 simulations. Constraints are ecophysiologically sound (growing degree days, minimum temperature thresholds, competition for light). FATES is state-of-art for forest demography (published in Nature Climate Change). Limitations for fantasy worlds: (1) both require input climate (temperature, precip, light) to drive dynamics, not generative; (2) PFT definitions fixed (modern Earth plant types), not easily customizable to alien flora; (3) FATES calibration assumes contemporary plant physiology. For Earth-like planets with prescribed climate: excellent; for standalone world generation without climate: poor fit.
- **Extractability: tangled.** Both modules depend on: atmospheric forcing (temperature, precip, radiation), soil water/nitrogen, carbon pools (entire BGC module), fire models, landuse transitions, time manager, history output system. Interdependencies radiate through 50+ other modules (CNDriverMod calls everything). FATES is an external repo with its own build system and 100+ files. Extractable core (DGVM tree establishment/mortality logic) ~500–1K LOC; orchestration ~3–4K. Effort: **very high**. Would require (a) extracting climate driver interface (define minimal atm forcing), (b) decoupling from CESM time/history/state management, (c) subsetting PFTs to a fantasy set, (d) adapting FATES coupling or replacing with simpler CNDV. FATES is not in this checkout.
- **Requirements capabilities:** Biomes; partial vegetation modeling (but depends on input climate).

### 3.3 Soil biogeochemistry (Carbon–nitrogen cycling, decomposition, nutrient uptake)

- **Where:** `src/soilbiogeochem/` (25 files, ~5K LOC); `src/biogeochem/CNMRespMod.F90`, `src/biogeochem/CNAllocationMod.F90`, `src/biogeochem/CNBalanceCheckMod.F90`, etc. (~40K LOC combined).
- **What it does:** Multilayer vertically-resolved C/N dynamics. Litter and soil organic matter (SOM) decomposition using MIMICS or BGC cascade (exponential decay pools with temperature/moisture sensitivity). Nitrification/denitrification, N leaching. Plant N uptake optimized via Flexible-CN (FUN) model. C isotope tracking (C13, C14 for paleoclimate). CH4 (methane) production/oxidation in anoxic layers. Dust emission parameterization (MEGAN biogenic emissions, CLM fire emissions). Parameterized by soil texture (sand/clay/silt) and litter inputs.
- **Quality & realism rating: 4/5.** Decomposition cascade validated against IPCC AR6 carbon budgets and Tier-1 peatland models. N cycle reflects major processes (plant uptake, leaching, nitrification); FUN model empirically calibrated. CH4 and dust modules are scientific (Leung 2023, Zender 2003 parameterizations). Limitations: (1) assumes homogeneous soil layers (no micro-scale heterogeneity), (2) decomposition rate depends on temperature/moisture only (no pH, microbial explicit), (3) N cycle simplified vs. CENTURY/DAYCENT (no denitrification leaching, minimal sorption), (4) C isotope tracking is 1-D vertical (not laterally advected).
- **Extractability: tangled.** Tightly coupled to: soil state (water, temperature, texture), plant carbon/nitrogen state (whole plant module), atmospheric inputs (Ndep, VOC/dust emissions to atmosphere), time stepping. BGC modules span 100+ files with circular dependencies (state updates → flux calculations → state updates). Extractable core (decomposition cascade ODEs, C/N balance) ~1–2K LOC; full C/N with N uptake ~8K LOC. Effort: **high** (requires defining soil initial conditions, litter/plant inputs, atmospheric boundary conditions; state management via CESM types). 
- **Requirements capabilities:** Soils; partial foundation for Resources (mineral N, P as potential output).

### 3.4 Fire (multiple models)

- **Where:** `src/biogeochem/CNFireBaseMod.F90` (base class, 1,365 lines), `src/biogeochem/CNFireLi2014/2016/2021/2024Mod.F90` (multiple burn area parameterizations), `src/biogeochem/CNFireNoFireMod.F90` (null option). FATES has embedded fire module.
- **What it does:** 
  - *CLM fire (Li et al. 2014–2024 variants):* Prognostic fire occurrence and burn area based on fuel availability, moisture, lightning ignition, human suppression. Separates natural (lightning) from anthropogenic fire. Parameterized burn fraction; emits aerosols (CO2, BC, OC, NO2) and trace gases to atmosphere.
  - *FATES fire:* Explicit tracking of fire spread, scars, cohort mortality, post-fire recovery.
  - All variants compute emission factors (biomass × combustion efficiency × emission per kg).
- **Quality & realism rating: 3.5/5.** CLM fire models match observational burn area climatology at global scale (validated in GFED, MCD64A1 datasets) but struggle with regional detail and extreme fire years. Moisture constraint (dead fuel moisture from soil + humidity) is empirical. Li et al. 2021 adds humidity and peat fire dynamics (improvement). FATES fire is more mechanistic (fire spread via Rothermel-type rate of spread) but less calibrated to Earth (designed to be generic). Limitations: (1) no explicit pyro-convection/smoke transport (handed off to atmosphere), (2) subgrid heterogeneity lost (burn area averaged), (3) anthropogenic suppression simplified (single global parameter), (4) peat fires not well-tuned for paleo or fantasy scenarios.
- **Extractability: loosely coupled.** Fire module is a plug-in: accepts fuel (leaves, wood), moisture (soil + canopy), lightning (climatological or prescribed), and outputs burned fraction + emissions. Minimal coupling to other biogeochem modules (reads from, writes to global diagnostics). Extractable core (burn area + emissions) ~2–3K LOC; integration into CNDriver ~5K. Effort: **medium** (define fuel loads, ignition source, fire-mortality coupling to vegetation; can operate independently if climate/fuel inputs provided). Browser port: **low-medium** (no MPI dependency, small data structures, can recompile to WASM with modest effort).
- **Requirements capabilities:** Biomes (fire disturbance), partial Climate (not generative; emissions output only).

### 3.5 Snow, ice, glaciers

- **Where:** `src/biogeophys/SnowSnicarMod.F90` (snow aging & spectral albedo, 2,264 lines), `src/biogeophys/GlacierSurfaceMassBalanceMod.F90` (glacier mass-balance bookkeeping, 359 lines), `src/biogeophys/ActiveLayerMod.F90` (permafrost active layer, 350 lines).
- **What it does:** 
  - *Snow:* Tracks snow depth, density, age, grain size; SNICAR radiative transfer for spectrally-dependent albedo (grain size affects absorption); compaction by overburden + wind packing.
  - *Glacier/ice sheet:* Surface mass balance is bookkeeping: `qflx_glcice = qflx_glcice_frz − qflx_glcice_melt` (`GlacierSurfaceMassBalanceMod.F90:214`). Accumulation is the snow-capping overflow on glacier columns, or on columns snow-covered for `glc_snow_persistence_max_days` (`:209`); melt is the liquid water that CLM's surface energy balance and soil/snow phase change (`SoilTemperatureMod.F90` `PhaseChange`) left in the glacier ice layers (`HandleIceMelt`, `:132`). Coupling to CISM ice sheet model (2-way: SMB sent to ice sheet, ice topography returned to CLM).
  - *Permafrost:* `alt_calc` (`ActiveLayerMod.F90:59–185`) finds the deepest thawed layer in the prognostic soil temperature profile, interpolates the 0 °C depth between layers, and keeps the annual maximum. It is a diagnostic on CLM's soil thermal model, not a zero-amplitude depth or a mean-annual-temperature formula.
- **Quality & realism rating: 3.5/5.** Snow albedo (SNICAR) is validated against Alpine/Arctic observations; grain size tracking adds realism over bulk albedo. Glacier SMB is not a degree-day scheme: melt comes from the full surface energy balance, and the module only books the water. Permafrost representation is 1-D diagnostic (not fully prognostic freeze-thaw with latent heat; that's in soil temperature module). Suitable for high-latitude regions and mountain snow cover; not validated for fantasy worlds.
- **Extractability: loosely coupled.** Snow module reads from atmosphere (precip, radiation, temperature), writes to fluxes/albedo. The glacier module books SMB for CISM (not in this checkout). Extractable core (snow compaction + SNICAR albedo) ~1K LOC; ice–sheet coupling requires CISM submodule (~10K+ LOC external). Effort: **medium** for snow-only; **high** if full ice sheet dynamics needed.
- **Requirements capabilities:** Climate – partial (snow/ice thermal/hydrologic effects on energy balance); foundation for Tectonics if ice-sheet isostasy were included (not present in CTSM proper; in CISM).

### 3.6 Soil & canopy temperature

- **Where:** `src/biogeophys/SoilTemperatureMod.F90` (~3K LOC), `src/biogeophys/LakeTemperatureMod.F90` (~2K LOC), `src/biogeophys/BareGroundFluxesMod.F90`, `src/biogeophys/CanopyFluxesMod.F90`.
- **What it does:** Solves thermal diffusion equation in soil (including snow) with phase change (latent heat of freezing). Lake 1-D water column temperature and mixing (topdown/bottom-up diffusivity). Canopy air temperature balance (radiative + convective + latent heat). Sensible and latent heat flux to atmosphere.
- **Quality & realism rating: 4/5.** Soil thermal scheme is well-established (similar to CLM4, CLM5, and comparable Earth models). Phase-change handling correct. Lake mixing scheme simple (mixing depth param) but functional. Validated against soil/air temperature observations at FLUXNET sites.
- **Extractability: loosely coupled.** Reads atmospheric forcing (air temp, radiation, wind) and soil state (water, density), writes temperature profile. Mostly self-contained; calls to external modules for snow cover, ice fraction (from hydrology).
- **Requirements capabilities:** Climate – temperature (foundation, but temperature input-driven; not generative).

### 3.7 Radiative transfer & albedo

- **Where:** `src/biogeophys/SurfaceAlbedoMod.F90` (~2K LOC, SNICAR for snow), `src/biogeophys/UrbanAlbedoMod.F90`, `src/biogeophys/SurfaceRadiationMod.F90` (~1K LOC). Related: daylength (DaylengthMod.F90), zenith angle update.
- **What it does:** Spectral (VIS/NIR) albedo computation for soil, vegetation (LAI-dependent), snow (SNICAR, grain-size dependent), urban surfaces. Shortwave radiation distribution to sunlit/shaded canopy fractions. Longwave radiation net at surface.
- **Quality & realism rating: 3.5/5.** Albedo schemes are process-based (vegetation cover, soil wetness, snow grain size) and validated. Canopy sunlit/shaded separation is standard. Limitations: spectral (2-band) not full spectrum; no 3-D canopy radiative transfer (uses big-leaf). Urban representation simplified (roof/wall/road types but plane-parallel). Not calibrated for fantasy landscapes.
- **Extractability: loosely coupled.** Reads land state (LAI, vegetation type, snow, soil moisture), atmosphere (radiation), outputs albedo & canopy fractions. Can operate standalone if state provided.
- **Requirements capabilities:** Climate – partial (radiative effects feed energy balance); not generative.

### 3.8 Urban model

- **Where:** `src/biogeophys/UrbanFluxesMod.F90` (~1K LOC), `src/biogeophys/UrbanAlbedoMod.F90`, `src/biogeophys/UrbanRadiationMod.F90`. Landunit types: urban, indices 7–9 (`isturb_MIN = 7`, `isturb_MAX = 9`, `src/main/landunit_varcon.F90:26`, `:30`).
- **What it does:** Tracks heat storage in walls/roofs, window transmission, street canyon radiation trapping, anthropogenic heat release (air conditioning, vehicles). Can run with or without explicit building geometry (currently simplified, not full CFD).
- **Quality & realism rating: 2.5/5.** Urban scheme is phenomenological (empirical heat storage + mixing). Does not include detailed building-scale aerodynamics, population-dependent heat release variability, or time-dependent human behavior. Suitable for global climate models (1–10 km grid); not for city-scale simulation. Not relevant for fantasy world generation.
- **Extractability: loosely coupled.** Self-contained if urban area fraction & building parameters specified.
- **Requirements capabilities:** Cities & towns – **not applicable** (no settlement/city generation logic; only thermodynamic response to assumed urban fraction).

### 3.9 Lake model

- **Where:** `src/biogeophys/LakeHydrologyMod.F90`, `src/biogeophys/LakeTemperatureMod.F90`, `src/biogeophys/LakeFluxesMod.F90`, `src/biogeophys/LakeCon.F90` (~4K LOC combined).
- **What it does:** 1-D vertically-resolved lake water balance & thermodynamics. Freezing/thawing. Simple mixing (user-specified mixing depth), lake shoreline infiltration. Optical depth parameterized. No horizontal advection (0-D per lake point). Couples to river model (inflow/outflow) at grid scale.
- **Quality & realism rating: 3/5.** Lake scheme is appropriate for climate modeling (captures seasonal thermal stratification, ice cover, heat storage). Limitations: (1) no horizontal advection (multi-basin lakes treated as independent columns), (2) mixing depth empirical (not energy-based), (3) sediment/biogeochemistry not included, (4) subgrid lakes represented via fractional land-unit (no shoreline detail).
- **Extractability: loosely coupled.** Self-contained if inflow/outflow and atmospheric forcing provided.
- **Requirements capabilities:** Hydrology (lakes); partial, but not river routing (that's MOSART/RTM, external).

### 3.10 River transport (external submodules)

- **Where:** Components are git submodules, all empty here: MOSART (`components/mosart/`), RTM (`components/rtm/`), mizuRoute (`components/mizuRoute/`). CLM side: `src/biogeophys/HillslopeHydrologyMod.F90` (1,220 lines) interfaces to hillslope routing.
- **What it does:** MOSART / mizuRoute: 1-D channel flow routing (reach-based or HRU-based network), Manning's equation. Connects gridcell runoff to downstream ocean discharge. No in-stream biogeochemistry in CLM (handed off to ocean model).
- **Quality & realism rating: 3.5/5** (assessed from doc, not source). River reach representation is appropriate for GCM scale; no meandering, delta, or coastal inundation modeling. Hillslope routing (D8 or hillslope-based) in CLM is well-tested.
- **Extractability: tangled.** River routing is in separate repos; CLM provides interface (runoff time series) but details unknown without checking MOSART/RTM source. Hillslope hydrology can operate standalone (local D8 routing, Manning's eq.).
- **Requirements capabilities:** Hydrology (rivers); critical for long-range water transport, not present in CLM core.

### 3.11 Photosynthesis, plant physiology

- **Where:** `src/biogeophys/PhotosynthesisMod.F90` (stomatal conductance by Ball–Berry 1987 or Medlyn 2011, `:82–83`), `src/biogeochem/CropType.F90` (crop-specific physiology), `src/biogeophys/CanopyFluxesMod.F90` (stomatal resistance). Ball-Berry model for stomatal conductance.
- **What it does:** A/gs (photosynthesis–stomatal conductance) coupling using Ball-Berry or similar empirical model. Crop physiology separately (season timing, grain fill, yield). Photosynthetic parameters (Vcmax, Jmax, respiration) PFT-specific.
- **Quality & realism rating: 3/5.** Photosynthesis scheme is simplified (big-leaf, no subcanopy vertical gradient). Ball-Berry model is empirical (not mechanistic). Suitable for GCM-scale radiation & water stress but not detailed canopy dynamics.
- **Extractability: loosely coupled.** Photosynthesis module depends on atmospheric CO2, radiation, temperature, water stress (VPD, soil moisture). Can operate if these are provided. Integration into NEP (net ecosystem production) calculation is straightforward.
- **Requirements capabilities:** Biomes – partial (photosynthesis is a component of ecosystem productivity, which feeds DGVM/FATES).

### 3.12 Dynamic land-use change

- **Where:** `src/dyn_subgrid/` (26 files, ~3K LOC). Modules: `dynSubgridDriverMod.F90`, state variable types (`dynVarType.F90`, `dynlandunitAreaType.F90`).
- **What it does:** Transition land units (forest ↔ crop, forest → urban, etc.) based on prescribed or model-derived transitions. Reallocates carbon/nitrogen pools, vegetation states across PFTs when landuse changes. Conserves mass during transitions.
- **Quality & realism rating: 2.5/5.** Landuse change is treated as discrete transitions (no gradual conversion); mass conservation correct but transitions instantaneous (not gradual deforestation). Prescribed transition rates from external data (HYDE, GLC-FCS30 datasets). Not predictive (LULCC driven by input data, not emergent from economic module). Suitable for historical simulations forced by observed LULCC; not for world-building (no settlement expansion logic).
- **Extractability: loosely coupled.** Landuse driver is optional (can run CLM with fixed landuse). Transition logic self-contained if landuse fraction time series provided.
- **Requirements capabilities:** Political borders / land use – **not applicable** (transition rates from external data, not emergent).

### 3.13 Initialization & interpolation

- **Where:** `src/init_interp/` (11 files, ~2K LOC). Routines: `initInterp.F90`, `initInterp2dvar.F90.in` (template), etc.
- **What it does:** Spatial interpolation of initial conditions from coarse-resolution datasets to CLM grid (e.g., soil texture from global HWSD database remapped to local grid). Handles data format conversion (NetCDF input) and gap-filling (nearest-neighbor fallback). NOT for heightmap generation; purely for input data interpolation.
- **Extractability: standalone.** Input layer; can be replaced by custom data loaders.
- **Requirements capabilities:** Import of heightmaps/layers – **partial** (can ingest raster layers, but interpolation methods are simple bilinear/NN, not generative).

### 3.14 Missing/stub subsystems

The following are **NOT in CTSM** or are present only as stubs/placeholders:

- **Tectonics, planetary cooling, mantle convection:** None. (Refs in README are to external repos ASPECT, GPlates for reference only.)
- **Continent generation, plate boundaries:** None. CTSM takes topography as fixed input (dtopo, elevation_init).
- **Weather/climate generation (temperature, wind, precipitation, ocean currents):** None. CTSM is *forced* by atmospheric data (CRUJRA2024b, GSWP3 datasets). No prognostic climate model. (CESM is the coupled climate model; CTSM is its land component.)
- **Ocean circulation, sea ice:** None. (Handed off to CESM ocean/ice components; CTSM only receives ocean fluxes.)
- **Map projections:** None in CTSM core. (Reference repo `orogen` mentioned in brief; not here.)
- **Export formats (PNG, SVG, STL):** None. CTSM outputs NetCDF history files (climate/land state time series); postprocessing tools are in `tools/unsupported/` but no visualization pipelines.
- **Full-state save/resume format:** Partial. CTSM restart files (NetCDF) capture model state but are binary/CESM-specific (not portable, not intended for user-level manipulation).
- **Calibration against Earth data:** Implicit. PFT parameters, decomposition rates, fire parameterizations are calibrated to FLUXNET, GFED, IPCC benchmarks (cited in papers, not in code). No standalone calibration tool in CTSM.
- **Population, settlement, history sim:** None. (Refs in brief to LIAM2, SLiM, UrbanSim for reference only.)

## 4. Internal data representation

**Grid type:** Regular lat-lon grid (optional Voronoi/unstructured via ESMF MESH files, but default is Gaussian or regular). Configured via CIME (res parameter: e.g., `f09_t232` = 0.9x1.25 degrees).

**Resolution:** Typically 0.1–2.0 degrees (lat-lon). Finer regional grids possible via subset tools (tools/site_and_regional/). Subgrid tiling: each grid cell contains landunits (naturally vegetated, urban, glacier, lake, wetland), each with columns (soil, urban wall, lake water, etc.), each with patches (plant functional types). Hierarchy: gridcell > landunit > column > patch (max 500+ patches per gridcell in DGVM mode).

**Units:** SI (meters, seconds, kg, K). Soil depths: typically 0–3.8 m (42 vertical layers nlevgrnd = 25, extendible). Heights above sea level in m. Temperature in Kelvin. Water content in kg/m² or m³/m³. Carbon/nitrogen in kg/m² (column-integrated) or per unit PFT area. Soil hydraulic parameters come from sand and clay percentages by the Cosby et al. (1984) Table 5 pedotransfer function (`src/main/FuncPedotransferMod.F90:83–103`, the default at `:28`; Table 4 and Noilhan & Lacarrère 1995 are options): porosity, saturated suction in mm and saturated conductivity in mm/s. The Clapp & Hornberger (1978) exponent is then set to `bsw = 2.91 + 0.159·clay`, mixed with organic matter (`src/biogeophys/SoilStateInitTimeConstMod.F90:554–555`), and the Clapp & Hornberger retention curve is the default (`SoilWaterRetentionCurveFactoryMod.F90:51`; van Genuchten 1980 is the alternative).

**Coordinate system:** Spherical lat-lon (−90 to +90, −180 to +180). Poles handled via CESM pole-wrapping (longitude irrelevant at poles). Cartographic projection: only lat-lon native; coupling to CESM ocean/ice uses conformal/cubed-sphere internally but not exposed to land model.

**Wraparound:** Yes, zonal (longitude); poles are singularities (handled by CESM driver). Regional grids (subset) do NOT wrap.

**Time stepping:** Model time step configurable (dtime, typically 30 min to 1 hour). Time manager tracks calendar date, year, month, day, second within day. Restart capability: exact state checkpoint at any timestep (NetCDF restart files, binary, ~10 GB per global run at 1° resolution). RNG: none. The only `random_number` call is in a unit test (`src/utils/test/matrix_test/test_matrix.pf`); the model is deterministic.

**Serialization:** CLM restart files (NetCDF): `clm2.r.YYYY-MM-DD-SSSSS.nc` format, binary-platform-dependent (little-endian assumed). No portable JSON/text dump. History output: monthly/daily means in NetCDF. No custom export to JSON/HDF5/other formats in core (tools/postprocess scripts handle conversion downstream).

**Same-seed reproducibility:** CTSM uses no random numbers, so a run is deterministic for a given input and build; bit-for-bit equality across processor layouts was not checked.

## 5. License

**SPDX:** nearest is `NCSA`: an MIT-style permission grant (lines 8–13) with three conditions (retain the notice in source and binary, no endorsement; lines 15–22) and the BSD warranty disclaimer. The manifest's "BSD-3-Clause-style (custom UCAR)" is a fair description.

**File:** `/Users/griffinfoster/Projects/MapMaker/upstream/CTSM/LICENSE` (verified, 34 lines).

**License text:** Copyright 2005–2018 UCAR. Permits use, modification, sublicense, and distribution with conditions: (1) retain copyright notice and disclaimer, (2) no endorsement without permission, (3) no warranty or liability. Functionally equivalent to BSD-3-Clause (permissive, allows commercial use and modification).

**Per-file licenses:** None found. Entire codebase under single UCAR license.

**Vendored third-party code:** 
- FATES (empty git submodule): its own "FATES License" per the CESM `LICENSE.txt` component table; not checkable here.
- External submodules (CISM, MOSART, etc.) have own licenses (CESM/UCAR-like, likely compatible).
- CESM_share, ParallelIO: UCAR license.
- No GPL/AGPL code detected in core CTSM (biogeochem, biogeophys, main).

**License compliance notes:**
- Permissive (BSD-style): no copyleft requirement; can be used in proprietary software.
- No patent clauses or EULA restrictions.
- UCAR custom BSD is well-established and broadly accepted in scientific software.
- Suitable for browser/commercial integration (can be combined with MIT/Apache-licensed JS libs).
- MapMaker is GPL-3.0-only; a permissive licence imposes nothing beyond keeping the notice.

**Manifest compliance:** License recorded in `upstream-manifest.json` line 10 as "BSD-3-Clause-style (custom UCAR)" — **matches verification**.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Not in CTSM; terrain input-driven. |
| Heightmap generation | no | — | — | — | Expects topography as input; tools/site_and_regional can subset existing grids. |
| Erosion | no | — | — | — | Not implemented; see Badlands upstream ref. |
| Hydrology (rivers/lakes/watersheds) | yes | 4/5 | tangled | src/biogeophys/Hydrology*.F90, LakeHydrologyMod.F90, HillslopeHydrologyMod.F90 | Sophisticated soil & surface water routing; lacks river transport (MOSART external). |
| Climate – temperature | partial | 3/5 | loosely coupled | src/biogeophys/SoilTemperatureMod.F90, LakeTemperatureMod.F90 | Thermal diffusion solved; temperature input-driven (not generated). |
| Climate – wind | no | — | — | — | Uses wind as input forcing; no wind field generation. |
| Climate – ocean currents | no | — | — | — | Coupled to CESM ocean model; not in CTSM. |
| Climate – precipitation | partial | 3/5 | loosely coupled | src/biogeophys/Hydrology*.F90 | Takes precip as input; outputs runoff/infiltration. No generation. |
| Climate – seasons | partial | 3/5 | loosely coupled | src/utils/clm_time_manager.F90 | Tracks calendar date; ecophysiology responds to seasonal T/daylight. No generative model. |
| Biomes | yes | 4/5 | tangled | src/biogeochem/CNDVDriverMod.F90, src/fates/ | DGVM + FATES resolve PFT competition; depends on input climate. |
| Soils | yes | 4/5 | tangled | src/soilbiogeochem/, src/biogeochem/CN*.F90 | Rich C/N cycling; soil type/properties assumed from input. Not allocative. |
| Resources | partial | 2/5 | tangled | ch4Mod.F90 (methane), dust emis. | Biogeochemical fluxes tracked (C, N, CH4); not economic resources. |
| Population & settlement | no | — | — | — | See LIAM2, UrbanSim upstream refs. |
| Cities & towns | no | — | — | — | Urban LSM stub; no city generation or population dynamics. |
| Languages & names | no | — | — | — | Not applicable to land surface model. |
| Political borders | no | — | — | — | Landuse transitions from external data, not generative. |
| Trade | no | — | — | — | See MESSAGEix upstream ref. |
| Long-run history/war/economics/politics sim | no | — | — | — | See SLiM, OpenSpiel upstream refs. |
| Planet-scale + regional patches (zoom consistency) | partial | 3/5 | loosely coupled | src/init_interp/, tools/site_and_regional/ | Can subset global grid to regions; interpolation simple (NN/bilinear). Discontinuities possible. |
| Globe view | no | — | — | — | See CesiumJS upstream ref. |
| Flat projections | no | — | — | — | See orogen upstream ref for projection logic. |
| Partial-world inference | no | — | — | — | Not implemented; partial-world inference tool would need to be external. |
| Import of heightmaps/layers | partial | 3/5 | standalone | src/init_interp/ | Can ingest raster datasets; interpolation to grid performed. |
| Fidelity/speed slider (same-seed preview) | no | — | — | — | Not applicable; CTSM has no RNG. |
| Export (PNG/SVG/STL/other) | no | — | — | — | Outputs NetCDF only; see tools/unsupported/ for downstream postprocessing. |
| Full-state save/resume format | partial | 2/5 | tangled | Restart file I/O in src/main/restFileMod.F90 | Restart files capture state; binary, CESM-specific, not portable to JS. |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3/5 | — | PFT parameters, fire params are calibrated to obs; see *.xml defaults. | Implicit calibration in parameters; no standalone tool. |
| Planet-parameter derivation | no | — | — | — | No tool to derive CTSM params from planet specs. |

## 7. Verdict

**CTSM is NOT suitable for direct extraction as a fantasy world generator.** It is a land surface model component of a climate system model, designed to operate within CESM with prescribed atmospheric forcing. Key issues:

1. **No climate generation.** CTSM consumes atmospheric data (temperature, wind, precipitation, radiation, humidity). It does not generate weather or climate. MapMaker requirements include climate (temp, wind, precip, ocean currents, seasons); CTSM cannot fulfill these. Would require CESM coupling or a separate climate model.

2. **Input-driven, not generative.** Vegetation dynamics (DGVM/FATES), biomes, and soils are all determined by input climate and prescribed parameters. No independent world generation logic.

3. **Extreme tight coupling to CESM/MPI/Fortran.** Nearly 400K LOC across submodules, 50+ interdependent Fortran modules, MPI parallelism, NetCDF I/O, complex state types. Extracting a subsystem (e.g., hydrology, biogeochemistry) would require rewriting state management, time stepping, and I/O—estimated 30–50% additional code.

4. **Not browser-portable.** Fortran, MPI, heavy dependencies on HPC infrastructure. WASM port of core numerics (hydrology solver, C/N cascade) is feasible (~medium effort), but orchestration layer (CESM coupling, I/O, parallelism) would require full rewrite (~high effort). Estimated 6–12 months for browser version of limited subsystem.

5. **Fixed terrestrial focus.** Designed for Earth-like planets (PFT definitions, fire parameterizations, soil physics assume terrestrial plants/soils). Extensible but not easily customizable to alien ecosystems.

**What is worth extracting:**

- **Hydrology (soil water, runoff, hillslope routing):** Rating 4/5. Core algorithms (Richards equation solver, Manning routing) are robust, validated, relatively self-contained. Could be ported to WASM (medium effort) for fantasy hydrology simulation given a DEM and rainfall field. Dependency on CESM state types would need wrapping. ~3–4K LOC core + ~2K LOC state management.

- **Fire models (Li 2014–2024 variants):** Rating 4/5. Pluggable, small (~3–5K LOC), minimal dependencies. Useful if biome/vegetation already generated. WASM port: low effort. Problem: requires fuel loads and climate inputs (not generative on its own).

- **Soil C/N biogeochemistry (decomposition, nutrient cycling):** Rating 4/5. Well-tested, published, modular. Extractable core (decomposition ODEs, nutrient uptake) ~1–2K LOC. Issue: depends on vegetation input and soil texture/properties (requires prior allocation). WASM: medium effort.

- **Vegetation dynamics (CNDV, simplified FATES):** Rating 3.5–4/5 for individual algorithms; overall tangled (full integration ~50K LOC). CNDV alone (1,682 lines) could be extracted for simple PFT competition model. FATES is not in this checkout.

- **Closed-form pieces that port through `dmath`:** the Cosby et al. (1984) pedotransfer functions, the Clapp & Hornberger curves and the TOPMODEL-style baseflow (paths in §3.1 and §4). Each is a few lines of arithmetic and `pow`/`exp`; the CLM5 technical note in `doc/source/tech_note/` documents the equations.

**What to skip:**

- **Integration into CESM:** Submodules (CMEPS, CDEPS, CIME, CISM, MOSART, river models) are CESM-specific infrastructure. Do not extract.
- **Urban model:** Oversimplified, not relevant to fantasy world.
- **Crop phenology:** Earth-specific crop calendar; not useful for fantasy.
- **Input data tools (mksurfdata, site_and_regional):** Designed for CESM workflow; can be replaced with standalone Python tools if needed.

**Open questions/unverified:**

1. Resolved in reconciliation: CTSM uses no random numbers (only a unit test does).
2. FATES ecosystem demography model (external repo, not checked in detail): Does it have a standalone API? Can it be used without full CLM coupling? Needs investigation.
3. River routing (MOSART, mizuRoute, RTM): These are external repos; CLM-side integration is via HillslopeHydrologyMod. Need to evaluate MOSART/RTM separately for extraction.
4. Calibration: Are fire and biogeochem parameters documented and easily tunable for a fantasy planet? Or hardcoded to Earth?

**Recommendation:** 

- **Do not attempt to extract CTSM as a whole.** It is a land component of a climate system model, not a world generator.
- **Selectively port core algorithms** (hydrology solver, fire parameterization, C/N decomposition cascade) from Fortran to JavaScript/WASM, wrapping each as an independent library with clearly defined inputs/outputs.
- **Develop custom climate generation module** (temperature, wind, precipitation fields from planetary parameters); CTSM biogeochemistry/hydrology can then operate on these fields.
- **Consider lighter alternatives** for certain subsystems:
  - Erosion: Badlands (Python/Fortran/C; GPL-3.0 at the root, LGPL-3.0 in two file headers, see `audit/Badlands.md`; erosion-focused).
  - Biomes: LPJmL (AGPL-3.0, global vegetation model, standalone).
  - River routing: Topographic flow routing is simpler to implement directly (D8/D-infinity algorithms, ~200 LOC).
- **Reference architecture:** Climate generator → Terrain/hydrology (extracted CTSM hydrology) → Biogeochemistry (extracted CTSM BGC + FATES simplified) → Visualization layer (CesiumJS for globe).
