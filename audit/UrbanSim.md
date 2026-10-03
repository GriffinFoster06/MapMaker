# Audit: UrbanSim

## 1. Overview

UrbanSim is an active, mature open-source Python platform maintained by the Urban Data Science Toolkit (UDST). Developed by UrbanSim Inc. and contributors, it provides statistical methods and reusable model components for simulating urban development, real estate markets, household/employment location choice, and demographics at regional scale.

**Status**: Active development (commit 1a9a68e9bfe34dd31c68bf9480c4fc65334663e0, Oct 2024).
**Size**: ~10,649 lines of Python code across 7 main modules.
**Maturity**: Production-grade; deployed by dozens of US cities and regions for policy scenario analysis.
**Author**: UrbanSim Inc. with UDST community contributions.
**Primary use case**: Operational regional forecasting, not world generation.

## 2. Language, runtime, dependencies, build

**Language**: Python 100% (no C/C++/Fortran).
**Python version**: 3.10+ required.
**Runtime**: CPU-based; designed for conventional execution. No GPU acceleration.
**Build**: setuptools; `pip install urbansim` or `conda install urbansim -c conda-forge`.
**Does it build?** Yes. Inferred from CI (GitHub Actions test.yml), pyproject.toml, and active PyPI distribution.

**Core dependencies** (pyproject.toml):
- numpy ≥1.26, pandas ≥2.2, scipy ≥1.10, statsmodels ≥0.14 (data/stats backbone)
- orca ≥1.8 (UDST task orchestration)
- patsy ≥0.5.6 (formula parsing for models)
- pyyaml, toolz, prettytable (utilities)

**Optional**: pandana ≥0.8 (network accessibility; adds scikit-learn, tables dependencies).
**Test/dev**: bottle, jinja2, matplotlib, pytest, simplejson.

**Browser portability: HIGH EFFORT.** Core models rely heavily on pandas DataFrames, numpy arrays, and scipy stats. No web-native version exists. Full browser deployment would require: (1) JS/TS data structure equivalents (danfo.js for DataFrames, numeric.js for linalg), (2) rewrite of statsmodels formulas to JS, or (3) WASM-compiled scipy/pandas (feasible but non-trivial). Estimate: 4–6 weeks for a minimal JS port of core location-choice and transition models. Maps module is Bottle-based REST+HTML; could be rewritten in Node/Express + Leaflet in 1–2 weeks but is not the core value.

## 3. Subsystem inventory

### 3.1 Discrete Choice Models (Location Choice)
- **Where**: `urbansim/models/dcm.py` (1,866 LOC), `urbansim/urbanchoice/mnl.py` (275 LOC), `urbansim/urbanchoice/pmat.py` (254 LOC).
- **What it does**: Multinomial logit (MNL) estimation and prediction for household/employment location choice. Agents (households, jobs) choose among alternatives (residential units, job sites, zones) based on utility functions derived from hedonic attributes (price, accessibility, amenities). Supports filtering, segmentation, and customizable choice sets.
- **Quality & realism rating: 4/5.** Industry-standard MNL approach, well-tested in production models. Properly handles unobserved heterogeneity, income segmentation, and availability constraints. Limitation: static utility functions (no dynamic learning or feedback loops); assumes stable preferences across time.
- **Extractability: Loosely coupled.** Models depend on pandas DataFrames and patsy formulas; interaction matrices can be computed independently. Core logic (probability calculation, choice simulation via `np.random.choice`) is self-contained. Extract: ~500 LOC core math; remaining is I/O and pandas integration. **Effort to JS/TS**: Medium (2–3 weeks). Need JS multinomial sampling, formula evaluation, matrix operations.
- **Requirements capabilities it could serve**: Population & settlement (location choice), Cities & towns (where agents live/work), partial Trade (commuting patterns).

