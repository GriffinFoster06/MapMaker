# Audit: Badlands

## 1. Overview

**Badlands** (Basin and Landscape Dynamics) is a long-term, large-scale landscape evolution and sediment transport model designed to simulate Earth surface development from upstream erosional regions to marine depositional environments over geological timescales (thousands to millions of years). Active development by researchers at the University of Sydney, with a mature codebase (published on PyPI, extensive documentation, multiple peer-reviewed papers). ~12,200 lines of Python across 29 source files, plus ~2,000 lines of Fortran for performance-critical flow algorithms. Used in academic research (DOI published, Docker containers, Jupyter examples).

## 2. Language, runtime, dependencies, build

**Primary languages**: Python (~85% of codebase); Fortran (~15%, in `utils/` for flow network and mesh algorithms).

**Runtime**: Command-line Python application with optional parallelization (MPI-capable). Requires Conda/Micromamba environment with Fortran compiler (gfortran). No native browser runtime; designed for HPC or local workstations.

**Key dependencies** (from `pyproject.toml` and `environment.yml`):
- `triangle`: Delaunay triangulation for TIN construction
- `numpy` (strict: <2.0)
- `scipy` (>=1.2): spatial queries, interpolation
- `pandas` (>=0.24): data I/O
- `h5py` (>=2.8.0): HDF5 output format
- `matplotlib` (>=3.0): visualization
- `gFlex` (>=1.1.0): flexural isostasy computation
- `scikit-image` (>=0.15): image processing
- `six` (>=1.11.0): Python 2/3 compatibility
- Fortran compiler (gfortran) and build tools (Meson >=1.4.0, f2py)

**Build process**: Uses Meson build system with `mesonpy` backend. `meson.build` compiles Fortran modules (classfv, classoro, classpd) via f2py, then builds Python extension modules. CI (PyPI/Conda deploy workflows) uses `micromamba` to set up environment, then `python -m build`. **Build verified by inspection**: Requires native toolchain (Fortran compiler); no pre-built binaries for browser.

**Browser runtime feasibility**: **Very high effort to low feasibility**. Core algorithms are in Python and Fortran, tightly coupled. Would require: (1) Rewriting Fortran flow algorithms (flowalgo, classfv) to JavaScript (~2,000 LOC critical, non-trivial numerical algorithms); (2) Porting 12+ core Python modules (flow routing, diffusion, mesh refinement) to JS/TS; (3) Replacing Fortran-Python f2py bindings with WASM or pure JS; (4) Replacing HDF5/numpy I/O stack. **Estimated rewrite scope**: 10,000+ LOC, 8–12 weeks for a skilled developer. WASM porting of Fortran possible but would still require substantial Python module rewrite.

## 3. Subsystem inventory

### 3.1 Mesh & TIN representation
**Where**: `src/badlands/surface/` (elevationTIN.py, partitionTIN.py, raster2TIN.py, FVmethod.py).

**What it does**: Constructs and manages a Triangular Irregular Network (TIN) from input DEM or generated grid. Uses Delaunay triangulation (`triangle` library). Implements finite-volume discretization (Tucker et al. method) for solving continuity equations on the TIN. Supports node refinement under tectonic advection and dynamic rebalancing to maintain uniform node density.

**Quality & realism rating: 4/5**. Well-established finite-volume approach on TINs for landscape modeling. Supports adaptive refinement and edge-case handling (boundary conditions, node density). Complexity is appropriate for regional-to-continental scale over Myr. Limited by TIN scalability (millions of nodes feasible, but intensive). Good scientific pedigree (cited in hydrology/geomorphology literature).

**Extractability: Loosely coupled**. Depends heavily on `triangle` library (external), `numpy`, `scipy.spatial`. Core TIN logic (~1,200 LOC) is Python with numerical kernels in Fortran (`pdalgo.f90`). Would require: porting Fortran partition/flow algorithms to JS, replacing `triangle` with Delaunay.js or similar, adapting numpy-based linear algebra to typed arrays. **Effort: Medium-to-High** (~2–3 weeks for functional JS/TS version, assuming Delaunay.js available).

