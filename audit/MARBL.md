# Audit: MARBL

## 1. Overview

MARBL (Marine Biogeochemistry Library) is a Fortran library for ocean biogeochemical simulation, developed by NCAR/UCAR with support from NSF and DOE. It is designed to be integrated into ocean GCMs and simulates ecosystem dynamics, nutrient cycling, and carbon/oxygen biogeochemistry in seawater. Maturity: production-ready, stable release (2018+), actively maintained. Size: 40 Fortran files (~23.4k LOC), plus ~2.85k LOC Python tools for configuration. Last committed version pinned to stable branch commit 6b2a5e41dc5b0faaf9b600c96432e2487515e878 (matches manifest).

## 2. Language, runtime, dependencies, build

- **Primary language**: Fortran 90+ (100% of core library); Python 3 helpers for configuration only.
- **LOC breakdown**: ~23.4k Fortran (src/), ~2.85k Python (MARBL_tools/).
- **Runtime**: Fortran-compiled library (libmarbl.a) designed to link into ocean GCMs; not standalone executable, not browser-native.
- **Platform**: Linux/Unix (standard HPC). No native Windows or macOS GUI. Supports MPI parallelization.
- **Key dependencies**: 
  - Fortran compiler (gfortran/gcc, Intel ifort, PGI, Cray, NAG supported; see src/Makefile compiler variants)
  - No external scientific libraries required; uses standard Fortran only
  - Tests use NetCDF file I/O (test data) but MARBL core does not require NetCDF
- **Build**: `make [compiler]` in src/ produces libmarbl.a and .mod files. No cmake, no autotools. Requires explicit Fortran compiler choice. Deterministic and lightweight.
- **Does it build?** Inferred from build files only (no build attempted per HARD RULES). Makefile is well-structured, compiler flags provided for 8 compilers (gnu, intel, pgi, nag, cray, plus MPI variants), dependency generation via makedep.py. No missing toolchain flags detected. Can be built with any Fortran 90+ compiler. **Builds: inferred from src/Makefile, dependency manifests, and compiler support — should build cleanly.**
- **Browser portability**: ZERO. Entire codebase is Fortran. Porting to browser JS/TS would require:
  - Complete rewrite (23.4k LOC of heavily domain-specific biogeochemistry)
  - Replacement of MPI-ready parallelism with WebWorkers or similar
  - Replacement of module/subroutine-based architecture with JS/TS OOP
  - Effort: **very high** (weeks of work for a team familiar with both Fortran and ocean biogeochemistry). WASM feasibility: **low** — Fortran→WASM is possible via Emscripten or f2c, but the resulting code would be slow (no SIMD, no MPI), and climate/biogeochemistry code is numerically sensitive.

## 3. Subsystem inventory

### 3.1 Phytoplankton ecosystem (autotrophs & zooplankton)
- **Where**: src/marbl_pft_mod.F90 (plant functional type settings); src/marbl_init_mod.F90 (initialization); src/marbl_interior_tendency_mod.F90 (growth/mortality computation).
- **What it does**: Simulates 4 phytoplankton types (diatoms, diazotrophs, small phytoplankton, coccolithophores) with temperature-dependent growth, nutrient uptake kinetics (Monod), photoadaptation (variable Chl:N), and mortality. One zooplankton grazer. Handles nutrient limitation (N, P, Fe, Si), stoichiometric constraints (C:N:P:Fe:Si:Chl), and sinking particle routing. Growth rate parameterization via empirical Q10 or Arrhenius temperature response. Photosynthesis-irradiance curve (GD98 model).
- **Quality & realism rating: 3.5/5**. Model structure is scientifically sound and well-validated against observations (JGOFS, SeaWiFS, full 3D runs in CESM); ecosystem response to nutrients and temperature is realistic for mid-to-low-latitude open ocean. However: (1) single zooplankton type is a simplification (real oceans have size-structured grazers); (2) grazing and nutrient cycling parameterizations are tuned for Earth at present climate — unclear how well they generalize to very different worlds; (3) model does not include microbial loop or heterotrophic bacteria explicitly; (4) designed for global ocean → may not be suitable for shallow/coastal fantasy scenarios without recalibration.
- **Extractability: tangled**. Deep coupling to GCM interface via marbl_interface.F90 and marbl_interface_private_types.F90 (92k LOC of type definitions). Depends on external forcing (temperature, light, physical mixing rates from GCM). No standalone data generation (initialization requires state arrays passed in). Approximate extractable core (pft dynamics + growth): ~8–10k LOC. Effort to lift to browser: **high** — would require reimplementing GCM interface layer, parameterization tuning, and numerical solvers (implicit differentiation for some tracer updates).
- **Requirements capabilities it could serve**: Climate – ocean currents (provides biological response to currents/mixing); Biomes (ocean biota composition); possibly Resources if iron/nutrient upwelling zones matter for fantasy lore.

