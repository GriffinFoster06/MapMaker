# Audit: FLAMEGPU2

## 1. Overview
FLAME GPU 2 is a GPU-accelerated agent-based simulation library designed for domain-independent complex systems modeling. Developed by researchers at the University of Sheffield and maintained as an active open-source project, it abstracts CUDA/C++ complexity to allow modelers to focus on agent behavior. The codebase consists of ~35,600 lines of C++/CUDA headers, ~20,000+ lines of implementation across 95 source files (mostly .cu and .cpp), with 9 example models (boids, circles, game of life, sugarscape, diffusion, ensemble, pedestrian navigation, host functions tests). Status: pre-release (release candidate), with Python bindings available via pre-compiled wheels.

## 2. Language, runtime, dependencies, build

**Languages:** C++ (host code) and CUDA C++ (device code); Python bindings via SWIG. Approximate distribution: ~60% CUDA (.cu), ~30% C++ (.cpp/.h), ~10% Python/SWIG.

**Runtime:** GPU-accelerated parallel execution; requires NVIDIA CUDA 12.0+ (12.4+ on Windows), NVIDIA GPU with Compute Capability ≥ 5.0. Does NOT run in browsers. Does NOT run on CPU-only systems (CUDA is mandatory, no fallback). Python wheels available for Python 3.10+, but these still require CUDA driver/libraries installed.

**Key dependencies:**
- CMake ≥ 3.25.2
- CUDA ≥ 12.0 (Windows: 12.4+)
- C++20-capable compiler (MSVC 2022/2026 on Windows; GCC ≥ 10 on Linux)
- Optional: Python 3.10+, SWIG ≥ 4.1.0 (for Python bindings)
- Optional: Doxygen (documentation), SDL/GLEW/FreeType/DevIL/GLM (desktop visualizer)
- No heavy external scientific dependencies; uses jitify for runtime CUDA code compilation

**Does it build?** Inferred from CMake config and build files. Does not require external data files. Requires CUDA toolkit and compatible compiler; without these, only documentation-only build is possible (CMakeLists.txt lines 28–69 document this fallback).

**Browser-runnable?** NO. This is a desktop/HPC framework. WASM porting would require:
- Complete rewrite from CUDA to JavaScript/WebGL/WebGPU (~20K–30K lines)
- Simulation algorithm must remain platform-agnostic (it does, but all I/O and platform-specific code would need reimplementation)
- No CUDA runtime equivalent in browser; would need GPU.js, WebGPU, or significant algorithmic restructuring for CPU mode
- Estimated effort: HIGH (6–12 months for a competent team to port a non-trivial model)

## 3. Subsystem inventory

FLAMEGPU2 is a **framework, not a domain application**. It provides ABM infrastructure; users write domain-specific models. Examples listed below are provided models, not subsystems of the framework itself.

### 3.1 Agent-based simulation engine
- **Where:** `include/flamegpu/model/`, `include/flamegpu/simulation/`, `src/flamegpu/simulation/` (CUDASimulation.cu, Simulation.cu, AgentVector.cpp, LogFrame.cu)
- **What it does:** Multi-agent discrete-time simulation on GPU. Agents have typed properties; functions operate on agents; messaging system (Spatial2D/3D, Brute-Force, Array, Bucket) enables local communication. Supports agent birth/death, sub-models, ensemble runs, MPI-based distributed ensemble (optional).
- **Quality & realism rating: 4/5** Research-grade framework, well-tested, published in peer-reviewed venues. Supports large-scale (10M+ agents easily). Not inherently realistic (realism depends entirely on user-defined model). Proven in production academic simulations.
- **Extractability: loosely coupled** Core simulation is self-contained in simulation/ and model/ dirs (~8K LOC). Dependencies: CUDA runtime (platform-specific), jitify (JIT compiler, bundled), logging framework. Messaging is well-encapsulated. Device functions compile to CUDA kernels at runtime. To extract: would need to port CUDA code generation and messaging layer to target platform.
- **Requirements capabilities it could serve:** Population & settlement (IF user writes a model); Long-run history/war/economics/politics (IF user writes detailed socio-economic model). Nothing else directly applicable without domain code.

