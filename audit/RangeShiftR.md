# Audit: RangeShiftR

## 1. Overview

**RangeShiftR** is an R package (v3.0.1, updated Apr 2026) implementing the RangeShifter spatially-explicit, individual-based simulation platform for modeling species' range dynamics, patch connectivity, and eco-evolutionary processes. It wraps the C++20 core engine (RScore) via Rcpp bindings. Maintained by University of Potsdam group (Bocedi, Palmer, Malchow, Travis, Zurell et al.); published in *Ecography* (Bocedi et al. 2021, Malchow et al. 2021). 

**Size**: ~17.5k LOC total: ~11k R, ~7k C++ (25 .cpp, 23 .h, 17 .R files). Repo: git commit d01f1b6527ac543163adadcc9b993da842f6c866.

**Maturity**: Production-grade, peer-reviewed, used globally in research. Active maintenance (GitHub issues/discussions, technical support). Modular architecture: demography, dispersal, genetics all configurable at different complexity levels.

## 2. Language, runtime, dependencies, build

**Languages & LOC breakdown**:
- R: ~11k LOC (R/classes for parameter management, simulation control, output handling)
- C++20: ~7k LOC (RScore core in RangeShiftR/src/RScore; algorithms for individual/population/community dynamics)
- Ratio: ~61% R, 39% C++

**Runtime/Platform**:
- **Native**: R package (R >= 3.6 required). Builds via Rcpp/Armadillo.
- **Browser**: Not runnable in browser as-is. Core C++20 would require WASM compilation (non-trivial); R interface layer is R-specific (no JS equivalent).

**Key dependencies**:
- Rcpp (>= 1.0.0) & RcppArmadillo — C++ linear algebra & R interop
- terra — raster/spatial data handling (for landscape input)
- R methods, rmarkdown

**Build**:
- **Requirements**: Functional C++20 compiler (clang/g++), R development environment, Rcpp toolchain
- **Process**: `pak::pak("RangeShifter/RangeShiftR-pkg/RangeShiftR@main")` from GitHub; builds from source with R CMD INSTALL
- **Inferred building**: Makevars present (RangeShiftR/src/Makevars), CXX_STD=CXX20, -O2 optimization flags. CMakeLists.txt in RScore (build independence unclear). No CI config found in .github/, only documentation.
- **Status**: builds: inferred from Makevars/CMakeLists; did not attempt build (no npm/R install in upstream per brief)

**Browser porting effort**: **HIGH**. 
- C++20 → WASM would require either: (a) emscripten port (binaries grow ~10-20x, slow), (b) full JavaScript rewrite (~7k LOC).
- R interface layer (11k LOC of parameter/output handling) is R-specific; porting to JS/TS is moderate effort.
- **Verdict**: Not practical for browser without ground-up rewrite. Would extract algorithms to standalone C++/WASM or translate core simulation logic to JS.

## 3. Subsystem inventory

### 3.1 Population dynamics and dispersal

**Where**: RangeShiftR/src/RScore/{Individual,Population,SubCommunity,Species,DispersalTrait,Community}.{cpp,h}; RangeShiftR/R/class_DemogParams.R, class_DispersalParams.R

**What it does**:
Individual-based model: tracks each organism with age, sex, life stage (juvenile/adult), genetic traits. Population manages cohorts within patches. Three dispersal models implemented:
1. **Constant Dispersal Probability**: fixed proportion disperses per generation
2. **Density-Dependent**: probability scales with population density
3. **SMS (Stochastic Movement Simulator)** and **CRW (Correlated Random Walk)**: complex movement kernels with landscape cost resistance

Traits include dispersal distance (E_D0/alpha/beta parameters), settlement success, survival/fecundity. Supports sex-specific trait variation. Settlement subject to habitat suitability and mate availability.

