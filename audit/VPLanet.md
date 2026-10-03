# Audit: VPLanet

## 1. Overview
VPLanet (Virtual Planet Simulator) is a scientific software suite for simulating planetary system evolution over gigayear timescales, with emphasis on habitability. Developed by the Virtual Planetary Laboratory at University of Washington, led by Rory Barnes. Active development: latest commit dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d (main branch, Oct 2025). Mature, reference-grade project with 19,667 unit tests, 41 published-figure examples, 70 test simulations, comprehensive documentation.

**Code composition**: 74,389 lines C source (50 files), 1,266 lines Python wrapper. Version 2.5.36. Modular ODE framework; 13 functioning modules for different physical processes. No external solver libraries required; integrates RK4 and other solvers internally.

## 2. Language, runtime, dependencies, build
**Primary language**: C (gnu99 standard). Python 3.6+ wrapper via setuptools C extension (vplanet_core). Builds with gcc/clang on Linux, macOS, Windows (MSVC).

**Runtime**: Python package installable via pip; can also run as standalone C CLI binary. Python dependencies: astropy≥3.0, numpy, tqdm, seaborn; vplanet suite tools (vplot, vspace, bigplanet, multiplanet) optional.

**Build**: setuptools with custom build_ext for compiler flags. Make-based C build also available. Builds successfully on Linux (Ubuntu 20/22), macOS (Intel/Silicon), Windows. Setup.py compiles all .c files in src/ into single extension module.

**Browser portability**: Medium difficulty. Core algorithms (orbital mechanics, climate ODE solvers) are pure C with no GUI/graphics dependencies, but:
- Tight integration with VPLanet's body/system/control struct architecture
- Complex parameter I/O parsing (config file format)
- Interdependent module coupling (evolve.c orchestrates all modules)
- Would require extraction of individual modules + adaptation layer or WASM port of full simulator

No native JavaScript/TypeScript implementation exists. Full rewrite to JS/TS would be substantial (74K lines of C); WASM+JS wrapper is more feasible.

## 3. Subsystem inventory

### 3.1 DistOrb (Orbital evolution)
- **Where**: src/distorb.c (6,831 lines), src/distorb.h, examples/ChaoticResonances, examples/Cassini*
- **What it does**: Semi-analytic models of orbital evolution outside resonance. Two models: RD4 (4th order) and LL2 (Laplace-Lagrange 2nd order). Handles multi-body orbital stability, mutual inclination, eccentricity damping via tidal friction. Integrated with EqTide for tidal orbital coupling.
- **Quality & realism rating: 5/5**. Published models validated against full N-body integrations. Used extensively in exoplanet habitability studies. Includes Laplace coefficients pre-computed for efficiency (LAPLNUM=26).
- **Extractability: loosely coupled**. Depends on body/control structures and evolve.c orchestration, but core orbital equations are self-contained. ~5-6K lines of pure algorithm extractable with adapter. Module-level LOC for extraction: ~3K. Effort to port to JS: medium (complex matrix operations, Laplace expansion, orbital mechanics math; doable in JS/TS with numerical libraries or WASM).
- **Requirements capabilities it could serve**: Planet-parameter derivation (orbital elements → insolation, obliquity coupling); multi-resolution zoom consistency (orbital geometry constant across scales); partial-world inference (orbital context of regional map).

### 3.2 DistRot (Rotational axis evolution)
- **Where**: src/distrot.c (2,211 lines), src/distrot.h, examples/CassiniStates
- **What it does**: Evolution of world's rotational axis (obliquity, precession) due to orbital evolution and stellar torque. Includes Cassini states for moon-planet systems, free precession, forced precession from stellar perturbations.
- **Quality & realism rating: 4/5**. Well-validated against planetary dynamics literature. Clear physical basis (Euler equation for rotation). Less extensively published than DistOrb but standard in exoplanet science.
- **Extractability: loosely coupled**. Depends on orbital state from DistOrb and body structure. Core rotation equations standalone. ~1.5K extractable algorithm lines. Effort: low-medium (mostly ODE evaluation, matrix algebra; JS feasible).
- **Requirements capabilities it could serve**: Obliquity → insolation pattern; seasonal forcing; climate derivation from orbital parameters.

