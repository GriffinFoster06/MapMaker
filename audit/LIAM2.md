# Audit: LIAM2

## 1. Overview

LIAM2 (Version 0.x, discontinued) is a generic microsimulation toolkit designed for agent-based demographic and economic modeling. Primary developers: Federal Planning Bureau (Belgium), with support from CEPS/INSTEAD and IGSS (Luxembourg) and EU Commission funding. Project is no longer maintained. Codebase: ~13,785 lines of Python, with 2 Cython optimization modules (.pyx files). Structured for modeling individual agents (persons, households, firms, etc.) and their dynamics over discrete time periods, used primarily for policy evaluation in social sciences, pensions, education, and public administration.

## 2. Language, runtime, dependencies, build

- **Primary language**: Python (>99% of ~13,785 LOC); 2 Cython modules (liam2/cpartition.pyx, liam2/cutils.pyx) for performance-critical operations.
- **Runtime**: CPython 2.7+ / 3.x (setup.py indicates Python 2 support via `from __future__ import` statements); Windows .bat build scripts and cross-platform Makefile suggest desktop CLI tool model.
- **Key dependencies**: larray < 0.29; numexpr >= 2.6.6; numpy >= 1.8; tables (HDF5) >= 3; PyYAML; Cython (required before setup.py runs); optional bcolz for interpolation.
- **Build**: `python setup.py build` or `python setup.py build_exe` (cx_Freeze for Windows exes). Requires Cython pre-installed. Does NOT appear to target browser/WASM.
- **Browser portability**: Not feasible as-is. Python + HDF5 (tables) + Cython core would require: (a) full Python→WASM transpiler or (b) complete rewrite in TS/JS. Cython modules would need WASM recompilation. HDF5 I/O could be ported to JS libraries (e.g., jsfive) but would be non-trivial. Estimated rewrite effort for core simulation engine: high (5,000+ LOC rewrite).
- **Build verification method**: Inspection of setup.py, requirements in dependencies, presence of .pyx Cython files, .travis.yml CI config, Windows .bat build scripts, and Python `from __future__` imports. Not built/run.

## 3. Subsystem inventory

### 3.1 Agent/Entity framework
- **Where**: liam2/entities.py (876 LOC), liam2/expr.py (1,473 LOC), liam2/exprbases.py (396 LOC), liam2/exprmisc.py (585 LOC), liam2/simulation.py (848 LOC), liam2/process.py (385 LOC).
- **What it does**: Core agent-based model infrastructure. Defines entities (agents), their fields (attributes), processes (discrete-time rule applications), and an expression evaluation system (DSL) for model rules. Entities stored in HDF5 tables; simulation state updated period-by-period, all agents aged/processed together (cross-sectional ageing).
- **Quality & realism rating: 3/5** — Solid, mature infrastructure for demographic ABM; well-tested for population dynamics and policy microsim (pensions, education, labor markets). Not designed for spatial or biophysical modeling; realism is in human behavior rules, not world physics.
- **Extractability: tangled** — Deeply tied to HDF5 storage, expression evaluation engine (liam2/expr.py is 1,473 LOC, complex), larray multidimensional array library, and YAML configuration parsing. Extracts core simulation loop but requires substantial refactoring to decouple from larray and tables. ~2,000 LOC core if extracted, but ~4,000+ LOC of dependencies to replicate. Effort to browser: high.
- **Requirements capabilities it could serve**: Population & settlement (agent-based population dynamics only; no spatial placement), Cities & towns (aggregate-level modeling only, not spatially resolved).

### 3.2 Expression/Rule evaluation engine
- **Where**: liam2/expr.py (1,473 LOC), liam2/exprbases.py (396 LOC), liam2/exprmisc.py (585 LOC), liam2/exprtools.py (300 LOC), liam2/exprrandom.py (234 LOC).
- **What it does**: Domain-specific language (DSL) parser and evaluator for model rules. Supports arithmetic, aggregation functions (sum, mean), logical conditions, random number generation, entity links, and time-dependent functions. Rule expressions compiled from YAML into Python AST then executed with numexpr for NumPy vectorization.
- **Quality & realism rating: 4/5** — Mature, extensively tested, efficient vectorized evaluation. Good for demographic rules but not designed for spatial/physical processes. Realism is orthogonal to the domain.
- **Extractability: tangled** — Depends on larray, numexpr, Python AST, YAML parsing. Expression syntax is LIAM2-specific (not portable as-is). ~2,500 LOC to extract, but heavily interdependent with entities and simulation loop. Effort: high.
- **Requirements capabilities it could serve**: None directly; this is infrastructure, not a world-generation algorithm.

