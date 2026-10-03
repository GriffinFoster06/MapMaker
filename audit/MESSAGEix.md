# Audit: MESSAGEix

## 1. Overview

MESSAGEix is a mature, production-grade Python framework for integrated assessment modeling of energy-engineering-economy-environment (E4) systems, developed by the IIASA Energy, Climate, and Environment Program since the 1980s. It implements MESSAGE (linear programming optimization for strategic energy planning) and optional MACRO (general equilibrium economic model) solvers, linked through the ixmp data warehouse platform. ~23.6K LOC (17K Python, 6.4K GAMS), 140 project files, git HEAD d8578a8 (October 2026). Heavy active maintenance (Python 3.10–3.14 support).

## 2. Language, runtime, dependencies, build

- **Primary languages**: Python (17,119 LOC, 67 files); GAMS (6,462 LOC, 25 .gms files); R bindings (9 LOC).
- **Runtime**: Python 3.10+ with command-line CLI (`message-ix`) and Jupyter notebook environments; requires JDBCBackend or ixmp4 database backend; **not browser-capable**.
- **Key dependencies**:
  - `ixmp >= 3.11` (IIASA modeling platform with data warehouse)
  - `genno[pyam] >= 1.20` (computation graph library)
  - `pandas >= 1.2`, `numpy`, `scipy` (scientific Python)
  - `click` (CLI framework)
  - `PyYAML` (configuration)
  - Optional: GAMS solver (external binary, not included; Windows/Mac/Linux; requires license or community version)
  - Optional: `plotly` (for Sankey diagram reports)
  - Test suite: pytest, various plugins
- **Build**: Python setuptools with `setuptools-scm` version management. No native compilation required for Python components.
- **Does it build?**: Inferred from inspection. Pyproject.toml is well-formed; dependencies are pip-installable (except GAMS, which is external). No missing data files in repo. Would build as a Python package if dependencies available; browser deployment is architecturally impossible (would require complete rewrite of solve layer).
- **Browser portability**: **Not feasible.** The entire model execution flows through GAMS solver or ixmp database backends. GAMS is a proprietary/GPL-licensed modeling language compiler; no WASM port exists. Porting the optimization logic to TypeScript would require rewriting 6K+ lines of GAMS modeling formulation and the entire ixmp data/solve backend in JavaScript, plus integrating a lightweight LP solver (e.g., JSPF or GLPK.js). Effort: 6–12 months, high risk of numerical divergence.

## 3. Subsystem inventory

### 3.1 Energy systems optimization (MESSAGE model)

- **Where**: `message_ix/model/MESSAGE_master.gms`, `message_ix/model/MESSAGE_run.gms`, `message_ix/model/includes/` (GAMS formulations); `message_ix/message.py`, `message_ix/core.py` (Python API).
- **What it does**: Linear programming optimization of energy supply/demand, capacity expansion, costs, and commodity trade subject to bounds, constraints, and dynamic linkage with demand prices. Solves for minimum-cost energy system evolution over user-defined time horizons. Includes:
  - Technology dispatch and capacity-factor tracking
  - Investment and operating cost minimization
  - Commodity and energy balances (fossil fuels, renewable, electricity)
  - Inter-regional trade via commodity flows with transportation costs
  - Demand-side flexibility (soft relaxation bounds)
  - Dynamic constraint enforcement
- **Quality & realism rating: 4/5**. This is reference-grade for energy systems planning; well-tested, published in 100+ peer-reviewed studies, calibrated to real-world energy data. However, trade modeling is simplified (cost-based commodity flows, not game-theoretic or geopolitically nuanced), and the model operates at annual/decadal timescales for strategic planning, not high-frequency market or tactical scales.
- **Extractability: tangled**. The MESSAGE logic is split across GAMS formulation (hard to interpret without GAMS knowledge) and Python API wrapper. Extraction would require:
  - Reproducing the GAMS LP formulation in Python/JavaScript (6K lines) or finding/adapting an LP solver binding (JSPF, scipy.optimize).
  - Replicating the ixmp data warehouse (scenario indexing, commit/checkout workflows, multi-version management).
  - Estimated extractable core: ~2–3K lines of Python API logic; but solve layer (~6K GAMS) is not portable.
  - Effort: high (6–12 months for a functional port).
  - Data files: optional, but tutorials include large XLSX scenario templates.
- **Requirements capabilities it could serve**: Trade (commodity cost-minimization flows); partial long-run economics simulation (if coupled with population/settlement models).

### 3.2 MACRO model (optional general equilibrium coupling)