### 3.2 Nutrient cycling & stoichiometry
- **Where**: src/marbl_interior_tendency_mod.F90 (nutrient remineralization, denitrification); src/marbl_oxygen.F90 (O2 dynamics, anoxic thresholds); src/marbl_ciso_interior_tendency_mod.F90 (carbon/nitrogen/isotope cycling).
- **What it does**: Tracks remineralization of sinking organic matter and releases of N, P, Si, Fe. Implements denitrification (NO3 reduction when O2 < 4 µM). Handles alkalinity and oxygen consumption. Variable stoichiometry (C:N:P:Fe:Si) based on particle sinking speed and depth remineralization profile (power law with exponential cutoff).
- **Quality & realism rating: 4/5**. Denitrification thresholds and remineralization schemes are well-grounded in observations and other global biogeochemistry models (OCMIP, BEC original publications). Remineralization profiles are calibrated to match observations. Limitation: remineralization timescales are tuned for Earth's oxygen distribution; very different worlds (e.g., anoxic oceans, extreme iron limitation) may see unrealistic behavior.
- **Extractability: loosely coupled**. Core remineralization logic (~3–5k LOC) can be separated from GCM interface. Requires tracer state arrays and sinking particle fluxes (computed elsewhere). No file I/O dependencies. Effort: **medium** — straightforward stoichiometric calculations, but many parameters to tune/validate.
- **Requirements capabilities it could serve**: Climate – ocean chemistry (implied for ocean currents); Biomes (nutrient limitation drives phytoplankton composition).

### 3.3 Carbonate chemistry & CO2 air-sea flux
- **Where**: src/marbl_co2calc_mod.F90 (OCMIP carbonate solver); src/marbl_surface_flux_mod.F90 (gas exchange); src/marbl_ciso_surface_flux_mod.F90 (isotopic fractionation).
- **What it does**: Solves the carbonate system (equilibrium between CO2, HCO3-, CO32-) to compute ocean pCO2 and surface air-sea CO2 flux using wind-speed-dependent gas transfer velocity (Wanninkhof parameterization or variants). Handles temperature/salinity dependence of solubility and equilibrium constants. Optional O2 flux and NH3 emissions.
- **Quality & realism rating: 4/5**. OCMIP carbonate solver is standard in climate modeling and validated extensively. Wind-speed-flux relationship is empirical but well-calibrated. Limitation: depends on surface temperature and salinity input (not generated in MARBL), and assumes modern ocean pCO2. For very different worlds (e.g., CO2-rich atmospheres), non-linear responses (Revelle factor) become important and may not be captured accurately.
- **Extractability: loosely coupled**. Carbonate solver is self-contained (~4–5k LOC). Requires: surface temperature, salinity, total alkalinity, DIC, and wind speed (all external inputs). No GCM-specific dependencies beyond type definitions. Effort: **low-to-medium** — straightforward chemical equilibrium; solver is well-documented in OCMIP literature.
- **Requirements capabilities it could serve**: Climate – ocean currents (modulates CO2 flux, could inform atmospheric CO2 feedback in a full simulation).

### 3.4 Iron sourcing & scavenging
- **Where**: src/marbl_interior_tendency_mod.F90 (iron remineralization, scavenging); src/marbl_init_mod.F90 (iron source configuration).
- **What it does**: Models dissolved iron (Fe) sourcing from sediments, hydrothermal vents, and atmospheric dust deposition. Implements iron scavenging (removal via particle aggregation and settling). Includes variable Fe/C ratio uptake by phytoplankton.
- **Quality & realism rating: 3.5/5**. Approach follows Moore & Braucher (2008) and Krishnamurthy et al. (2007). Handles major sources realistically for modern Earth but: (1) dust deposition parameterization is Earth-specific (latitude/desert distribution); (2) sediment iron source depends on shelf width and oxygen status (tuned for Earth); (3) hydrothermal input is not explicitly spatially resolved (global parameterization).
- **Extractability: tangled**. Iron sourcing is deeply embedded in initialization and depends on prescribed atmospheric/sedimentary input fields. Scavenging couples to other tracer pools. Effort: **high** — would need to decouple input dependency and tune for fantasy worlds.
- **Requirements capabilities it could serve**: Resources (if iron availability matters for world-building); Biomes (iron limitation drives productivity patterns).

### 3.5 Diagnostics & output
- **Where**: src/marbl_diagnostics_mod.F90 (192k LOC; very large file defining all output variables).
- **What it does**: Computes and exposes ~200+ diagnostic fields: phytoplankton biomass/productivity, nutrient concentrations, oxygen, carbon fluxes, remineralization, sinking fluxes, etc. Modular: GCM can select which diagnostics to compute (performance optimization).
- **Quality & realism rating: N/A** (infrastructure, not a model component). Well-organized but highly specialized for ocean model output. No fantasy-world applicability on its own.
- **Extractability: standalone**. Diagnostics computation is self-contained. Requires: tracer state, flux arrays (computed elsewhere). No external dependencies. Effort: **low** — pure computation, easy to reuse or adapt.
- **Requirements capabilities it could serve**: Export (if embedding ocean biogeochemistry in world export).