### 3.3 HDF5 I/O and data management
- **Where**: liam2/data.py (1,146 LOC), liam2/importer.py (956 LOC), liam2/entities.py (embedding), various .h5 serialization.
- **What it does**: Persistence layer. Reads/writes agent data to HDF5 tables. Imports CSV→HDF5. Handles field type mapping, period-indexed arrays, data alignment. Saves/loads full simulation state.
- **Quality & realism rating: 3/5** — Functional and reliable for demographic data; standard HDF5 format allows interop with R, Matlab, Python analytics tools. Not optimized for spatial data, raster grids, or large-scale map I/O.
- **Extractability: loosely coupled** — I/O layer; depends on PyTables (HDF5), numpy. ~600 LOC core. Portable in principle (HDF5 has browser JS bindings), but LIAM2's schema (entity tables, field defs, period indexing) is domain-specific. Effort to browser: medium (HDF5 reading exists in JS; schema translation needed).
- **Requirements capabilities it could serve**: Full-state save/resume format (only for population state, not world data).

### 3.4 Alignment and matching (data fitting)
- **Where**: liam2/alignment.py (851 LOC), liam2/align_link.py (122 LOC), liam2/matching.py (378 LOC).
- **What it does**: Statistical alignment: fits simulated population to marginal distributions (e.g., age-sex totals from census). Matches entities across time steps (e.g., linking parents to offspring). Uses least-squares, hot-deck methods.
- **Quality & realism rating: 3/5** — Sound statistical methods; well-applied in population simulation. Not applicable to world generation.
- **Extractability: tangled** — Depends on numpy, scipy-like operations, larray. ~500 LOC core. Effort: medium-high.
- **Requirements capabilities it could serve**: None.

### 3.5 UI / Visualization / Console
- **Where**: liam2/console.py (356 LOC), liam2/charts.py (366 LOC), liam2/view.py (79 LOC), bundle/ (Tkinter-based GUI).
- **What it does**: Interactive console for exploratory analysis (post-sim query of results). Matplotlib charting for simple visualizations (histograms, timeseries). Desktop GUI bundled with installers.
- **Quality & realism rating: 2/5** — Basic console REPL and charting; adequate for data inspection. Tkinter GUI is dated. No relevance to world rendering.
- **Extractability: loosely coupled** — Console and charts are optional; core sim doesn't depend on them. Effort: low to exclude from extraction.
- **Requirements capabilities it could serve**: None.

---

## 4. Internal data representation

- **Grid / mesh type**: No spatial grid. Data structure is tabular (HDF5 tables): one row per agent, columns = fields (age, gender, location_id, etc.). Agents are unordered unless explicitly partitioned.
- **Resolution(s)**: Not spatial. Time step is user-defined (typically annual, but any integer). Population/household count is fixed at start or grown via birth/immigration.
- **Units**: Dimensionless for most attributes (age in years, IDs, categorical flags). Model parameters are user-tuned; no inherent calibration to physical units.
- **Coordinate conventions**: No coordinates. Agents may have a `location` or `region` field (categorical ID referencing an external geography), but no lat/lon, spatial relationships, or projections.
- **Time step / time representation**: Discrete, annual (or other user-chosen integer period). Stored in HDF5 tables indexed by period and agent ID.
- **Serialization**: HDF5 tables (via PyTables). Full state saved as snapshot: all agent fields + globals for a period. Resume from any saved period.
- **RNG/seed handling**: NumPy random seed set globally. Same seed ⇒ reproducible results within Python; depends on NumPy and Python version (not guaranteed across versions/platforms for exact floating-point replay). No explicit "preview" mode.
- **Zoom/multi-resolution**: None. No hierarchical spatial nesting; aggregate statistics can be computed post-hoc but no consistent detail across scales.

## 5. License

