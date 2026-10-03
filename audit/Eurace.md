# Audit: Eurace

## 1. Overview

Eurace@Unibi is an agent-based macroeconomic model implemented in C using the FLAME (Flexible Large-scale Agent Modeling Environment) framework. Developed at the University of Bielefeld (Dawid, Gemkow, Harting, van der Hoog, Neugart), it simulates heterogeneous economies with multiple agent types (households, firms, banks, government, statistical office) interacting in labor, goods, credit, and financial markets. Version 1.0.1 (April 2016) is the most recent release. ~43,700 lines of C code across 88 files. Designed for macroeconomic policy research and business-cycle analysis, not world/terrain generation. Active as a research platform but no geographic or spatial generation subsystems. **Critical restriction: custom EULA forbids redistribution of code without prior written permission from authors.**

## 2. Language, runtime, dependencies, build

- **Primary language**: C (100% of source code), 43,700 LOC. No Python, JavaScript, Fortran, or other languages in the main model.
- **Runtime**: Linux/macOS command-line executable. Compiled to a single binary that runs discrete time-step simulations. No browser, GUI, or interactive runtime; requires FLAME framework executables to generate and compile.
- **Key dependencies** (all C/UNIX):
  - GCC 4.4+ (C compiler)
  - GNU Scientific Library (GSL) 2.4+ (numerical routines)
  - FLAME XParser 0.17.1 (model XML parser / code generator)
  - FLAME Libmboard 0.3.1 (message-passing communication library for agents)
  - CUnit (C unit testing library)
  - Standard POSIX make
- **Does it build?** Not attempted (GSL not installed in environment, but toolchain available). Build determinable from README.md steps: (1) download/build Libmboard 0.3.1, (2) download/compile XParser 0.17.1, (3) run `xparser eurace_model.xml` to generate Makefile, (4) `make`. Requires external libraries and FLAME framework installation. No CMake, autoconf, or modern build tooling; shell script (scripts/install_flame.sh) provided for FLAME setup. No reported build issues in recent commits. Build expected to work on macOS/Linux with dependencies; Windows support marked TODO in README.
- **Browser portability**: Cannot run in browser as-is. Pure C compiled binary using MPI-capable agent framework. Porting to browser (WASM or native JS) would require: (1) complete rewrite of agent communication layer (FLAME Libmboard → JS event system), (2) rewrite of GSL numerics calls (→ existing JS math libs or native WASM binding), (3) translation of 43,700 lines of C logic (likely 80%+ rewrite). Effort: **very high**. Output format is text statistics/logs, not images/maps (no rendering pipeline exists). Result would be an economics simulator in JS, not a world generator.

## 3. Subsystem inventory

Eurace has no subsystems aligned with MapMaker's world-generation scope. All subsystems are agent-based economic/financial:

### 3.1 Labor Market
- **Where**: `Labour/` (Firm_Employer_Functions.c, Household_Employee_Functions.c, ~4,500 LOC total including tests)
- **What it does**: Firms post vacancies with wage offers; households search for jobs; skills (general/specific) accumulate via learning-by-doing; wage bargaining; hiring/firing decisions based on productivity match (logit choice model). Regional labor mobility with commuting costs (region_cost parameter). No geographic representation; regions are abstract economic zones, not spatial.
- **Quality & realism rating: 3/5** — Labor search and matching is realistic for heterogeneous-agent macro (theory-grounded in job search models, skills acquisition, wage negotiation). Well-tested (1,870 lines of unit tests). Suitable for economic research but oversimplified for true agent-based settlement (no occupation distribution, no skill-based clustering, no labor flow from geography). Tuned for whole-economy calibration, not regional/urban labor markets.
- **Extractability: tangled** — Tightly coupled to firm/household agents (Firm_agent_header.h, global state), FLAME message passing system (employee records passed via messages), GSL random-number generator for job-search sampling. Core logic (matching algorithm, skill update) is ~1,500 LOC. Effort to extract to JS: **high** (agent lifecycle, message delivery, state machine all FLAME-specific).
- **Requirements capabilities it could serve**: Population & settlement (agent birth/death/employment status), Trade (indirect via wage/income). Low value to MapMaker (no spatial dimension, focus on labor income/unemployment rather than place-based settlement).