### 3.2 Messaging and communication
- **Where:** `include/flamegpu/runtime/messaging/` (MessageSpatial2D, MessageSpatial3D, MessageBruteForce, MessageArray*, MessageBucket, MessageNone)
- **What it does:** Data exchange between agents each timestep. Spatial messaging uses spatial acceleration (hash grids in 2D/3D). Brute-force broadcasts all agents to all. Array/Array2D/Array3D for grid/lattice models. Bucket for value-key aggregation.
- **Quality & realism rating: 4/5** Efficient and well-designed. Spatial messaging uses proven GPU acceleration patterns. Not domain-specific, but solid infrastructure.
- **Extractability: standalone** Messaging layer is independent of simulation engine. ~3K LOC. Could be extracted to implement local communication in any agent model. Effort to adapt to JS: medium (needs spatial hash algorithm in JS, manageable).
- **Requirements capabilities it could serve:** Foundational for any agent-based subsystem (settlement, population, trade networks, etc.).

### 3.3 I/O and logging
- **Where:** `include/flamegpu/io/` (JSONLogger, XMLLogger, JSONStateReader, JSONStateWriter, StateReader, StateWriter, Telemetry); `src/flamegpu/io/`
- **What it does:** Serialize agent state to JSON/XML snapshots; log per-timestep agent statistics (reductions, custom functions). Full state save/restore capability.
- **Quality & realism rating: 4/5** Functional state serialization. JSON/XML human-readable. Statistics logging is complete. No custom binary format, so state files are portable and debuggable.
- **Extractability: standalone** ~4K LOC. Independent of CUDA; pure serialization logic. No domain knowledge embedded.
- **Requirements capabilities it could serve:** Full-state save/resume format; calibration data import/export.

### 3.4 Environment and properties
- **Where:** `include/flamegpu/model/EnvironmentDescription.h`, `include/flamegpu/runtime/environment/`
- **What it does:** Global simulation state (environment properties: scalars, arrays, directed graphs). Properties are read-only to agents (no races). Used for parameters, constants, and external data.
- **Quality & realism rating: 3/5** Sufficient for parameter passing; directed graph support enables network/topology data. No spatial grid or implicit fields; no climate/terrain data structures.
- **Extractability: standalone** ~6K LOC. Pure data structure and accessor code. Could be extracted.
- **Requirements capabilities it could serve:** Parameter storage for any simulation; import of pre-computed layers/climate data as environment arrays.

### 3.5 Desktop visualization
- **Where:** `include/flamegpu/visualiser/` (ModelVis, AgentVis, PanelVis, LineVis, EnvironmentGraphVis, color/)
- **What it does:** Real-time visualization of agent positions/velocities, scalar overlays, graphs. Requires SDL, GLEW, FreeType, DevIL. Desktop application only.
- **Quality & realism rating: 2/5** Adequate for monitoring simulation state; limited to agent visualization. No map rendering, no terrain, no climate visualization. Not a mapping tool.
- **Extractability: tangled** Depends on SDL/OpenGL stack. ~8K LOC of visualization code. Would require complete rewrite to support browser (WebGL/Canvas). Effort: high. Not worth extracting; build web UI from scratch.
- **Requirements capabilities it could serve:** None for MapMaker (needs web-based visualization with map support, not agent swarm display).

### 3.6 Example models (reference implementations)
- **Boids** (`examples/cpp/boids_*`): Flocking model (separation/alignment/cohesion). No realism to terrain.
- **Circles** (`examples/cpp/circles_*`): Collision dynamics. Generic.
- **Sugarscape** (`examples/cpp/sugarscape/`): Resource dynamics on grid. Minimal (cells as agents; implicit individual agents). Could inspire population/resource interaction but provides no base model.
- **Game of Life** (`examples/cpp/game_of_life/`): Cellular automata. Not applicable to MapMaker.
- **Diffusion** (`examples/cpp/diffusion/`): Heat/diffusion PDE on grid. Shows Array2D messaging; not applicable.
- **Pedestrian Navigation** (separate repo): Agent pathfinding/collision avoidance. Could inspire settlement movement, but no terrain/map integration.