**Quality & realism rating: 4/5**. 
Well-validated individual-based framework. Dispersal kernels are flexible and realistic (two-component dispersal, fat-tailed kernels supported). Density-dependence and Allee effects can be incorporated via demographic parameters. Minor: CRW movement on real landscapes is computationally intensive; SMS cost-surface handling requires careful calibration. Trait heritability model is quantitative-genetic (additive), not tracking full genotypes at scale.

**Extractability: loosely coupled**. 
Depends on: Landscape (cell/patch grid), Community (for population aggregation), RNG (RSrandom). Core Individual/Population classes are self-contained once landscape is provided. **Extractable core LOC**: ~800 LOC (Individual logic). **Effort to lift to JS/TS**: medium (individual state vectors, dispersal kernel sampling, mate-finding algorithm need careful translation). Data files: landscape raster, initial species distribution, demographic/dispersal trait tables.

**Requirements capabilities it could serve**: 
Population & settlement (primary); species range shifts (primary); biome distribution inference (via habitat suitability linkage)

---

### 3.2 Landscape and habitat

**Where**: RangeShiftR/src/RScore/{Landscape,Cell,Patch,FractalGenerator}.{cpp,h}; RangeShiftR/R/class_LandParams.R

**What it does**:
Rectangular grid landscape (cell-based or patch-based; patches are groupings of cells). Cells hold discrete habitat classes, percent-cover layers, or continuous quality (0–100%). Can input from ArcGIS raster files or generate synthetic random/fractal landscapes. Supports dynamic habitat change (user-supplied raster sequences for land-use transitions). Grain (cell resolution) is user-defined; extent is flexible.

**Quality & realism rating: 3/5**. 
Functional but basic. Raster-based, static analysis (no erosion/hydrology/soil dynamics). No topographic routing, no dynamic feedback from population to landscape (one-way environmental forcing). Fractal generation is rudimentary (Perlin-like noise, unvalidated against real DEM statistics). Suitable for abstract/stylized fantasy maps; less for high-fidelity Earth-calibrated simulation.

**Extractability: standalone**. 
Self-contained raster grid with file I/O. Imports: terra R package (for reading rasters). **Extractable core LOC**: ~400 LOC (Cell/Patch/Landscape grid logic). **Effort to lift to JS/TS**: low-medium (grid algebra is straightforward; raster I/O requires adapting to Browser APIs or canvas). Data files: input raster(s) in ASCII grid or GeoTIFF format.

**Requirements capabilities it could serve**: 
Heightmap/terrain placeholder (not generation); import of user-supplied maps

---

### 3.3 Genetics, evolution, and trait inheritance

**Where**: RangeShiftR/src/RScore/{GeneticFitnessTrait,NeutralTrait,DispersalTrait,Allele,SpeciesTrait}.{cpp,h}; RangeShiftR/R/class_GeneticsParams.R

**What it does**:
Quantitative genetic model: individuals carry alleles at multiple loci; traits are sums of allele effects (additive model). Trait types: neutral (tracking only), genetic load (deleterious alleles), fitness-linked (habitat/density effects), dispersal (movement distance/probability). Supports sex-specific and age/stage-specific trait expressions. Evolution via: selection (fitness-dependent survival), mutation (random allele frequency changes), genetic drift (stochastic transmission). NeutralStatsManager tracks allele frequency changes.

**Quality & realism rating: 3/5**.
Solid quantitative genetics. Additive model is standard but simplified (no dominance, linkage, or gene flow constraints). Mutation rates and initial allele distributions are user-supplied (calibration needed). Good for tracking evolutionary response to selection and demographic bottlenecks. Not suitable for fine-scale population genetics (requires explicit genotype tracking at higher resolution).

**Extractability: loosely coupled**.
Depends on: Individual (holds trait alleles), RNG (for mutation/drift). Trait factories abstract trait creation. **Extractable core LOC**: ~600 LOC (trait computation). **Effort to lift to JS/TS**: medium (allele array operations, population statistics, sex/stage-dependent trait expression). Data files: initial allele frequencies, mutation rates per locus, trait-to-fitness mapping tables.

**Requirements capabilities it could serve**: 
Long-run history/war/economics/politics sim (genetic/evolutionary baseline); population adaptation to biome shifts

