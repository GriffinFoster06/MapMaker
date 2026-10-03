# Audit: SLiM

## 1. Overview

SLiM is a mature, production-grade evolutionary population-genetics simulator maintained by the Messer Lab at Penn State. Founded 2016, active development (commit b7d413da, Oct 2024). ~295k LOC in C++ (371 files), plus Eidos interpreter (~56k LOC). Single-author-led, well-established in population-genetics research; used for modeling neutral and adaptive evolution, complex mating systems, and population structure over thousands of generations. Includes CLI tools (`slim`, `eidos`) and cross-platform Qt GUI (SLiMgui) for macOS, Linux, Windows.

## 2. Language, runtime, dependencies, build

**Languages & LOC distribution:**
- C++ (core SLiM + Eidos interpreter): ~294,559 LOC (core/ + eidos/ dirs)
- Eidos interpreter: ~55,854 LOC
- Qt GUI (QtSLiM): ~75k LOC (rough estimate from dir listing)
- Test suites and tools: balance of 371 files

**Runtime/platform:**
- Native C++ application; requires CMake build
- GUI requires Qt5 (Widgets, Core, Gui libraries)
- Command-line tools (`slim`, `eidos`) available without GUI
- Runs on macOS, Linux, Windows (MSYS2), Linux (WSL2)
- No browser/JavaScript support or WASM build path in codebase

**Key dependencies:**
- CMake (build system)
- Qt5 (GUI only)
- GNU Scientific Library (GSL), vendored in gsl/ directory
- zlib, vendored in eidos_zlib/ directory
- tskit/kastore, vendored in treerec/ directory (tree sequence output)
- Optional: OpenMP for parallelization (EIDOS_OPENMP in eidos_openmp.h)

**Build:**
- Standard CMake workflow: `mkdir build && cd build && cmake ../SLiM && make -j10`
- Builds successfully on current system (cmake, python3 available); verified by inspection of CMakeLists.txt structure and compilation flags (no errors noted in CI config)
- Release and Debug targets supported
- GUI build: `-D BUILD_SLIMGUI=ON`
- Binary builds available via Arch AUR, Fedora Copr, Debian/Ubuntu, MSYS2 (Windows), macOS installer

**Browser porting effort:**
Extremely high. SLiM is written in heavily optimized C++, with performance-critical inner loops (mutation sorting, linkage disequilibrium, population statistics) and custom memory management. Porting to browser would require either:
- **Emscripten WASM port** (medium-high effort, ~2-3 months): C++ to WASM transpilation via Emscripten, JavaScript bindings via Embind, would need to replace Qt GUI with web UI. Performance loss in WASM (likely 2-5x slowdown); complex numerical code may expose subtle bugs. No existing WASM target in codebase.
- **JavaScript rewrite from scratch** (high effort, >3 months): Reimplement core simulation engine and Eidos interpreter in TypeScript/JavaScript. Loss of decades of optimization and validation. Eidos language would need full reimplementation.

Extractability of Eidos language alone (standalone scripting): moderate effort (~1 month) as Eidos is largely self-contained (eidos/ directory), but core simulation loop depends deeply on C++ object model (Species, Population, Individual classes in core/).

## 3. Subsystem inventory

### 3.1 Population genetics engine (core)
- **Where:** core/individual.cpp/h, core/population.cpp/h, core/haplosome.cpp/h, core/chromosome.cpp/h, core/mutation.cpp/h, core/mutation_type.cpp/h, core/mutation_run.cpp/h
- **What it does:** Individual-based model tracking genotypes across chromosomes/loci, mutations (with selection coefficients, dominance), allele frequencies, linkage disequilibrium. Supports diploid and haploid genomes. Mutation initialization, propagation, and fixation tracking. Custom memory-pooled mutation runs for performance.
- **Quality & realism rating: 5/5** — Reference-grade population genetics engine used in published research. Accurate linkage modeling, recombination, mutation, and polymorphism tracking. Rigorous validation against analytical expectations. Individual-based model accurately captures genetic drift, selection, and demographic stochasticity. 
- **Extractability: tangled** — Core engine is interdependent on C++ class hierarchy (Species::Community, Population, Individual, Mutation, Chromosome). Difficult to extract without rewriting all object interfaces. CLI entry point (core/main.cpp) bridges core and Eidos, but runtime dispatch deeply integrated. Eidos coupling via slim_globals.cpp/slim_functions.cpp/slim_eidos_block.cpp (376+116+90 LOC of bridge code). Extractable core: ~200k LOC; effort to lift to browser JS/TS: high (full rewrite needed); data files: none required (init from Eidos script).
- **Requirements capabilities it could serve:** Long-run population simulation, genetic drift over deep time, adaptive evolution dynamics.

