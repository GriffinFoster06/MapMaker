# Audit: OpenSpiel

## 1. Overview

OpenSpiel is a collection of environments and algorithms for research in general reinforcement learning and game theory, maintained by Google DeepMind. It provides a framework for multi-agent strategic games (e.g., chess, poker, Go, Hanabi), including implementations of 150+ games and 50+ RL/game-theoretic algorithms. The framework supports both perfect and imperfect information games, turn-based and simultaneous-move, zero-sum and general-sum. Latest commit: 48401890ee9857e611678302371378175a8e4c6b (master, Oct 2024). Approximately 301K LOC across 1432 files; ~782 C++ headers/sources and ~650 Python files; codebase is mature and actively maintained.

## 2. Language, runtime, dependencies, build

**Primary languages and LOC share:**
- C++ (~200K LOC): core game logic, state management, algorithms
- Python (~100K LOC): algorithm implementations, bindings to C++ core, examples, evaluation tools

**Runtime / platform:**
- Requires Python 3.11+ (official constraint; supports 3.11, 3.12, 3.13)
- Core C++ compiled via CMake to shared objects (.so, .pyd, .dll) and linked into Python
- CPU-only; no GPU acceleration built-in (optional TensorFlow/PyTorch for algorithms)
- Desktop/server only; no browser, Node.js, or WASM support
- Runs on Linux, macOS, Windows (separate Windows install docs)

**Key dependencies:**
- Build: CMake ≥3.15, Ninja (non-Windows), C++17 compiler
- Runtime: absl-py ≥0.10.0, attrs ≥19.3.0, numpy ≥1.21.5, scipy ≥1.10.1, ml-collections ≥0.1.1
- Optional (algorithms/viz): matplotlib, nashpy, networkx, pillow, pygame, pygraphviz, tensorflow, torch
- Heavyweights: Hanabi Learning Environment (bundled), Pokerkit (wrapper)

**Does it build?**
Build method inferred from setup.py (CMakeExtension + BuildExt) and pyproject.toml. Standard Python package build: `pip install -e .` triggers CMake compilation of C++ bindings. No attempt made to build (read-only constraint), but CI pipeline (.github/workflows/build_and_test.yml) indicates routine passing builds on Linux/macOS/Windows. No red flags in build files; dependencies are standard and available.

**Can it run in a browser as-is?**
No. OpenSpiel is Python/C++ desktop software with no JavaScript or WASM port. Porting would require:
- Rewriting C++ game core to either pure Python+JavaScript, or building WASM module (moderate effort: ~5K lines of core game interface, but then all algorithms also need porting or binding via WASM)
- No existing bindings to Emscripten; would need manual effort
- High coupling to Python's C extension API (type conversions, memory management)
- Estimated effort: high (month+ for a minimal subset; substantial for full feature parity)

## 3. Subsystem inventory

### 3.1 Game-theoretic abstractions
- **Where**: `open_spiel/spiel.h`, `open_spiel/spiel.cc`, `open_spiel/game_parameters.h`, `open_spiel/policy.h`, `open_spiel/observer.h` (~500 LOC core)
- **What it does**: Abstract API for representing extensive-form games (game tree with chance nodes, information sets, actions, rewards). Provides State, Game, Policy base classes; uniform interface for game queries (legal actions, observations, rewards). Action representation is integer-based; no domain-specific abstractions.
- **Quality & realism rating: 3/5** — Well-engineered abstraction (mature, tested, used in 100+ games), but generic to the point of abstraction-only (no domain modeling). Suitable for academic game theory, insufficient for simulating warfare dynamics or economic supply chains. No concept of agents with persistent identity across long time horizons or strategic relationships.
- **Extractability: standalone** — Core API is self-contained (one .h/.cc pair + headers). Extraction would yield ~500 lines of clean abstraction. Imports: std only. No external deps, no UI/framework coupling. Effort to lift to browser JS: medium (rewrite 500 LOC in TypeScript; test coverage exists).
- **Requirements capabilities it could serve**: Philosophical underpinning for multi-agent strategic reasoning in Political borders / Trade / Long-run history sim (as an abstract game framework, not a concrete model).