---

### 3.4 Simulation control and output

**Where**: RangeShiftR/R/{RunRS.R, RSsim.R, class_SimulationParams.R, class_ControlParams.R, output_handling.R}; RangeShiftR/src/RScore/{Model,Management}.cpp

**What it does**:
R wrapper manages replicate runs, seeding, parameter sweeps. Simulation loop in C++: for each year/generation, executes demography → dispersal → settlement → genetics → output. Management module handles translocation/culling interventions. Output: population counts by stage/sex/patch, occupancy grids, genetic stats, raster time-series. Supports saving/resuming from checkpoints.

**Quality & realism rating: 3/5**.
Robust simulation engine. Parameter combinations can be complex (30+ parameters for demography alone). Output is rich (raster stacks, summary statistics) but text-based (no native visualization). Management (translocation) support is minimal but extensible.

**Extractability: tangled**.
Tightly coupled to R/Rcpp interface (Rinterface.cpp/h, RcppExports.R). Simulation state (Community/Landscape/Species) is opaque to R caller (managed via C++ pointers). **Extractable core LOC**: ~300 LOC (RunModel loop). **Effort to lift to JS/TS**: high (need full simulation event loop rewrite; no native async/event-driven model). Data files: parameter tables (CSV/JSON).

**Requirements capabilities it could serve**:
Full-state save/resume format (CSV dumps of population/genetics tables); time-stepping control for UI

---

### 3.5 No subsystems for: Tectonics, heightmap generation, erosion, hydrology, climate, biomes (inference), soils, resources, cities, languages, political borders, trade, war/economics, projections, globe view

RangeShiftR is deliberately **species-centric**, not world-generation-focused. It assumes a fixed landscape provided by user. No modules for:
- **Tectonics, orogenesis**: not applicable (static landscape).
- **Heightmap generation**: assumed input (via raster files or stylized fractal).
- **Erosion**: no landscape evolution.
- **Hydrology, climate, biomes**: These are **inputs** (encoded in habitat classes or quality rasters); RangeShiftR does not derive them. Species respond to environmental forcing (temperature/precipitation can be time-series forcing in habitat quality tables), but they are not simulated.
- **Soils, resources**: Beyond habitat class labels; no material cycles.
- **Cities, languages, political borders, trade, war, economics**: No social simulation.
- **Long-run history**: Population genetics yes; human civilization no.
- **Projections, globe view**: No mapping/rendering layer.

## 4. Internal data representation

**Grid/mesh type**: Rectangular 2D raster grid (cells or patches). No mesh/triangulation support.

**Resolution and how set**: 
- Landscape grain (cell size) is user-specified in metres (or abstract units). Can be any positive integer.
- Landscape extent: rows × columns, typically 10–10,000+ cells per dimension (tested up to large regional models).
- Initial species distribution: either same grain as landscape, or integer multiple thereof (coarser).
- Dynamic habitat: must match landscape dimensions exactly.

**Units**: 
- Spatial: metres (nominal, but any linear unit scales consistently).
- Time: years; within-year dynamics are generation-based (multiple generations per year possible for insects; single for mammals).
- Dispersal distance: metres, drawn from user-specified kernels.
- Survival/fecundity: per-capita, per year or generation.

**Coordinate conventions**:
- Grid: (x, y) = (column, row); x increases east, y increases north. No explicit CRS encoding (user must track).
- Landscape boundary: **periodic wraparound not implemented**; edges are absorbing or reflecting (user-selectable).
- Poles/sphere: **none**; Cartesian plane only.
- Latitude/longitude: not supported natively; raster I/O expects ArcGIS ASCII grid (which can carry geo-coordinates, but RangeShiftR ignores them).

**Time step**:
- Annual (year loop). Generational sub-loop within each year (1+ generations per year).
- Stochasticity: per-individual survival/fecundity are stochastic (Bernoulli/Poisson draws); RNG uses MT19937 seeded by user.