### 3.2 Goods Production & Consumption
- **Where**: `Cons_Goods/` (Firm_Producer_Functions.c ~1,721 LOC, model definitions in Cons_Goods/model.xml, 993 LOC unit tests)
- **What it does**: Firms decide production quantity based on sales expectations and financial constraints; manage capital stock (with vintage/productivity levels); calculate input demands (labor, capital); price goods based on markups; households consume and save. No input from land, geography, or resources.
- **Quality & realism rating: 3/5** — Production function (Cobb-Douglas or similar) and capital accumulation are standard microeconomic theory, well-tested. Suitable for macro calibration. However, no sectoral diversity (just "consumption goods"), no supply chains, no resource constraints. Unrealistic for a regional economy.
- **Extractability: tangled** — Embedded in FLAME agent lifecycle; state variables tied to firm/household data structures; Libmboard message exchange for orders/prices. ~2,000 LOC extractable core (production logic, pricing). Requires full agent-system rewrite for browser.
- **Requirements capabilities it could serve**: Trade (inter-firm exchanges), Resources (no, uses abstract capital units). Unsuitable for world generation.

### 3.3 Financial Markets & Credit
- **Where**: `Financial/` (13 C files, ~5,000+ LOC), `Credit/` (~3,500 LOC), `Financial_Management/` (~3,500+ LOC)
- **What it does**: Banks offer credit (loans); firms and households borrow/lend; ClearingHouse matches supply/demand for financial assets (equities, bonds); Central Bank sets policy rates; financial market participants rebalance portfolios. Agent Financial Market (AFM) module. No geographic basis; all transactions virtual.
- **Quality & realism rating: 4/5** — Multi-agent financial market simulation is sophisticated, published in peer-reviewed literature, validated against empirical business cycles. Portfolio-rebalancing logic, default mechanisms, and price discovery are well-implemented. High-quality for macroeconomic research. Unfit for world generation (pure financial abstraction).
- **Extractability: tangled** — Requires FLAME agent communication, GSL samplers, complex state machines. ~3,000 LOC of extractable matching/clearing logic, but embedded in agent-based framework. Porting to JS: **very high effort**.
- **Requirements capabilities it could serve**: Trade (financial instruments, not goods), Long-run history sim (economic dynamics, not war/politics). No direct utility.

### 3.4 Government & Policy
- **Where**: `Government/` (~1,000 LOC), policy experiments hard-coded in model constants (policy_exp_*).
- **What it does**: Government collects taxes (income, VAT), pays subsidies, runs budget; experiments with policy shocks (energy shocks, stabilization subsidies/taxes). No political decision-making, war, or diplomacy; all policy is exogenous rule-based.
- **Quality & realism rating: 2/5** — Government is a simplified rule-based agent, not a political entity. Useful for macro policy experiments (fiscal stimulus, etc.) but far from realistic for long-run political simulation. No borders, territory, or legislation beyond tax/subsidy rates.
- **Extractability: standalone** — Government logic is mostly isolated (calculation of tax revenue, subsidy disbursement). ~500 LOC extractable. Could be lifted without major FLAME refactoring. Effort: **low-medium**. But provides no value for world generation.
- **Requirements capabilities it could serve**: Political borders (no), Long-run history sim (no political sim). Not applicable.

### 3.5 Market Research & Statistical Office
- **Where**: `Market_Research/` (~2,926 LOC), `Statistical_Office/` (~2,000+ LOC including tests)
- **What it does**: Market Research: firms conduct surveys to predict consumer demand (demand forecasting, market shares). Statistical Office: aggregates agent-level data into macroeconomic statistics (employment, inflation, GDP, income distribution), analogous to national statistics agency (Eurostat). Generates .csv output with time-series.
- **Quality & realism rating: 3/5** — Reasonable behavioral model of demand forecasting (adaptive expectations). Statistical aggregation is straightforward but useful for model analysis. Not validated against real surveys/data. Tuned for macro research, not behavioral realism.
- **Extractability: loosely coupled** — Market research and statistical calculations are mostly self-contained functions; data aggregation can run independently. ~1,500 LOC extractable (aggregation logic, time-series output). Requires FLAME agent data access but not deep agent lifecycle dependencies. Effort: **medium**. Output format (CSV time-series) is browser-friendly but not a world map.
- **Requirements capabilities it could serve**: Export (CSV only, no maps/images), Calibration data (no Earth data). No world-generation value.