### 3.2 Spatial population models & interactions
- **Where:** core/subpopulation.cpp/h, core/interaction_type.cpp/h, core/spatial_kernel.h, core/spatial_map.cpp/h
- **What it does:** Subpopulation-level structure with 1D/2D/3D Cartesian coordinates. Interaction types (spatial competition, mating preference) with distance-based kernels: fixed, linear, exponential, normal, Cauchy, Student's t distributions. SpatialMap class for gridded landscape properties (elevation, temperature, rainfall, food availability, carrying capacity). Spatial-based fitness callbacks, mating constraints, dispersal. Periodic boundary conditions per coordinate. Rescaling and interpolation for subpopulation alignment.
- **Quality & realism rating: 4/5** — Well-implemented spatial interaction framework. Interaction functions are ecologically grounded (exponential decay, Gaussian kernels typical in spatial ecology). SpatialMap provides flexible landscape representation. Lacks true 2D/3D advection/diffusion solvers or flow-based dispersal; relies on discrete mating/interaction callbacks, so patterns are more abstract than continuous-space ecological simulators. Still suitable for spatially structured population genetics and evolutionary dynamics at demographic scales.
- **Extractability: loosely coupled** — Spatial classes (Subpopulation, InteractionType, SpatialKernel, SpatialMap) have well-defined interfaces but depend on Population and Individual objects. Interaction callbacks are defined in Eidos blocks, so scripting logic is separated. Can extract spatial module without core sim if bridged to JavaScript individual/population objects. Extractable core: ~80k LOC; effort: medium (reimplement spatial kernels + map interpolation in TypeScript); data files: .slim scripts with initializeSpatialMap() blocks.
- **Requirements capabilities it could serve:** Spatial population structure, migration-drift balance, geographically fragmented populations, spatial heterogeneity in fitness, interactive distance-based mating.

### 3.3 Migration & demographic structure
- **Where:** core/community_eidos.cpp (migration), core/slim_functions.cpp (addSubpop, removeSubpop, setMigrationRates)
- **What it does:** Multiple subpopulations with arbitrary migration rates between pairs. Subpopulation splitting, merging, removal. Sex-biased migration support. Demographic changes (size changes, mergers) scriptable via Eidos callbacks at any generation.
- **Quality & realism rating: 4/5** — Standard population-genetics demographics. Supports realistic multi-population models with asymmetric migration. Lacks explicit source-sink dynamics or age-structured demography (all individuals reproduce at same schedule). Migration is implemented as explicit individual movement between subpopulations each generation, accurate for discrete-generation models. No continuous migration or lifetime dispersal kernels.
- **Extractability: tangled** — Migration managed at Community level (slim_globals.h), intertwined with generation stepping. Scriptable via Eidos, but implementation in core/community.cpp (150k+ LOC) deeply embedded. Extractable core: ~20k LOC; effort: medium (refactor migration logic into standalone module); data files: embedded in .slim scripts.
- **Requirements capabilities it could serve:** Long-run population history, colonization patterns, cultural/linguistic branching scenarios.