### 3.2 Strategic games (chess, poker, Go, etc.)
- **Where**: `open_spiel/games/` (104 subdirectories, one per game type, ~116K LOC total game implementations)
- **What it does**: Implementations of 150+ strategic board/card games. Each game is a Game subclass implementing rules, state transitions, and outcome computation. Games are purely procedural (no external data files for most).
- **Quality & realism rating: 1/5 for world sim use** — Individual games are well-implemented and tested (chess, poker verified against published sources; Go tested against AlphaGo benchmarks). But all games are abstract strategic puzzles with no spatial/climate/economic/civilizational content. Even the "world-adjacent" games (routing, mean-field games, social dilemmas) are toy models with simplified dynamics. No calibration to real-world data. Chess/poker have no negotiation or long-run memory; each game is isolated. Hanabi and Bridge have imperfect information but no persistent state or resource management.
- **Extractability: loosely coupled** — Each game is independent module (separate .cc/.h). Typical game ~500-2000 LOC. Imports only: Game base class, action/state/policy abstractions, Pokerkit/Hanabi libraries (for those games). UI: none (games are logic-only; visualization is external). Effort to lift to browser JS: medium per game (rewrite game logic; reuse abstract API). Zero to low dependencies on OpenSpiel infrastructure outside core API.
- **Requirements capabilities it could serve**: None directly. Indirectly, game-theoretic reasoning might inform negotiation/conflict modeling, but the games themselves are off-topic (chess teaches tactical thinking, not worldbuilding).

### 3.3 Trade/negotiation/bargaining games
- **Where**: `open_spiel/games/trade_comm/` (~3K LOC), `open_spiel/games/negotiation/` (~5K LOC), `open_spiel/games/bargaining/` (~3K LOC), `open_spiel/games/first_sealed_auction/` (~1K LOC), `open_spiel/games/coin_game/` (~2K LOC)
- **What it does**: Toy game models where agents negotiate, trade items, or bid. Trade_comm: 2 agents, ~10 items, 1 comm round, 1 trade round; reward for successful 1:1 trade. Negotiation: agents with different utilities allocate resources; reward depends on negotiated split. Bargaining: sequential offer/counter-offer. First-sealed-auction: agents bid for items; highest bidder wins at bid price. Coin_game: collaborative collection with hidden valuations.
- **Quality & realism rating: 2/5** — These are game-theoretic pedagogical models for studying communication and incentive alignment in RL. No economic depth (no production, consumption, supply chains, money, inflation, class structure). No historical dimension (no generational effects, no cultural evolution, no path dependency). Reward structure is trivial (binary success/failure, or simple splits). Agents have no memory, identity, or persistent relationships. Fundamentally unsuitable for simulating trade networks, economies, or diplomatic history. Baboon level compared to what would be needed for even a simplified fantasy economy.
- **Extractability: standalone** — Each game is ~1-5K LOC self-contained. No cross-game dependencies. Imports: Game base class only. No data files. Effort to extract and port to browser JS: low (rewrite game logic; straightforward). BUT: value after extraction is minimal (toy logic unsuitable for production use).
- **Requirements capabilities it could serve**: Trade (toy version only, unsuitable); Long-run history/war/economics/politics sim (completely inadequate).