None of the examples implement world-building, terrain, climate, or realistic population/settlement dynamics. All are generic ABM patterns. **Rating: 1–2/5 for MapMaker applicability.** Extractability varies by example (1K–3K LOC each), but without domain model, none are directly useful.

## 4. Internal data representation

**Agent data:** Type-safe property vectors (AgentVector<T>). Each agent is a struct with user-defined fields (scalars, arrays). No implicit spatial data; agent position is a property like any other.

**Grid/mesh:** No built-in representation. Users implement via agent properties or environment arrays. Spatial messaging operates on agent coordinates (x, y, [z]). No heightmap, no mesh data structure, no geographic CRS support.

**Resolution:** Unbounded (user-defined). Agents scale to 10M+ per simulation. Grid size (if used) is user-defined via environment or agent property.

**Units:** None enforced. Model is unit-agnostic. User responsible for consistency (e.g., if agents are at positions 0–1000, messaging radius must be in same units).

**Coordinates:** Cartesian (x, y, [z]). No spherical coordinates, no lat/lon, no projection support. Spatial messaging treats bounds as min/max box; wrapping/toroidal topologies supported but must be coded by user.

**Time:** Discrete timesteps. No continuous time. Timestep duration is semantic (user interprets).

**Serialization:** JSON or XML (full agent/environment state). Binary format: none. State file size scales with agent count; no compression in default I/O.

**RNG:** CUDA cuRAND via `flamegpu::random::` wrapper (Philox PRNG, device-side). Seeding supported for reproducibility. Same seed ≠ guaranteed same sequence across platforms (CUDA versions may differ); same seed ≠ guaranteed same result if agent count/order changes.

**Multi-resolution/zoom consistency:** No inherent support. User must implement parent-child model hierarchies (FLAME GPU supports sub-models). No automatic level-of-detail or mesh refinement. **Not suitable for consistent zoom without custom work.**

## 5. License

**SPDX:** AGPL-3.0 (verified in `/Users/griffinfoster/Projects/MapMaker/upstream/FLAMEGPU2/LICENSE.md`)

**File:** LICENSE.md (35K, full AGPL-3.0 text)

**Mixed/vendored:** 
- jitify (embedded in src/): BSD-licensed, included source. OK to use.
- SWIG bindings (swig/python/): standard SWIG output, no license conflict.
- No per-file license overrides found.

**Matches manifest:** Yes (AGPL-3.0).