**Serves**: Heightmap generation, Hydrology, Planet-scale + regional patches (multi-resolution/zoom).

### 3.2 Flow network & stream routing
**Where**: `src/badlands/flow/flowNetwork.py`, `utils/flowalgo.f90`, `utils/classpd.f90`, `utils/classoro.f90`.

**What it does**: Implements single-flow-direction (SFD) stream routing using the O(n)-efficient stack-ordering algorithm from Braun & Willett (2013). Computes drainage direction, flow accumulation (unit catchment area, UA), stream power law incision via stack-based traversal. Handles orographic precipitation (Smith & Barstad linear model). Fortran subroutines (`buildfa`, `overlap`, `flowoverland`) handle performance-critical node partitioning and stack operations.

**Quality & realism rating: 4/5**. SFD routing is a well-validated standard in landscape modeling, though Multiple-Flow-Direction (MFD) alternatives exist (not implemented here). Stream power law is empirically grounded (m=0.5, n=1 defaults matched Earth geomorphology). Orographic precipitation coupling is physically motivated but simplified. Appropriate for 100m–10km resolution regional simulations; may underestimate lateral sediment redistribution.

**Extractability: Tangled**. Core logic is spread across Python (class state, convergence loops) and Fortran (node iteration, stack building). Python depends on: `scipy.spatial.cKDTree` (spatial indexing), `scipy.interpolate` (precipitation grids), `pandas` (I/O), `h5py` (state save), matplotlib (diagnostics). Fortran uses implicit module dependencies (`classfv` common blocks). To port: (1) Translate Fortran stack-building to JS (moderate complexity, ~500 LOC); (2) Replace cKDTree with kdtree.js; (3) Reimplement convergence iteration in JS. **Effort: High** (~3–4 weeks, due to Fortran-Python coupling and spatial-index dependencies).

**Serves**: Hydrology (rivers/watersheds), Erosion (channel incision), Heightmap generation.

### 3.3 Hillslope diffusion & soil creep
**Where**: `src/badlands/hillslope/diffLinear.py`.

**What it does**: Simulates hillslope processes (soil creep, mass wasting) using linear and nonlinear diffusion equations: `dh/dt = ∇²(κ∇h)` or modified form with critical slope (`Sc`). Linear diffusion produces convex-upward slopes; nonlinear captures threshold behavior (e.g., landslide angles). Applied uniformly across aerial, marine, and river domains with domain-specific diffusivity coefficients (CDaerial, CDmarine, CDriver).

**Quality & realism rating: 3/5**. Linear diffusion is a simplified but computationally efficient proxy for actual hillslope processes; nonlinear extension is physically more defensible but tuning is empirical. Treats hillslope as 2D PDE without explicit mechanics (no friction angle, cohesion, pore pressure). Works well as a phenomenological component when tuned (typically κ=0.01–0.1); less suitable for steep alpine terrain or landslide-prone regions. Good for fantasy world generation at 1–10 km resolution.

**Extractability: Loosely coupled**. ~400 LOC Python; relies on `numpy` for PDE solving (explicit finite-difference update), `scipy.spatial` for neighbor queries. No Fortran dependency (unlike flow routing). To port: translate PDE update loop and slope calculations to JS using typed arrays. **Effort: Low-to-Medium** (~1–2 weeks; standard numerical recipe, no complex data structures).

**Serves**: Erosion, Heightmap generation.

### 3.4 Fluvial incision & sediment transport
**Where**: `src/badlands/forcing/forceSim.py`, `src/badlands/simulation/buildFlux.py`, `src/badlands/underland/eroMesh.py`.