- **Where**: `message_ix/model/MACRO_run.gms`, `message_ix/model/MESSAGE-MACRO_run.gms`; `message_ix/message_macro.py`.
- **What it does**: Computable general equilibrium (CGE) model optionally linked to MESSAGE; feeds back energy prices to demand elasticity, creating price-demand feedback loops. Solves for economic equilibrium.
- **Quality & realism rating: 3/5**. Functional CGE model for integrated assessment, but simplified economy representation (aggregate sectors, Cobb-Douglas production, single-region in MESSAGE-MACRO linkage). Suitable for strategic planning (2020–2100 outlooks), not for detailed economic simulation or multi-regional trade networks. No human geography, cities, settlement patterns, or cultural factors.
- **Extractability: tangled**. Same issues as MESSAGE; both solves via GAMS.
- **Requirements capabilities it could serve**: Economic feedback loops in long-run simulation (if drastically simplified and rewritten for browser).

### 3.3 Data warehouse & scenario management (ixmp interface)

- **Where**: `message_ix/core.py` (Scenario class extending ixmp.Scenario); `message_ix/util/scenario_data.py` (parameter/set definitions); `message_ix/util/scenario_setup.py` (template builders).
- **What it does**: Wrapper around ixmp platform for managing model scenarios (versions, time-indexed data, multi-dimensional parameters indexed by region, technology, fuel, time-period, etc.). Provides Python API for reading/writing model data, checking out/committing versions, querying solutions.
- **Quality & realism rating: 4/5**. Well-designed data model for tabular scientific scenarios; clear separation of sets/parameters. Limitation: no spatial indexing beyond regions (no grid, mesh, coordinates); optimized for aggregate-region modeling.
- **Extractability: loosely coupled**. The Scenario class logic is ~1K lines of Python (message_ix/core.py). Could be extracted as a standalone scenario/versioning framework (similar to Neptune or MLflow), but would require adapting ixmp backend (JDBCBackend or ixmp4) for browser (likely infeasible). The parameter definitions in scenario_data.py (~57K lines) are energy-specific; reuse would mean wholesale replacement.
- **Requirements capabilities it could serve**: None directly for MapMaker (versioning/provenance system could be useful, but not worth extracting from here).

### 3.4 Utilities (GAMS I/O, reporting)

- **Where**: `message_ix/util/gams_io.py` (GAMS input/output file formatting); `message_ix/report/` (Sankey, tables); `message_ix/tools/` (helpers: year interpolation, add_year).
- **What it does**: Bridge between Python pandas DataFrames and GAMS/Excel data formats; plotting/reporting of scenario results.
- **Quality & realism rating: 2/5** for MapMaker context. The reporting is useful for energy results but not applicable to world simulation. GAMS I/O logic is specific to GAMS syntax.
- **Extractability: loosely coupled**. gams_io.py (~450 lines) is a self-contained formatter; tools are standalone helpers. However, without the MESSAGE model context, they have no purpose.
- **Requirements capabilities it could serve**: Potentially, file I/O format design lessons (though GAMS-specific format would not transfer).

### 3.5 Testing & tutorials

- **Where**: `message_ix/tests/` (pytest suite, 30+ test files); `message_ix/testing/` (fixtures, test data); `tutorial/` (Jupyter notebooks and example scenarios: Austrian energy system, Westeros stylized model).
- **What it does**: Unit/integration tests for API and model solve; tutorial notebooks demonstrating scenario creation, solving, and results analysis.
- **Quality & realism rating: 4/5** for software engineering practices; limited value for MapMaker.
- **Extractability: standalone** (tests are self-contained). Westeros tutorial (~50 nodes, simplified energy system) is a useful educational reference for scenario design but not a data source or algorithm.
- **Requirements capabilities it could serve**: Example of modular scenario structure and parameterization (useful for design reference, not code).

## 4. Internal data representation

- **Data model**: Relational scenario (ixmp Scenario), indexed by multi-dimensional sets (regions, technologies, fuels, time periods) and their parameters (costs, capacities, etc.). Stored as tables in a backend database (JDBC or ixmp4 SQLite).
- **Resolution(s)**: Geographic: regions (user-defined; no default globe tessellation). Temporal: years (configurable, typically 5–10-year intervals, 2020–2100 or custom range). No grid, mesh, or high-resolution spatial support.
- **Units**: SI + application-specific (e.g., PJ for energy, USD/PJ for costs, MW for capacity). Unitless 0–1 scaling for some parameters (capacity factors, elasticities).
- **Coordinate conventions**: No spatial coordinates stored; purely symbolic region/technology names. No CRS, no projection support, no lat/lon.
- **Time representation**: Year as integer (e.g., 2020, 2025, …, 2100); no sub-annual timescales.
- **Serialization**: ixmp backend (JDBC via GamsIO or ixmp4 SQLite). Scenarios can export to GAMS .gdx files or Excel. No native JSON/YAML world-state format.
- **RNG/seed**: ixmp scenarios are deterministic (no stochasticity in core MESSAGE); limited support for uncertainty (scenarios, sensitivity analysis via external loops). No seeded random generation for reproducible branching simulations.
- **Multi-resolution consistency**: Not supported. Regional aggregations must be manually defined; no hierarchical mesh or zoom-level inference.

## 5. License

**SPDX**: Apache-2.0 (verified in `/Users/griffinfoster/Projects/MapMaker/upstream/MESSAGEix/LICENSE`).

**Matches manifest**: Yes.