**Practical notes:** AGPL-3.0 is **strong copyleft**. If MapMaker extracts FLAME GPU code and deploys the result as a networked service (including web app), MapMaker and any modifications must be released under AGPL-3.0 or compatible (e.g., GPL 3.0). If MapMaker is licensed MIT/Apache-2.0, this is a **license conflict** (copyleft ← permissive is a known incompatibility issue, though the project brief notes license conflicts are recorded but ignored for now). Static linking of AGPL code into a web-deployed app triggers the network distribution clause; source code would need to be available to users. **Legal review recommended before extraction.**

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Framework has no domain; would require writing plate/deformation model |
| Heightmap generation | no | — | — | — | No terrain module. User must provide. |
| Erosion | no | — | — | — | No erosion model. |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | No flow simulation. |
| Climate – temperature | no | — | — | — | No climate model. |
| Climate – wind | no | — | — | — | No wind/circulation model. |
| Climate – ocean currents | no | — | — | — | No ocean model. |
| Climate – precipitation | no | — | — | — | No precipitation model. |
| Climate – seasons | no | — | — | — | No seasonal forcing. |
| Biomes | no | — | — | — | No biome classification. |
| Soils | no | — | — | — | No soil model. |
| Resources | no | — | — | — | Framework can track agent properties; user defines resource dynamics. |
| Population & settlement | partial | 2 | loose | model/, simulation/, io/ | Framework supports agent populations; no pre-built settlement model. Examples do not include settlement. User must write socio-spatial model. |
| Cities & towns | no | — | — | — | No urban model. |
| Languages & names | no | — | — | — | No linguistic/naming module. |
| Political borders | no | — | — | — | No political simulation. |
| Trade | partial | 1 | loose | model/ (messaging) | Messaging layer could encode trade; no economic model or price dynamics. |
| Long-run history/war/economics/politics sim | partial | 2 | loose | model/, simulation/ | Framework suitable for microsimulation; user must model agents, rules, and dynamics. No base model provided. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | No hierarchical or multi-resolution support. Sub-models exist but no automatic LOD. |
| Globe view | no | — | — | — | Desktop visualizer only, no spherical rendering. |
| Flat projections | no | — | — | — | No projection support. |
| Partial-world inference | no | — | — | — | No inference engine. |
| Import of heightmaps/layers | partial | 2 | standalone | io/ (JSON state reader) | Can import agent state; no specialized raster/heightmap import. User must write loader. |
| Fidelity/speed slider with same-seed preview | partial | 1 | medium | simulation/ (RunPlan, logging) | RunPlan supports parameter sweeps; same seed does not guarantee reproducibility across different agent counts/orderings. Logging can capture state at different resolutions. |
| Export (PNG/SVG/STL/other) | no | — | — | — | No raster/vector export. Visualizer renders to screen only; no export pipeline. |
| Full-state save/resume format | yes | 4 | standalone | io/ (JSONStateWriter, JSONStateReader) | JSON/XML state snapshots support full resume. Portable, human-readable. |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | No Earth-data reference or calibration module. |
| Planet-parameter derivation | no | — | — | — | No parameter inference engine. |

## 7. Verdict

- **Not recommended for extraction as-is.** FLAMEGPU2 is a general-purpose ABM framework, not a world-building tool. It provides no terrain, climate, hydrology, tectonics, or biome simulation. Extracting it to MapMaker would amount to extracting a simulation engine and building everything on top of it—a large undertaking with high risk.

- **Potential use case (if value is compelling):** Population & settlement simulation and long-run historical/political/economic dynamics. If MapMaker needs realistic microsimulation of settlement growth, trade, conflict, and cultural evolution, FLAMEGPU2's agent infrastructure and messaging could be a foundation. However, this requires: (1) writing a complex domain model (18–24 months), (2) porting CUDA/C++ to JavaScript/WASM (6–12 months), (3) resolving AGPL-3.0 license conflict with MapMaker's license (legal review).

- **Biggest risks:** 
  - **License conflict:** AGPL-3.0 copyleft requires source-code release if deployed as a service. MapMaker's license is not yet stated; confirm compatibility with legal team.
  - **Language/platform:** CUDA C++ with Python wheels. No JavaScript or WASM. Full rewrite needed for browser.
  - **No domain models:** Requires building settlement/population/economics/politics models from scratch. FLAMEGPU2 provides only the simulation framework.

- **Better alternatives to explore first:** 
  - For population/settlement: LIAM2 (microsimulation, Python-based, more portable), UrbanSim (land-use & demography, Python), or RangeShiftR (population dispersal). These are closer to domain.
  - For long-run simulation: SLiM (population genetics, C++, but more focused), OpenSpiel (game theory, Python, cleaner architecture).

- **Unverified:** Whether FLAME GPU's same-seed reproducibility is sufficient for MapMaker's "same-seed preview" requirement (needs testing across different agent counts and orderings). Documentation does not guarantee this.

**Current git HEAD:** 5909ecccf90f6b05d9b2cb09de0d50b612420f9f (matches manifest)