**SPDX**: GPL-3.0-only (GNU General Public License, version 3, 29 June 2007).
**File**: /Users/griffinfoster/Projects/MapMaker/upstream/LIAM2/COPYING (full GPL-3.0 text).
**Mixed licenses**: None detected. All code under GPL-3.0. Vendored dependencies (khash.h in liam2/) are included inline but not a separate license.
**Matches manifest**: Yes. Manifest lists "GPL-3.0".
**Copyleft strength**: Strong. Any derivative work must be GPL-3.0 compatible; source must be provided. Patent grant clause applies.
**Practical notes**: As a browser app, any GPL-3.0 code linked must be disclosed and source provided. LIAM2's Python core is GPL-3.0; if extracted and modified, derivative must be GPL-3.0 (or compatible, e.g., AGPL-3.0). No conflict with MIT/Apache-licensed browser frameworks, but attribution and source-release obligations apply. **No embedded proprietary code detected.**

**Git commit verified**: HEAD = 06288f1c12c74f8ec36fe125cb2378c933b37545.

## 6. Capability coverage summary (machine-readable table)

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Not a world-gen tool |
| Heightmap generation | no | — | — | — | Not a world-gen tool |
| Erosion | no | — | — | — | Not a world-gen tool |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | Not a world-gen tool |
| Climate – temperature | no | — | — | — | Not a world-gen tool |
| Climate – wind | no | — | — | — | Not a world-gen tool |
| Climate – ocean currents | no | — | — | — | Not a world-gen tool |
| Climate – precipitation | no | — | — | — | Not a world-gen tool |
| Climate – seasons | no | — | — | — | Not a world-gen tool |
| Biomes | no | — | — | — | Not a world-gen tool |
| Soils | no | — | — | — | Not a world-gen tool |
| Resources | no | — | — | — | Not a world-gen tool |
| Population & settlement | partial | 3 | tangled | liam2/entities.py, liam2/simulation.py, liam2/expr.py | Agent-based population dynamics; no spatial placement |
| Cities & towns | no | — | — | — | Could model aggregate town-level stats, not settlements in space |
| Languages & names | no | — | — | — | Not a world-gen tool |
| Political borders | no | — | — | — | Not a world-gen tool |
| Trade | no | — | — | — | Not a world-gen tool |
| Long-run history/war/economics/politics sim | partial | 2 | tangled | liam2/entities.py, liam2/simulation.py | Could frame agent rules for economic behavior; no historical event system or conflict sim |
| Planet-scale + regional patches (multi-resolution/zoom) | no | — | — | — | No spatial structure |
| Globe view | no | — | — | — | Not a world-gen tool |
| Flat projections | no | — | — | — | Not a world-gen tool |
| Partial-world inference | no | — | — | — | No spatial model to infer |
| Import of heightmaps/layers | no | — | — | — | No raster/grid support |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No multi-resolution or progressive-generation mode |
| Export (PNG/SVG/STL/other) | no | — | — | — | CSV/HDF5 output only |
| Full-state save/resume format | yes | 3 | loosely coupled | liam2/data.py, liam2/entities.py | HDF5 serialization; domain-specific to agent state, not world state |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | Not a world-gen tool |
| Planet-parameter derivation | no | — | — | — | Not a world-gen tool |

## 7. Verdict

- **Skip entirely.** LIAM2 is a demographic/economic microsimulation toolkit with zero overlap with MapMaker's core mission (world generation). Designed for agent-based population dynamics, policy evaluation, and economic modeling — not spatial simulation, terrain, climate, or biophysics.
- **No extractable subsystems.** The agent framework (entities, simulation loop) is inseparable from LIAM2's expression language, HDF5 storage, and larray abstractions, and is not suited to spatial/geographic modeling.
- **Discontinued project.** No longer maintained; not a suitable foundation for active development.
- **Language barrier.** Python + HDF5 + Cython is incompatible with browser deployment (MapMaker's default target). Porting to JS/TS would require rewrite, not extraction.
- **Mismatch in scope.** LIAM2 excels at temporal, cross-sectional agent dynamics with discrete time steps and non-spatial attributes. MapMaker needs continuous spatial simulation (terrain, climate, hydrology). The two problem domains are orthogonal.
- **Unverified but likely irrelevant**: LIAM2 may have optional "location" or "region" fields in example models, but these are agent *attributes*, not spatial modeling. No GIS, geospatial, or map-generation code found.