### 3.6 Configuration & settings
- **Where**: src/marbl_settings_mod.F90 (140k LOC; parameter registry); MARBL_tools/MARBL_generate_settings_file.py (configuration generator); defaults/*.yaml (preset configs).
- **What it does**: Centralizes all tunable model parameters (nutrient half-saturation constants, mortality rates, temperature response functions, iron scavenging coefficients, etc.). Provides pre-tuned configurations for CESM 2.0, 2.1, +coccolithophore variant. Python tools allow GCMs to generate valid parameter files.
- **Quality & realism rating: 4/5**. Parameter registry is comprehensive and well-documented. Pre-tuned CESM configs are validated against observations. Limitation: all parameters are empirical and tuned for specific physical ocean models (MOM5, MOM6); changing physical drivers significantly (e.g., entirely different ocean circulation) requires re-tuning.
- **Extractability: loosely coupled**. Settings module is self-contained. Python tools are standalone (no external deps). Effort: **low** — straightforward parameter table.
- **Requirements capabilities it could serve**: Calibration (settings/tuning system could be reused for fantasy biome generation).

### 3.7 State management & I/O
- **Where**: src/marbl_interface.F90, src/marbl_saved_state_mod.F90 (state serialization); tests/driver_src/ (example driver).
- **What it does**: Defines state arrays (tracers, diagnostics, forcing fields) and provides interfaces for initialization, running one time step, and checkpointing. Example Fortran driver shows how to call MARBL from a GCM.
- **Quality & realism rating: N/A** (infrastructure). API is clean and well-defined.
- **Extractability: loosely coupled**. Interface is well-documented but Fortran-specific. Effort to reimplement in JS: **medium** — would need to define state schema and time-stepping loop.
- **Requirements capabilities it could serve**: Full-state save/resume format (state structure could be adapted).

## 4. Internal data representation

**Grid/mesh**: Depth-column (1D vertical) per horizontal grid cell. MARBL does not represent horizontal spatial structure; it assumes horizontal transport is provided by the GCM's advection/diffusion.

**Resolution**: Vertical resolution is determined by GCM (typically 50–60 ocean layers in CESM). Horizontal: global 0.1° or 1° typical, but MARBL is agnostic.

**Units**: Tracer concentrations in mmol/m³ (millimoles per cubic meter). Rates in /second (converted from /day parameterizations). Time step: typically 3600 s (1 hour) for CESM coupling.

**Coordinates**: Depth in meters (0 = surface, positive downward). Temperature/salinity/light provided by GCM as 1D profiles per column.

**Time representation**: Eulerian time stepping (current MARBL uses explicit time integration, some tracers implicit). No adaptive time stepping.

**Serialization**: Tracer arrays marshaled as 1D floating-point arrays per column + metadata (tracer names, units, diagnostic fields). No versioning of state format (would need to be added for long-term save/resume).

**RNG/seed**: MARBL is deterministic (no stochastic processes). Same input → same output exactly. Suitable for same-seed preview requirement.

**Multi-resolution/zoom**: NOT APPLICABLE. MARBL is depth-column only and does not support spatial hierarchy or zoom-level consistency. Horizontal spatial variation comes from GCM.

## 5. License

**SPDX**: BSD-3-Clause-style (custom UCAR) — matches manifest.

**License file**: /Users/griffinfoster/Projects/MapMaker/upstream/MARBL/LICENSE.txt

**Text**: BSD-3-Clause-like terms (attribution, no liability) with UCAR as copyright holder. No patent clauses, no EULA restrictions. Permissive, compatible with most open-source licenses including GPL and MIT.

**Vendored/mixed licenses**: None detected. All code is UCAR copyright.

**Verification**: LICENSE.txt read and confirmed. No per-file license headers observed (standard for Fortran projects of this era).

**Practical notes**: Permissive copyleft-weak license. Code can be extracted and used freely (with attribution); no obligation to publish modifications. No resale restrictions. Safe for MapMaker.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Outside scope (ocean biogeochemistry only) |
| Heightmap generation | no | — | — | — | Outside scope |
| Erosion | no | — | — | — | Outside scope |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | Outside scope; MARBL is ocean-only |
| Climate – temperature | partial | 3 | tangled | marbl_interior_tendency_mod.F90 | Temperature dependency built in; drives growth/mortality. Does not generate temperature. |
| Climate – wind | partial | 2 | loosely coupled | marbl_surface_flux_mod.F90 | Uses wind speed for CO2/O2 gas flux; does not generate wind. |
| Climate – ocean currents | partial | 1 | tangled | src/ (entire library) | Responds to mixing/advection; does NOT generate currents. Requires MOM6 or similar. |
| Climate – precipitation | no | — | — | — | Outside scope |
| Climate – seasons | partial | 2 | tangled | marbl_interface_private_types.F90 | Seasonal cycles in light/temperature are propagated from GCM; MARBL does not generate seasonality. |
| Biomes | partial | 3 | tangled | marbl_pft_mod.F90, marbl_interior_tendency_mod.F90 | Phytoplankton composition (diatoms vs. small vs. diazotrophs) varies with nutrients/Fe/temp. Does not map to land biomes. |
| Soils | no | — | — | — | Outside scope |
| Resources | no | — | — | — | No resource/ore generation. Iron/nutrient cycling are internal biogeochemical state. |
| Population & settlement | no | — | — | — | Outside scope |
| Cities & towns | no | — | — | — | Outside scope |
| Languages & names | no | — | — | — | Outside scope |
| Political borders | no | — | — | — | Outside scope |
| Trade | no | — | — | — | Outside scope |
| Long-run history/war/economics/politics sim | no | — | — | — | Outside scope; ecosystem model only |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | MARBL is column-based; no spatial hierarchy or multi-scale representation |
| Globe view | no | — | — | — | No rendering; data output only |
| Flat projections | no | — | — | — | No map rendering |
| Partial-world inference | no | — | — | — | Requires full global ocean state (no edge/boundary inference). |
| Import of heightmaps/layers | no | — | — | — | No import capability (external I/O is via GCM) |
| Fidelity/speed slider with same-seed preview | N/A | — | — | — | Deterministic library; no UI. GCM caller could implement slider if desired. |
| Export (PNG/SVG/STL/other) | no | — | — | — | No export. Output is NetCDF tracer/diagnostic arrays. |
| Full-state save/resume format | partial | 2 | loosely coupled | marbl_interface.F90, marbl_saved_state_mod.F90 | State serialization defined; format is opaque (array dumps). No schema versioning. |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3 | tangled | defaults/*.yaml, src/marbl_pft_mod.F90 | Parameters tuned against CESM/observations. Earth-centric; requires re-tuning for other worlds. |
| Planet-parameter derivation | no | — | — | — | Settings are manually tuned; no algorithmic derivation from planet properties. |

## 7. Verdict

- **What to skip**: Almost all of MARBL. The library is specialized for Earth ocean biogeochemistry coupled to a modern GCM. For MapMaker's fantasy world simulator, it offers: (1) little-to-no value for most subsystems (tectonics, heightmap, erosion, climate physics, population, history); (2) significant baggage (40 Fortran files tightly coupled to GCM assumptions); (3) zero browser applicability.

- **Narrow extractable value**: *If* MapMaker eventually includes ocean biogeochemistry (e.g., to determine ocean biomes or nutrient-rich regions for lore), the carbonate solver (src/marbl_co2calc_mod.F90, ~5k LOC) and remineralization logic (~5k LOC) are cleanest components and could be adapted. However: (1) these are coupled to Earth parameters; (2) rewriting to JS/TS is easier than porting Fortran; (3) a simpler ocean model (e.g., a fantasy-world-specific nutrient budget) would be more maintainable.

- **Risks**:
  - **Language**: Pure Fortran. Browser porting is prohibitively expensive (23.4k LOC rewrite).
  - **Coupling**: Every subsystem depends on GCM state (temperature, salinity, mixing, light from above). Extracting pieces requires re-architecting input flow.
  - **Specificity**: Parameters (half-sat constants, mortality rates, Fe sources) are tuned for Earth at present-day. Applying to fantasy worlds requires validation/re-tuning, which demands oceanography expertise.
  - **License**: Not a risk (BSD-3-Clause permissive). No conflicts.

- **Open questions**:
  - Would MapMaker include ocean biogeochemistry in scope, or is ocean biology treated as a narrative backdrop? (Affects decision to extract.)
  - If extracted, would a dedicated fantasy-ocean module (smaller, simpler) be preferable to adapting MARBL?

- **Verdict summary**: **DO NOT EXTRACT.** MARBL is a sophisticated, specialized tool for Earth climate modeling that offers minimal value for a fantasy world generator. The effort to port and tune exceeds the benefit. If ocean biology becomes a must-have feature, write a simplified fantasy-specific module or adopt a lighter reference (e.g., a nutrient budget + plankton composition rule).

---

**Audit completed**: 2026-10-02  
**Manifest commit**: 6b2a5e41dc5b0faaf9b600c96432e2487515e878 (stable branch, current)  
**License verified**: LICENSE.txt (BSD-3-Clause-style UCAR)