### 3.4 Algorithms for game solving and RL
- **Where**: `open_spiel/algorithms/` (103 subdirectories, ~100K LOC)
- **What it does**: Implementations of classic game-theoretic algorithms (Counterfactual Regret Minimization, Nash solver, Fictitious Play, PSRO, Regret Matching); RL algorithms (DQN, PPO, Actor-Critic); and evaluation tools (payoff matrices, best-response calculation, entropy metrics). Algorithms are game-agnostic and implemented both in C++ and Python.
- **Quality & realism rating: 4/5 for game-theoretic validity** — These are peer-reviewed, well-tested algorithms from academic literature (each algorithm links to paper). But they solve *games*, not *world simulations*. They optimize agent policy given fixed payoff structures. No representation of long-run causality, state-space explosion with thousands of agents, or generational effects. Not suitable for history/economics sim where payoff structures are emergent and time-scales span millennia.
- **Extractability: loosely coupled** — Each algorithm is independent (separate .cc/.h or .py module). Typical size 500-3K LOC. Imports: core Game API, policy abstractions, numpy (for Python). No UI. No external data. Effort to port: medium (RL algorithms need neural network libraries; game-theoretic ones are mostly linear algebra, more portable).
- **Requirements capabilities it could serve**: Theoretical scaffolding for multi-agent strategic reasoning (could inform war/diplomacy modeling as an algorithmic approach, but not a concrete implementation).

### 3.5 Mean field games
- **Where**: `open_spiel/games/mfg/` (~5K LOC), `open_spiel/algorithms/mfg_*` (algorithms for mean field analysis)
- **What it does**: Framework for modeling games with very large numbers of identical, anonymous agents where only the aggregate distribution of states matters (e.g., crowd routing, predator-prey). Provides tools to define population dynamics and solve for equilibria in infinite-agent limits. Includes specific games: crowd modelling (agents move on grid, incentivized to gather at one point), routing (agents choose routes given congestion), predator-prey (two populations).
- **Quality & realism rating: 2/5** — Mean field approach is mathematically elegant for specific scenarios (routing, herding), but agents are homogeneous and interactions are local/symmetric. No heterogeneity (e.g., species diversity, trader risk profiles, cultural identity), no hierarchy, no institutions. Crowd-modelling example is physically simple (linear movement, quadratic cost). Routing example has static topology (no network growth). Predator-prey is Lotka-Volterra (classical, unrealistic). No spatial geography, no resource constraints beyond local congestion, no inheritance/evolution. Models are academic exercises, not realistic simulations.
- **Extractability: loosely coupled** — Mean field game logic separated from algorithm logic. Typical game ~1K LOC. Imports: Game base class, numpy. No UI. Effort to port: medium (linear algebra, needs adaptation for heterogeneous agents).
- **Requirements capabilities it could serve**: Population & settlement (toy model, vastly oversimplified); Long-run history sim (no temporal evolution or learning).

### 3.6 Evaluation and analysis tools
- **Where**: `open_spiel/evaluation/` (~3K LOC), example scripts in `open_spiel/examples/`, analytics in `open_spiel/python/algorithms/`
- **What it does**: Utilities to compute payoff matrices, best-response strategies, Nash equilibria, learning curves, entropy. Plotting and reporting tools (mostly matplotlib-based). Integration testing harness.
- **Quality & realism rating: 3/5** — Tools are useful for game-theoretic analysis (e.g., computing best-response to a policy) but domain-agnostic. No visualization (charts are matplotlib static images, not interactive). No scenario builder or parameter sweep UI.
- **Extractability: loose** — Tools depend on core API + numpy + optional matplotlib. Effort to port: low for core analysis, medium for visualization (matplotlib to D3/Canvas).
- **Requirements capabilities it could serve**: None directly (analysis tools only).

### 3.7 No subsystems for:
- Tectonics, heightmap generation, erosion, hydrology, climate (temperature, wind, ocean currents, precipitation, seasons)
- Biomes, soils, resources
- Population dynamics beyond crowd-level mean-field models
- Cities, settlement growth, urban planning (UrbanSim is a separate upstream repo; OpenSpiel has no city subsystem)
- Language/naming generation
- Political borders, state formation, geopolitics
- Long-run history simulation (civilization, war, economics over millennia)
- Spatial/geographic reasoning (no grid, mesh, or coordinate systems; games are abstract)
- Planet/map rendering (no graphics engine, no projections, no globe)
- Import/export (no file I/O except game state serialization)
- Calibration to Earth data (no climate models, no geophysical parameters)

## 4. Internal data representation