**Per-directory/per-file licenses**: No COPYING files or license headers within subdirectories. All code is Apache-2.0. GAMS model files (`.gms`) inherit Apache-2.0. No vendored third-party code detected within the repo (dependencies are external pip packages).

**Patent clauses**: Apache-2.0 includes automatic patent grant (Section 3) for contributions; termination on litigation (rare in practice).

**Practical notes**: Permissive, no copyleft. Can be freely used/modified/distributed in proprietary projects. No EULA restrictions. GAMS solver itself (if used) is proprietary (Gurobi/CPLEX backend) or GPL (if community GAMS/Free/Couenne); users must provide their own solver license or use free solvers—this is a runtime dependency, not a code license issue.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Framework has no geophysical simulation |
| Heightmap generation | no | — | — | — | Energy model, not terrain |
| Erosion | no | — | — | — | — |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | — |
| Climate – temperature | no | — | — | — | — |
| Climate – wind | no | — | — | — | — |
| Climate – ocean currents | no | — | — | — | — |
| Climate – precipitation | no | — | — | — | — |
| Climate – seasons | no | — | — | — | — |
| Biomes | no | — | — | — | — |
| Soils | no | — | — | — | — |
| Resources | partial | 2 | tangled | `message_ix/util/scenario_data.py` | Energy commodities only (fossil fuels, renewables); no metals, minerals, etc. |
| Population & settlement | no | — | — | — | — |
| Cities & towns | no | — | — | — | — |
| Languages & names | no | — | — | — | — |
| Political borders | no | — | — | — | — |
| Trade | partial | 3 | tangled | `message_ix/model/MESSAGE_master.gms:~500 lines` | Commodity cost-minimization trade flows; no geopolitics/alliance/conflict logic |
| Long-run history/war/economics/politics sim | partial | 2 | tangled | `message_ix/model/MESSAGE*.gms`, `message_ix/message.py` | Multi-decadal economic optimization only; no war, politics, history, demographic dynamics |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | Regional aggregation only; no hierarchical mesh or zoom |
| Globe view | no | — | — | — | — |
| Flat projections | no | — | — | — | — |
| Partial-world inference | no | — | — | — | No context inference outside explicit regions |
| Import of heightmaps/layers | no | — | — | — | — |
| Fidelity/speed slider with same-seed preview | no | — | — | — | Scenarios are deterministic, not parametrically varied |
| Export (PNG/SVG/STL/other) | partial | 2 | loosely coupled | `message_ix/report/` | PDF/Excel/GAMS reports only; no cartographic exports |
| Full-state save/resume format | partial | 2 | loosely coupled | `message_ix/core.py`, ixmp backend | ixmp scenarios are versionable but tied to database backend; not JSON/portable |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | No calibration against Earth data |
| Planet-parameter derivation | no | — | — | — | — |

## 7. Verdict

- **What NOT to extract**: Essentially all of MESSAGEix. It is a specialized energy-economy optimization framework with zero utility for terrain, climate, biomes, settlement, or political simulation. The GAMS solver dependency, heavy scientific computing stack (ixmp, pandas, scipy), and Python-only runtime make it incompatible with browser deployment. Even the trade/economics module (the only potentially relevant subsystem) is too tightly coupled to the LP solver and scenario database to extract cleanly.

- **What MIGHT be worth learning from (not extracting)**: The Westeros tutorial scenario (simplified 50-node stylized energy system) is a pedagogical example of scenario design and parameterization; the philosophy of separating sets/parameters in the ixmp data model could inspire MapMaker's internal world state structure. But no code reuse is recommended.

- **Biggest risks**:
  1. **Architecture mismatch**: MESSAGEix is an optimizer (LP solver) + database; MapMaker needs simulation + procedural generation. No overlap.
  2. **Language barrier**: GAMS is a niche domain-specific language for optimization; no widely used equivalent in JavaScript/WASM.
  3. **Browser incompatibility**: ixmp, GAMS solver, and scipy (numerically heavy) have no browser equivalents. Would require a from-scratch rewrite of the entire solve/data layer.
  4. **Scope creep risk**: Extracting trade economics from MESSAGE might tempt the team to overfit MapMaker to energy-system patterns (time-period aggregation, linear optimization) when a lighter, game-theoretic trade model would be better suited to fantasy world dynamics.

- **Open questions/unverified**:
  - (Unverified) Whether ixmp4 backend (SQLite-based, newer than JDBC) would be any easier to port (likely not—still requires database plumbing).
  - (Unverified) Whether any open-source LP solver has a WASM port that could serve as a replacement (checked briefly: GLPK.js exists but is unmaintained; scipy.optimize.linprog could theoretically compile to WASM via Pyodide, but overhead and bundle size would be prohibitive).

**Bottom line**: Pass entirely. MESSAGEix is a wrong-tool choice for MapMaker. Use other upstream repos (e.g., Badlands for erosion, LPJmL for biomes, UrbanSim for settlement, VPLanet for whole-planet calibration).