**Serialization/save format**:
- Landscape: input from ArcGIS ASCII raster (.asc) or GeoTIFF (via terra R package).
- Parameters: passed as R S4 objects (RSparams class) to C++ via Rcpp; no standard parameter exchange format (JSON/YAML not native).
- Population state: exported as CSV tables (individuals table: age/sex/traits/location; population counts by patch/year).
- Genetic data: allele frequency tables (CSV) via NeutralStatsManager.
- **Full-state save**: no native checkpoint format. Resumption requires re-initializing from population CSV dump (lossy; loses microstate).

**RNG/seed handling**:
- RNG: Mersenne Twister (RSrandom.cpp). Seeded by user or system time.
- Seed persistence: passed to C++ via RS_random_seed global; deterministic replicate runs if seed is fixed.
- **Reproducibility**: good (within R/compiler version); no cross-platform guarantees.

**Relevance to zoom consistency**:
- **Not zoom-aware**. Landscape is fixed-resolution; finer/coarser views are not generated. MapMaker requirement for zoom consistency (whole-planet + regional patches with no discontinuities) **is NOT supported**. Regional simulations on extracted landscape tiles would require careful edge/boundary handling to avoid spurious dispersal at tile boundaries.

## 5. License

**SPDX**: GPL-3.0 (GNU General Public License v3.0, 29 June 2007)

**File paths**:
- RangeShiftR package: LICENSE.md (35 KB, full GPL-3.0 text) at root of RangeShiftR/ directory.
- RScore core: LICENSE (35 KB, GPL-3.0) at RangeShiftR/src/RScore/LICENSE.
- Both identical copies of GPL-3.0.

**Mixed/vendored licenses**: None detected. All source files carry GPL-3.0 header. Dependencies (Rcpp, RcppArmadillo, terra) have their own licenses (MIT, GPL, Apache-2.0), which are compatible with GPL-3.0 (linking is permitted).

**Matches manifest**: ✓ Yes. Manifest lists RangeShiftR as GPL-3.0 with file LICENSE; verified in repo.

**Practical notes**:
- **Reciprocal**: GPL-3.0 is copyleft; any extracted code or derivative must be GPL-3.0 (or compatible).
- **Compatibility with MapMaker**: MapMaker brief states license conflicts are ignored for now. **RangeShiftR extraction would require GPL-3.0 compliance** (not problematic if MapMaker is open-source; would be if commercial).
- **Sublicense constraint**: Cannot combine with Apache-2.0 or BSD-only code without careful review; GPL-3.0 + Rcpp (Apache/GPL mix) is standard in R ecosystem.

