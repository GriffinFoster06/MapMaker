# Reconciliation, group 1: GPlates, tectonics.js, ASPECT, VPLanet

2026-10-18. Documentation only: no code, `upstream/` or `packages/gen-orogen/vendor/` file was changed, and no dependency was touched.

**Why:** the 2026-10-13 planning overhaul (notes 15–38, the §7.0 roadmap, the matrix's "Expanded scope" section) was written without `upstream/` checked out. This pass checks every claim about these four repos in `audit/<repo>.md`, `audit/CAPABILITY_MATRIX.md`, `docs/ARCHITECTURE.md` and `docs/design/` against the source at the commits pinned in `upstream-manifest.json`.

**Method:** one subagent per repo read the source and checked the claims. The coordinator then re-checked the key facts by hand, because each first report had errors: a GPlates composition order stated backwards, a tectonics.js path marked "Confirmed" when its own evidence contradicted it, VPLanet line citations that were really input-reader functions, and an ASPECT material model reported as undefined when the file exists. Every path:line below was read in the source. Line numbers are at the pinned commit.

**Verdicts:** **Confirmed** means the claim is correct as written. **Changed** means the pick stands but a detail was wrong (path, function, scope, feasibility or licence) and has been corrected. **Dropped** means the pick cannot work as planned.

**Feasibility column:** **dmath** means it can be ported to TypeScript, run through `dmath` in a worker, and is deterministic. **Ref** means it is only an algorithm or parameter reference. **Oracle** means it is only usable as native golden data in tests.

| Repo | Commit | Licence (as found) | Recorded |
|---|---|---|---|
| GPlates | `5392e78` | GPL-2.0-only: `COPYING` preamble lines 9–11 ("version 2, dated June 1991, not any later version"); headers say "version 2" (e.g. `src/maths/FiniteRotation.h:15`) | Manifest `GPL-2.0` (SPDX for v2-only); matrix licence table; ARCHITECTURE F10 |
| tectonics.js | `e43927c` | CC-BY-4.0 (`LICENSE.txt`); no per-file headers; vendored `libraries/` are mostly MIT (see `audit/tectonics.js.md` §5) | Manifest; audit §5; `docs/spikes/NEW_UPSTREAMS.md` |
| ASPECT | `d399131` | GPL-2.0-or-later (`LICENSE`). **Also in-tree:** `contrib/world_builder/` is **LGPL-2.1** (`contrib/world_builder/LICENSE`) and bundles vtu11 with its own licence | Manifest records GPL-2.0-or-later only; the World Builder licence is now in `audit/ASPECT.md` §5 |
| VPLanet | `dd55da7` | MIT (`LICENSE`), no per-file variation | Manifest; matrix licence table; PROVENANCE (spike 1a) |

None of these four has code extracted yet, so `PROVENANCE.md` has no extraction rows for them. That is correct for now; each port will need a row when it lands.

## GPlates

Frame and units, verified:
- **Frame:** lat/lon → (cos φ cos λ, cos φ sin λ, sin φ) (`src/maths/LatLonPoint.cc:127–139`). That is MapMaker's canonical frame, so a port needs no axis permutation.
- **Angles:** radians (`FiniteRotation.h:75`).
- **Time:** rotation-file times are Ma before present. MapMaker's geo axis is t ≤ 0 Myr (`tStartMyr: -300` in the core tests), so Ma = −t.
- **Composition:** `compose(r1, r2)` returns q1·q2 (`FiniteRotation.cc:493–497`), with r1 the root-ward (fixed-plate) rotation (`FiniteRotation.h:355–363`). Applied to a point, r2 acts first, then r1. That is premultiplication, the same convention as note 13's q ← exp(½ωΔt)⊗q.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| G1 | Unit quaternions, finite rotations, Euler poles; port for note 13 kinematics | matrix "Expanded scope" (Plate kinematics); note 13 §3, refs; ARCH §2 GPlates row, §3.6 | **Confirmed** (port allowed since Q12) | `src/maths/UnitQuaternion3D.h` (682 lines), `.cc`; `FiniteRotation.h` (509), `.cc` (719) | dmath. Pure arithmetic and trig. The port drops Qt, Boost and Scribe (`src/maths/Real.h:34–42`: boost fpclassify, `QDebug`, `QTextStream`, Scribe) and must reproduce `Real`'s epsilon comparisons exactly |
| G2 | Rotation interpolation (SLERP) | note 13 refs | **Confirmed** | `FiniteRotation.cc:366` `slerp`, `:434` `interpolate` | dmath |
| G3 | `src/app-logic/Reconstruction*` and `RotationUtils.h` (rotation trees, plate circuits) | matrix tectonics row 2, "Expanded scope"; note 13 refs | **Confirmed**, with a scope note | `RotationUtils.h` (154 lines); `ReconstructionTree*`, `ReconstructionGraph*` depend on the feature model (`ReconstructionFeatureProperties`, `Feature`) | Ref, or a partial port. The tree/circuit logic is separable only behind a data adapter. Note 13 generates one total rotation per plate and needs no plate circuit, so G1 is the part to port |
| G4 | Pre-Q12 wording: "math reference only", "re-implemented", "GPL-2.0-only code could not be included" | matrix tectonics pick and licence table; ARCH §3.6 table (`r_plate` row); note 13 §3 Kinematics | **Changed**: wording corrected to Q12 | ARCH Q12 | n/a |
| G5 | Map projections (Rectangular, Mercator, Mollweide, Robinson) | matrix rows "Flat projections", projections row 1, D1; audit §3.3 | **Changed**: they are PROJ calls on the **WGS84 ellipsoid**; GPlates has no projection maths of its own | `src/gui/MapProjection.cc:67–71` (`proj=latlong/merc/moll/robin`, `ellps=WGS84`); `src/file-io/Proj.h` includes `<proj.h>` | Ref only (PROJ is not in `upstream/`). D1 (d3-geo) is unaffected |
| G6 | `valid_time` concept for `validFrom/validTo` | ARCH §3.3 | **Confirmed** (concept) | `gml:validTime` / `GmlTimePeriod` in the GPGIM (`src/qt-resources/gpgim/gpgim.xml`) | Concept; no code needed |
| G7 | "Inference of missing rotations is not implemented" | matrix partial-world section; note 3 refs | **Confirmed** | No inference code found; an incomplete chain is an error | n/a |

## tectonics.js

Frame: **+Y north**, `lat = asin(y/|p|)`, `lon = atan2(−z, x)` (`noncompiled/academics/SphericalGeometry.js:17–23`). To canonical: (x, y, z) → (x, −z, y). Units are SI (m, kg/m³), with time through `Units.MEGAYEAR` (`models/lithosphere/Crust.js:263`). The in-app time step is wall-clock (`Simulation.js:66–86`, already in the audit), so the app as a whole is not deterministic. The cited formulas are, but they are only a reference.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| T1 | Airy isostasy, "`Lithosphere.js`: Airy isostasy on the sphere" | note 21 refs; matrix "Expanded scope" (note 21 row) | **Changed**: the formula lives in `FluidMechanics.js`. It is per-column Airy with no flexure and nothing sphere-specific, and its mantle density is tuned empirically | `noncompiled/academics/FluidMechanics.js:65–76` (`displacement = h − h·ρ/ρ_mantle`), called from `models/lithosphere/Lithosphere.js:42` and `Plate.js:31`; `ρ_mantle = 3075` "derived empirically" (`models/World.js:41`) | Ref (three lines; written fresh from Airy's formula with a physical density) |
| T2 | Detection mesh and crust pools for note 13 | matrix tectonics row 3 and the line after the pick | **Confirmed** | `audit/tectonics.js.md` §3 (re-checked: overlap via `Crust.js:248–255`, 40,962-cell cap from Uint16 ids) | Ref |
| T3 | Claims corrected earlier in `NEW_UPSTREAMS.md` (Erosion.js, 1M cells, seeded rifting test, collision/orogeny logic) | — | **Confirmed absent**: none of the notes or the matrix repeats them | grep of notes, matrix and ARCHITECTURE | n/a |

## ASPECT

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| S1 | `source/material_model/`: rheology parameter values | note 21 refs; matrix "Expanded scope" (note 21 row) | **Confirmed**, path detail added | `source/material_model/` (`simple.cc`, `visco_plastic.cc`, `steinberger.cc`, `grain_size.cc`, ...); flow laws in `rheology/` (`diffusion_creep.cc`, `dislocation_creep.cc`, `peierls_creep.cc`, `frank_kamenetskii.cc`, ...); `data/material-model/steinberger/radial-visc*.txt` | Ref (SI: Pa·s, J/mol, m³/mol); constants transcribed, not code |
| S2 | `source/postprocess/dynamic_topography.cc`: "formulations for dynamic topography" | note 21 refs; matrix "Expanded scope" | **Changed**: the formula is h = (−σ·n − p_surface)/(Δρ·g) at the boundary (lines 304–316), evaluated from the FEM stress solution (Consistent Boundary Flux). Nothing is usable without a stress field | `dynamic_topography.cc` (584 lines), `:44`, `:304–316` | Ref only (formula). Note 21 has no dynamic-topography output, so nothing depends on it |
| S3 | "ASPECT … parameterisations" for plume placement and heat flow (stage 2i); "ASPECT-derived parameterisations of mantle plumes" | ARCH expanded pipeline 2i; note 13 refs | **Dropped** for plume placement: ASPECT has no plume-count, position or timing model. Its vendored World Builder plume (`contrib/world_builder/source/world_builder/features/plume.cc`, 458 lines, LGPL-2.1) is user-placed geometry (depth range and elliptic cross-sections, lines 85–93). Note 21 §3.2 already plans plume placement as new code (Sleep 1990, Davies 1988) | `ls source/initial_temperature` has no plume plugin; `cookbooks/plume_2D_chunk/plume2D.prm:1` (Kellogg & King 1997 setup) | Placement: new code. Geometry: Ref |
| S4 | *New reference:* parameterised core evolution | — (added to note 21 refs) | **New** | `source/boundary_temperature/dynamic_core.cc` (1,240 lines); header `include/aspect/boundary_temperature/dynamic_core.h:51–99` (inner-core radius, CMB heat flux, radiogenic and latent heat) | Ref; cross-check for VPLanet ThermInt |
| S5 | FastScape "couples with ASPECT" | matrix candidate list | **Confirmed** | `source/mesh_deformation/fastscape.cc`; `contrib/fastscape/` | n/a (FastScape is a separate candidate) |
| S6 | "Mantle convection FEM, not portable, parameter reference only" | matrix tectonics row; "nothing to extract" list | **Confirmed** | deal.II/MPI/Trilinos build (audit §2) | Ref |

## VPLanet

Units and frame:
- **Angles:** radians internally (`dObliquity`, `dTrueL` in `fvDailyInsolation`, `src/poise.c:5541`).
- **Insolation:** W/m² from L/(4πa²) (`poise.c:5538`).
- **Latitude grid:** `iNumLats` cells uniform in sin φ, with cell centres `asin(−1 + Δ/2 + iΔ)` (`poise.c:1955–1964`). It needs resampling to canonical cells; there is no longitude.
- **Time:** years internally; SI throughout.

**Integration:** DistOrb, DistRot, EqTide, ThermInt and the POISE ice sheets only supply derivatives. `src/evolve.c` integrates them, with `RungeKutta4Step` at :403, `EulerStep` at :373 and the adaptive `fdGetTimeStep` at :138. A TS port of any secular evolution therefore includes the integrator.

Insolation is closed-form. The POISE annual and seasonal EBMs are implicit linear solves (`fvMatrixInvertAnnual` :5716 and `fvMatrixInvertSeasonal` :5747, both via `LUDecomp`/`LUSolve` at :5719, :5732, :5750 and :5763). Both port exactly through dmath: they are arithmetic plus trig.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| V1 | POISE insolation `fvDailyInsolation`, `fvAnnualInsolation` | note 10 refs; note 11 refs; ARCH §2 VPLanet row; §3.6 | **Confirmed** | `poise.c:5530`, `:5602` | dmath (closed-form) |
| V2 | Phase 6 subset includes "DistOrb/DistRot steady-state formulas, not secular evolution" | ARCH §2 VPLanet row; note 10 refs; note 11 refs | **Changed**: DistOrb and DistRot have no steady-state insolation formulas. They do secular evolution only, and insolation comes from POISE given fixed orbital elements. They move to note 20 / Phase 6a | `distorb.c`, `distrot.c` derivative functions; `examples/EarthClimate/earth.in:2` (`saModules distorb distrot poise`) | Phase 6: not needed. Phase 6a: dmath plus integrator |
| V3 | POISE EBM (annual and seasonal modes, OLR WK97/HM16/SMS09, diffusion, `bMEPDiff`, ice-albedo) | note 10 refs; ARCH §2; note 24 refs | **Confirmed** | `poise.h:20–22` (OLR ids), `:71` (`OPT_MEPDIFF`); `PoiseAnnual` `poise.c:5893`, `PoiseSeasonal` `:7387`; LU solves above | dmath |
| V4 | Matrix: "1D Hadley-style diffusion" | matrix climate row 3 | **Changed**: 1D meridional diffusion with an optional `bHadley` bump within about ±25° latitude, which the code calls "not self-consistent with rotation rate" | `poise.c:2159–2165`, `:2476–2481` | dmath |
| V5 | POISE ice sheets: 1D latitudinal model for fast paleo runs | note 22 refs; note 24 refs | **Confirmed** | `PoiseIceSheets` `poise.c:7552`; Glen's law, n = 3 (`poise.h:44`, `poise.c:7662–7665`); bedrock depression | dmath plus integrator |
| V6 | DistOrb (Laplace–Lagrange secular theory, RD4/LL2), DistRot (obliquity, precession), Milankovitch check | note 20 §3 and refs; ARCH pipeline 0a | **Confirmed**, with the integrator added to the plan text | `distorb.c`, `distrot.c`; `examples/SSDistOrbDistRot/` (`LL2`, `RD4` runs); `examples/EarthClimate/README.rst:1` ("Seasonal and Milankovitch Climate Cycles") | dmath plus integrator |
| V7 | EqTide (tides) | note 20 refs; ARCH pipeline 0a | **Confirmed** (CPL and CTL models) | `eqtide.h:15–16`; `examples/BinaryTides`, `TidalEarth` | dmath plus integrator |
| V8 | Stellar with Baraffe et al. (2015) tracks | note 20 §3 and refs | **Confirmed** | `stellar.c:9–10`; tables in `src/tracks/Data/`; interpolation `body.c:1254` (bilinear), `:1280` (bicubic), `:1430` (`fdBaraffe`) | dmath (tables plus interpolation; table data ported as data) |
| V9 | Binary stars: "circumbinary (P-type) orbits get a time-varying insolation from both stars" | note 20 §3 | **Changed**: VPLanet's `binary.c` (2,523 lines) gives circumbinary orbits but only an orbit-averaged scalar flux (`fndApproxInsol` :2482). POISE takes one star (`body[0].dLuminosity`, `poise.c:5538`). Latitude-resolved two-star insolation is new code; `binary.c` is added to the port list | `binary.c:3–14`, `:1311–1324`, `:2482–2488` | dmath (orbits plus integrator); insolation new |
| V10 | ThermInt and RadHeat: thermal history, heat flow, inner-core growth, dynamo | note 21 §3.1, §3.5, refs; matrix "Expanded scope"; ARCH pipeline 2i | **Confirmed**, details corrected | `fdRIC` `thermint.c:4989`, `fdRICDot` :5073, `fdMagMom` :5128 (zero when core buoyancy ≤ 0: the dynamo criterion); RadHeat `fd40KPower`/`fd232ThPower`/`fd238UPower` `radheat.c:6674–6698` | dmath plus integrator (ThermInt); RadHeat decay is closed-form |
| V11 | Validation "against `examples/EarthInterior` and `examples/MagneticField`" | note 21 refs | **Changed**: `examples/MagneticField` does not exist (`MagneticBraking` is stellar spin-down) | `ls examples/`; `examples/EarthInterior/earth.in:3` (`saModules radheat thermint`) | Oracle |
| V12 | Matrix: ThermInt "useful for deciding whether plate tectonics is plausible" | matrix tectonics row 4; `audit/VPLanet.md` capability table | **Changed**: the regime is a user input. `dStagLid > 0` sets the heat-flow prefactor to `HFLOWREDUCTSTAG`; nothing decides it | `fvReadStagLid` `thermint.c:649–708` | n/a |
| V13 | Native VPLanet as golden-data oracle (`examples/EarthClimate`) | ARCH §2; note 10 tests; PROVENANCE spike 1a | **Confirmed** | `spikes/1a/results/vplanet-earthclimate.sha256`; `docs/spikes/PHASE1_REPORT.md:150–154` (built with clang, 105 s run) | Oracle |
| V14 | Audit side claims ("validated against GPlates reference data", "validated against GCMs (CESM)", "Version 2.5.36", 50 files) | `audit/VPLanet.md` | **Changed**: the unsupported claims were removed; the source has 25 `.c` and 24 `.h` files | grep of `src/` | n/a |

## Corrections made

- **`audit/GPlates.md`:** a reconciliation header with the verified conventions. Projection extractability corrected (PROJ calls, Qt core types only). Proj.js renamed to proj4js / d3-geo.
- **`audit/tectonics.js.md`:** the frame (+Y north, adapter mapping), units, and the empirical mantle density.
- **`audit/ASPECT.md`:** material-model and rheology file lists, including `simple.cc`. World Builder recorded as vendored and LGPL-2.1. Plume geometry versus plume placement. `dynamic_core.cc` added. Dynamic topography marked as needing the FEM solution.
- **`audit/VPLanet.md`:**
  - integration requirement, LU solves, file count;
  - unsupported claims removed;
  - `examples/MagneticField` removed;
  - ThermInt regime stated as an input;
  - RadHeat functions corrected (the earlier lines cited input readers);
  - Baraffe table and interpolation locations.
- **`audit/CAPABILITY_MATRIX.md`:**
  - tectonics rows 3 and 4 (isostasy location, ThermInt regime) and the ASPECT row;
  - tectonics pick (port GPlates since Q12);
  - climate row "Hadley-style";
  - projections row 1 (PROJ, WGS84);
  - "Expanded scope" note 21 row (ASPECT references);
  - GPlates licence flag and the combined-work sentence (Q12).
- **`docs/ARCHITECTURE.md`** (non-phase text only):
  - §2 VPLanet row: the insolation source, and DistOrb/DistRot excluded from the subset;
  - §3.6 `r_plate` row and "GPlates math → canonical": frame, units, Ma = −t;
  - expanded pipeline 0a: Binary and the integrator added;
  - expanded pipeline 2i: ASPECT references reworded, plume placement marked new.
- **Notes:**
  - 10 and 11: VPLanet refs, with DistOrb/DistRot moved to note 20;
  - 13: kinematics sentence aligned with Q12 and the GPlates convention; ASPECT plume sentence;
  - 20: binary insolation, integrator, examples, EqTide models, `binary.c`;
  - 21: VPLanet validation, ASPECT references, tectonics.js isostasy;
  - 22: POISE ice-sheet details.

Not changed: `upstream-manifest.json` (the ASPECT subagent suggested rewording its notes field; it is configuration rather than one of the audited documents) and `docs/spikes/*` (historical records). The ASPECT entry there lists only GPL-2.0-or-later; the World Builder's LGPL-2.1 is now recorded in `audit/ASPECT.md`.

## Flags for the phase plan (phase text not edited)

1. **Phase 6a and 6c effort: an ODE integrator is needed but not budgeted.** Every VPLanet module planned for 6a (DistOrb, DistRot, EqTide, Binary) and 6c (ThermInt) only supplies derivatives. The port must include `evolve.c`'s RK4 step and adaptive time step, built once in 6a and reused in 6c. The size tables in notes 20 §7 and 21 §7 have no line for it. This does not change phase order.
2. **Phase 6a scope: two-star insolation is new code.** "Star (and binary) properties" in 6a relies on VPLanet only for circumbinary orbits; latitude-resolved P-type insolation is original. Note 20's "Stellar and binary insolation ~800 LOC" is now partly original rather than ported.
3. **Phase 6 vs 6a boundary is now explicit.** The ARCH §2 row implied that DistOrb and DistRot formulas were in the Phase 6 subset. They are not: Phase 6 takes orbital elements as fixed inputs, which matches the Phase 6 bullet. Secular evolution is 6a. No phase text change is needed, but anyone planning Phase 6 should know.
4. **Phase 6c: ASPECT supplies no plume placement or dynamic topography.** Plumes, hotspot tracks and any dynamic topography are original code, as note 21 §3.2 already plans. The 6c deliverables stand; only the references changed.
5. No flag for **Phase 6b**: porting the GPlates maths core (G1) fits note 13 as written. GPlates' reconstruction trees and plate circuits are not needed for forward evolution.
6. No flag for **Phase 5**: GPlates projections were never the plan (D1 uses d3-geo).

## Checks run

- Each upstream repo is clean (`git status --porcelain` empty) at its pinned commit after the pass.
- Every edit was applied by a script that required its old text to match exactly once.
- No `npm` command was run; only Markdown changed.