### 3.2 Relocation Models
- **Where**: `urbansim/models/relocation.py` (159 LOC).
- **What it does**: Identifies "movers" within a population based on exogenous relocation rates segmented by agent attributes (age, income, household type). Probabilistic binary choice: agent relocates if `random() < rate`. Supports rate table with min/max filters on demographic bins.
- **Quality & realism rating: 2/5.** Simplistic rate-driven model. Realistic in capturing aggregate demographic churn but ignores reasons for moving (e.g., job changes, family events, dissatisfaction). No feedback from market state or agent heterogeneity beyond table lookup.
- **Extractability: Standalone.** ~50 LOC core logic (filter + random comparison). No external dependencies except pandas for filtering. **Effort**: Low (1 week); straightforward array operations.
- **Requirements capabilities it could serve**: Population & settlement (churn and turnover).

### 3.3 Transition Models (Population Dynamics)
- **Where**: `urbansim/models/transition.py` (554 LOC).
- **What it does**: Adds/removes agents from population based on target totals or growth rates. Replicates rows (duplicate agent attributes) proportionally for births/immigration; removes rows randomly for deaths/emigration. Maintains index continuity and accounting (row-count or custom column-based).
- **Quality & realism rating: 2/5.** Mechanistic; no demographic age structure, fertility, mortality, or migration logic. Suitable for top-down cohort balancing but not bottom-up population projection. Treats all agents as identical when sampling (no preference for young families to replicate vs. elderly).
- **Extractability: Standalone.** ~150 LOC core (sample_rows, index management). Minimal dependencies. **Effort**: Low (1 week).
- **Requirements capabilities it could serve**: Population & settlement (growth, decline).

### 3.4 Supply & Demand (Real Estate Price Adjustment)
- **Where**: `urbansim/models/supplydemand.py` (92 LOC).
- **What it does**: Iteratively adjusts property prices to equilibrate supply and demand. Computes demand as summed choice probabilities; supply as unit count. Price multiplier = demand/supply, clipped and applied per iteration (default 5 iterations). Submarkets supported via segmentation key (e.g., zone_id, property type).
- **Quality & realism rating: 3/5.** Simplified hedonic equilibrium; assumes price elasticity of ~1 and homogeneous substitution within submarket. Works in practice for operational models but lacks income effects, speculation, or credit constraints.
- **Extractability: Loosely coupled.** Depends on choice-model probabilities and groupby operations. Core algorithm (groupby.sum, ratio, clip) is generic. **Effort**: Medium (2 weeks); needs custom groupby semantics in JS.
- **Requirements capabilities it could serve**: Trade (implicit good-market clearing), Population & settlement (housing affordability effects).

### 3.5 Regression Models (OLS Forecasting)
- **Where**: `urbansim/models/regression.py` (1,031 LOC).
- **What it does**: Wraps statsmodels OLS for model estimation and prediction. Supports patsy formula syntax for variable transformations (log, polynomials, interactions). Estimable, predictable base class; subclasses for segmented regression.
- **Quality & realism rating: 4/5.** Standard least-squares inference; properly handles missing data, multicollinearity diagnostics. Good for price forecasting and accessibility relationships. Limitation: linear-only (no GLM for counts or classification within core model).
- **Extractability: Tangled with statsmodels.** OLS logic must be reimplemented or bound to a JS stats library (simple-statistics, jStat, or jstat.js). Formula parsing (patsy) also needs porting. **Effort**: High (4–6 weeks) for a usable subset; medium (2–3 weeks) for basic linear fit without diagnostics.
- **Requirements capabilities it could serve**: Long-run history (trend forecasting), Population & settlement (demographic forecasting).