No license conflicts within RangeShiftR itself.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Not applicable; assumes static landscape |
| Heightmap generation | no | — | — | — | Assumes user-supplied raster; fractal synthetic only |
| Erosion | no | — | — | — | No landscape evolution |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | Not simulated; can be encoded in habitat classes |
| Climate – temperature | partial | 2 | loose | class_SimulationParams.R | Can force habitat quality via time-series input; no climate model |
| Climate – wind | no | — | — | — | Not modeled |
| Climate – ocean currents | no | — | — | — | Not modeled |
| Climate – precipitation | partial | 2 | loose | class_SimulationParams.R | Can force habitat quality via time-series input; no climate model |
| Climate – seasons | yes | 2 | loose | class_SimulationParams.R | Within-year generational dynamics; no seasonal phenology model |
| Biomes | partial | 2 | loose | Landscape.{cpp,h}; class_LandParams.R | Habitat classes as proxy; no classification/derivation algorithm |
| Soils | no | — | — | — | Not modeled |
| Resources | no | — | — | — | Not modeled |
| Population & settlement | **yes** | **4** | **loose** | Individual/Population/Community/{cpp,h} | Full individual-based dynamics; settlement via habitat suitability & mate-finding |
| Cities & towns | no | — | — | — | Not modeled |
| Languages & names | no | — | — | — | Not modeled |
| Political borders | no | — | — | — | Not modeled |
| Trade | no | — | — | — | Not modeled |
| Long-run history/war/economics/politics sim | partial | 2 | tangled | NeutralTrait/GeneticFitnessTrait/{cpp,h} | Evolutionary dynamics only (genetic response, bottlenecks); no social/economic/political simulation |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | Fixed single-resolution grid; no zoom consistency guarantee |
| Globe view | no | — | — | — | No 3D globe rendering |
| Flat projections | no | — | — | — | No projection support; assumes user-provided rasters in correct CRS |
| Partial-world inference | no | — | — | — | MapMaker req. for inferring surrounding tectonic/climate context from region; not supported |
| Import of heightmaps/layers | yes | 3 | standalone | Landscape/{cpp,h}; class_LandParams.R | Can read ArcGIS ASCII, GeoTIFF (via terra); limited to raster grids |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No adaptive refinement; single-fidelity run per seed |
| Export (PNG/SVG/STL/other) | partial | 2 | tangled | output_handling.R | Exports CSV tables and raster grids (can be visualized externally); no native PNG/SVG export |
| Full-state save/resume format | partial | 1 | tangled | RunRS.R; output_handling.R | Can save population CSV snapshots; lossy resume (no checkpoint of internal RNG state) |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | No built-in calibration; user must supply pre-calibrated habitat rasters |
| Planet-parameter derivation | no | — | — | — | No derivation engine; user supplies all parameters directly |

## 7. Verdict

**What to extract**:
1. **Individual-based population dynamics engine** (Individual/Population/Community core logic; ~800 LOC). Excellent reference for dispersal kernels, mate-finding, Allee effects, density-dependent settlement.
2. **Quantitative genetic framework** (GeneticFitnessTrait/NeutralTrait; ~600 LOC). Solid additive model for trait evolution; useful for long-run historical population adaptation.
3. **Landscape raster I/O** (Landscape/Cell/Patch grid logic; ~400 LOC). Basic but robust grid data structure; can adapt to browser-based tile handling.
4. **Parameter schema and class design** (R classes for DemogParams, DispersalParams, GeneticsParams). Good template for modular, well-documented parameter management.

**What to skip**:
- Full R interface layer (11k R LOC is R-specific; JS/TS rewrite needed anyway).
- C++20 codebase without WASM port (too heavy; recommend pure JS rewrite of algorithms).
- Fractal landscape generation (basic; better alternatives exist in orogen).
- Management/translocation module (minor feature; can defer).

**Biggest risks**:
1. **Browser porting**: C++20 → WASM is unfeasible without substantial build infrastructure; full JS port is needed. **High effort (3–6 weeks for core pop. dyn. + genetics).**
2. **Single-resolution grid**: No zoom consistency. Extracting for MapMaker's multi-resolution requirement requires designing overlay scheme (e.g., fine-grained regional patches on coarse global grid) — **non-trivial added complexity**.
3. **Landscape not generated**: RangeShiftR is **input-driven**, not **generative**. User must supply habitat rasters; no calibration to Earth data. MapMaker requirement for "derive from world parameters" is incompatible — need coupling to climate/biome generators (CESM, LPJmL, etc.).
4. **No full-state checkpoint**: Can export population snapshots but not resume with identical RNG state. Small issue for MapMaker (can re-run with seed), but complicates interactive map editing.

**Open questions**:
- How to integrate with MapMaker's biome/climate derivation pipeline? RangeShiftR expects habitat rasters; would need adapter layer from climate model outputs.
- Should settlement model include explicit resource depletion (food, water) or remain coarse habitat-suitability based?
- Multi-resolution tile strategy: overlap/stitch individual-based sims across zoom levels, or nest finer grids within coarse patches?

**Overall assessment**: 
**Strong match for Population & Settlement subsystem; weak/no match for world generation.** Recommended for extracting core demographic and evolutionary algorithms. Requires substantial integration work (climate/biome coupling, browser porting, multi-resolution design). **Do not attempt full-stack port; extract algorithms only.**