**What it does**: Implements six variants of stream power law incision: detachment-limited, transport-limited with tool/cover effects (parabolic, linear decline, dynamic cover), and threshold models. Updates channel elevations via: `dh/dt = κ_d * (PA)^m * S^n - deposition` (or similar). Sediment flux (`Q_s`) is routed downstream, with deposition when `Q_s > Q_t` (transport capacity). Capacity is `Q_t = κ_t * (PA)^m_t * S^n_t`. Includes sea-level and base-level effects (deepbasin, denscrit thresholds).

**Quality & realism rating: 4/5**. Stream power law is a well-tested, computationally efficient model matching thousands of real river profiles. Six variants allow tuning for different regimes (bedrock vs. alluvial). Tool/cover effects (parabolic) are grounded in sediment transport physics. Weak point: no explicit sediment-size sorting, simple transport capacity. At 100m–10km resolution over Myr, predictions match GPS-corrected uplift rates well (per literature).

**Extractability: Loosely coupled**. Incision logic is pure Python (~600 LOC), interleaved with flow network. Depends on flow-routing outputs (UA, slope, stack order). No Fortran or external numerical libraries beyond numpy. To port: extract incision update loop, adapt it to use flow-network outputs from ported flow module. **Effort: Medium** (~2 weeks; requires clean separation from flow-network module, which is not trivial in current codebase).

**Serves**: Erosion, Hydrology, Heightmap generation.

### 3.5 Wave-induced transport & coastal erosion
**Where**: `src/badlands/simulation/waveSed.py`, `utils/waveseds.f90`, `src/badlands/forcing/forceSim.py` (wave forcing).

**What it does**: Computes wave propagation in shallow water using linear wave theory; wave celerity `c = √(g*L/(2π))` (deep) or `√(g*d)` (shallow). Refraction via Huygens principle. Calculates wave-induced bottom shear stress and sediment transport via longshore drift. Includes wave-breaking conditions and energy dissipation. Fortran subroutine handles performance-critical wave-front propagation.

**Quality & realism rating: 3/5**. Linear wave theory is standard coastal engineering; Huygens refraction is geometric and accurate for large scales. Weak point: simplified sediment transport (no intra-wave orbital velocity asymmetry, no suspended load decoupling). Energy dissipation model is empirical. For coastal fantasy worlds at 1–10 km grid, produces visually plausible deltas and shorelines; lacks detail for fine wave-beach interaction. Reef growth coupling (carbonate production) is present but tuned to tropical carbonate platforms, not general.

**Extractability: Loosely coupled**. Wave propagation logic is ~400 LOC Python + ~300 LOC Fortran. Depends on mesh/elevation from TIN, sea-level forcing. No external libraries beyond numpy. To port: translate wave-front propagation (grid-based, can use raster math) and sediment transport to JS; Fortran kernel can be rewritten in JS (no complex linear algebra). **Effort: Low-to-Medium** (~2 weeks).

**Serves**: Erosion, Hydrology (wave-driven), Heightmap generation, Climate – ocean currents (partial: advective wave transport only, no thermohaline).

### 3.6 Tectonics & flexural isostasy
**Where**: `src/badlands/forcing/isoFlex.py`, `src/badlands/forcing/forceSim.py` (tectonic field parsing).