### 3.6 Maps (Web Visualization)
- **Where**: `urbansim/maps/dframe_explorer.py` (67 LOC), `urbansim/maps/dframe_explorer.html` (27 KB HTML/JS).
- **What it does**: Bottle-based REST server that queries pandas DataFrames and renders results on a Leaflet map via GeoJSON zones. Allows filtering, grouping, and aggregation (sum, mean, etc.) on simulation outputs. Very basic—no spatial analysis, only display.
- **Quality & realism rating: 1/5.** Bare-bones visualization; not a mapping engine. Assumes zones pre-defined in GeoJSON; no terrain, no routing, no analytics. Suitable for result browsing, not for world generation or spatial reasoning.
- **Extractability: Standalone.** Bottle can be replaced with Express/Node or built directly into a React app. **Effort**: Low (1 week) to rewrite in modern web stack.
- **Requirements capabilities it could serve**: Globe view (very limited; static zones only), Flat projections (assumed; no reprojection logic).

### 3.7 Utilities & Developer Tools
- **Where**: `urbansim/utils/` (434 LOC misc, 255 LOC YAML I/O, 234 LOC sampling), `urbansim/developer/` (sqftproforma, developer economics).
- **What it does**: Miscellaneous: file I/O, logging, range calculations. YAML config serialization (model specs). Sampling utilities (weighted row replication). Developer module estimates real-estate feasibility (construction cost, rent, profit).
- **Quality & realism rating: 3/5.** Utilities are solid; developer module is simplified (no financing, zoning, or detailed construction phasing).
- **Extractability: Standalone.** Most reusable as-is with minimal adaptation.
- **Requirements capabilities it could serve**: Cities & towns (feasibility heuristics, if extracted), Trade (developer decision-making, partial).

## 4. Internal data representation

**Grid/Mesh type**: Not grid-based. Representation is tabular (pandas DataFrames): agents (households, jobs, developers) as rows; alternatives (zones, parcels, buildings) as rows; attributes as columns.

**Resolution & Scope**: User-defined zones (e.g., traffic analysis zones, census tracts, parcels). Typical resolution: 100s to 1000s of zones per region; agent counts: 100k–10M rows. No fixed grid; spatial extent is determined by input data footprint.

**Units & Coordinate Conventions**: Unspecified in library; delegated to user (typically WGS84 lat/lon or state plane projections). No coordinate system enforcement. Time step: annual (typical in operational models, user-configurable).

**Serialization/Save Format**: YAML for model specifications (transition rules, filters, formula strings); CSV/HDF5 for DataFrames. No native checkpoint format for full simulation state (agents + parameters + RNG state). Maps module assumes GeoJSON zones; can serialize to shapefile via external tools (GDAL, GeoPandas).

**RNG/Seed Handling**: Uses `np.random.seed()` (NumPy global RNG). No explicit seed tracking per agent or per model step; requires manual seed management in calling code. Reproducibility: supported if seed is set at experiment start, but not portable across NumPy versions.

**Relevance to zoom/multi-resolution**: None. UrbanSim is zone-based, not hierarchical. No built-in zoom consistency or aggregation/disaggregation between scales. Multi-resolution would require external bookkeeping (e.g., nested zone hierarchies, manual resampling).

## 5. License