### 3.6 Investment Goods (Capital)
- **Where**: `Inv_Goods_Basic/` (disabled in main model), `Inv_Goods_Vintage/` (~1,250 LOC), Financial management and Credit modules handle vintaged capital (productivity by age/type).
- **What it does**: Firms purchase capital goods; capital ages and becomes obsolete; technological frontier advances (exogenous). Productive capacity determined by capital stock and labor efficiency. No geographic location; all capital is abstract.
- **Quality & realism rating: 3/5** — Vintage capital (capital of different ages with different productivity) is a standard macro model feature. Realistically degrades over time. Not calibrated to real capital-goods markets. Suitable for macro, not regional economics.
- **Extractability: tangled** — Integrated with firm production, credit, and financial decisions. ~800 LOC of extractable vintage-management logic, but requires agent state machine. Effort: **high**.
- **Requirements capabilities it could serve**: Trade (inter-firm capital trade), Resources (no). Unsuitable.

## 4. Internal data representation

- **Structure**: Discrete agents (households, firms, banks, government, statistical office) with attached state records (not a grid/mesh). Agents communicate via FLAME Libmboard message-passing; no spatial topology.
- **Resolution/time**: 1 day per time step (DAY variable, indexed). Simulation runs for many years (configurable, typically 1000+ days for business-cycle studies). No spatial resolution; agents exist in abstract "regions" (identified by region_id, typically 1-3 for multi-country models).
- **Units**: Agents are dimensionless economic entities. Output prices, wages, quantities in "model units" without explicit scale. Stocks (capital, money) in currency units (abstract €). No physical units (meters, kg, °C, etc.). **Not calibrated to Earth**: parameters are tuned to match stylized facts (unemployment rates, inflation, Gini coefficient) not real geographic/climatic data.
- **Coordinate system**: None. Regions are integer IDs, no lat/lon or spatial coordinates. "Region" is a label, not a geographic boundary.
- **Serialization**: State saved as C structures in memory; no save/resume format described in source. Simulation state not designed for checkpointing or reloading; each run starts fresh. Model parameters set via XML config (eurace_model.xml, Cons_Goods/model.xml, etc.) and constants in .c files.
- **RNG/seed**: GSL random-number generator seeded via `GSL_RNG_SEED` or `rnd_seed` environment variables (seeds are pinned in model.xml constants). Same seed reproducible across runs. RNG used for: job search sampling, stochastic demand/supply shocks, portfolio rebalancing. No Perlin noise, fractal generation, or spatial random fields.
- **Zoom/detail consistency**: Not applicable; no spatial representation.

## 5. License

- **SPDX id**: NOT-OPEN-SOURCE (non-standard custom EULA, not OSI-approved)
- **License file(s)**: `/LICENSE.md` and `/EULA.rtf` (identical terms in two formats)
- **Vendored/third-party licenses**: None detected (all code in repo is original, dependencies external). GSL (GNU GPL-2.0+), FLAME XParser/Libmboard, CUnit are external tools, not vendored.
- **License match**: Matches manifest (`LICENSE.md is an End User License Agreement, not an OSI license`).

**Key license restrictions (quoting LICENSE.md):**
- **(1) Clause 1**: "You are permitted to use the Standard Version and create and use Modified Versions for any purpose without restriction, provided that you do not Distribute the Modified Version." — Can use and modify privately, not for sharing.
- **(2) Clause 2**: "You may not Distribute verbatim copies of the Source form of the Standard Version of this Package in any medium." — Cannot redistribute unmodified code.
- **(3) Clauses 4-5**: "You may Distribute the Package as Source or in Compiled form only with prior written permission from the Owner." — Any redistribution (modified or not, source or binary) **requires written permission from the 5 named copyright holders** (Dawid, Gemkow, Harting, van der Hoog, Neugart).
- **(6-7) Publication clause**: Results from the model must cite the model and notify authors if published.
- **(8) Warranty disclaimer**: Provided as-is, no liability.

