# Reconciliation, group 2: Badlands, ParFlow, WRF-Hydro, PISM, Delft3D

2026-10-18. Documentation only: no code, `upstream/` or `packages/gen-orogen/vendor/` file was changed, and no dependency was touched.

**Why:** the 2026-10-13 planning overhaul (notes 15–38, the §7.0 roadmap, the matrix's "Expanded scope" section) was written without `upstream/` checked out. This pass checks every claim about these five repos in `audit/<repo>.md`, `audit/CAPABILITY_MATRIX.md`, `docs/ARCHITECTURE.md` and `docs/design/` against the source at the commits pinned in `upstream-manifest.json`.

**Method:** as in group 1. One subagent per repo read the source and checked the claims. The coordinator then re-checked the key facts by hand, because each first report had errors:
- the Badlands report called the incision "implicit" (it is explicit, rate × dt with a CFL step) and saw nothing wrong in the licence section;
- the ParFlow report confirmed `geostats.c` kriging and Brooks–Corey curves, and neither exists;
- the WRF-Hydro report confirmed the audit's file count by leaving out `src/Land_models/`;
- the PISM report confirmed "public domain or BSD" for two vendored libraries that are GPL;
- the Delft3D report missed that `engines_gpl/wave/` has no wave formulas and that "Watanabe" does not exist in the source.

Every path:line below was read in the source. Line numbers are at the pinned commit.

**Verdicts:** **Confirmed** means the claim is correct as written. **Changed** means the pick stands but a detail was wrong (path, function, scope, feasibility or licence) and has been corrected. **Dropped** means the pick or citation cannot work as planned. **New** is a reference added by this pass.

**Feasibility column:** **dmath** means it can be ported to TypeScript, run through `dmath` in a worker, and is deterministic. **Ref** means it is only an algorithm or parameter reference. **Oracle** means it is only usable as native golden data in tests.

| Repo | Commit | Licence (as found) | Recorded |
|---|---|---|---|
| Badlands | `975f595` | Root `LICENSE` and `COPYING` are GPLv3 and `pyproject.toml:29` points to `LICENSE`; `COPYING.LESSER` is LGPLv3; the only two headed files (`src/badlands/model.py:3–5`, `__init__.py`) say LGPL-3.0-or-later; every other file points to a `LICENSE.md` that does not exist | Manifest `GPL-3.0`; matrix licence table (now with the LGPL note); `audit/Badlands.md` §5 |
| ParFlow | `abb239b` | LGPL-2.1 (`LICENSE.txt:12`, `:27`); headers mis-cite "GNU General Public License ... version 2.1" (`pfsimulator/parflow_lib/nl_function_eval.c:11–16`). Third-party: MIT mesh simplification (`pftools/third_party/simplify.h`), MIT-style TCLAP, MIT cJSON, a vendored 1999 LLNL KINSOL (`pfsimulator/kinsol/`) with no separate licence | Manifest `LGPL-2.1`; `audit/ParFlow.md` §5 |
| WRF-Hydro | `47a64b6` | Custom UCAR: "You shall not sell, license or transfer for a fee the Software, or any work that in any manner contains the Software" (`LICENSE.txt:6–7`). `src/Rapid_routing/LICENSE` is BSD-3-Clause | Manifest; matrix licence table; `audit/WRF-Hydro.md` §5; ARCH Q12 |
| PISM | `6314953` | GPL-3.0-or-later (`COPYING`; e.g. `src/verification/tests/exactTestsABCD.c` header). Vendored: cubature GPL-2.0-or-later (`src/external/cubature/cubature.c:1–12`), CalCalcs GPL-3.0-or-later (`src/external/calcalcs/README:31–33`), nlohmann/json MIT | Manifest `GPL-3.0`; `audit/PISM.md` §5 (vendored licences corrected) |
| Delft3D | `38d2603` | Multiple (`LICENSE:9–12`): D-Flow FM AGPL-3.0 (1,482 headed files in `src/engines_gpl/dflowfm/packages`); `src/utils_gpl/` (morphology) and Delft3D-FLOW GPL-3.0-only ("the Free Software Foundation version 3", e.g. `tranb7.f90`, `bott3d.f90`); `utils_lgpl` LGPL-2.1; SWAN GPL-2.0-or-later (`src/third_party_open/swan/swan_license_info.txt`) | Manifest "Multiple (LGPL-2.1, Apache-2.0, others per component)", which is incomplete (not edited: configuration); matrix licence table; `audit/Delft3D.md` §5 |

None of these five has code extracted yet, so `PROVENANCE.md` has no rows for them. That is correct for now; each port will need a row when it lands.

## Badlands

Frame and units, verified:
- **Grid:** a planar TIN in Cartesian x, y metres, z up, with Voronoi cell areas `Acell` in m² (`flowNetwork.py:557`, discharge = `Acell · rain`). Neighbour lists hold up to 20 entries (`utils/sfd.c:14`). There is no lat/lon and no sphere.
- **Units:** elevation m; rain m/a (`flowNetwork.py:551`); time in years (sediment load converted with 3.154e7 s/a, `flowNetwork.py:884`).
- **To canonical:** every quantity is a per-node scalar, so no axis permutation is needed. On the sphere mesh, distances become great-circle distances between cell centres and `Acell` becomes the spherical cell area. Elevation in metres matches canonical.
- **Scheme:** incision is **explicit**: E·dt, clipped to the local drop, with dt from `flowcfl` (`utils/flowalgo.f90:396`) and deposition limits (`flowNetwork.py:687` `compute_sedflux`). It is not the implicit Braun–Willett solve that ARCHITECTURE §2 plans for the TypeScript pass.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| B1 | Braun–Willett O(n) receiver and stack ordering | ARCH §2 Badlands row; matrix erosion row 2; note 6 refs; note 12 lit. | **Confirmed** | `flowNetwork.py:385` `SFD_receivers` → C `directions` (`sfd.c:55`); donors and stack `buildfa` (`flowalgo.f90:39`); docstring cites Braun & Willett (2013) | dmath |
| B2 | "Implicit stream-power incision (detachment-limited first, transport-limited variants later)" | ARCH §2 Badlands row | **Changed**: Badlands applies the laws explicitly with a CFL step. Implicit incision is MapMaker's own choice, taken from the paper. ARCH §2 now states this, so the planar comparison allows for the scheme difference | `flowalgo.f90:946–1103` (`SPL·dt`, clipped to `dh`), `:396` `flowcfl` | dmath (both schemes) |
| B3 | "Stream-power law (6 variants)" | matrix erosion row 2; `audit/Badlands.md` §3.4, §6 | **Changed**: five incision laws, `incisiontype` 0–4: detachment-limited, generalised undercapacity, almost parabolic, Gaussian tools-and-cover, saltation–abrasion. Optional bedload slope functions `bedslptype` 1–3 | `flowalgo.f90:946`, `:967`, `:1000`, `:1038`, `:1076`; `:909–925`; parameters `forcing/xmlParser.py:1099–1148` | dmath |
| B4 | Linear and nonlinear hillslope diffusion | ARCH §2; matrix erosion row 2 | **Confirmed**; the kernels are C, not Python | `sfd.c:155` `diffusion`, `:237` `diffusionnl` (critical slope Sc); CFL `hillslope/diffLinear.py:52`, `:85` | dmath |
| B5 | "Flexure (gFlex) is not ported; Airy isostasy if needed" | ARCH §2 | **Confirmed**; the audit's "Green's functions, C++ library" was wrong | `forcing/isoFlex.py:29` (`import gflex`, an external Python package, not vendored), `:109–127` (`gflex.F2D`, `Method = "FD"`, direct solver) | Ref |
| B6 | "Badlands has no explicit lakes"; "flow accumulation, no explicit lakes" | note 12 §1; matrix hydrology row 3; audit §6 | **Changed** (detail): depressions are filled by Planchon & Darboux and pit volumes take sediment, but there is no lake water balance. Barnes priority-flood is present but commented out | `utils/pdalgo.f90:191` `pitfilling` → `utils/classpd.f90:227` `fillPD`; `fillBarnes` `:171`, commented at `pdalgo.f90:207–209`; `fillH` documented as "lake elevations" in `compute_sedflux` | dmath (the topology part is Barnes et al. in note 12 anyway) |
| B7 | D4 validation: "compare against Python Badlands with the same initial DEM, uplift and parameters" on a planar benchmark | ARCH Phase 7 (D4 step 1) | **Changed** (feasibility; phase text not edited): no example inputs are in the checkout (`docs/examples.rst:13–17` points to the separate `badlands-workshop` repo, not in `upstream/`). A native run needs gfortran, meson and f2py, `numpy<2` (`pyproject.toml:16`), `triangle` and gFlex. The benchmark XML and DEM must be written for the test | `find upstream/Badlands -name '*.xml'` is empty; `meson.build`; `pyproject.toml` | Oracle (tolerance only; explicit vs implicit) |
| B8 | Orographic precipitation (audit: "Smith & Barstad, 2006", "P = P₀·exp(−z/H)") | `audit/Badlands.md` §3.2, §3.7 | **Changed**, and **New** as a reference for note 14: it is the linear Smith & Barstad (2004) model, solved by FFT on a regular grid and interpolated to the TIN, with its own mixed-radix FFT | `utils/ormodel.f90:11`; `utils/classoro.f90:11`, `fftmx` `:278`; called at `forcing/forceSim.py:419–459` | Ref (an FFT through dmath is needed) |
| B9 | Outputs `receiver`, `stackOrder`, `drainageArea` (m²), `erosionRate`, `sediment`, `strata` | ARCH §3.6 "Badlands-style erosion → canonical" | **Confirmed** (all have Badlands counterparts) | receivers and stack above; discharge `flowNetwork.py:557`; erosion/deposition from `compute_sedflux`; strata `underland/strataMesh.py`, `pdalgo.f90:332` `updatestrati` | dmath |
| B10 | Badlands as a coasts reference (Phase 7k) and the matrix's "wave-driven nearshore drift" and "carbonate platforms" | ARCH pipeline 7k; matrix rows 7, 12; note 23 | **Confirmed** | Airy wave theory with refraction (`simulation/waveSed.py:13`); `utils/waveseds.f90:12` `airymodel`, `:141` `wavtransport`; carbonate growth by fuzzy logic (`forcing/carbGrowth.py:23`) | Ref |
| B11 | Size "~2,000 lines of Fortran"; licence "source headers say LGPL" | `audit/Badlands.md` §1, §2, §5 | **Changed** | 12,004 Python lines in 29 files; 5,315 Fortran and 350 C in `utils/`; licence as in the table above | n/a |

## ParFlow

Frame and units, verified:
- **Grid:** structured Cartesian x, y, z, with optional terrain-following coordinates. There is no sphere.
- **Units:** any consistent set; ParFlow assumes none (`docs/user_manual/keys.rst:40–44`). Pressure is head [L] and permeability is saturated hydraulic conductivity [L T⁻¹] (`docs/user_manual/models.rst:639–641`). Gravity is an input: head = p/(ρg) (`problem_saturation.c:283`), so it can follow planet gravity.
- **To canonical:** use m and s, with z up. Only the closed-form constitutive relations transfer; the solver is tied to the structured grid.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| P1 | "Groundwater: **ParFlow** formulations" | matrix "New domains" Groundwater row; ARCH pipeline 7g | **Changed** (scope): the transferable parts are the closed-form retention and relative-permeability curves. The variably saturated Richards solver (Newton–Krylov via a vendored KINSOL, optional hypre) is a reference only | van Genuchten saturation `pfsimulator/parflow_lib/problem_saturation.c:221`, closed form `:283–285`; Haverkamp `:419`; relative permeability `problem_phase_rel_perm.c:567` (van Genuchten), `:1363` (Haverkamp); `nl_function_eval.c` (2,547 lines), `solver_richards.c` (7,149), `kinsol_nonlin_solver.c`, `pfsimulator/kinsol/kinsol.c` | Curves: dmath. Solver: Ref |
| P2 | Note 12 as the groundwater design note | ARCH pipeline 7g (note column), §7.0 vision map ("Slow erosion, hydrology, groundwater · 12"); matrix Groundwater row; note 25 "depends on" | **Dropped** (citation): note 12 has no groundwater design. Its open question 1 proposes "surface water only, with a documented limitation" | `docs/design/12-lake-and-basin-hydrology.md:115`; no other groundwater text in note 12 | n/a (see flag 1) |
| P3 | "Soil-water and overland flow. Not river-network generation" | matrix hydrology row 4 | **Confirmed** | `overlandflow_eval.c` (440 lines), `overlandflow_eval_diffusive.c` (503), `overlandflow_eval_Kin.c` (524) | Ref |
| P4 | "Hydraulic properties only" | matrix soils row 3 | **Confirmed** | as P1; no soil classification | dmath (curves) |
| P5 | Audit details: SI units, `geostats.c` kriging, Brooks–Corey curves, CLM "67 files, ~45K LOC" | `audit/ParFlow.md` §2, §3.3, §3.7, §4, §6 | **Changed**: units as above; random fields are turning bands and PGS with an explicit seed (`turning_bandsRF.c:149`, `:519`; `geostats.h` is only a header); the saturation curves are constant, van Genuchten, Haverkamp, tabulated, polynomial or from a file (`problem_saturation.c` cases 0–5, `:168–653`), with no Brooks–Corey; CLM is 63 `.F90` files and 11,833 lines | as cited | n/a |

## WRF-Hydro

Frame and units, verified:
- **Grid:** a regular grid in the driving model's map projection (Lambert conformal for the NWM, `src/Routing/module_HYDRO_io.F90:1922`), with a finer routing grid (`AGGFACTRT`, `src/template/HYDRO/hydro.namelist:119`). Reach routing works on a 1D graph whose reaches carry length, slope, bottom width, side slope and Manning's n, independent of the grid.
- **Units:** SI (m, s, m³/s). The lake area in the level-pool routine is in km² (`sap = ar * 1.0E6`).
- **Precision:** default `REAL` is 32-bit; the GNU flags set no `-fdefault-real-8` (`CMakeLists.txt:214`). A Float64 port through `dmath` is deterministic, but it cannot match the native output bit for bit.
- **To canonical:** reach routing maps onto a river graph over sphere cells, with reach length as the geodesic length along the river cells. Channel geometry must be synthesised, for example from discharge by hydraulic geometry. Gravity is hard-coded as 9.81 in the orifice law, and Manning's n implicitly assumes Earth gravity; both must follow planet gravity.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| W1 | Muskingum–Cunge channel routing for Phase 7 | matrix hydrology row 2 and "Picks re-decided" row; note 12 refs; ARCH §2 row "Eurace, WRF-Hydro" | **Confirmed** | `src/Routing/module_channel_routing.F90:130–519` `SUBMUSKINGCUNGE`: secant depth solve from `:228`, loop condition at `:240` (relative error 0.01), `maxiter = 100` and `mindepth = 0.01` at `:201–202`. Reach-based option 2 (`hydro.namelist:143–145`); driver `drive_CHANNEL_RSL` `:1613` | dmath; native is a tolerance Oracle |
| W2 | Diffusive-wave routing | same | **Changed** (detail): a per-link flux from Manning conveyance and friction slope, used only in the gridded configuration (`channel_option` 3) | `DIFFUSION` `:53–127`; called from `drive_CHANNEL` (`:543`) at `:1050`, `:1185`, `:1285` | dmath |
| W3 | Level-pool lake scheme | note 12 refs; matrix "Picks re-decided" row | **Confirmed**, with details: a reservoir scheme with weir and orifice outflow, integrated by a three-stage Runge–Kutta step. For a natural lake the outlet becomes a weir, and g = 9.81 is hard-coded | `src/Routing/Reservoirs/Level_Pool/module_levelpool.F90:224` `LEVELPOOL_PHYSICS`; `LAKE_OPT == 1`, the Chow et al. scheme | dmath |
| W4 | "Proven at continental scale" | matrix hydrology row 2 | **Confirmed** | `README.md:11` (the 2016 National Water Model for the continental United States) | n/a |
| W5 | Licence: no sale or licensing for a fee; "blocks any commercial use" | matrix licence table; ARCH Q12, §2 | **Confirmed**; recorded, not enforced, since Q12 | `LICENSE.txt:3–7`; RAPID `src/Rapid_routing/LICENSE` (BSD-3-Clause) | n/a |
| W6 | "Hydraulic properties only" | matrix soils row 3 | **Confirmed** | Noah-MP soil parameter tables, e.g. `src/template/examples/nwm/parameter_tables/v2.1/SOILPARM.TBL` | Ref |
| W7 | Audit details: "~138 files, ~78,200 lines", "lat-lon grid", RAPID as Muskingum–Cunge, "reference only, rewrite from the literature" | `audit/WRF-Hydro.md` §1, §3.1, §3.5, §4, §7 | **Changed**: 249 files and about 175,000 lines (125 files and about 99,000 lines are `src/Land_models/`); a projected grid; RAPID is matrix or traditional Muskingum on PETSc (`src/Rapid_routing/rapid_var.F90:56`); the routing kernels are port candidates under Q12 | as cited | n/a |

## PISM

Frame and units, verified:
- **Grid:** a regular planar grid in projected x/y metres (`Lx`, `Ly`, `x0`, `y0`, `Mx`, `My`, `src/util/Grid.hh:95–130`). Lat/lon are derived through PROJ (`compute_lon_lat`, `src/util/Projection.cc:436`).
- **Units:** SI internally (seconds; the exact-solution comment at `exactTestsABCD.c:64` says "t and t0 are in seconds"); configuration through UDUNITS.
- **To canonical:** the SIA becomes a nonlinear diffusion of ice thickness on the sphere mesh. Gradients are taken on each cell's tangent plane, and elevation stays in metres. That is a new solver, since PISM's own code is PETSc on the planar grid.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| S1 | "PISM SIA/SSA ... port to the sphere"; "port the SIA solver and its verification tests to the sphere" | matrix "New domains" ice row; note 22 §3.2, §4; ARCH pipeline 4c, Phase 7b | **Changed**: PISM is the formula and verification reference, not portable code. The SIA uses a staggered-grid surface gradient (Mahaffy or variants); the SSA is a Picard iteration with a PETSc KSP; the time step follows a diffusivity CFL rule. Note 22 §7 already sizes the sphere solver as new (~1,500 LOC) | `src/stressbalance/sia/SIAFD.cc:158–188`; `ssa/SSAFD.cc:47`; `stressbalance/timestepping.cc:201–205` | Ref (the new solver is dmath) |
| S2 | Exact-solution tests (Halfar, Bueler) as validation | note 22 §5; note 15 refs; note 38 refs | **Confirmed**, with a caveat: they are closed-form C with no PETSc and port as golden values, but they are planar and radially symmetric (R0 = 750 km domes), so the sphere result can only match within a curvature tolerance | `src/verification/tests/exactTestsABCD.c`: `exactA` `:55`, `exactB` `:86` (Halfar 1983, the λ = 0 Bueler et al. 2005 solution, comment at `:68–69`), `exactC` `:123`, `exactD` `:203`; `R0 = 750000.0` at `:66`. Tests K and L need GSL root finding or an ODE solve | dmath (golden values) |
| S3 | `OrographicPrecipitation` as the Smith & Barstad reference | note 14 §3.6 and refs; matrix precipitation row 3 | **Confirmed**, path detail: the maths is in the serial class and is solved with FFTW on a padded regular grid | `src/coupler/atmosphere/OrographicPrecipitationSerial.cc:258–263` (transfer function), `:101–103` (`fftw_plan_dft_2d`), `:65–72` (wind, lapse rates, conversion and fallout times); wrapper `OrographicPrecipitation.cc` (127 lines) | Ref (an FFT through dmath is needed; see B8 for the second reference) |
| S4 | `src/energy/` (enthalpy) and `src/geometry/` (mass transport) | note 22 refs | **Confirmed** | `src/energy/EnthalpyModel.cc` (360 lines); `src/geometry/GeometryEvolution.cc` (1,343) | Ref |
| S5 | *New reference:* bed deformation for glacial isostatic adjustment | — (added to note 22 refs) | **New** | `src/earth/LingleClark.cc`, `LingleClarkSerial.cc` (FFTW, `:21`); the Lingle & Clark viscous half-space in `greens.cc:123`; `PointwiseIsostasy.cc` | Ref |
| S6 | Glacial erosion | note 22 §3.3 (no source named); `audit/PISM.md` §6 ("models only glacial erosion") | **Changed**: PISM has no erosion of any kind. Bed erosion is only planned (`src/earth/BedDef.hh:27`, "(soon) bed erosion"). Note 22 now says so; the law needs another source | grep of `src/` | n/a |
| S7 | Vendored licences "public domain or BSD"; the audit verdict "not relevant", "do not extract" | `audit/PISM.md` §3, §5, §7 | **Changed**: cubature and CalCalcs are GPL (licence table). The verdict predated the Q13 scope and now describes PISM as note 22's reference | `src/external/README.rst`; as above | n/a |

## Delft3D

Frame and units, verified:
- **Formulas:** pointwise, per computational cell. Inputs are depth h (m), depth-averaged velocity (m/s), wave height and period, grain sizes D50 and D90 (m), and water and sediment densities (kg/m³). Gravity `ag` is a parameter, not a constant (`tranb7.f90`).
- **Grids:** structured (Delft3D-FLOW) or unstructured (D-Flow FM), in Cartesian or spherical coordinates.
- **To canonical:** evaluate the formulas per coastal cell, with transport vectors on the cell's tangent plane. The velocity and wave inputs must come from note 23's own ocean, tide and wave fields.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| D1 | van Rijn sediment-transport formulas | matrix erosion row 3; note 23 §3.4 and refs; ARCH pipeline 7k | **Confirmed**, paths added | `src/utils_gpl/morphology/packages/morphology_kernel/src/`: `tranb7.f90:40` (van Rijn 1984), `tram1.f90:48` (1993), `tram2.f90` (2004); dispatch `eqtran.f90:304–386`; also Engelund–Hansen `tranb1.f90`, Meyer-Peter–Müller `tranb2.f90`, Bijker with waves `tranb5.f90`, Soulsby/van Rijn `trab11.f90`, Van Thiel/van Rijn `trab19.f90` | dmath (closed form) |
| D2 | "`src/engines_gpl/wave/`: sediment transport and wave formulas for coastal landforms" | note 23 refs | **Changed**: `engines_gpl/wave/` only drives SWAN and maps its output. The wave physics is SWAN, a spectral action-balance model (reference only); wave effects on transport are in the morphology formulas (D1) | `src/engines_gpl/wave/packages/kernel/src/run_swan.f90`, `wave2flow.f90`, `map_swan_output.f90`; `src/third_party_open/swan/` (78 source files) | Ref |
| D3 | "Delft3D morphology and wave formulas" for coasts, deltas, barrier islands and reefs | matrix "New domains" coasts row; note 23 §3.4 | **Changed**: Delft3D has transport formulas, a morphological acceleration factor and an Exner bed update, but no landform rules. Delta classification, barrier islands and reefs are new code | `updmorfac.f90`; `flow2d3d_kernel/src/compute_sediment/bott3d.f90` (GPL), `dflowfm_kernel/src/dflowfm_kernel/compute_sediment/m_fm_bott3d.f90` (AGPL) | formulas dmath; landforms new |
| D4 | "Wave, surge and tsunami propagation formulas" | note 28 refs; matrix "New domains" hazards row | **Dropped** for tsunami: there is no tsunami code (the only match in `src/` is a third-party `config.guess`). **Changed** for surge: D-Flow FM is a general shallow-water solver (AGPL), a reference only | `src/engines_gpl/dflowfm/`; note 28 already lists Synolakis (1987) for run-up | Ref |
| D5 | "Regional coastal flows only"; "equations only" | matrix ocean row 3, erosion row 3 | **Confirmed** | D-Flow FM / Delft3D-FLOW scope | Ref |
| D6 | Licence: "audit reports GPL/AGPL, which does not match the manifest"; audit "manifest match ✓", "AGPL (D-Flow FM, D-Morphology)", "SWAN GPL-3.0" | matrix licence table; `audit/Delft3D.md` §5 | **Changed**: as in the licence table. The morphology library is GPL-3.0-only, not AGPL, and SWAN is GPL-2.0-or-later | `LICENSE:9–12`; file headers | n/a |
| D7 | "Van Rijn, Watanabe" formulas | `audit/Delft3D.md` §3.2, §7 | **Dropped**: no Watanabe formula exists anywhere in `src/`, and no longshore bulk formula (CERC, Kamphuis) either | grep of `src/` | n/a |

## Corrections made

- **`audit/Badlands.md`:**
  - a reconciliation header;
  - sizes and languages;
  - the five incision laws, explicit with a CFL step, and the file locations (`streampower`, `buildfa`, `sfd.c`);
  - Planchon–Darboux filling;
  - gFlex as a Python finite-difference solver;
  - the orographic model (Smith & Barstad 2004, by FFT);
  - adaptive time stepping;
  - the licence section rewritten.
- **`audit/ParFlow.md`:**
  - a reconciliation header;
  - Fortran and CLM sizes;
  - the Richards, retention and relative-permeability file locations;
  - units (any consistent set, head and conductivity);
  - random fields (turning bands and PGS, seeded) in place of kriging;
  - Brooks–Corey removed;
  - the vendored KINSOL (the default nonlinear solver; external SUNDIALS is optional and off) and the third-party licences.
- **`audit/WRF-Hydro.md`:**
  - a reconciliation header;
  - code size and single precision;
  - routing functions with line numbers and the `channel_option` values;
  - the level-pool details;
  - RAPID as Muskingum on PETSc;
  - the projected grid;
  - the licence notes and verdict updated for Q12.
- **`audit/PISM.md`:**
  - a reconciliation header;
  - stress balance, atmosphere, ocean, hydrology, geometry and verification sizes and files;
  - the planar projected grid;
  - exact solutions A–D;
  - new §3.9 (`src/earth/` bed deformation);
  - no erosion;
  - vendored licences;
  - capability and verdict lines updated for note 22.
- **`audit/Delft3D.md`:**
  - a reconciliation header;
  - transport-formula files and dispatch;
  - Watanabe removed;
  - the wave engine as a SWAN driver;
  - the licence breakdown (AGPL, GPL-3.0-only, LGPL, SWAN) and the manifest comparison;
  - the recommendation updated (closed-form formulas portable under Q12).
- **`audit/CAPABILITY_MATRIX.md`:**
  - erosion row 2 (Badlands);
  - hydrology rows 2 (WRF-Hydro) and 3 (Badlands);
  - precipitation row 3 (PISM, with Badlands as a second reference);
  - the "Expanded scope" caveat;
  - the channel-routing re-decision row;
  - the "New domains" ice, coasts, groundwater and hazards rows;
  - the Badlands, WRF-Hydro and Delft3D licence rows;
  - the "nothing to extract" list, which now names the small closed-form exceptions.
- **`docs/ARCHITECTURE.md`** (non-phase text only): the §2 Badlands row (explicit scheme, Planchon–Darboux, gFlex is Python).
- **Notes:**
  - 12: Badlands depression filling; WRF-Hydro functions, inputs, gravity and precision;
  - 14: the PISM serial file and FFTW, with Badlands as a second Smith–Barstad reference;
  - 22: PISM as a formula reference, not a port; `src/earth/` added; no glacial erosion in PISM; curvature tolerance for the exact tests;
  - 23: Delft3D formula files, SWAN driver, landforms new;
  - 25: the groundwater dependency marked as having no design note;
  - 28: no tsunami code in Delft3D; D-Flow FM as a surge reference.

Not changed:
- `upstream-manifest.json`: the Delft3D licence entry is incomplete and the Badlands entry omits the LGPL headers. It is configuration rather than one of the audited documents, as in group 1.
- Phase text in `docs/ARCHITECTURE.md` §7 and the §7.0 tables, including pipeline row 7g and the vision map (see flags).

## Flags for the phase plan (phase text not edited)

1. **Phase 7 (stage 7g, groundwater) has no design note.** ARCH pipeline row 7g ("aquifers, water table, springs, baseflow", notes column "12") and the §7.0 vision map ("Slow erosion, hydrology, groundwater · 12") point to note 12. Note 12 has no groundwater design, and its open question 1 (`:115`) proposes surface water only. Note 25 depends on that groundwater. Before Phase 7 can include 7g, either note 12 must be extended (the ParFlow constitutive curves P1, plus a baseflow and water-table formulation) or a new note written. This **could change Phase 7's scope**, and it needs your decision.
2. **Phase 7 D4 validation step 1 costs more than the text implies.** Python Badlands has no example inputs in `upstream/`, needs a native Fortran build (gfortran, meson, `numpy<2`, `triangle`, gFlex), and uses an explicit CFL scheme where MapMaker plans an implicit one. The benchmark DEM and XML must be authored, and the comparison needs a tolerance or a matched explicit mode. Phase order is unchanged.
3. **Phase 7 WRF-Hydro routing:** the kernels port cleanly through `dmath`, but native WRF-Hydro is single precision, so it is a tolerance oracle only. Channel geometry must be synthesised, and gravity must follow the planet. No phase change.
4. **Phase 7b (note 22):** PISM supplies formulas, exact tests and a GIA reference, but no portable solver and no glacial-erosion law. Note 22 §7 already sizes the sphere SIA as new code (~1,500 LOC), so the estimate stands. The glacial-erosion law in §3.3 needs a source: orogen's heuristic or the literature.
5. **Phase 7c (note 23, stage 7k):** coastal landforms are new code. Delft3D supplies only pointwise transport formulas, which need velocity and wave fields from note 23's own models (SWAN is reference only). The deliverables stand.
6. **Phase 9e (note 28):** Delft3D has no tsunami code; tsunami propagation and run-up come from the literature already cited. No phase change.
7. **Phase 7, I3 (Smith–Barstad rain at L1, note 14):** both references (PISM, Badlands) solve the model by FFT on a regular planar grid, so the tangent-plane window needs a TypeScript FFT through `dmath`. That is small, but no note budgets it. No phase change.

## Checks run

- Each upstream repo is clean (`git status --porcelain` empty) at its pinned commit after the pass.
- Every edit was applied by a script that required its old text to match exactly once.
- Each edited audit file (`Badlands`, `ParFlow`, `WRF-Hydro`, `PISM`, `Delft3D`, `CAPABILITY_MATRIX`) was grepped for leftover contradictions: the old variant count, implicit, no explicit lakes, Green's functions, kriging, `geostats.c`, Brooks–Corey, SI, lat-lon, "reference only", "none", "do not extract", public domain, Watanabe, tsunami, "port to the sphere". The hits found were fixed: Badlands "six variants" in §3.4 quality, Green's functions in §3.6 quality, the §5 manifest line, the Fortran line count in §2; ParFlow Brooks–Corey in three places and "SUNDIALS" for the vendored KINSOL in four; WRF-Hydro sparse-matrix effort and the flat-projections row; PISM's "none" capability lines, planar-grid lines and verdict erosion mention.
- No `npm` command was run; only Markdown changed.
