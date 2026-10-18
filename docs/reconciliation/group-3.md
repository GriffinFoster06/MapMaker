# Reconciliation, group 3: CESM, CTSM, MOM6, MARBL

2026-10-18. Documentation only: no code, `upstream/` or `packages/gen-orogen/vendor/` file was changed, and no dependency was touched.

**Why:** the 2026-10-13 planning overhaul (notes 15–38, the §7.0 roadmap, the matrix's "Expanded scope" section) was written without `upstream/` checked out. This pass checks every claim about these four repos in `audit/<repo>.md`, `audit/CAPABILITY_MATRIX.md`, `docs/ARCHITECTURE.md` and `docs/design/` against the source at the commits pinned in `upstream-manifest.json`.

**Method:** as in groups 1 and 2. One subagent per repo read the source and checked the claims. The coordinator then re-checked the key facts by hand, because each first report had errors:
- the CESM report counted 13 component directories (there are 11), "confirmed" the audit's "~800 LOC" without counting (about 3,600 lines of Python and shell plus 971 of XML), and confirmed a BSD-3-style licence without noticing that `LICENSE.txt` grants no permissions at all;
- the CTSM report placed glacier melt in `SnowSnicarMod` (it is liquid water left in glacier ice layers by the soil/snow phase change), kept "zero-amplitude depth" in its proposed text for `ActiveLayerMod`, confirmed "benchmarking practices" although the checkout has no benchmarking code, and missed the audit's wrong RNG claim and four wrong paths;
- the MOM6 report confirmed "245 files across 91 directories" (245 is `src/` only; the repo has 75 directories) and "confirmed" an audit line that calls the barotropic solver implicit, while its own evidence said split-explicit; it also missed the analytic gyre winds and two wrong MARBL-interface paths;
- the MARBL report confirmed "40 Fortran files (~23.4k LOC)" (31 files carry the 23.4k), confirmed "generated documentation" (there is none), confirmed a BSD-3 licence (it has no non-endorsement clause), and confirmed mmol/m³ units in a library that works in cgs.

Every path:line below was read in the source. Line numbers are at the pinned commit.

**Verdicts:** **Confirmed** means the claim is correct as written. **Changed** means the pick stands but a detail was wrong (path, function, scope, feasibility or licence) and has been corrected. **Dropped** means the pick or citation cannot work as planned. **New** is a reference added by this pass.

**Feasibility column:** **dmath** means it can be ported to TypeScript, run through `dmath` in a worker, and is deterministic. **Ref** means it is only an algorithm or parameter reference. **Oracle** means it is only usable as native golden data in tests.

| Repo | Commit | Licence (as found) | Recorded |
|---|---|---|---|
| CESM | `ad73796` | `LICENSE.txt` ("CESM2 Copyright and Terms of Use", 118 lines): a UCAR copyright notice (lines 1–4), the BSD warranty disclaimer (12–22) and a component table (24–112). **No permission grant and no conditions**, so not BSD-3-Clause. The table names CISM as LGPL-3.0-or-later (66–71) and the Lahey `Inf_NaN_Detection` module as "may not be sold without permission" (73–80); MOM6 is not listed | Manifest "BSD-3-Clause-style (custom UCAR)" (not edited: configuration); matrix licence table; `audit/CESM.md` §5 |
| CTSM | `b334aa0` | `LICENSE` (34 lines): an MIT-style grant (8–13) with three conditions (notice in source and binary, no endorsement; 15–22) and the BSD disclaimer. Nearest SPDX: NCSA. FATES has its own licence per the CESM table; its submodule is empty | Manifest "BSD-3-Clause-style (custom UCAR)", a fair description; matrix; `audit/CTSM.md` §5 |
| MOM6 | `f49a000` | Apache-2.0 (`LICENSE`, 177 lines; `SPDX-License-Identifier: Apache-2.0` headers, e.g. `src/core/MOM_barotropic.F90:3`). GSW-Fortran and CVMix are empty submodules, so their licences cannot be checked | Manifest; matrix (new MOM6 row); `audit/MOM6.md` §5 |
| MARBL | `6b2a5e4` | `LICENSE.txt` (31 lines): an MIT-style grant (8–13) with two BSD conditions (15–20) and the disclaimer (22–31); no non-endorsement clause, so not BSD-3-Clause | Manifest "BSD-3-Clause-style (custom UCAR)" (not edited); matrix; `audit/MARBL.md` §5 |

None of these four has code extracted yet, so `PROVENANCE.md` has no rows for them. That is correct for now; each port will need a row when it lands.

**Empty submodules.** CESM: all 21 (11 components, 5 libraries, `ccs_config`, `cime`, `share`, `tools/CUPiD`, `tools/statistical_ensemble_test/pyCECT`). CTSM: all 13, including `src/fates`. MOM6: both, `pkg/GSW-Fortran` and `pkg/CVMix-src`. MARBL has none.

## CESM

Frame and units: nothing to verify. The checkout has 104 files: `cime_config/` XML (971 lines), the vendored `.lib/git-fleximod` (2,658 lines of Python), two small tools, CI files, and five Sphinx user-guide pages in `doc/source/` (introduction, downloading, configurations, quickstart, index). There is no model code and no science documentation; `doc/source/downloading_cesm.rst:98–102` only lists CAM physics directories that a full checkout would contain.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| C1 | "CESM is an empty shell in this checkout" | matrix note 4 (line 23), line 119, licence table, "nothing to extract" list | **Confirmed**, detail corrected: all 21 submodules are empty, not just `components/` | `.gitmodules:29–172` (21 `[submodule]` entries); `components/*` and `libraries/*` hold 0 files; `cime/`, `share/`, `ccs_config/` empty | n/a |
| C2 | "CESM (CAM physics, documentation only; the checkout is empty per the matrix): formulations for moist physics" | note 24 refs | **Changed**: no CAM documentation is in the checkout either. The formulations come from the published CAM technical notes, so this is a literature reference | `doc/source/` lists; grep for physics terms finds only `downloading_cesm.rst:98–102` (directory names) | Ref (literature) |
| C3 | "CESM/CAM formulations as reference" | ARCH expanded pipeline 5a | **Changed** (same reason) | as C2 | Ref (literature) |
| C4 | "CESM docs" as an atmosphere and paleoclimate reference | matrix "New domains" atmosphere row | **Changed** (same reason) | as C2 | Ref (literature) |
| C5 | Audit: "~800 LOC", "12 external components", ocean on a "staggered B-grid", licence "BSD-3-Clause-style ... matches the file", `components/fates`, "no ... EULA restrictions" | `audit/CESM.md` §1, §2, §4, §5, §6 | **Changed**: about 3,600 lines of Python and shell and 971 of XML; 21 submodules; MOM6 is a C-grid (`audit/MOM6.md`); the licence as in the table above (with the Lahey no-sale clause); FATES is a CTSM submodule | `find`/`wc`; `.gitmodules`; `LICENSE.txt` | n/a |
| C6 | Submodule tags (cam6_4_203, ctsm5.4.057, mi_260909, cesm3_cice6_6_3_22, cismwrap_2_2_015, rtm1_0_89, mosart1.1.13, v3.1.1, cmeps1.1.73, cdeps1.0.111, main_0.1.1, cime6.6.2) | `audit/CESM.md` §3 | **Confirmed** | `.gitmodules:40`, `:61`, `:69`, `:76`, `:83`, `:89`, `:97`, `:104`, `:111`, `:117`, `:125`, `:132` | n/a |

## CTSM

Frame and units, verified:
- **Grid:** per-gridcell columns in a gridcell > landunit > column > patch hierarchy, on whatever mesh the coupler supplies; gridcells carry latitude and longitude in degrees. Physics is vertical (1-D per column) except hillslope flow within a gridcell; rivers are in the (empty) routing submodules. A column maps onto one sphere cell.
- **Units:** SI for state (K, kg/m², m³/m³), but soil hydraulics use mm and mm/s (`sucsat`, `xksat`), and texture is in percent sand and clay.
- **Determinism:** CTSM has no random numbers. The only `random_number` call is in a unit test (`src/utils/test/matrix_test/test_matrix.pf`), so the audit's "not seeded ... not reproducible" was wrong.
- **Documentation:** the CLM5 technical note is in the checkout (`doc/source/tech_note/`, one directory per process, e.g. `Glacier/`, `Soil_Snow_Temperatures/`, `Hydrology/`).

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| L1 | "CTSM soil hydrology and texture → hydraulic parameters (Clapp & Hornberger 1978 style)" | note 4 refs | **Changed**: the pedotransfer is Cosby et al. (1984) Table 5 by default (Table 4 and Noilhan & Lacarrère 1995 are options); Clapp & Hornberger supplies the exponent `b = 2.91 + 0.159·clay` and the default retention curve. Note 4 now cites the functions | `src/main/FuncPedotransferMod.F90:15–17`, `:28` (default), `:83–103` (Table 5); `src/biogeophys/SoilStateInitTimeConstMod.F90:539–541`, `:554–555`; `SoilWaterRetentionCurveFactoryMod.F90:51`; `SoilWaterRetentionCurveClappHornberg1978Mod.F90:75` (`hk`), `:115` (`smp`) | dmath (closed form; `pow`, `exp`) |
| L2 | "CTSM and LPJmL use the same texture → hydraulic-property idea" | note 4 §3.4 | **Confirmed** for CTSM (LPJmL is checked in a later group) | as L1 | n/a |
| L3 | "CTSM's glacier surface-mass-balance scheme is the reference for a physically based option" | note 22 §3.1 | **Changed**: `GlacierSurfaceMassBalanceMod` is bookkeeping, not a scheme. Accumulation is snow-capping overflow on glacier (or long-snow-covered) columns; melt is liquid found in glacier ice layers after CLM's full energy balance and phase change. The physically based reference is the energy balance documented in the technical note | `GlacierSurfaceMassBalanceMod.F90:69` `HandleIceMelt`, `:132` (melt from `h2osoi_liq`), `:209` (accumulation), `:214` (SMB); phase change in `SoilTemperatureMod.F90:81` `PhaseChange`; `doc/source/tech_note/Glacier/` | Ref |
| L4 | "permafrost from mean annual ground temperature with snow insulation (CTSM `ActiveLayerMod` as a reference)" | note 22 §3.5 | **Changed**: `alt_calc` interpolates the 0 °C depth in the prognostic layered soil temperature profile and keeps the annual maximum. It needs a soil thermal model; a mean-annual-temperature method is new code | `ActiveLayerMod.F90:59–185` (`t_soisno` `:101`, thaw search `:147–170`) | Ref |
| L5 | `src/biogeophys/GlacierSurfaceMassBalanceMod.F90`, `SnowSnicarMod.F90`, `ActiveLayerMod.F90` | note 22 refs | **Confirmed** (all exist; roles now stated) | 359, 2,264 and 350 lines | Ref |
| L6 | `src/biogeochem/CNDV*Mod.F90` (DGVM), `CNFire*Mod.F90` as alternative formulations | note 25 refs; matrix "New domains" vegetation row ("CTSM CNDV and fire"); ARCH pipeline 8v | **Confirmed** | `CNDVDriverMod.F90`, `CNDVEstablishmentMod.F90`, `CNDVLightMod.F90`, `CNDVType.F90` (1,682 lines; LPJ-derived, `CNDVDriverMod.F90:78`); `CNFireBaseMod.F90` (1,365), `CNFireLi2014/2016/2021/2024Mod.F90` | Ref |
| L7 | "DGVM/FATES, Fortran. Reference." | matrix biomes row 4 | **Changed**: FATES is an empty submodule; only CNDV is present | `src/fates/` (0 files) | Ref |
| L8 | "C/N cycling; soil properties are input"; soil gap with CTSM as an algorithm reference | matrix soils row 2, soil pick; ARCH §7 soils line (phase text, not edited) | **Confirmed**; the row now names the pedotransfer | `src/soilbiogeochem/` (23 files); L1 | Ref |
| L9 | "CTSM hydrology" for groundwater (7g); "Soil-water and overland flow" | matrix "New domains" groundwater row, hydrology row 4; ARCH pipeline 7g | **Confirmed**, detail added: a water table, TOPMODEL-style baseflow and a Richards solver | `SoilHydrologyMod.F90:615` `WaterTable`, `:872` `Drainage`, `:1218` (`rsub_top = imped·rsub_top_max·exp(−f·zwt)`), `:1533` `PerchedWaterTable`, `:2037` `SubsurfaceLateralFlow`; `SoilWaterMovementMod.F90:414` (Zeng & Decker 2009), `:976` (moisture form); `InfiltrationExcessRunoffMod.F90` | Baseflow: dmath (closed form). Richards: Ref |
| L10 | "their benchmarking practices (biome and NPP comparisons)" | note 15 refs | **Changed**: the checkout has no benchmarking code; for CTSM this is a literature reference | grep for "ilamb" and "benchmark" in the repo: no benchmark code | Ref (literature) |
| L11 | "CTSM glacier mass balance" as an ice-sheet reference | matrix "New domains" ice row | **Changed** (as L3) | as L3 | Ref |
| L12 | Audit details: 39K LOC / 147 Python files; FATES "~15K LOC, C++ core"; `CNFireBaseMod` "115K LOC"; glacier SMB "PDD-based"; active layer "zero-amplitude depth"; paths `src/utils/SoilWaterMovementMod.F90`, `src/biogeophysics/HillslopeHydrologyMod.F90`, `src/biogeochem/CNPhotosynthesisMod.F90`; urban "istdlak index 71–75"; RANDOM_NUMBER; licence "lines 1–35"; Badlands "Python/C++, LGPL-3.0" | `audit/CTSM.md` | **Changed**: 45,489 lines in 198 Python files; FATES absent; 1,365 lines; L3; L4; `src/biogeophys/` for both modules and `PhotosynthesisMod.F90` (Ball–Berry 1987 or Medlyn 2011, `:82–83`); urban landunits 7–9 (`main/landunit_varcon.F90:26`, `:30`); no RNG; 34 lines; Badlands per `audit/Badlands.md` | as cited | n/a |

## MOM6

Frame and units, verified:
- **Grid:** an Arakawa C-grid on logically rectangular meshes (lat-lon, Mercator, tripolar), with geographic latitude and longitude in degrees, east-positive. The canonical frame converts to it through lat = asin(z/r), lon = atan2(y, x).
- **Units:** SI underneath a dimensional-rescaling layer (`src/framework/MOM_unit_scaling.F90`; comments read like "[rad T-1 ~> rad s-1]"). A port drops the scaling factors and uses SI.
- **To canonical:** the C-grid finite-volume discretisations do not transfer to Voronoi sphere cells; note 23 already plans a new solver. Closed-form pieces (EOS polynomials, tidal astronomy, analytic winds) transfer directly, evaluated per cell.
- **Submodules:** `pkg/GSW-Fortran` (commit `29e64d6`) and `pkg/CVMix-src` (commit `fce4221`) are empty. The 32 files in `src/equation_of_state/TEOS10/` are symlinks into GSW-Fortran, so TEOS-10 proper is absent. Seven files `use` CVMix, including `MOM_vert_friction.F90`, so the checkout cannot build as is.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| M1 | `src/core/MOM_barotropic.F90`, `MOM_CoriolisAdv.F90`, `MOM_PressureForce*.F90`: "formulations and constants" | note 23 refs and §3.1; ARCH pipeline 5o; matrix "New domains" ocean row | **Confirmed**, detail added: the barotropic step is explicit and subcycled (forward–backward, blended toward backward Euler by `bebt`); Coriolis/PV schemes Sadourny 1975, Arakawa & Hsu 1990, Arakawa & Lamb 1981, a blend and WENO variants; pressure gradient finite-volume or Montgomery | `MOM_barotropic.F90:471–477` (`btstep`); `MOM_CoriolisAdv.F90:103–111`; `MOM_PressureForce_FV.F90`, `MOM_PressureForce_Montgomery.F90` | Ref (the new solver on the sphere is dmath) |
| M2 | `src/equation_of_state/` (TEOS-10) | note 23 refs and §3.1 ("the equation of state") | **Changed**: TEOS-10 is not in the checkout. The Roquet et al. (2015) polynomial, a closed-form TEOS-10 fit in conservative temperature, absolute salinity and pressure, is in-tree and needs no GSW code | `TEOS10/` symlinks → `../../../pkg/GSW-Fortran/toolbox/*.f90`; `MOM_EOS_TEOS10.F90:8–11` `use gsw_mod_toolbox`; options `MOM_EOS.F90:175–185`; `MOM_EOS_Roquet_rho.F90:5`, `:194` `density_elem_Roquet_rho` | Roquet, Wright, linear: dmath. TEOS-10: unavailable here |
| M3 | `src/parameterizations/vertical/MOM_tidal_forcing.F90` | note 23 refs | **Changed** (path): the file is in `lateral/`. It is closed-form equilibrium-tide astronomy for 10 constituents, a port candidate for note 23 §3.3 | `src/parameterizations/lateral/MOM_tidal_forcing.F90`: `MAX_CONSTITUENTS = 10` `:27`; `astro_longitudes_init` `:91`; `eq_phase` `:120`; `tidal_frequency` `:154–182`; `nodal_fu` `:187`; degree-2 structure functions `:290–293`; amplitudes and Love numbers `:413–458` | dmath |
| M4 | *New reference:* analytic gyre wind stress for note 23 §5 idealised basins | — (added to note 23 refs) | **New**. MOM6 has no analytic Stommel or Munk comparison; `tc1` runs gyre winds as a regression test only | `config_src/drivers/solo_driver/MOM_surface_forcing.F90:471` `wind_forcing_2gyre`, `:506` `_1gyre`, `:540` `_gyres`; `.testing/tc1/MOM_input:169`, `:516` | dmath |
| M5 | "MOM6 test cases: verification patterns for ocean" | note 15 refs | **Confirmed**, detail added: `.testing/` runs invariance tests (grid symmetry, processor layout, restart equivalence, DEBUG vs REPRO, NaN initialisation, dimensional rescaling) on `tc0`–`tc4`, with no analytic targets | `.testing/README.rst:221–242` | Ref (practice) |
| M6 | "verification and performance-test practice" | note 38 refs | **Confirmed** | timing tests `.testing/README.rst:31–35` (`config_src/drivers/timing_tests`), profiling `:77`; tools `parse_perf.py`, `compare_perf.py` | Ref (practice) |
| M7 | "Production primitive-equation ocean model, Fortran/MPI. Algorithm reference only."; "MOM6 etc. are ocean-only" | matrix ocean row 2, wind pick | **Changed** (scope): the solver is a reference, but M2–M4 port as closed forms | as M2–M4 | as M2–M4 |
| M8 | Audit details: "245 Fortran source files across 91 directories"; barotropic "implicit free-surface"; `MOM_tidal_forcing` in `vertical/`; TEOS-10 "fully contained", "LGPL (checked)"; CVMix "included"; `MOM_MARBL_tracers.F90`, `MOM_generic_tracer.F90` in `src/tracer/`; LICENSE "178 lines" | `audit/MOM6.md` | **Changed**: 245 in `src/`, 323 in the repo, 75 directories; M1; M3; empty submodules (licence not checkable); MARBL interface is `src/tracer/MARBL_tracers.F90` and `MARBL_forcing_mod.F90` with stubs in `config_src/external/MARBL/`, generic tracers in `config_src/external/GFDL_ocean_BGC/`; 177 lines | as cited | n/a |

## MARBL

Frame and units, verified:
- **Grid:** one vertical column at a time; no horizontal structure. The host ocean model supplies transport and integrates the returned tendencies (`marbl_interior_tendency_compute` `src/marbl_interior_tendency_mod.F90:92`, output `interior_tendencies` `:159`).
- **Units:** cgs. Concentrations in nmol/cm³ (numerically mmol/m³, as the YAML tracer list states), fluxes in nmol/cm²/s, wind as cm²/s² (`docs/src/usr-guide/GCM-interface/GCM_requirements/forcing_fields.rst:23–30`), seawater density in g/cm³ (`src/marbl_constants_mod.F90:59`), lengths in cm (`defaults/settings_latest.yaml:429`). A port converts to SI.
- **Determinism:** no random numbers; the code is arithmetic plus `exp` and `**`, which map onto `dmath`.

| # | Pick (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| B1 | "`src/marbl_settings_mod.F90` and `defaults/*.yaml`: a parameter registry with types, defaults and generated documentation, the model for this design" | note 17 refs; matrix "New domains" registry row | **Changed**: the metadata is datatype, units, long name, subcategory, a per-configuration default and an optional `valid_values` enumeration, in four ordered categories. There are no numeric ranges and no generated documentation, and each parameter is declared twice (Fortran `add_var` plus default, and YAML). It remains the model for the metadata fields, not for the mechanism (note 17 §3.1 declares once, in code) | `settings_latest.yaml:9–39`; `marbl_settings_mod.F90:540`, `:1138`, `:1217`, `:1766` (define), `:369`–`:522` (defaults), `:2045` `add_var`; `docs/src/dev-guide/add-settings-parameter.rst:7–9`; `MARBL_tools/yaml_to_json.py`, `MARBL_generate_settings_file.py` (no documentation output) | Ref (design) |
| B2 | `src/marbl_interior_tendency_mod.F90`, `marbl_pft_mod.F90`: "optional ocean productivity for marine life and fisheries"; "MARBL-style biogeochemistry" | note 23 refs and §2; ARCH pipeline 5o; matrix "New domains" ocean row | **Changed** (feasibility): productivity needs prognostic 3D nutrient, biomass and chlorophyll tracers, so the model is a reference. Its rate laws (temperature function, Monod nutrient limitation, Geider et al. 1998 light limitation) port as a per-cell proxy, which is new code. `marbl_pft_mod.F90` holds only PFT parameter types and defaults | `compute_autotroph_photosynthesis` `:1306`; PCmax `:1353`; light limitation `:1364`; photoC `:1379`; `f_nut` `:1526`; `compute_temperature_functional_form` `:1222` (Q10 `:1257`, Arrhenius, power); `marbl_pft_mod.F90` (389 lines; `autotroph_set_to_default` `:107`) | Rate laws: dmath. Full model: Ref |
| B3 | Audit details: "40 Fortran files (~23.4k LOC)", "~2.85k LOC Python", settings "140k LOC", diagnostics "192k LOC", private types "92k LOC", carbonate solver "~5k LOC", "4 phytoplankton types", depth in metres, mmol/m³, "explicit time integration", licence "BSD-3-Clause", "copyleft-weak" | `audit/MARBL.md` | **Changed**: 31 files in `src/` carry 23,437 lines (40 with `tests/`); 2,023; 2,914; 4,367; 2,078; 1,211 (the large figures were bytes); three autotrophs by default (`settings_latest.yaml:205–211`; `+cocco` adds coccolithophores and a second zooplankton); cgs; MARBL returns tendencies; the licence as in the table above | as cited | n/a |

## Corrections made

- **`audit/CESM.md`:**
  - a reconciliation header;
  - code size and the five user-guide pages;
  - the 21 submodules;
  - the ocean grid;
  - the licence section rewritten (no permission grant, component table, CISM LGPL, Lahey no-sale clause);
  - the FATES path.
- **`audit/CTSM.md`:**
  - a reconciliation header;
  - Python size, empty submodules (FATES included);
  - hydrology paths with the water table, baseflow and Richards solver;
  - CNDV and fire sizes;
  - glacier SMB as bookkeeping, active layer as an interpolated 0 °C depth;
  - urban landunit indices, routing paths, `PhotosynthesisMod.F90`;
  - soil hydraulic parameters (Cosby 1984, Clapp & Hornberger);
  - no RNG, so deterministic;
  - licence (NCSA-style, 34 lines) and MapMaker's GPL-3.0-only;
  - the closed-form pieces worth porting; the Badlands licence line.
- **`audit/MOM6.md`:**
  - a reconciliation header;
  - file and directory counts;
  - the `.testing/` invariance and timing tests;
  - the barotropic scheme, Coriolis and pressure-gradient options;
  - tidal forcing moved to §3.3 with its constituents and line numbers; ePBL and CVMix dependence in §3.2;
  - MARBL-interface and generic-tracer paths;
  - EOS options and the Roquet polynomial; the TEOS10 symlinks and empty submodules;
  - grid frame; licence line count and headers;
  - the verdict: closed-form pieces for note 23 (EOS, tidal astronomy, gyre winds).
- **`audit/MARBL.md`:**
  - a reconciliation header;
  - file counts and sizes;
  - default plankton set and the productivity rate laws;
  - how the settings registry works;
  - cgs units and depth in cm;
  - tendencies only (no time stepping);
  - licence (MIT-style grant, two BSD conditions);
  - a note-23 verdict line.
- **`audit/CAPABILITY_MATRIX.md`:**
  - note 4 (CESM empty; empty submodules in MOM6 and CTSM);
  - ocean row 2 (MOM6), biomes row 4 (CTSM, no FATES), soils row 2 (pedotransfer);
  - "New domains" ice, ocean, groundwater, atmosphere and registry rows;
  - the UCAR licence row split, with a new MOM6 row;
  - the "nothing to extract" list, which now names the small closed-form exceptions in MOM6, CTSM and MARBL.
- **`docs/ARCHITECTURE.md`** (non-phase text only): expanded pipeline 5a (CAM formulations from the literature; CESM's checkout is empty).
- **Notes:**
  - 4: CTSM pedotransfer functions with paths and lines;
  - 15: MOM6 `.testing/` invariance tests; CTSM has no benchmarking code;
  - 17: what MARBL's registry has and lacks;
  - 22: glacier SMB as bookkeeping (energy-balance reference is the CLM5 technical note); permafrost by mean annual temperature is new code; roles of the three CTSM files;
  - 23: the MOM6 bullet split into solver, EOS (Roquet), tidal astronomy (path fixed) and gyre winds; MARBL rate laws, cgs units, proxy as new code; `ocean.productivity` wording;
  - 24: CAM as a literature reference;
  - 38: MOM6 test practice with paths.

Not changed:
- `upstream-manifest.json`: the CESM and MARBL licence entries say "BSD-3-Clause-style"; CESM's file grants nothing and MARBL's has two conditions. It is configuration rather than one of the audited documents, as in groups 1 and 2.
- Notes 25 (CNDV and fire confirmed) and ARCH pipeline 5o, 7g and 8v (confirmed).
- Phase text in `docs/ARCHITECTURE.md` §7 and the §7.0 tables, including the §7 soils line that names CTSM (correct as written).

## Flags for the phase plan (phase text not edited)

1. **Phase 7b (note 22): a physically based SMB option has no upstream scheme to port.** CTSM computes melt inside its full surface energy balance and soil/snow thermal model; `GlacierSurfaceMassBalanceMod` only books the result. The PDD default stands. A physically based option means writing a surface energy balance from the CLM5 technical note, which note 22 §7's "Mass balance ~600" does not cover. Permafrost from mean annual ground temperature is also new code (small, inside "Sea ice and permafrost ~500"). Phase order is unchanged; the size line may need to grow if the option is kept.
2. **Phase 7c (note 23): TEOS-10 is not in the checkout.** MOM6's TEOS-10 files are symlinks into an empty submodule. The Roquet et al. (2015) polynomial in MOM6 is a closed-form TEOS-10 fit and covers the thermohaline proxy. No phase change.
3. **Phase 7c (note 23): useful closed-form ports.** MOM6's tidal astronomy (frequencies, equilibrium amplitudes, Love numbers, phases, nodal factors) fits §3.3, and its analytic gyre winds fit the §5 idealised-basin tests. MOM6 has no analytic Stommel or Munk check, so those comparisons are MapMaker's own. No phase change.
4. **Phase 7c (note 23): ocean productivity is a proxy.** MARBL's full model needs prognostic 3D tracers; the optional `ocean.productivity` comes from its rate laws evaluated per cell, which is new code within note 23 §7's "Biogeochemistry (optional) ~1,500". No phase change.
5. **Phase 8b (note 24): CESM supplies nothing in this checkout.** CAM formulations come from the literature, as stage 5a's "new, from published models" already says. No phase change.
6. **Phase 5b (note 17): MARBL is a metadata model only.** No ranges, no generated docs, double declaration; note 17's design already goes further. No phase change.
7. **Group 2 flag 1 (stage 7g groundwater, no design note):** CTSM adds a ready formulation for that decision: a water-table depth and TOPMODEL-style baseflow (`SoilHydrologyMod.F90:615`, `:1218`), alongside ParFlow's retention curves. It does not resolve the flag; the design note is still missing.
8. No flag for **Phase 9b** (note 25): CNDV and the Li fire models are present as alternative references; FATES is absent but was never the pick.

## Checks run

- Each upstream repo is clean (`git status --porcelain` empty) at its pinned commit after the pass.
- Every edit was applied by a script that required its old text to match exactly once (three follow-up fixes the same way).
- Each edited audit file (`CESM`, `CTSM`, `MOM6`, `MARBL`, `CAPABILITY_MATRIX`) was grepped for leftover contradictions: ~800, 12 external, B-grid, BSD-3, "matches the file", `components/fates`, EULA; 39K, 147, PDD, degree-day, zero-amplitude, RANDOM_NUMBER, stochastic, PE layout, 115K, 15K, C++, `biogeophysics`, `src/utils/SoilWater`, `CNPhotosynthesis`, 71–75; 91 directories, 243,000, implicit, `vertical/MOM_tidal`, fully contained, LGPL, 178, `MOM_MARBL`, vendored; 40 Fortran, 2.85, 192k, 140k, 92k, 4 phytoplankton, metres, mmol/m³, ~5k, Eulerian, copyleft; CESM docs, glacier mass balance, "Algorithm reference only", FATES, BSD-style. The hits found were fixed: MOM6's "implicit solver" in §3.1 extractability and the "(vendored)" §3.10 heading; MARBL's "implicit differentiation" time-stepping remark in §3.1. The remaining hits are the corrected text itself.
- No `npm` command was run; only Markdown changed.