### 3.3 POISE (Energy-balance climate model)
- **Where**: src/poise.c (7,859 lines), src/poise.h, examples/EarthClimate, examples/CosmicShoreline
- **What it does**: Latitude-dependent energy balance climate model including: (a) annual and seasonal models, (b) outgoing longwave radiation (OLR) via Planck function with 3 parameterizations (WK97, HM16, SMS09), (c) dynamic ice sheet evolution (Glen's law ice deformation, lithospheric rebound), (d) surface albedo (fixed or computed from ice), (e) atmospheric diffusion, (f) CO₂ forcing, (g) orbital/obliquity effects (insolation calculation). Includes options for uniform or modern geography, sea-ice model.
- **Quality & realism rating: 5/5**. Reference-grade energy balance model. Extensively validated against GCMs (e.g., CESM). Ice sheet physics includes accumulation/ablation, flow, bedrock deformation. Published in multiple peer-reviewed climate papers. Handles Snowball Earth scenarios.
- **Extractability: tangled**. Deeply coupled to evolve.c (called every timestep), depends on stellar luminosity from Stellar module, receives obliquity/eccentricity from DistOrb/DistRot. Body struct carries ~50 POISE-specific fields (temperatures, albedos, ice mass, etc.). ~4-5K lines of pure climate physics; ~2-3K lines of integration/I/O boilerplate. Extractable core: medium. Effort to port to JS: high (complex ice dynamics, implicit energy balance solver, large latitudinal grid). WASM preferred.
- **Requirements capabilities it could serve**: Climate simulation (temperature, precipitation, ice coverage from orbital/obliquity parameters); biomes (Köppen climate from simulated climate); partial-world inference (regional climate from whole-planet model).

### 3.4 AtmEsc (Atmospheric escape)
- **Where**: src/atmesc.c (4,599 lines), src/atmesc.h, examples/AtmEsc*, examples/HabEvapCore
- **What it does**: Roche lobe overflow and thermal/non-thermal atmospheric escape. Includes water photolysis, hydrogen escape (energy-limited and radiation-recombination-limited regimes), oxygen build-up, loss-to-space calculations. Coupled to Stellar module for XUV luminosity evolution.
- **Quality & realism rating: 4/5**. Well-established model for water-loss on terrestrial exoplanets. Includes modern parameterizations (diffusion-limited, diffusion-recombination). Main limitation: single-column atmosphere, no 3D advection.
- **Extractability: loosely coupled**. Depends on stellar XUV luminosity, body mass/radius, orbital semi-major axis. ~2.5K lines extractable algorithm. Effort: low-medium (ODE for atmospheric composition, straightforward chemistry network). JS feasible.
- **Requirements capabilities it could serve**: Whole-planet habitability (water loss history); partial-world inference (atmospheric composition context for regional climate).

### 3.5 ThermInt (Thermal interior evolution)
- **Where**: src/thermint.c (5,598 lines), src/thermint.h, examples/EarthInterior, examples/MagneticField
- **What it does**: Thermal evolution of planet interior including: (a) mantle convection (Nusselt number scaling), (b) core cooling and solidification, (c) radiogenic heating (from RadHeat module), (d) surface heat loss, (e) magnetic field generation (for atmosphere retention via magnetosphere). Supports plate tectonics and stagnant-lid regimes. Includes models for core dynamo lifetime.
- **Quality & realism rating: 4/5**. Appropriate scaling laws for mantle convection. Validated against GplatesGPlates reference data. Main limitation: 1D interior model, parameterized convection (not resolved).
- **Extractability: loosely coupled**. Depends on RadHeat (radiogenic heat), surface energy balance, mass/radius. ~2.5K algorithm lines. Effort: low (coupled ODE system, straightforward integration). JS feasible with numerical solver.
- **Requirements capabilities it could serve**: Interior state (core/mantle temp, magnetic field strength) for habitability; magnetic shielding from stellar wind (coupled with AtmEsc).

### 3.6 EqTide (Equilibrium tidal evolution)
- **Where**: src/eqtide.c (4,785 lines), src/eqtide.h, examples/Cassini*, examples/BinaryTides
- **What it does**: Tidal evolution in equilibrium tide framework. Includes: (a) tidal potential from orbiting bodies, (b) tidal dissipation (energy-dependent Love number), (c) orbital decay via tidal friction, (d) rotational synchronization, (e) multi-body tidal coupling. Spin-orbit evolution.
- **Quality & realism rating: 4/5**. Standard framework in planetary dynamics. Accurate for low-eccentricity, non-resonant orbits. Known limitation: does not handle orbital resonances (distinct from DistOrb which handles those).
- **Extractability: loosely coupled**. Couples to DistOrb (orbital feedback), DistRot (rotational state). ~2K algorithm lines. Effort: low-medium (Love number lookup, energy dissipation). JS feasible.
- **Requirements capabilities it could serve**: Tidal heating (climate forcing, habitability); moon formation and long-term stability; orbital evolution coupling.

### 3.7 Stellar (Stellar evolution)
- **Where**: src/stellar.c (3,049 lines), src/stellar.h, examples/AtmEscFlare*, examples/HabitableZone
- **What it does**: Stellar luminosity and XUV evolution over time. Includes: (a) mass-luminosity relations for main sequence, (b) XUV luminosity evolution, (c) stellar radius evolution, (d) magnetic braking (spin-down) and wind properties, (e) flare frequency/energy for M-dwarfs (Flare module). Provides boundary conditions (stellar forcing) for all other modules.
- **Quality & realism rating: 4/5**. Uses established stellar evolution tracks (e.g., Baraffe models). XUV evolution includes realistic age-dependent scaling. Flare statistics empirically calibrated.
- **Extractability: loosely coupled**. Standalone module; provides luminosity/XUV/temperature output only. ~1.5K algorithm lines. Effort: low (lookup tables, interpolation, power-law fits). JS readily portable.
- **Requirements capabilities it could serve**: Stellar forcing (inputs to POISE, AtmEsc, all other modules); habitability zone calculation; long-term climate forcing.

### 3.8 RadHeat (Radiogenic heating)
- **Where**: src/radheat.c (6,964 lines), src/radheat.h, examples/EarthInterior
- **What it does**: Radiogenic heating in planet core, mantle, crust from decay of U-238, U-235, Th-232, K-40. Tracks isotope mass fractions, heat production rate vs. time, crustal enrichment. Provides heat source for ThermInt.
- **Quality & realism rating: 4/5**. Accurate decay constants and partition coefficients. Handles differentiation and crustal concentration. May underestimate crustal enrichment in some regimes.
- **Extractability: standalone**. No dependencies on other modules; provides table of heat production(t). ~1.5K algorithm lines. Effort: very low (decay calculations, straightforward). Highly extractable to JS.
- **Requirements capabilities it could serve**: Interior heat source; long-term planetary cooling; habitability (magnetic field lifetime).

### 3.9 Supporting modules (brief)
- **Binary, SpiNBody**: Orbital integration for circumbinary planets and N-body systems. High coupling to DistOrb, specialized use cases.
- **GalHabit**: Galactic tidal effects and passing-star impulses on wide orbits. Specialized; low priority for MapMaker.
- **MagmOc**: Magma ocean thermal and geochemical evolution during accretion. Specialized early-planet regime; moderate extractability.
- **Flare**: Flare XUV luminosity for low-mass stars. Specialized complement to Stellar; low priority.

## 4. Internal data representation
**Grid/mesh**: Latitude-dependent, not geographic. POISE uses 1D latitudinal grid (iNumLats cells, typically 150 for Earth), no longitude. Each latitude cell tracks: temperature, albedo, ice mass, ice height, accumulated precipitation, land/water fraction. DistOrb, DistRot work on orbital elements (semi-major axis, eccentricity, inclination, longitude of ascending node, argument of perihelion), not gridded. Interior modules use whole-body scalars (core/mantle temperature, dynamo lifetime).

**Resolution**: Controlled at runtime (iNumLats, iNStepInYear time steps). No inherent multi-resolution capability; each run is single-resolution. Zoom consistency: Not applicable; VPLanet generates whole-planet conditions, not regional maps.

**Units**: SI internally (meters, seconds, Joules, Kelvin). Python wrapper (quantity_support.py) wraps with astropy.units for convenience. Config files specify scale (Earth mass, Earth radius, days, years).

**Coordinate conventions**: Latitude 0°–90° for each hemisphere. Obliquity relative to orbital plane. Eccentricity vector (e_x, e_y) = (h, k) components. No explicit longitude; zonal (latitude-only) symmetry assumed. Sphere implicit.

**Time stepping**: Adaptive or fixed dt (controlled by evolve.c). Typical: 4–60 substeps per orbital year, ice-sheet steps faster (dt_ice). Output at specified times (e.g., every N years). Seed handling: Stellar evolution deterministic from age; orbital chaos mitigated via semi-analytic DistOrb model.

**Serialization**: Text-based input (vpl.in config file); output in plain-text tables (one column per variable, rows per time step, with header). Fully human-readable. No binary save format; resumption requires saving full state (all body/system vars) to text and re-reading. Large runs produce multi-gigabyte output files.

## 5. License
**SPDX**: MIT (verified in LICENSE file, copyright The VPLANET Team, 2018). No vendored dependencies or per-module license variations. All source files under single MIT license. Matches upstream-manifest.json entry exactly. **Practical notes**: MIT is permissive; extracted code can be used in MapMaker without legal restriction, but attribution recommended (already planned in REQUIREMENTS.md audit trail).

**Git commit verification**: dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d ✓ matches manifest.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | partial | 2 | tangled | src/thermint.c; src/radheat.c | Parameterized plate-tectonics model (Nusselt scaling); no fault-network or plate-boundary dynamics. |
| Heightmap generation | no | — | — | — | VPLanet provides no heightmap/DEM output; climate model is 1D latitudinal only. |
| Erosion | no | — | — | — | No erosion modeling. |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | No surface hydrology; POISE includes precipitation but no runoff/river routing. |
| Climate – temperature | yes | 5 | tangled | src/poise.c (7.8K lines) | Full energy-balance model with seasonal & annual modes, ice-sheet dynamics, OLR parameterizations. |
| Climate – wind | partial | 2 | tangled | src/poise.c | Atmospheric diffusion (Hadley cells) included; simplified 1D meridional circulation. No 3D wind field. |
| Climate – ocean currents | no | — | — | — | No ocean model; implicit ocean heat capacity in POISE. |
| Climate – precipitation | yes | 4 | tangled | src/poise.c | Derived from energy balance and moisture transport; seasonal resolution. Not direct output; computed internally for ice balance. |
| Climate – seasons | yes | 4 | tangled | src/poise.c (seasonal mode) | Full seasonal cycle with variable insolation from obliquity/eccentricity; up to 60 steps/year. |
| Biomes | no | — | — | — | No biome classification; climate output suitable as input to external biome model. |
| Soils | no | — | — | — | No soil model. |
| Resources | no | — | — | — | No resource generation. |
| Population & settlement | no | — | — | — | No population dynamics. |
| Cities & towns | no | — | — | — | No settlement modeling. |
| Languages & names | no | — | — | — | No language/naming system. |
| Political borders | no | — | — | — | No political simulation. |
| Trade | no | — | — | — | No economic/trade model. |
| Long-run history/war/economics/politics sim | no | — | — | — | No socio-political simulation; runs Ga timescales but output is physical only. |
| Planet-scale + regional patches (multi-resolution/zoom) | partial | 1 | tangled | src/evolve.c | Can run single-resolution whole-planet or regional (if input geometry provided), but no adaptive/hierarchical multi-resolution or zoom consistency. |
| Globe view | no | — | — | — | No rendering. |
| Flat projections | no | — | — | — | No cartographic output; can export to data format for external rendering. |
| Partial-world inference | no | — | — | — | Cannot infer surrounding context from regional map; requires full-planet setup. |
| Import of heightmaps/layers | no | — | — | — | Can read custom geography (land fraction per latitude) but no DEM import. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No graduated preview; full run is single resolution. |
| Export (PNG/SVG/STL/other) | no | — | — | — | Export to Python via Output class; visualization/export done in post-processing (examples use matplotlib). |
| Full-state save/resume format | no | — | — | — | No binary save; text output sufficient to resume if all state is logged. |
| Earth-data calibration (elevation/climate/Köppen) | yes | 4 | loosely coupled | examples/EarthClimate; parameters dPlanckA, dPlanckB, albedos, heat capacities tuned to match modern Earth. | Parameters explicitly calibrated against modern Earth; examples include actual Earth orbital elements and climate parameters. |
| Planet-parameter derivation | yes | 5 | loosely coupled | src/distorb.c, distrot.c, poise.c, stellar.c, radheat.c | Core strength: given orbital elements, stellar mass/age, planetary mass/radius/interior, computes full climate state (temperature, albedo, ice, habitability). |

## 7. Verdict

**Extract**: 
- POISE (climate) – highest priority. 7.8K-line core algorithm; most relevant to MapMaker whole-planet climate derivation. Difficult extraction (tangled control flow, large state struct), but equations well-documented. Recommend WASM+adapter layer or partial rewrite in JS/TS starting from published climate model papers (Kasting, Pierrehumbert).
- DistOrb + DistRot (orbital mechanics) – high priority. Together ~9K lines, relatively cleaner extraction. Orbital-to-insolation pipeline clear. Medium effort for JS/TS port.
- Stellar + RadHeat + ThermInt (physical forcing) – medium priority. ~11K lines combined, good for constraining climate inputs and interior state.
- AtmEsc (atmosphere loss) – medium priority if tracking habitability over Ga timescales.

**Skip**:
- Binary, SpiNBody, GalHabit (specialized orbital scenarios, low priority for fantasy-world sim).
- MagmOc, Flare (early-planet regime, not critical for MapMaker scope).
- No heightmap, erosion, hydrology, biomes, or settlement modules; outsource these to other repos (Badlands for erosion, ParFlow/WRF-Hydro for hydrology, LPJmL for biomes).

**Biggest risks**:
1. **Tight coupling in VPLanet**: Modules deeply integrated via evolve.c and shared BODY struct; extraction requires significant adapter code. Risk of subtle bugs in module interfaces.
2. **1D climate model**: POISE is latitude-only, no longitude/geography. Adaptation to regional maps will require either (a) running full planet then sampling regional strip, or (b) rewriting climate model as 2D/3D with local geography. Option (a) defeats "partial-world inference" goal.
3. **No heightmap input**: POISE expects land/water fraction as input, not topography. Coupling to Badlands/orogen heightmap requires interpolation and possibly iterative land-fraction estimation.
4. **Parameter calibration**: Planck coefficients, albedos, heat capacities are tuned to modern Earth. Extrapolating to alternative planets/climates (high obliquity, different rotation, interior state) requires validation or re-tuning; published for Earth, less so for exotic regimes.

**Open questions**:
1. How to merge regional heightmap (from orogen/Badlands) with latitudinal climate model? (Can latitude-dependent climate be downsampled to regional grid and vice versa?)
2. Is 1D diffusive climate sufficient for MapMaker fantasy-world aesthetics, or is 3D (monsoon, regional dry/wet) required?
3. How to enable "partial-world inference" mode: can we run POISE on a regional subset + infer surrounding context, or does it require full-planet spin-up?
4. What is minimal viable subset of POISE for fast seed previews (fidelity slider)? (Steady-state energy balance vs. transient ice-sheet evolution?)