**State representation:** Extensive-form game tree. States are nodes; actions are edges. State is a vector of game-specific parameters (board positions, hand contents, pot size, etc.), encoded as integers and floats. Information sets are explicitly defined per player (what each player observes). No implicit spatial structure; games that have spatial boards (chess, Go) encode board as flat array or vector.

**Resolution:** No concept of resolution (single abstract game state per node). Some games support parameterized scaling (e.g., Tic-Tac-Toe can be m×n board), but not multi-scale representation (e.g., planet + regional zoom).

**Units:** Game-specific. Poker bets are in chips (abstract units); board games use moves/positions; mean-field games use continuous positions (0–1 range typically). No unit system (SI, physical scale).

**Coordinate conventions:** Game-specific. Tic-Tac-Toe uses 0-indexed (row, col). Chess uses algebraic notation. Go uses 0-indexed grid. No standard coordinate frame (no lat/lon, no Cartesian xyz). No concept of wraparound or poles (no spherical geometry).

**Time:** Games are discrete turn-based. Time step is one action per agent. Terminal condition checked after each action. No continuous time, no simultaneous events beyond chance nodes. No calendar or date representation.

**Serialization:** Game state serialized as string (human-readable) or binary (for RL training efficiency). No custom save format per game; format is game-specific (e.g., chess state → algebraic notation string). No provenance, version, or metadata (e.g., random seed is not stored in serialized state by default).

**RNG/seed handling:** Games use std::mt19937 seeded with a uint64 seed. Seed can be passed at game initialization. Once seeded, all randomness is deterministic given sequence of chance outcomes. **No same-seed preview feature**: re-running with same seed restarts from initial state, not from a checkpoint. This breaks MapMaker's requirement for "same seed preview + detailed run" without recomputing.

**Multi-scale consistency:** Not applicable. No multi-resolution support or hierarchical grids.

## 5. License

**SPDX:** Apache-2.0 (verified from `/LICENSE` file)
**File path:** `LICENSE` (root)
**Mixed/vendored licenses:** None detected at root level. Vendored library Hanabi Learning Environment (in `open_spiel/games/hanabi/`) has separate license (also Apache-2.0). Third-party libraries (Abseil C++, etc.) are included in `open_spiel/abseil-cpp/` and `open_spiel/libnop/` with their own Apache-2.0 licenses. No GPL, AGPL, or proprietary licenses in core or bundled games. All examined game implementations and algorithms are Apache-2.0.

**License compatibility:** Apache-2.0 is permissive (no copyleft). Compatible with MIT, BSD. MapMaker can use without conflict (noted in manifest).

**Practical notes:** Apache 2.0 includes patent grant (Section 3) protecting contributors and users from patent suits. No EULA or restrictions on commercial use. Attribution required if modified. No resale restrictions (unlike some earth sciences libs, e.g., WRF-Hydro). Safe for extraction and modification.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | No geodynamic simulation. |
| Heightmap generation | no | — | — | — | No terrain generation. |
| Erosion | no | — | — | — | No landscape evolution model. |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | No hydrologic routing. |
| Climate – temperature | no | — | — | — | No weather/climate model. |
| Climate – wind | no | — | — | — | No atmospheric dynamics. |
| Climate – ocean currents | no | — | — | — | No oceanography. |
| Climate – precipitation | no | — | — | — | No rainfall/weather. |
| Climate – seasons | no | — | — | — | No seasonal cycle. |
| Biomes | no | — | — | — | No vegetation/ecosystem model. |
| Soils | no | — | — | — | No soil science subsystem. |
| Resources | no | — | — | — | No resource distribution or depletion model. |
| Population & settlement | partial | 2 | loose | `open_spiel/games/mfg/` | Mean-field crowd model only; toy-level, no settlement growth/migration. |
| Cities & towns | no | — | — | — | No urban simulation (UrbanSim is separate upstream repo). |
| Languages & names | no | — | — | — | No naming/language generation. |
| Political borders | no | — | — | — | No state formation or geopolitical simulation. |
| Trade | partial | 2 | standalone | `open_spiel/games/trade_comm/` | Toy negotiation model (2 agents, 10 items, 1 round); no supply chains or economics. |
| Long-run history/war/economics/politics sim | partial | 1 | loose | `open_spiel/algorithms/`, game abstractions | Framework for multi-agent games; no economic depth, no temporal evolution, no institutional modeling. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | No hierarchical spatial representation. |
| Globe view | no | — | — | — | No 3D rendering or projection support. |
| Flat projections | no | — | — | — | No cartographic projections. |
| Partial-world inference | no | — | — | — | No context inference from regional input. |
| Import of heightmaps/layers | no | — | — | — | No file I/O or raster import. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No checkpoint/resume mechanism; same seed restarts from scratch. |
| Export (PNG/SVG/STL/other) | no | — | — | — | No graphics export (game states only serialize to text/binary). |
| Full-state save/resume format | partial | 2 | loose | `open_spiel/spiel.h` State API | Generic serialization for game state; no custom world format, no metadata/provenance, no cross-version compatibility guarantees. |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | No calibration or real-world data integration. |
| Planet-parameter derivation | no | — | — | — | No parameter-to-outcome model (e.g., "set axial tilt → predict climate zones"). |

