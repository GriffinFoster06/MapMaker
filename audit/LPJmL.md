# Audit: LPJmL

## 1. Overview

LPJmL (Lund-Potsdam-Jena managed Land) is a Dynamic Global Vegetation Model (DGVM) written in C, developed and maintained by the Potsdam Institute for Climate Impact Research (PIK). It simulates terrestrial natural vegetation, agriculture, hydrology, and soil biogeochemistry at global scales on a 0.5-degree lat-lon grid. The project is mature (version 6.1.9, latest commit 4595764), active (monthly maintenance), and substantial: ~1064 C source files across 120,880 lines of code distributed among climate, vegetation (grass/tree/crop), soil, hydrology, and output subsystems. It supports parallel execution via MPI and integration with Earth system models (IMAGE coupler).

## 2. Language, runtime, dependencies, build

- **Primary language**: C (~95% of ~121 kLOC). Smaller components in shell scripts.
- **Runtime**: Linux/macOS/Windows command-line tool; requires MPI (optional but often installed on clusters). No browser capability; purely backend simulation engine.
- **Key dependencies** (from INSTALL.md):
  - GNU Make, C compiler (GCC/Clang/Intel)
  - **JSON-C library** (JSON configuration parsing)
  - **NetCDF** + **Udunits-2** (optional, for climate I/O)
  - **MPI** (optional; OpenMPI, MPICH, Intel MPI support detected by configure.sh)
  - No Python, no Node.js, no bundled JavaScript
- **Build**: Standard `./configure.sh && make` (creates lpjml binary in bin/). No CMake, Autotools, or WASM support evident. Tested on Linux, macOS, Windows (Cygwin).
- **Build status**: Inferred from docs and config scripts. No actual build attempted (copy to scratchpad); configure.sh auto-detects OS and MPI, creates platform-specific Makefile. Requires external data files for climate, elevation, soils; testcase_2cell included for minimal testing.
- **Browser feasibility**: Not realistically portable to browser as-is. C code would require WASM compilation (moderate effort, ~10-20 kLOC per subsystem), plus large input datasets (NetCDF files, soil maps, climate timeseries) must be served or embedded. Data dependencies (GSWP3 reanalysis, GADM layers) are 100s of MB. Would require ground-up rewrite or significant transpilation. **Not browser-native.**

## 3. Subsystem inventory

### 3.1 Climate
- **Where**: `src/climate/` (184 kB); includes monthly and daily climate readers, CO2/deposition I/O
- **What it does**: Reads monthly mean temperature, precipitation, wind speed, shortwave/longwave radiation, humidity, CO2, N deposition, methane concentration from NetCDF or binary CLM format. Interpolates to daily values. No climate generation; purely input-driven. References GSWP3-W5E5 reanalysis for observational data.
- **Quality & realism: 3/5** — Uses well-calibrated reanalysis data (GSWP3-W5E5), but model reads rather than generates. Daily interpolation is interpolation, not physics-based generation. Suitable for Earth-calibrated fantasy world if climate data supplied externally. No wind field/ocean current physics; assumes input grid.
- **Extractability: loosely coupled** — Climate routines are modular (openclimate, readclimate, getclimate etc. in `src/climate/`, ~200 LOC each). Depends on Config/Cell/Coord data structures (defined in include/). Minimal domain physics; essentially a data reader. Could extract ~5 kLOC climate + I/O layer; effort to lift: low-medium (rewrite data I/O for browser binary/JSON, no external library dependencies). Needs external climate file supply.
- **Requirements capabilities served**: Climate – temperature, precipitation, wind (partial: no ocean currents or seasons generated); partial-world inference (if climate fields can be spatially interpolated/inferred).