**Practical impact**: This is a **prohibitive license for MapMaker**. Even extraction of small modules for reuse in a derivative work (MapMaker) would violate clause 5 (redistribution of modified version). The brief says "license conflicts are ignored," but **this is not a conflict—this is an absolute prohibition without permission**. The manifest correctly flags it. **Any code extraction requires direct written consent from all five copyright holders**, which is unlikely to be granted for a browser-based fantasy-world generator (incompatible use case).

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | Note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Not applicable; model has no geology |
| Heightmap generation | no | — | — | — | No terrain; purely economic agents |
| Erosion | no | — | — | — | Not applicable |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | Not applicable |
| Climate – temperature | no | — | — | — | Not applicable |
| Climate – wind | no | — | — | — | Not applicable |
| Climate – ocean currents | no | — | — | — | Not applicable |
| Climate – precipitation | no | — | — | — | Not applicable |
| Climate – seasons | no | — | — | — | Not applicable |
| Biomes | no | — | — | — | Not applicable |
| Soils | no | — | — | — | Not applicable |
| Resources | no | — | — | — | Capital goods are abstract, no material resources |
| Population & settlement | partial | 2/5 | tangled | Labour/*, Cons_Goods/* | Agent birth/death (employment tracking) but no geographic distribution, settlement formation, or mobility |
| Cities & towns | no | — | — | — | No settlement clustering, urban structure, or place names |
| Languages & names | no | — | — | — | Not applicable |
| Political borders | no | — | — | — | Abstract "regions" with no spatial boundaries; no political simulation |
| Trade | yes | 4/5 | tangled | Financial/*, Credit/*, Cons_Goods/* | Multi-agent economic trade in goods, credit, financial assets. Well-implemented. No geographic trade routes or constraints |
| Long-run history/war/economics/politics sim | partial | 2/5 | tangled | All modules | Long-run economic dynamics (recessions, business cycles); no war, politics, or true historical events |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | No spatial representation; regions are abstract labels |
| Globe view | no | — | — | — | Not applicable |
| Flat projections | no | — | — | — | Not applicable |
| Partial-world inference | no | — | — | — | Not applicable |
| Import of heightmaps/layers | no | — | — | — | Not applicable; configuration is XML-based parameter tuning only |
| Fidelity/speed slider with same-seed preview | no | — | — | — | RNG seed reproducible, but no preview mechanism |
| Export (PNG/SVG/STL/other) | partial | 1/5 | loose | Statistical_Office/* | CSV time-series export only; no maps, images, or 3D meshes |
| Full-state save/resume format | no | — | — | — | Not designed; each run starts fresh. No checkpoint format |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | Parameters tuned to macroeconomic stylized facts, not Earth data |
| Planet-parameter derivation | no | — | — | — | Not applicable |

## 7. Verdict

- **Fundamental mismatch**: Eurace is a **macroeconomic simulator, not a world generator**. It has zero geographic/terrain/climate subsystems. All 18 major capability categories in MapMaker's requirements that relate to world/map generation (tectonics, terrain, climate, biomes, geography, projections, settlement placement) are absent. It cannot generate planets, maps, or landscapes.

- **Trade simulation value (qualified, low)**: Eurace has a sophisticated multi-agent economic model with realistic trade, credit, and production dynamics. In principle, trade logic could be adapted for a fantasy-world goods trade layer *after* the world map (terrain, settlements) is already generated. However, **license prohibition and tight coupling to FLAME framework make extraction prohibitively costly**.

- **Licensing barrier (hard stop)**: The custom EULA forbids any redistribution or modification without written permission from 5 specific authors. This is not negotiable per the license text. Extracting even a fragment for reuse in MapMaker violates clause 5. **Do not attempt extraction without direct legal sign-off from the copyright holders.**

- **Technical feasibility (low)**: To port Eurace to browser JavaScript, ~80% rewrite required: agent lifecycle, message passing (FLAME Libmboard → JS event system), GSL numerics, all simulation logic. 43,700 LOC in C, no existing JS port or modular library version. Effort: many weeks for a senior developer, likely 30,000-50,000 LOC of new JS code. Not worthwhile even for an unlicensed copy.

- **Open question**: Is there any real-world economic trade/goods model in the MapMaker requirements? The brief mentions "trade" and "long-run history sim (war, economics, politics, and full human history)," but trade is subordinate to world generation. Eurace solves trade but requires a world to be embedded in. Would a simplified JS trade engine (e.g., based on GAMA or MESSAGEix pattern, not Eurace code) be preferable? Current architecture suggests world gen comes first; trade simulation second.

- **Recommendation**: **Skip Eurace entirely**. No world-generation value. If trade simulation becomes a priority, consult GAMA (agent-based modeling + GIS, GPU-friendly, GPL-3.0, browser-unfriendly but more general), MESSAGEix (Apache-2.0, Python, modular), or write a lightweight custom trade engine in JS. Do not pursue extraction or licensing negotiation with Eurace authors.