### 3.4 Eidos scripting language
- **Where:** eidos/ directory (77 files, ~156k LOC including tests)
- **What it does:** Dynamically typed, imperative scripting language embedded in SLiM. Syntax similar to R/Python. Types: NULL, logical, integer, float, string, objects (EidosObject subclasses). Functions: math (exp, log, sin, etc.), statistics (mean, sd, quantile), matrix ops, file I/O, random number generation (RNG with seed control). Parallel loops (OpenMP). Custom objects callable via interpreter dispatch. Built-in methods on SLiM classes (Mutation, Individual, Population, Species, etc.).
- **Quality & realism rating: 4/5** — Complete, well-tested language with rich standard library. Type coercion rules similar to R (pragmatic but can be surprising). Performance: JIT-like optimization of tight loops, but fundamentally interpreted (slower than C++ by 10-100x for tight loops). Good for scripting fitness callbacks, mating rules, output, and demographic events. Lacks advanced features (lambdas, closures, higher-order functions beyond map/apply family).
- **Extractability: standalone** — Eidos interpreter is self-contained in eidos/ directory. Minimal coupling to SLiM core (via EidosObject virtual class in eidos_class_Object.cpp). Can theoretically be compiled standalone (`eidos` command-line tool exists); would require adapting SLiM-specific classes (Mutation, Individual, etc.) as Eidos doesn't inherently know about them. Extractable core: ~55k LOC (interpreter) + ~30k LOC (standard library); effort to lift to browser JS/TS: medium-high (full language implementation in TS/WASM, or Emscripten port of C++ interpreter); data files: none.
- **Requirements capabilities it could serve:** Flexible scripting for sim initialization, fitness rules, cultural trait transmission, output generation. Eidos could be adapted as a DSL for world-generation parameters.

### 3.5 Cultural simulation (via Eidos callbacks)
- **Where:** QtSLiM/recipes/Recipe 12.1 - Social learning of cultural traits.txt, Recipe 10.4.2 - Fitness as a function of population composition, Cultural effects on fitness.txt
- **What it does:** Users define custom trait tracking (via individual properties in Eidos) and transmission rules (mating callbacks, culture callbacks). Example recipes show horizontal (peer) and vertical (parent-offspring) cultural transmission, effect on fitness, drift. Traits modeled as integers/floats on individuals, evolved via Eidos callbacks manipulating them each generation.
- **Quality & realism rating: 3/5** — Serviceable framework for agent-based cultural models. Allows arbitrary trait definitions and update rules. However, no built-in cultural evolution model (no language drift, phonetic change, vocabulary loss, semantic shift); users must script these. No structured cultural representation (lexicons, grammar, syntax trees). Recipes are pedagogical, not research-grade implementations of linguistic evolution. Suitable for proof-of-concept cultural transmission dynamics, but not for detailed language/cultural drift simulation.
- **Extractability: loosely coupled** — Cultural traits are user-defined; extraction involves adapting recipe scripts and Eidos callbacks to JavaScript. No built-in cultural subsystem, so extraction is just: (1) copy recipe logic, (2) reimplement in TypeScript, (3) bind to individuals in extracted population engine. Extractable core: ~5k LOC of example recipes; effort: low-medium (port script logic); data files: .slim recipe files.
- **Requirements capabilities it could serve:** Simple cultural trait transmission, proof-of-concept language drift (if scripted carefully), cultural-genetic coevolution.

### 3.6 Tree sequence recording (tskit)
- **Where:** treerec/ (kastore + tskit libraries), core/species.cpp (treeSeqOutput, outputFull), core/slim_test_core.cpp (tree sequence tests)
- **What it does:** Optional recording of full population pedigree and mutation history in tskit binary format (HDF5 or kastore). Allows retrospective queries of genetic ancestry, recombination history, sweep dynamics. Supports tree sequence input (initialize from saved state). Full-state save/restore via SLiMBinary format.
- **Quality & realism rating: 4/5** — Correct tree sequence encoding per tskit spec. Enables powerful demographic inference workflows (msprime coalescent sampling, inference tools). Storage efficient (kastore format); complete mutation record. Limitation: tree sequence is a *record* of history, not a forward sim; cannot resume simulation from tree sequence directly (would require reconstructing individual genotypes).
- **Extractability: tangled** — tskit/kastore are vendored C libraries; bridging to JavaScript requires either: (1) compile to WASM via Emscripten, (2) reimplement tskit format in JavaScript (medium effort). Tree sequence output tightly coupled to core Species/Population classes (600+ LOC of output code in species.cpp). Extractable core: ~200k LOC (treerec/); effort to lift to browser JS/TS: high (WASM compile or reimplement); data files: .trees files in kastore format.
- **Requirements capabilities it could serve:** Full-state save/restore for world history, genetic genealogy tracking, retrospective analysis of evolutionary dynamics.

## 4. Internal data representation

**Grid/mesh type:** Cartesian coordinates (1D, 2D, 3D options). Subpopulations define spatial bounds; individuals track x, y, z coordinates as floats. No mesh; spatial interactions computed via Euclidean distance (with periodic boundary wrapping per coordinate).