### 3.2 Hydrology & river routing
- **Where**: `src/lpj/drain.c` (primary); soil water percolation in `src/soil/infil_perc.c`; lake/reservoir in `src/lpj/`.
- **What it does**: Implements a parallel river routing algorithm (Pnet library, based on Rost et al.'s work on green/blue water) that routes surface runoff, infiltration, and groundwater flow through reservoirs and lakes. Computes discharge to ocean, manages lake storage and evaporation. No water routing visualization; outputs NetCDF discharge fields. Crudely approximated at grid cell scale (no explicit stream networks).
- **Quality & realism: 3/5** — Physically-based water balance (infiltration, percolation, evaporation, runoff) but Lagrangian routing on regular grid (no explicit river geometry). Tested on 0.5° global grids; scales to finer resolution but becomes approximate. Good for continental-scale hydrology, weak for detailed river networks. Fire-susceptible to large-scale bias if elevation data poor.
- **Extractability: loosely coupled** — River routing is self-contained in drain.c (~400 LOC logic + pnet library). Requires Cell grid, Discharge struct, Config. Pnet library for network routing could be extracted separately (in src/pnet/, ~400 LOC). Effort to lift: low-medium. Core algorithm is pure C, no external library calls within drain.c itself (pnet is internal).
- **Requirements capabilities served**: Hydrology (rivers/lakes/watersheds).

### 3.3 Soils & soil carbon/nitrogen
- **Where**: `src/soil/` (588 kB, ~87 files); includes litter/humus pools, water retention, thermal properties, nitrogen cycling (fixation, denitrification, leaching)
- **What it does**: Simulates soil layering (3 organic pools + mineral), water-holding capacity vs. texture, daily heat conduction, daily and annual nitrogen dynamics (mineralization, nitrification, denitrification, plant uptake, leaching). Biogeochemical cycling driven by litter inputs and soil moisture/temperature. Output: soil C, N pools, fluxes; NO3/NH4 leaching; pH-dependent nitrification.
- **Quality & realism: 4/5** — Well-developed soil model using Rothamsted carbon pool approach + nitrogen cycle from Century model. Depth-resolved (3 layers), thermodynamics included (freeze-thaw), tuned against global soil observatories. Missing: rock/weathering input, clay mineralogy details, but good for biome simulation. Soil map input required (13 soil types from HWSD/SoilGrids).
- **Extractability: tangled** — Soil module is large and coupled. ~588 kB across ~87 files, deeply intertwined with vegetation/litter/stand state. Core data structures (Soil, Litter, Pool) in include/soil.h; functions in src/soil/. Extractable core: ~30 kLOC for pool/flux routines; difficult to decouple from stand/pft/climate context. Requires soil type map, climate forcing, vegetation litter inputs. Effort to lift: high (requires PFT litter/senesce/fine-root turnover context).
- **Requirements capabilities served**: Soils.

### 3.4 Vegetation (Natural – Trees, Grasses, Mosses)
- **Where**: `src/tree/` (~260 kB), `src/grass/` (~196 kB); biome classification in `src/image/biome_classification.c`
- **What it does**: Simulates plant functional types (PFTs): 12 tree types (tropical/temperate/boreal, evergreen/deciduous/summergreen), 3 grass types (C3/C4, tropical/temperate/polar), Sphagnum moss. Each PFT has allometry (height/LAI from biomass), carbon allocation rules, phenology (budburst/senescence), fire mortality, establishment/light competition. Annual NPP driven by climate; turnover defined by fixed parameters. Outputs: fractional cover (FPC), GPP, NPP, biomass, LAI by PFT per grid cell.
- **Quality & realism: 4/5** — Established DGVM approach (LPJ core), calibrated against FLUXNET and satellite LAI/NDVI, widely used in Earth system models. Good botanical accuracy for natural vegetation; PFT distribution emerges from climate/soil. Weak on: biogeographic range limits (fixed by default; dynamic ranges optional), drought stress (simplified Jarvis formulation), individual tree allometry (area-averaged). Suitable for fantasy biome generation if climate/soil realistic.
- **Extractability: tangled** — Vegetation logic spreads across tree/ and grass/ dirs (~450 kB combined); each PFT type has ~30 functions (allocation, growth, phenology, fire, establishment). Requires tight coupling to soil/litter/climate/competition. Core PFT cycle (~100 kLOC) extractable but needs daily loop context, soil water/nutrient state, light competition logic. Effort: high (interdependent with soil, climate, stand management).
- **Requirements capabilities served**: Biomes (via FPC classification into forest/grassland/desert), vegetation composition.

### 3.5 Agriculture (Crops, managed grassland, wood plantations)
- **Where**: `src/crop/` (~240 kB), `src/grassland.h`, managed forest logic in landuse/
- **What it does**: 24 crop types (wheat, rice, maize, pulses, oilcrops, etc.) with crop-type-specific phenology, fertilizer response, water demand (green/blue). Managed grassland with stocking rates. Wood plantations (rotation period, harvest). Land-use forcing from external dataset (specify fractions of each crop/grass/forest type per grid cell, time-varying). Irrigation with detailed blue water accounting.
- **Quality & realism: 3/5** — Crop models simplified but reasonable (heat-unit driven, water-limited yield). Global crop dataset (cFTS) from ISIMIP3a. Good for continental-scale agricultural impact, weak on crop-to-crop rotation, pest/pest parity, economics. Designed for ISIMIP climate impact scenarios, not fantasy generation.
- **Extractability: loosely coupled** — Crop PFT logic is separate from natural vegetation; ~240 kB in src/crop/, modular by crop type. Crop calendar (sowing/harvest dates) and irrigation demand are key parameters. Effort: medium (less coupled than natural vegetation, but still needs soil/climate daily loop). Fertilizer/manure input as external files required.
- **Requirements capabilities served**: None for fantasy world (agriculture is a historical/scenario input, not generated). Could map to fantasy economy/trade if integrated.

### 3.6 Fire (Spitfire)
- **Where**: `src/spitfire/` (~180 kB); fire probability, burned area, mortality
- **What it does**: Spitfire fire scheme: models fire ignition (natural lightning + anthropogenic), spread (fuel load, moisture, topography), and mortality by PFT (variable char-scorch height). Outputs: fire probability, burned area, carbon/nitrogen release. Uses annual vegetation structure (LAI, biomass) and soil moisture.
- **Quality & realism: 3/5** — Empirical (uses global GFED burnt-area observations for calibration), not physics-based spread. Good for global fire disturbance pattern, weak on fire spread dynamics, fuels structure. Suitable for fantasy if disturbance is desired but not critical.
- **Extractability: loosely coupled** — ~180 kB in src/spitfire/, ~30 functions. Core logic independent of soil but needs vegetation structure and moisture. Effort: low-medium (compact module, fewer interdependencies than vegetation). Burned-area and mortality rules are empirical/tuned.
- **Requirements capabilities served**: Biome realism (fire-adapted vegetation).

### 3.7 Output & I/O
- **Where**: `src/lpj/` (fopenoutput, fwriteoutput functions), `src/netcdf/` (NetCDF write), `src/utils/` (binary-to-netcdf conversion)
- **What it does**: Writes 385 output variables (defined in conf.h) across daily/monthly/annual timescales: fluxes (GPP/NPP/evap/runoff), pools (carbon/nitrogen/water), vegetation (LAI/FPC/biomass), fire, hydrology. Supports binary CLM format (native) and NetCDF (requires libnetcdf). Tools (bin2cdf, cdf2bin, etc.) convert between formats.
- **Quality & realism: 3/5** — Comprehensive output coverage; well-tested on 0.5° global runs. Output for research/analysis, not visualization. NetCDF + CDO/Ncview used for post-processing.
- **Extractability: loosely coupled** — Output routines in src/lpj/ and src/netcdf/ are modular. Binary I/O is self-contained; NetCDF calls are wrapped. ~200 kLOC in I/O + binary reading. Effort to adapt for browser: medium (rewrite binary reader for JSON/HDF5, link NetCDF or write minimal NetCDF writer). Post-processing tools in src/utils/ are separate utilities.
- **Requirements capabilities served**: Export (NetCDF, binary gridded fields); partial support for image synthesis (would need rendering layer).

### 3.8 Biome Classification
- **Where**: `src/image/biome_classification.c` (~270 LOC)
- **What it does**: Classifies grid cells into biomes (forest, grassland, savanna, tundra, desert, etc.) based on annual temperature, NPP, and PFT fractional cover (FPC). Uses heuristic thresholds on PFT composition (e.g., forest if tree FPC > 0.6). Output: biome index per grid cell.
- **Quality & realism: 3/5** — Simple threshold-based classification, not Köppen or Holdridge; well-correlated with observed biomes. Used for quick visual assessment.
- **Extractability: standalone** — Standalone function, ~270 LOC, minimal dependencies (just PFT list and FPC values). Effort to extract: very low.
- **Requirements capabilities served**: Biomes (basic classification).

### 3.9 Landuse & stand management
- **Where**: `src/landuse/` (~940 kB, largest subsystem after lpj core)
- **What it does**: Manages allocation of grid cell area to stand types (natural, agriculture, forest plantation, grassland, wetland, urban, etc.). Reads time-varying land-use fractions from external file (ISIMIP3a LU dataset). Applies management rules (harvest, fire suppression, fertilizer). Tracks transitions (e.g., forest-to-cropland).
- **Quality & realism: 3/5** — Land-use forcing from observational/scenario datasets; management rules simplified (e.g., harvest fraction, rotation period as fixed parameters). Good for historical reconstructions and RCP/SSP scenarios. Not generated from first principles.
- **Extractability: tangled** — ~940 kB, ~100+ files. Land-use fractions are inputs, not outputs; management is rule-based on external forcings. Deeply integrated with stand/pft/soil context. Difficult to extract standalone. Effort: high.
- **Requirements capabilities served**: None for fantasy (land use is an external scenario input, not generated).

### 3.10 Elevation & terrain analysis
- **Where**: Elevation data read in `src/lpj/` (elevation_filename in config); slope computed in input preprocessing (src/utils/).
- **What it does**: Reads elevation from external file, uses for temperature lapse-rate correction, and computes slope for fire spread. Does not generate elevation or terrain; purely input-driven.
- **Quality & realism: — / 5** — Passthrough layer; quality depends on input DEM (typically 30-arcsec GEBCO/SRTM). No terrain generation.
- **Extractability: n/a** — Not a real subsystem; I/O only.
- **Requirements capabilities served**: None (elevation is imported, not generated).

### 3.11 Tectonics, erosion, weathering
- **Present**: No. LPJmL is a vegetation + hydrology model, not a geodynamics simulator. No erosion algorithm, no weathering model, no plate tectonics.

### 3.12 Partial-world inference, calibration, projections
- **Present**: Partial. LPJmL can run on regional subsets (e.g., mask to a country). No explicit partial-world inference (inferring global context from a regional map). Climate/soil maps are global fields. Calibration against Earth data (FLUXNET, GFED, river discharge, NDVI) is embedded in parameter tuning but not exposed as a module. No support for Earth-relative parameter scaling or "Earthlike = 1.0" anchoring.

## 4. Internal data representation

- **Grid type**: Regular lat-lon (2D Cartesian on sphere), 0.5° resolution default; resolution set by coordinate file or config. Internally: Cell array indexed by (lat, lon) with contiguous storage, parallel partitioning across MPI ranks by lat band.
- **Units**: SI for most (m, kg, kg m^-2, mm water, °C); time steps are 1 year (spin-up + transient years, resizable restart state); daily sub-steps within year computed via Verhoef/Jarvis transpiration. Within-year monthly or daily depending on I/O setting.
- **Coordinates**: Lat/lon in degrees, -90 to +90 and -180 to +180; stored as floating-point in Coord struct (lon, lat, area in m^2). 0° = equator, +90 = North Pole.
- **CRS/wraparound**: Spherical lat-lon (WGS84 assumed); poles are singularities (handled by masking or reduced resolution near poles). Longitude wraps at 0/360.
- **Serialization**: Restart state saved in binary .state format (libnetcdf optional); includes full Cell array, RNG state, soil pools, vegetation biomass/structure, lakes, reservoirs. Save format is LPJmL-specific; no standard interchange format documented. Reproducibility: RNG seeded by config (fixed or from system clock); same seed + same input data → same output (deterministic within floating-point precision).
- **Multi-resolution/zoom consistency**: Not addressed. Model runs at fixed 0.5° global grid or regional subset; no explicit multi-scale integration. Upscaling/downscaling would require separate post-processing.

## 5. License

- **SPDX**: AGPL-3.0 (GNU Affero General Public License, version 3)
- **File**: `LICENSE.md` states AGPL-3.0; full license in `LICENSES/AGPL-3.0.md`
- **Graphics**: `LICENSES/CC0-1.0.md` — separate CC0 license for graphics/logo
- **Mixed licenses**: No per-directory or per-file license variations noted. Entire codebase is AGPL-3.0; graphics are CC0.
- **Matches manifest**: Yes. Manifest lists "AGPL-3.0", LICENSE.md confirms.
- **Practical notes**: AGPL-3.0 is copyleft (strong) with network-clause provision: if you run LPJmL on a server and modify it, you must provide source to end users. Suitable for academic/research use and open-source projects; incompatible with proprietary closed-source embedding without license grant. Patent provisions: standard FSF (no additional patent clauses). No EULA or resale restrictions (unlike some others in manifest, e.g., WRF-Hydro).

## 6. Capability coverage summary (machine-readable table)

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Not a geodynamics tool |
| Heightmap generation | no | — | — | — | Reads elevation from external file only |
| Erosion | no | — | — | — | No erosion/weathering model |
| Hydrology (rivers/lakes/watersheds) | partial | 3 | loose | src/lpj/drain.c, src/soil/infil_perc.c | Lagrangian routing, no explicit stream networks |
| Climate – temperature | partial | 3 | loose | src/climate/getmtemp.c | Reads monthly, interpolates daily; no generation |
| Climate – wind | partial | 3 | loose | src/climate/ | Reads wind speed only; no field generation |
| Climate – ocean currents | no | — | — | — | Not modeled |
| Climate – precipitation | partial | 3 | loose | src/climate/getmprec.c | Reads monthly, interpolates; no generation |
| Climate – seasons | partial | 2 | loose | src/climate/, phenology in src/tree/src/grass/ | Implicit via monthly T/P; PFT phenology tuned but not generative |
| Biomes | yes | 4 | loose | src/image/biome_classification.c, src/tree/, src/grass/ | Emerges from climate/soil/vegetation; classification heuristic on FPC |
| Soils | yes | 4 | tangled | src/soil/ (588 kB) | 3-layer pools, N cycle, thermal; requires soil type map input |
| Resources | no | — | — | — | No resource generation (minerals, ores, etc.) |
| Population & settlement | no | — | — | — | Reads historical population for fire ignition; no demographic sim |
| Cities & towns | no | — | — | — | Not modeled |
| Languages & names | no | — | — | — | Not modeled |
| Political borders | no | — | — | — | Reads country codes for output binning; no political sim |
| Trade | no | — | — | — | No trade/economy model (MESSAGEix, OpenSpiel are in manifest for this) |
| Long-run history/war/economics/politics sim | no | — | — | — | Not modeled; IMAGE coupler to macroeconomic models is optional |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | partial | 2 | — | — | Supports regional subsets but no explicit multi-scale consistency |
| Globe view | no | — | — | — | CLI tool, no visualization |
| Flat projections | no | — | — | — | No projection support (lat-lon grid only); external tools (QGIS, CDO) needed |
| Partial-world inference | no | — | — | — | Can mask to region but does not infer global context |
| Import of heightmaps/layers | yes | 3 | loose | src/netcdf/, src/tools/ | Reads NetCDF/binary grids; accepts elevation, soil, land use |
| Fidelity/speed slider with same-seed preview | no | — | — | — | Full simulation only; no "preview" mode |
| Export (PNG/SVG/STL/other) | partial | 2 | loose | src/utils/ (bin2cdf, etc.), src/lpj/ (NetCDF) | NetCDF + tools for raster conversion; no vector/STL export |
| Full-state save/resume format | yes | 4 | loose | src/bstruct/ (binary .state files) | Binary restart format; LPJmL-specific, documented |
| Earth-data calibration (elevation/climate/Köppen) | yes | 4 | n/a | FLUXNET, GFED, discharge obs in parameter tuning | Calibrated to GSWP3 reanalysis, observational constraints embedded |
| Planet-parameter derivation | no | — | — | — | No physics-to-parameters solver; parameters fixed from literature |

## 7. Verdict

- **Best subsystems to extract**:
  1. **Biomes & vegetation (trees/grass)**: 4/5 quality, well-documented PFTs, established DGVM logic. ~100 kLOC core (tree + grass + allometry + phenology). Effort: high (requires soil/climate context), but most valuable for fantasy biome generation.
  2. **Soils**: 4/5 quality, biochemically realistic, modular pool/flux routines. ~30 kLOC extractable core. Effort: high (coupled to vegetation), but necessary for terrestrial ecosystems.
  3. **Hydrology (drain + infiltration)**: 3/5 quality, simplistic but functional water routing. ~5 kLOC. Effort: low-medium. Independent of vegetation; good for hydrological outputs.
  4. **Biome classification**: Standalone, 3/5 quality. ~0.3 kLOC. Effort: trivial. Good for quick biome mapping.

- **Skip (not relevant to fantasy world generator)**:
  - Landuse/agriculture (external scenario input, not generated)
  - Crop models (historical forcing, not fantasy)
  - Fire (optional disturbance)
  - Population/settlement (not simulated; would require separate ABM engine)

- **Biggest risks**:
  1. **AGPL-3.0 copyleft**: Strongly copyleft; any derived work must be released open-source. Browser app would trigger network-clause (source must be available to users). **Mitigation**: Acceptable if MapMaker is open-source; risky if proprietary.
  2. **Language & coupling**: C code; no WASM port exists. Would require C → WASM transpilation + ground-up rewrite of data I/O (currently reads NetCDF/binary files from disk). **Effort**: 2-3 weeks per subsystem. Browser data loading (100s MB climate/soil files) is a separate challenge.
  3. **Heavy external data dependencies**: LPJmL assumes pre-computed global climate (GSWP3-W5E5), soils (HWSD), elevation (GEBCO/SRTM). Fantasy worlds with generated climate/soils require either: (a) supply external climate engine (e.g., extract from CESM/CTSM in manifest), or (b) rewrite LPJmL climate interface to accept synthetic inputs. **Unverified**: whether standalone climate generation is in scope for MapMaker.
  4. **No tectonics/erosion/terrain**: LPJmL is post-terrain. Heightmap, river valleys, plateaus must come from other sources (orogen for terrain gen, Badlands for erosion). **Integration complexity**: moderate (LPJmL reads elevation files; chain orogen → LPJmL is feasible).

- **Unverified points**:
  - Partial-world inference: LPJmL can run regional subsets, but "infer global context from region" is not explicit. May require custom climate/soil inference layer.
  - Fidelity/speed slider: Model has no built-in fast preview mode. Would need to implement fast-track (e.g., coarser grid, fewer years) separately.
  - Same-seed reproducibility: Model is deterministic given fixed seed and inputs; **not tested** whether browser implementation preserves determinism (floating-point rounding may differ).
  - Multi-resolution consistency: No evidence of built-in zoom-level handling. Would require external downscaling post-processing or grid nesting (not in LPJmL).