**Verified SPDX**: BSD-3-Clause (custom to UrbanSim Inc.).
**File**: `LICENSE.txt` (confirmed).
**Copyright**: UrbanSim Inc., 2020.
**Full text**: Standard 3-clause BSD (no resale restrictions, no resale clause unlike some other clauses). Permits commercial use, modification, redistribution under conditions (retain notice, include disclaimer).
**Matches manifest?** Yes. Manifest lists `BSD-3-Clause-style (custom UrbanSim Inc.)`. LICENSE.txt matches.
**Per-directory variations?** None detected (no vendored code, no subdirectory overrides).
**Practical notes**: Clean commercial-friendly license. No copyleft or attribution-beyond-notice requirements. Safe to extract and adapt.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | No | — | — | — | Out of scope. |
| Heightmap generation | No | — | — | — | Out of scope. |
| Erosion | No | — | — | — | Out of scope. |
| Hydrology (rivers/lakes/watersheds) | No | — | — | — | Out of scope. |
| Climate – temperature | No | — | — | — | Out of scope. |
| Climate – wind | No | — | — | — | Out of scope. |
| Climate – ocean currents | No | — | — | — | Out of scope. |
| Climate – precipitation | No | — | — | — | Out of scope. |
| Climate – seasons | No | — | — | — | Out of scope. |
| Biomes | No | — | — | — | Out of scope. |
| Soils | No | — | — | — | Out of scope. |
| Resources | No | — | — | — | Out of scope. |
| Population & settlement | Partial | 3–4 | Loose | `models/dcm.py, relocation.py, transition.py` | Location choice, relocation, and cohort balancing; lacks spatial birth/death logic, migration patterns, settlement clustering. |
| Cities & towns | Partial | 2 | Loose | `models/dcm.py, supplydemand.py, developer/sqftproforma.py` | Zone-based location choice and price equilibration; no city morphogenesis, growth cores, infrastructure, or hierarchical structure. |
| Languages & names | No | — | — | — | Out of scope. |
| Political borders | No | — | — | — | Out of scope. |
| Trade | Partial | 2 | Tangled | `models/supplydemand.py` | Implicit market clearing via supply/demand; no explicit goods, transport networks, or economic accounting. |
| Long-run history/war/economics/politics sim | Partial | 1 | Tangled | `models/regression.py, transition.py` | Forecasting (OLS) supports trend projection; no causal model of historical events, conflict, or governance. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | No | — | — | — | Zone-based only; no multi-scale hierarchy or zoom consistency. |
| Globe view | No | — | — | — | Maps module is zone-based static display; no globe rendering. |
| Flat projections | Partial | 1 | Standalone | `maps/dframe_explorer.py` | Assumes fixed GeoJSON zones (no reprojection logic); display only. |
| Partial-world inference | No | — | — | — | Out of scope. |
| Import of heightmaps/layers | No | — | — | — | Can import zone boundaries as GeoJSON/shapefile (external tool), not heightmaps. |
| Fidelity/speed slider with same-seed preview | No | — | — | — | No preview/fidelity infrastructure; seed control is manual. |
| Export (PNG/SVG/STL/other) | Partial | 1 | Standalone | `maps/` | Web map can be screenshot; no native export. |
| Full-state save/resume format | No | — | — | — | Only YAML specs + CSV snapshots; no checkpoint format for stochastic state. |
| Earth-data calibration (elevation/climate/Köppen) | No | — | — | — | Out of scope; only real-estate/demographic calibration to observed zones. |
| Planet-parameter derivation | No | — | — | — | Out of scope. |

## 7. Verdict

- **Extract: Yes, selectively.** Discrete choice models (`dcm.py`, `mnl.py`) and transition logic (`transition.py`) are well-designed, loosely coupled, and directly relevant to settlement growth and population dynamics. These are the core assets. Location choice is essential for city generation; relocation and transition provide demographic churn.

- **Skip: Maps module, regression models, supply/demand (for now).** Maps is too basic for MapMaker's scope. Regression/supply-demand are valuable for operational urban planning but less critical than choice mechanics for fantasy world generation. Revisit later if economic simulation is prioritized.

- **Biggest risk: Python→JS porting effort.** Core models depend heavily on pandas and NumPy. A minimal JS port (location choice + transitions) is feasible in 4–6 weeks; full feature parity is 8–12 weeks. Alternative: keep Python backend in a server or Jupyter cell, with JS frontend. This trades complexity for faster delivery but ties the app to a Python runtime.

- **Open question: Will formula-based utility functions work for fantasy?** UrbanSim uses hedonic regression (price, distance, density) calibrated to real cities. Fantasy worlds lack comparable real-estate markets. Decision: (1) adapt utilities to fantasy attributes (magic, danger, culture affinity), or (2) use choice model purely as mechanism, with handcrafted utility weights. Recommend (2) for simplicity.

- **Integration opportunity: Orca (task orchestration).** UrbanSim's Orca orchestrator could structure MapMaker's simulation pipeline (tectonics → climate → settlements → trade). Orca is well-designed and lightweight (could be ported to JS or kept as a Python bridge). Worth evaluating.