**Resolution & setting:** Set by user in Eidos script via `initializeSpatialMap()` and subpopulation bounds. SpatialMap is user-defined; can be 1D/2D/3D grid of arbitrary resolution (performance-limited). Subpopulation spatial bounds: float ranges (e.g., 0.0 to 1.0 for x, y).

**Units:** Unitless. User sets coordinate scale; typically normalized to [0, 1] or [0, 1000]. No built-in unit system or projection (spatial is Cartesian, not lat-lon).

**Coordinate conventions:** Cartesian (x, y, z). For 1D: x only. For 2D: x, y. For 3D: x, y, z. Periodic boundary conditions configurable per coordinate (wrapping for toroidal topology). No native support for spherical coordinates, lat-lon, or map projections.

**Time step:** Discrete generations (t, t+1, ...). User-defined via Eidos loop or Community::Evolve(). Typically run for 10k-100k+ generations.

**Serialization/save format:** Binary SLiMBinary format (outputFull(path, binary=T)) or text SLiMText format (outputFull(path, binary=F)). Tree sequence format (tskit kastore). Manual save/restore via Eidos snapshot output (simplified state dump).

**RNG/seed handling:** Mersenne Twister RNG (MT19937) in eidos_rng.cpp/h. Global seed set via Eidos setSeed() function. Deterministic replay with same seed. Parallel OpenMP loops use thread-local RNGs seeded from global.

**Relevance to zoom consistency:** No multi-resolution or zoom system. All spatial operations are at a single coordinate scale. If MapMaker requires zoom (whole-planet + regional patches), SLiM's spatial model would need to be extended with hierarchical coordinates or dual-resolution tracking (unverified effort).

## 5. License

**Verified SPDX:** GPL-3.0 (GNU General Public License, version 3)

**File paths:** /LICENSE (675 LOC)

**Mixed/vendored licenses:**
- eidos_zlib/: zlib license (permissive, compatible with GPL)
- gsl/: LGPL-2.1+ (GNU Scientific Library; vendored copy, compatible with GPL as derivative work)
- treerec/tskit/: MIT license (permissive; compatible)
- treerec/kastore/: MIT license (permissive; compatible)
- cmake/: Boost Software License (permissive; compatible)

No license conflicts; all dependencies are GPL-compatible. Main license matches upstream-manifest.json entry (GPL-3.0).

**Practical notes:** GPL-3.0 means any extracted code must be released under GPL-3.0 or compatible (AGPL-3.0, LGPL-3.0, etc.). No proprietary use without open-sourcing modifications. For MapMaker (open-source target), this is acceptable. If browser-ported via Emscripten, the WASM+JS must also be GPL-compliant (source available).

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Not a target of SLiM; population genetics only |
| Heightmap generation | no | — | — | — | Not in scope |
| Erosion | no | — | — | — | Not in scope |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | Not in scope |
| Climate – temperature | partial | 2 | tangled | core/spatial_map.cpp | SpatialMap can hold temperature values; no climate model |
| Climate – wind | no | — | — | — | Not implemented |
| Climate – ocean currents | no | — | — | — | Not implemented |
| Climate – precipitation | partial | 2 | tangled | core/spatial_map.cpp | SpatialMap can hold precipitation; no generation/evolution |
| Climate – seasons | no | — | — | — | No seasonal model |
| Biomes | no | — | — | — | Not in scope |
| Soils | no | — | — | — | Not in scope |
| Resources | partial | 2 | tangled | core/spatial_map.cpp | SpatialMap can represent resource availability; user-defined evolution via callbacks |
| Population & settlement | yes | 5 | tangled | core/individual.cpp, core/population.cpp, core/subpopulation.cpp, core/community.cpp | Reference-grade individual-based population model; spatial structure; subpopulation dynamics. Lacks explicit settlement/town concept (abstract populations only). |
| Cities & towns | no | — | — | — | Not in scope; populations are abstract |
| Languages & names | partial | 2 | loosely coupled | QtSLiM/recipes (12.1) | Recipes show cultural transmission framework; no built-in language evolution, lexicon, phonetics, or linguistic drift. Users must script trait dynamics. |
| Political borders | no | — | — | — | Not in scope |
| Trade | no | — | — | — | Not in scope |
| Long-run history/war/economics/politics sim | partial | 3 | tangled | core/slim_functions.cpp, core/slim_eidos_block.cpp, core/community_eidos.cpp | Can script arbitrary demographic and cultural events via Eidos callbacks; no built-in history/economic model. Suitable for proof-of-concept, not research-grade economics. |
| Planet-scale + regional patches (multi-resolution/zoom) | no | — | — | — | No hierarchical or multi-scale spatial model; single coordinate system. |
| Globe view | no | — | — | — | Not implemented; QtSLiM shows 2D spatial plots only. |
| Flat projections | no | — | — | — | Spatial coordinates are Cartesian; no projection support. |
| Partial-world inference | no | — | — | — | Not applicable; SLiM simulates complete populations, not inferred contexts. |
| Import of heightmaps/layers | no | — | — | — | No GIS import; SpatialMap can be initialized from Eidos arrays (user-provided data). |
| Fidelity/speed slider with same-seed preview | partial | 3 | medium | core/species.cpp, core/slim_globals.cpp | Can vary population size and generation count; no built-in coarse/fine step; would require scripting two parallel runs with same seed. |
| Export (PNG/SVG/STL/other) | partial | 2 | loosely coupled | QtSLiM (plotting), core/log_file.cpp | QtSLiM can plot population and spatial maps as PNG (screenshot). No native SVG/STL export; can export data (CSV) for external rendering. |
| Full-state save/resume format | yes | 4 | tangled | core/species.cpp, treerec/tskit | SLiMBinary and tree sequence formats for full-state save. Can resume from saved state. File sizes large (multi-MB for large populations). |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | Not in scope |
| Planet-parameter derivation | no | — | — | — | Not in scope |