## 7. Verdict

- **What (if anything) is worth extracting:** The game-theoretic abstraction layer (State/Game/Policy APIs) could be a foundation for multi-agent strategic reasoning in war/diplomacy modeling. Core API is ~500 lines, well-designed, tested, and language-agnostic. Potential use: encode diplomatic negotiations, trade deals, or military campaigns as extensive-form games and solve for Nash equilibria or learning outcomes. However, this is a *framework*, not a concrete model; building a realistic simulation would require designing game payoff structures from scratch.

- **What to skip:** All 150+ games (chess, poker, etc.); mean-field crowd models (too simplified); trade/negotiation toy games (pedagogical only, no economic realism); algorithms (general-purpose RL; not domain-specific). These have no direct application to world simulation.

- **Biggest risks:**
  - **Platform/language mismatch (CRITICAL):** OpenSpiel is Python/C++ desktop software with zero browser/WASM support. Porting core API to browser JavaScript would require substantial rewrite and testing. MapMaker requires browser deployment; this repo does not support that without major effort.
  - **Conceptual mismatch:** OpenSpiel solves *games* (fixed payoff structures, finite horizon, small state spaces). MapMaker requires *simulation* (emergent payoffs, long time horizons, massive state spaces with millions of agents/locations). Abstract game theory cannot easily model supply chains, demographic transitions, or institutional evolution.
  - **Temporal mechanics:** OpenSpiel games are turn-based or continuous-time with deterministic dynamics (Lotka-Volterra for mean-field). No multi-timescale modeling, no path-dependent history, no generational effects. This breaks long-run simulation realism.
  - **License:** Apache 2.0 is clean; no conflicts with extraction plan.

- **Open questions / unverified points:**
  - Could mean-field game framework be extended to heterogeneous agents (e.g., traders with different risk profiles)? Framework supports it theoretically, but no out-of-the-box heterogeneous implementation exists. Effort unknown.
  - Are there any academic papers using OpenSpiel for economic or civilizational modeling? (Searched: none found; repo is game-theoretic RL focused, not ABM/macro-economics focused.)
  - Would porting a single simple game (e.g., Kuhn poker or trade_comm) to WASM/JS be a viable proof-of-concept? Likely yes for one game, but infrastructure cost (WASM bindings, API wrapping) might not justify value for toy models.

**Summary verdict:** OpenSpiel is a sophisticated, well-engineered game-theoretic RL framework, but *not a world simulator*. Its games are abstract puzzles with no spatial/economic/climatic content; its platform is desktop-only; its temporal mechanics and agent models are mismatched to long-run civilization simulation. Extract the abstract game API as a library for multi-agent reasoning only if you plan to redesign game payoff structures from scratch. Do not expect to reuse games, algorithms, or mean-field models wholesale. Consider this repo a "theoretical reference for game-based reasoning" rather than a source of ready-to-use simulation components. The architecture and lessons from OpenSpiel's API design are more valuable than its code.