**What it does**: Applies user-defined 3D tectonic displacement fields (maps of cumulative vertical uplift/subsidence and horizontal shear) at each time step. Node positions are advected (`x_new = x + u_dt`), then rebalanced to maintain uniform density. Flexural isostasy (deflection of lithosphere under load) computed via gFlex library (Green's functions method; ~O(n²) complexity). Elastic thickness, mantle density, and sediment density are tunable parameters.

**Quality & realism rating: 3/5**. Tectonic advection is simple (Eulerian, no strain tracking). Flexural isostasy via Green's functions is accurate but computationally expensive (~minutes for large domains per step). Appropriate for plate-boundary-scale features (rifts, forelands) and passive margins; less suitable for distributed crustal deformation. Coupling with uplift-driven precipitation/erosion is present but decoupled (no feedback on overburden).

**Extractability: Loosely coupled**. Tectonic loading is ~200 LOC Python (field parsing, advection); flexural computation is delegated to gFlex (external C++ library). To port: tectonic advection to JS is trivial; flexural isostasy would require porting gFlex or replacing with simpler model (e.g., local isostatic adjustment, Airy compensation). **Effort: Medium** (tectonic advection: 1 week; flexure: 2–3 weeks if full gFlex port attempted, or 1 week if replaced with Airy model).

**Serves**: Tectonics, Heightmap generation, Climate (orographic coupling).

### 3.7 Climate forcing (rainfall, sea-level, orography)
**Where**: `src/badlands/forcing/forceSim.py` (XML parsing and grid interpolation), `src/badlands/forcing/xmlParser.py` (parameter definitions).

**What it does**: Loads time-varying rainfall grids or applies constant precipitation. Orographic precipitation model (Smith & Barstad, 2006): precipitation `P = P_0 * exp(−z/H_scale)` modified for wind direction and Coriolis (parameterized). Sea-level curves (eustatic or user-defined) interpolated from time series. Rainfall and sea-level are applied uniformly or spatially varying (gridded). No seasonal variation, no temperature model, no wind-driven currents (beyond wave-induced nearshore drift).

**Quality & realism rating: 2/5**. Rainfall is either uniform (unrealistic) or read from external grids (not generative). Orographic model is simplified (no convective triggering, limited by 1D vertical). Sea-level is prescribed (no dynamic oceanography). **Missing entirely**: temperature, wind patterns, ocean currents, seasons, humidity, evapotranspiration. This subsystem is a framework for *applying* climate forcings, not a climate model. Suitable for parameterized sensitivity studies; unsuitable for generating realistic climate fields from first principles.

**Extractability: Standalone**. Climate forcing is ~500 LOC Python, purely I/O and interpolation. Depends on `numpy`, `scipy.interpolate`, `h5py` (file I/O). No Fortran, no complex numerics. To port: read forcing grids (HDF5), interpolate in space/time with JS, apply to flow/erosion modules. **Effort: Low** (~1 week; mostly data plumbing).

**Serves**: Climate – precipitation (partial: orographic model only), Heightmap generation.

### 3.8 Stratigraphy & sediment routing
**Where**: `src/badlands/underland/` (strataMesh.py, stratiWedge.py, carbMesh.py, eroMesh.py).

**What it does**: Tracks sediment layers (strata) as they are deposited and buried. Each layer records thickness, deposition time, lithology. Wedge geometry is stored (pinch-outs, onlap, toplap). Compaction is applied as burial depth increases. Exports stratigraphic sections (wells) and cross-sections (XYZ stratal geometry). Carbonate and siliciclastic lithologies are tracked separately (carbMesh for coral/carbonate platforms).

**Quality & realism rating: 3/5**. Stratigraphic bookkeeping is sound (layer stacking order, time-depth relationships); compaction is simplified (empirical porosity-vs.-depth curve, no overpressure). Good for sequence stratigraphy teaching and basin evolution visualization. Limited by single-lithology-per-cell assumption (no intra-layer heterogeneity). Suitable for fantasy world generation (historical layers, basin fill patterns).

**Extractability: Loosely coupled**. ~1,500 LOC Python for layer management, output formatting. Depends on core mesh (TIN) for spatial reference, h5py for I/O. No external algorithms or Fortran. To port: represent strata as 3D array (nodes × time, per lithology), update on each erosion/deposition step, export to JSON or binary. **Effort: Low-to-Medium** (~2 weeks; mostly data structure porting).

**Serves**: Full-state save/resume format, Export (custom), Heightmap generation.

### 3.9 Carbonate production & reef growth
**Where**: `src/badlands/forcing/carbGrowth.py`, `src/badlands/forcing/pelagicGrowth.py`, `src/badlands/underland/carbMesh.py`.

**What it does**: Simulates carbonate platform growth in shallow marine settings. Growth rate is depth-dependent (highest in photic zone, 0–100m) and parameterized by saturation state, temperature, sediment stress. Two species: calcifiers (coralline) and plankton (pelagic). Restricts growth to warm waters and shelf depths. Output includes reef facies maps and time series of carbonate flux.

**Quality & realism rating: 2/5**. Carbonate model is a phenomenological parameterization, not a mechanistic model. Growth rates are empirical lookup tables (tuned to modern coral, not general). Temperature is *required* input (not modeled). Suitable for Cenozoic tropical sequences; not for siliciclastic-dominated or polar systems. For fantasy worlds, produces visually reasonable reef/shelf deposits but requires careful tuning of growth rates.

**Extractability: Loosely coupled**. ~600 LOC Python for depth/saturation lookups and rate application. Depends on mesh elevation, temperature grids (external input). No Fortran or complex numerics. To port: look-up-table logic to JS, apply growth rate in sediment-routing loop. **Effort: Low** (~1 week).

**Serves**: Resources (carbonate platforms), Biomes (implicit: restricts to warm waters), Soils (indirectly: deposits sediment type).

### 3.10 Visualization & I/O
**Where**: `src/badlands/surface/visualiseTIN.py`, `src/badlands/flow/visualiseFlow.py`.

**What it does**: Exports TIN geometry to VTK/XDMF/HDF5 formats (for ParaView), plots drainage networks and flow patterns with matplotlib, writes QGIS-compatible GeoTIFF. Handles raster to TIN conversion (raster2TIN.py) for DEM input. All state is saved to HDF5 (checkpoint restart capability).

**Quality & realism rating: 4/5**. VTK/XDMF export is industry-standard for geoscience visualization. HDF5 is robust for large datasets. Raster–TIN conversion is accurate (interpolation-based). Weak point: matplotlib output is static (no interactive 3D in browser). **Missing**: real-time browser rendering, web UI (this is a CLI tool).

**Extractability: Standalone**. I/O modules are ~800 LOC pure Python, using `h5py`, `numpy`, `scipy`. No Fortran, no heavy numerics. To port: read HDF5 in JS/WASM (hdf5.js or similar), render via THREE.js or Babylon.js, export PNG/SVG/STL via canvas + 3D libraries. **Effort: Low-to-Medium** (~2 weeks for basic web viewer; more for advanced features like cross-sections).

**Serves**: Export (PNG heightmap, SVG, custom), Flat projections (export to raster), Full-state save/resume format.

## 4. Internal data representation

**Grid type**: Triangular Irregular Network (TIN) with Delaunay triangulation. Regular raster grids are converted to TIN on startup (raster2TIN.py).

**Resolution**: User-specified as `resfactor` (input DEM resolution / resfactor). Typically 100m–5km spacing for continental-scale runs; adaptively refined under strong tectonic gradients. Nodes in millions (2–10 M nodes for 2000×2000 km domain).

**Units**: Horizontal in meters (SI); vertical (elevation, displacement) in meters; time in years (geological). Stream power exponents are dimensionless; diffusivity is m²/year. All parameters assume Earth-like gravity and rock densities (calibrated against real data).

**Coordinate conventions**: Cartesian (x, y, z) on a plane (not lat/lon or spherical). Origin is arbitrary; positive z is upward. Periodic/reflective boundaries configurable per edge. **No wraparound or pole handling** (regional model assumption, not global). CRS not explicitly tracked (user responsibility).

**Time stepping**: Explicit forward Euler. Time step is limited by CFL condition (Courant number) set per process (diffusion, incision, wave). Adaptive stepping not implemented (user must supply dt). Time state is in years, tracking both simulation time (`tNow`) and output intervals.

**State serialization**: Full model state saved to HDF5 (checkpoints). Each output writes: TIN geometry (node coords, connectivity), elevation, velocity/displacement, sediment flux, stratal layers, wave/climate state. HDF5 format allows parallel I/O (HDF5 MPI backend optional). **Seed/RNG**: No explicit RNG in core (deterministic given initial conditions); random initial roughness can be added at setup.

**Multi-resolution/zoom consistency**: TIN is a single surface; no level-of-detail or mipmap structure. Refinement is global (all nodes rebalanced together), not hierarchical. Exporting to raster at different resolutions is done post-hoc via interpolation. **Risk**: no guarantee of visual consistency across zoom levels in real-time rendering (would require hierarchical mesh).

## 5. License

**SPDX**: GPL-3.0 (files: `/LICENSE`, `/COPYING`)

**Verification**: Read `/LICENSE` (GPLv3 full text), `/COPYING` (GPLv3 again), `/COPYING.LESSER` (LGPL, present but not primary). Source files (e.g., `model.py`, `flowNetwork.py`) declare "GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or any later version" (LGPL phrasing).

**Observation**: License files conflict slightly in nomenclature: `/LICENSE` and `/COPYING` are GPLv3, but source code headers say LGPL. Likely the project intends LGPL (more permissive than GPL) but included full GPL text for reference. `pyproject.toml` references `{file = "LICENSE"}` (GPLv3 text).

**Per-directory differences**: No per-file or per-directory license overrides found. Vendored code in `/utils/orderpack.f90` (sorting) appears unlicensed but is a utility module. All Python/Fortran core is uniformly LGPL-3.0 or GPL-3.0.

**Practical implications**: LGPL-3.0 is copyleft (modifications to Badlands must remain open-source if distributed). Patent grant is included (defensive). **No linking restrictions** unlike GPL-3.0 (a C library can link to LGPL without requiring the caller to be open-source). Suitable for open-source projects; incompatible with proprietary/closed-source downstream use.

**Matches manifest**: Manifest states "GPL-3.0" → actual license in `/LICENSE` is GPLv3. Source headers say LGPL-3.0. **Conflict recorded but not critical** (LGPL-3.0 is compatible with GPL-3.0; derivative works must be LGPL-3.0 or GPL-3.0+).

**Git HEAD**: `975f595ae313dd08d674c0effde18b5e8155f597`

## 6. Capability coverage summary (machine-readable table)

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | yes | 3/5 | loose | `forcing/isoFlex.py`, `forcing/forceSim.py` | User-prescribed 3D displacement fields + flexural isostasy. |
| Heightmap generation | yes | 4/5 | loose | `flow/flowNetwork.py`, `hillslope/diffLinear.py`, `simulation/buildFlux.py` | Stream power + diffusion on TIN; needs tuning. |
| Erosion | yes | 4/5 | loose | `simulation/buildFlux.py`, `flow/flowNetwork.py` | Stream power law (6 variants) + hillslope diffusion. |
| Hydrology (rivers/lakes/watersheds) | partial | 3/5 | loose | `flow/flowNetwork.py`, `simulation/waveSed.py` | SFD routing, drainage accumulation, no explicit lakes. |
| Climate – temperature | no | — | — | — | Required as input, not generated. |
| Climate – wind | no | — | — | — | Not modeled; wave boundary conditions only. |
| Climate – ocean currents | partial | 2/5 | loose | `simulation/waveSed.py` | Wave-driven nearshore drift only; no thermohaline. |
| Climate – precipitation | partial | 2/5 | standalone | `forcing/forceSim.py` | Orographic model; mostly user-prescribed grids. |
| Climate – seasons | no | — | — | — | Not modeled. |
| Biomes | no | — | — | — | Not modeled (carbonate platform facies only). |
| Soils | partial | 2/5 | loose | `underland/strataMesh.py` (lithology) | Lithology tracking in strata; no properties (pH, fertility). |
| Resources | partial | 2/5 | loose | `forcing/carbGrowth.py` | Carbonate platforms only; no metals, hydrocarbons, etc. |
| Population & settlement | no | — | — | — | Not modeled. |
| Cities & towns | no | — | — | — | Not modeled. |
| Languages & names | no | — | — | — | Not modeled. |
| Political borders | no | — | — | — | Not modeled. |
| Trade | no | — | — | — | Not modeled. |
| Long-run history/war/economics/politics sim | no | — | — | — | Not modeled. |
| Planet-scale + regional patches (multi-res) | partial | 2/5 | loose | `surface/elevationTIN.py` | Single TIN per run; no hierarchical LOD or consistent cross-zoom rendering. |
| Globe view | no | — | — | — | Cartesian plane only; no spherical geometry. |
| Flat projections | yes | 3/5 | loose | `surface/visualiseTIN.py` (raster export) | Export to raster (equirectangular); no Mercator/equal-area. |
| Partial-world inference | no | — | — | — | Not modeled. |
| Import of heightmaps/layers | yes | 4/5 | loose | `surface/raster2TIN.py` | Raster DEM to TIN interpolation; supports GeoTIFF. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No preview mode; deterministic given inputs. |
| Export (PNG/SVG/STL/other) | partial | 3/5 | loose | `surface/visualiseTIN.py` | PNG (raster), VTK/XDMF (3D); no SVG or STL directly. |
| Full-state save/resume format | yes | 4/5 | loose | `simulation/checkPoints.py`, I/O (HDF5) | HDF5 checkpoint; allows restart at any step. |
| Earth-data calibration (elevation/climate/Köppen) | partial | 3/5 | loose | `forcing/xmlParser.py` | Parameters tuned against real river profiles, coral growth; no Köppen export. |
| Planet-parameter derivation | no | — | — | — | Not modeled; parameters must be set manually. |

## 7. Verdict

- **Worth extracting**: (1) **Stream power + diffusion erosion engine** (flowNetwork + buildFlux + diffLinear): This is the highest-quality subsystem (4/5 rating, published algorithms). Effort: 4–5 weeks to port core flow + incision to JS/TS. Reusable for any fantasy heightmap generator. (2) **TIN mesh representation**: Delaunay TIN is versatile and well-tested; extractable as a standalone module (~2–3 weeks). (3) **Wave + coastal transport**: Simplified but visually plausible for shorelines, relatively easy to extract (~2 weeks).

- **Skip or defer**: (1) **Climate subsystem**: Minimal value (mostly I/O, no generation). Skip or replace with simpler procedural model. (2) **Carbonate growth**: Highly specialized (coral only), limited generalizability. (3) **Tectonic flexural isostasy**: Complex (gFlex dependency), valuable but high effort; extract tectonic advection only, replace flexure with simpler Airy model if needed. (4) **Stratification**: Useful for internal state tracking but not essential for MVP; extract later. (5) **Biomes, population, cities, history, politics, trade**: Entirely absent; not applicable.

- **Biggest risks**: (1) **Language & coupling**: Fortran-Python bindings (f2py) are entangled with core algorithms (flow, mesh). Must carefully separate or rewrite in pure JS. (2) **Dependency chain**: gFlex (C++), triangle (C), scipy.spatial (C), h5py (C) are non-trivial to replace or port. For browser runtime, WASM wrappers or pure-JS alternatives are needed. (3) **Performance**: Badlands is optimized for offline batch runs (HPC, MPI). Browser JS will be much slower; interactive real-time generation at continental scale may be infeasible without aggressive optimization or LOD strategies.

- **Unverified points**: (1) Scaling behavior on very large domains (>100M nodes) not tested. (2) Interaction between orographic precipitation and topography-driven erosion feedback loops not analyzed in the audit. (3) Exact numerical stability under extreme parameter ranges (e.g., very high rainfall, fast uplift) not verified; likely user-dependent.