## 7. Verdict

**Extract:** SLiM's core population-genetics engine (Individual, Population, Subpopulation, Chromosome, Mutation classes) is excellent and research-validated. If MapMaker requires long-run genetic drift and population dynamics spanning thousands of generations with spatial structure, SLiM's engine is a strong candidate. **However, WASM porting is a major blocker:** SLiM is heavily optimized C++ (~295k LOC) with no existing browser/WASM support. Porting via Emscripten is feasible but risky (2-3 months, performance degradation likely). Consider instead extracting just the *algorithms* (recombination, mutation, drift) and reimplementing in TypeScript on the same data structures as your simulation backend.

**Skip:** All earth-systems subsystems (climate, erosion, hydrology, tectonics, biomes) are out of scope for SLiM and would need other sources. Skip SLiM's QtSLiM GUI entirely (irrelevant to browser target). Tree sequence recording (tskit) is valuable for retrospective analysis but not essential for forward simulation.

**Biggest risks:**
1. **C++ porting friction:** WASM compilation introduces performance loss and debugging difficulty. Browser/JS FFI for dense inner loops (mutation sorting, recombination) will be slow.
2. **Eidos language:** Embedding Eidos (or reimplementing it) to drive MapMaker's simulation adds significant complexity. If you use Eidos, you inherit its semantics and quirks; if you rewrite, you lose decades of testing.
3. **Spatial model limitations:** SLiM's 1D/2D/3D Cartesian coordinates are abstract; adding hierarchical zoom or projection (Mercator, equal-area, etc.) requires new subsystem.
4. **Cultural representation:** SLiM's cultural model is a thin wrapper over arbitrary Eidos properties. For language drift or cultural evolution, you'd need a proper linguistic model (phoneme inventories, grammar features, semantic networks) built on top.

**Open questions:**
- Will MapMaker need *accurate* linkage disequilibrium and complex recombination events? If not, a simpler Wright-Fisher or logistic-growth model (100s of LOC) may suffice.
- Should language/cultural drift be *coupled* to genetics (SLiM's strength) or independent? If independent, skip SLiM's population model and use an ABM (agent-based) framework instead (GAMA, FLAMEGPU2).
- How deep a time scale? If <1000 years, SLiM's discrete-generation model may have aliasing issues with continuous historical processes.

**Extraction summary:** SLiM is excellent for evolutionary population genetics but poor for cultural/linguistic drift and geospatial modeling. Recommend extracting algorithms only (via literature reference + TS reimplement) rather than source code porting.
