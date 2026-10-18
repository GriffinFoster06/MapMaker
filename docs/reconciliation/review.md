# Reconciliation review

2026-10-18. Independent review of every change on `catchup/reconciliation` since `121dc1e` (commits `e1478ec` … `001da0d`). This is a review only: nothing was fixed, and this file is the only one added.

Findings are ranked by severity: **High** means a planning decision rests on it now, **Medium** means a record contradicts another record or the source, and **Low** is wording or line-number drift.

## Summary

- **Scope is clean.** No file under `upstream/`, `packages/` or `tools/` changed. All 30 upstream checkouts are at their manifest commits with clean trees. The only non-Markdown change is `upstream-manifest.json`, and only `license.spdx` strings changed there.
- **Spot-check: 11 of 12 confirmed, 1 wrong.** Group 6a's A6 ("Azgaar has no label collision avoidance") is wrong. Azgaar has a seeded label-overlap solver in a directory the grep did not cover. That claim drives pending decision A3 and group 6a flag 2.
- **Prerequisites point to a missing file.** Every new Prerequisite line in §7 says the work "follows `docs/reconciliation/README.md`", and that file does not exist in this branch or anywhere in its history.
- **Deferred reconciliations are not all in the right phase.** Six upstreams have a Prerequisite only in a phase later than the first phase whose design note cites them. Four upstreams with unchecked claims (orogen, and Azgaar, QGIS and CesiumJS outside Phases 5/5c) have no Prerequisite at all.

## 1. Scope checks

| Check | Result | How |
|---|---|---|
| Files changed since `121dc1e` | 45 files: 44 `.md`, plus `upstream-manifest.json` | `git diff --name-only 121dc1e..HEAD` |
| `packages/`, `tools/`, `upstream/` in the diff | None | `git diff --name-only 121dc1e..HEAD -- upstream packages tools` is empty (`upstream/` is also git-ignored) |
| Manifest diff | 5 entries changed (ASPECT, Badlands, CESM, Delft3D, MARBL), `license.spdx` only. Each `commit` value is unchanged (each appears once as `-` and once as `+`) | `git diff 121dc1e..HEAD -- upstream-manifest.json` |
| `upstream/` checkouts | 30 of 30 present, no extra directories, `HEAD` equals the manifest `commit` for each, `git status --porcelain` empty for each. No repo was newly cloned or added to the manifest | script over `upstream-manifest.json` |
| Ignored files in `upstream/` | Only `UrbanSim/urbansim/__pycache__/` (`__init__.cpython-314.pyc`, dated 2026-10-02). It predates this branch and is ignored by UrbanSim's own `.gitignore`. Informational only | `git status --porcelain --ignored` per repo |

## 2. Spot-check of 12 Changed or Dropped verdicts

**Selection:** one verdict per repo, 12 different repos. The pick in each repo is the verdict that most directly drives phase text or a pending decision, with the nearest phases preferred.

| # | Verdict | Phase it drives | Result | What I read |
|---|---|---|---|---|
| 1 | **Azgaar A6** (Changed): "Azgaar has no label collision avoidance" | 5c (flag 2, pending A3) | **Wrong** | `src/controllers/label-spread.ts` (1,030 lines, added upstream 2026-09-11 in `37107a9f`) is a label-overlap solver. It has a collision model (`:108–120`: overlap ratio, padding, burg-icon obstacles, outside-map penalty) and builds 12-direction point candidates and path start-offset candidates. `optimizeLabelPlacements` (`:694`) splits overlapping labels into conflict components (`:734`), then runs `refine` (`:778`) and a simulated-annealing pass (`anneal`, `:802`) seeded by `Alea(\`${options.map.seed}\|ids\`)` (`:146–147`, `:713`). Tests are `label-spread-{burg,path,solver}.test.ts`, and `labels-overview.ts:419` calls it. The A6 grep covered only `renderers/labels/` and `labels-generator.ts`. **Caveat for porting:** it measures text through the SVG DOM (`getComputedTextLength`, `getExtentOfChar`, `getBoundingClientRect`, `:478–583`), so a worker port needs its own font metrics. |
| 2 | **QGIS Q1** (Changed): the hillshade pick is `qgshillshaderenderer.cpp`: Horn, the GDAL fast formula, multi-directional | 5c | **Confirmed** (line drift) | Renderer is 655 lines. Horn derivatives are at `:443–445`, the fast formula at `:447–454` and the USGS multi-directional weighting at `:458–489`. Cell size is at `:149–150`, zenith = 90 − alt at `:151`, azimuth negated at `:152`. Nodata is replaced by the centre value at `:433–441`, not `:443–448` as cited. Filter is 76 lines, and `lightAngle` feeds `mCosZenithRad`/`mSinZenithRad` at `:26–27` (cited `:23–24`) in the zenith-form formula. |
| 3 | **MARBL B1** (Changed): the registry has metadata only, with no ranges and no generated docs | 5b (note 17) | **Confirmed** (minor omission) | `defaults/settings_latest.yaml:9–39` lists four stages, five required fields and an optional `valid_values`, with no ranges. The four `marbl_settings_define_*` routines are at `:540`, `:1138`, `:1217` and `:1766`, and `add_var` is at `:2045`. The docs (`docs/src/`) are hand-written Sphinx. `MARBL_tools/` produces settings and diagnostics files, not documentation. The verdict omits the optional `cannot change`, `must set` and `_append_to_config_keywords` fields (`:35–39`). |
| 4 | **VPLanet V9** (Changed): `binary.c` gives only an orbit-averaged scalar flux, and POISE takes one star | 6a | **Confirmed** (omission) | `binary.c` is 2,523 lines. `fndApproxInsol` (`:2482`) wraps `fndFluxApproxBinary` (`:2365`, monopole plus dipole averaged over the binary orbit). `poise.c:5538` uses `body[0].dLuminosity` only. **Omitted:** `fndFluxExactBinary` (`binary.c:2394`), a numerical average over the planet's orbit. It is the function VPLanet itself uses for circumbinary instellation (`system.c:315`). It is also a scalar, so the conclusion holds, but Phase 6a's text cites only the approximate one. |
| 5 | **ASPECT S3** (Dropped): no plume-placement model, and World Builder plumes are user-placed geometry | 6c | **Confirmed** | `source/initial_temperature/` has 18 plugins and none is a plume. Grepping `source/` and `include/` for "plume" hits only `latent_heat_melt.cc` and `geometry_model/interface.h`. `contrib/world_builder/.../features/plume.cc` is 458 lines, with user entries for depth range and elliptic cross-sections at `:85–96`. `cookbooks/plume_2D_chunk/plume2D.prm:1` is the Kellogg & King setup. World Builder `LICENSE` is LGPL 2.1. |
| 6 | **CesiumJS K1** (Changed): three projection files, 314 lines; WebMercator is spherical | 5 | **Confirmed** | Line counts: 151 + 105 + 58 = 314. `WebMercatorProjection.js:27` sets `_semimajorAxis = maximumRadius`, and `:148` sets `MaximumLatitude = mercatorAngleToGeodeticLatitude(π)`. `GeographicProjection.js:56–57` computes x = λa and y = φa. No other projection classes exist; `engine/Source/Core/Deprecated/` only holds copies of the same three. |
| 7 | **Badlands B2** (Changed): incision is explicit with a CFL step, not implicit | 7 (D4) | **Confirmed** | `utils/flowalgo.f90`: `flowcfl` is at `:396` and `streampower` at `:797`. For the detachment-limited law, `SPL = −Cero·frck·Q^m·S^n`, and when `−totspl·dt > dh` the rate is scaled to the local drop (`:946–960`). The same clip repeats for each law at `:988`, `:1026` and `:1064`. |
| 8 | **ParFlow P1** (Changed): only the closed-form curves transfer; the Richards solver is reference only | 7 (7g Prerequisite) | **Confirmed** | `problem_saturation.c`: van Genuchten is case 1 (`:221`) with closed form `s_dif / (1+(α·h)^n)^m + s_res` at `:283–285`, where h = \|p\|/(ρg) (`:283`). Haverkamp is at `:419`. `problem_phase_rel_perm.c` has van Genuchten at `:567` and Haverkamp at `:1363`. Nothing in `pfsimulator/` mentions Brooks–Corey. Minor: P5 gives the case range as `:168–602`, but case 5 runs to `:653`. |
| 9 | **PISM S6** (Changed): PISM has no erosion | 7b | **Confirmed** | `src/earth/BedDef.hh:27` reads "(soon) bed erosion". Grepping `src/` for `erosion\|erode` finds only that line and a bibliography title in `coupler/ocean/holland_jenkins/subshelf_melt.mac:3`. |
| 10 | **CTSM L3** (Changed): `GlacierSurfaceMassBalanceMod` is bookkeeping, not a scheme | 7b (pending A2) | **Confirmed** | 359 lines. `HandleIceMelt` is at `:69`. Melt is the liquid water found in `istice` layers (`:131–136`). Accumulation is `qflx_snwcp_ice` on persistent-snow or ice columns (`:207–212`) and the SMB is at `:214`. The file has no degree-day logic. `PhaseChange` is declared at `SoilTemperatureMod.F90:81`. |
| 11 | **MOM6 M2** (Changed): TEOS-10 is not in the checkout; the Roquet polynomial is in-tree | 7c | **Confirmed** | `src/equation_of_state/TEOS10/` holds 32 symlinks to `../../../pkg/GSW-Fortran/toolbox/*.f90`, and `pkg/GSW-Fortran` has 0 entries. `MOM_EOS_TEOS10.F90:8–11` uses `gsw_mod_toolbox`. `MOM_EOS_Roquet_rho.F90` has its header comment at `:5` and `density_elem_Roquet_rho` at `:194`. The options are at `MOM_EOS.F90:175–185`. |
| 12 | **Delft3D D3** (Changed): transport formulas and the Exner update exist, but no landform rules | 7c | **Confirmed** | `updmorfac.f90`, `flow2d3d_kernel/.../bott3d.f90` and `dflowfm_kernel/.../m_fm_bott3d.f90` all exist at the cited paths. Grepping `src/` for barrier island, coral or reef matches 0 files. As a side check on D4, "tsunami" appears only in `third_party_open/libsigwatch/config.guess`. |

## 3. Findings, ranked

### High

**H1. Group 6a A6 is wrong, and the error has spread into five records and one pending decision.** Azgaar has a seeded, tested label-overlap solver (spot-check 1). The false claim appears in:
- `docs/reconciliation/group-6a.md` A6 and flag 2 ("cannot come from Azgaar or CesiumJS. The only implementation is QGIS PAL");
- `docs/design/18-cartographic-rendering.md:65` ("**Azgaar has no label collision avoidance**");
- `audit/CAPABILITY_MATRIX.md:401` ("no label collision han[dling]");
- `audit/Azgaars-Fantasy-Map-Generator.md:222`, `:225` ("no label collision handling");
- `docs/reconciliation/pending-decisions.md` A3, whose first evidence bullet and conclusion ("The only implementation is QGIS PAL") rest on it.

A3 asks the user to re-size Phase 5c around a 10,857-line PAL port with a GEOS replacement. A smaller MIT TypeScript alternative was never weighed. It is seeded (Alea from the map seed), already deterministic in ordering (`ids.sort()`), and needs font metrics instead of DOM measurement. Group 6a's method note says "the Azgaar and QGIS reports had no errors in the facts re-checked", so this claim was not re-read in the source.

> **Resolution (2026-10-18):** Re-read `upstream/Azgaars-Fantasy-Map-Generator/src/controllers/label-spread.ts`: the solver, seeding, tests and DOM measurement are as described. Corrected `group-6a.md` A6 and flag 2, `docs/design/18-cartographic-rendering.md`, `audit/CAPABILITY_MATRIX.md`, `audit/Azgaars-Fantasy-Map-Generator.md` (banner, §3.28 text and rating) and `audit/QGIS.md` ("only implementation"), and rewrote `pending-decisions.md` A3 as a choice between `label-spread.ts` and PAL. One correction to this review's wording: the point candidates are 12 directions at six step distances (`:92–93`), and `DIRECTION_SAMPLES = 16` is the path-direction sampling count. Phase text and note 18 §7's estimate were not edited.

**H2. Every new Prerequisite line cites a file that does not exist.** `docs/ARCHITECTURE.md` Phases 5b, 5c, 7, 8b, 9b, 9d, 10b, 11b, 13 and 18 each say the work "is documentation-only and follows `docs/reconciliation/README.md`". The directory holds only `group-1.md`, `group-2.md`, `group-3.md`, `group-6a.md` and `pending-decisions.md`, and `git log --all -- docs/reconciliation/README.md` is empty. The procedure each Prerequisite depends on (method, verdict scale, feasibility scale, subagent cross-check) exists only in each group file's preamble. The group numbering (1, 2, 3, 6a) also implies a plan for groups 4, 5 and 6b that is not written down anywhere.

> **Resolution (2026-10-18):** Created `docs/reconciliation/README.md` (why, method, status table matching the §7 Prerequisite lines, how to run a session, both reusable prompts). The numbering gap (groups 4, 5, 6b) is stated there: those groups were never defined, so deferred work is listed by Prerequisite phase.

**H3. Some deferred reconciliations sit in a later phase than the first phase that depends on them.** The table maps each unreconciled upstream to the notes that cite it, and those notes to phases (§7.0 table).

| Upstream | Prerequisite placed at | First dependent phase (note: citation) |
|---|---|---|
| LPJmL | 9b | **7** (note 12:95, `src/lpj/drain.c` for the lake water balance Phase 7 builds); then 8 (note 15:68, benchmarking practice) and 9 (note 4:86, `src/soil/`; note 4:78, the texture → hydraulic idea that group 3 L2 explicitly deferred to "a later group") |
| MESSAGEix | 13 | **5b** (note 17:57, "scenario parameters: scenario management") |
| UrbanSim | 13 | **10** (note 9:59, :97, logit location choice for migration) |
| GAMA, FLAMEGPU2 | 13 | **9c** (note 26:49, herd and migration patterns); 9e (note 29:32) |
| SongsOfFOSS | 13 | **9e** (note 29:33, demography reference) |
| FastScape | 7 | The matrix row (`CAPABILITY_MATRIX.md:417`) gives its notes as "erosion, 21". Note 21 is Phase 6c, but no design note mentions FastScape, so the "21" is unsupported, and 7 is right only if the erosion use is the sole one |

SLiM and RangeShiftR at 9b come before their first users (9c, and Phase 10 for note 9:98), so they are fine. Pending D1 already notes this.

> **Resolution (2026-10-18):** Verified the cited design-note lines (notes 12, 17, 9, 26, 29) still say what the table says. The Prerequisite placement is phase text, so it was **not edited**; each mismatch is shown in the `README.md` status table and recorded as pending decision D3 with a proposed fix.

**H4. Four upstreams with unchecked claims have no Prerequisite at all.** The §7 reconciliation paragraph says "the upstreams not yet checked … are each a **Prerequisite** line in the phase that first depends on them". These are not:
- **orogen**: cited by 21 design notes, including notes 12, 13, 16, 17, 21, 22 and 23 for Phases 5b–7c. It is vendored and parity-tested, which may justify the exemption, but the exemption is not stated. Two claims fail on a quick check: see M2 and M3.
- **Azgaar outside Phases 5/5c**: group 6a's "Not re-checked" section defers it. It is still cited by note 16:84 and note 17:56 (Phase 5b, editors and options UI, "exact files located when Phase 5b starts"), note 12:7, :14, :90, :94 (Phase 7: `lakes.ts` `getLakeEvaporation`, the `closed` flag, `features-generator.ts`), note 5 (Phase 9), note 9 (Phase 10) and others.
- **QGIS outside Phase 5c**: note 37:31 (Phase 17: the Processing framework).
- **CesiumJS outside Phases 5/5c**: note 38:52 (Phase 14: LOD and tiling) and note 36 (Phase 16, K6 checked only the paths).

> **Resolution (2026-10-18):** Recorded in the `README.md` status table (Azgaar, QGIS and CesiumJS as partly done; orogen as deferred with no Prerequisite) and in pending decision D3, which proposes either adding Prerequisite lines or stating an explicit orogen exemption. No phase text was edited.

### Medium

**M1. Pending A4 and group 1 S2 both miss orogen's existing dynamic topography.** `upstream/orogen/js/elevation.js:2412` `applyDynamicTopography` (stage 10, also in the vendored copy) adds `r_mantleNorm × DYNAMIC_TOPO_UPLIFT/SUBSIDENCE` to elevation. `audit/orogen.md:45` lists it too. A4 offers only "drop `interior.dynamicTopography`, or add a §3 method". It omits the third option that note 21:81 implies, falling back to orogen's heuristic. A4 correctly finds that group 1 S2 ("note 21 has no dynamic-topography output") contradicts note 21:21, but `group-1.md` S2 and flag 4 still carry the false statement with no pointer to A4.

> **Resolution (2026-10-18):** Read `upstream/orogen/js/elevation.js:2412` (`applyDynamicTopography`, stage 10; constant at `js/terrain-config.js:522`). Added the third option to `pending-decisions.md` A4, and added corrections to `group-1.md` S2 and flag 4.

**M2. Note 17 cites an orogen file that does not exist.** `docs/design/17-parameter-registry.md:56` names "orogen `js/config.js` (slider definitions)". Neither `upstream/orogen/js/` nor `packages/gen-orogen/vendor/js/` has `config.js`. The config files are `climate-config.js` and `terrain-config.js` (note 10:89 cites them correctly), and the sliders are read from the DOM in `generate.js` (`readSliders`, used at `:719`). Phase 5b depends on note 17. Orogen was never reconciled (H4), so the error went unchecked.

> **Resolution (2026-10-18):** Confirmed `js/config.js` does not exist in `upstream/orogen/js/`; the files are `climate-config.js` and `terrain-config.js`, and the sliders are DOM inputs read by `readSliders` (`js/generate.js:18`). Fixed `docs/design/17-parameter-registry.md:56`. The wider orogen reconciliation remains deferred (D3).

**M3. The GPlates reconstruction-code port contradicts group 1.** Group 1 G3 says `Reconstruction*` depends on the feature model ("Ref, or a partial port … G1 is the part to port"), and flag 5 says reconstruction trees and plate circuits "are not needed". These records were not aligned:
- `audit/CAPABILITY_MATRIX.md:374`: "**Port GPlates** `src/maths` and `src/app-logic/Reconstruction*` to TypeScript";
- `audit/CAPABILITY_MATRIX.md:59`: rates `Reconstruction*` as "loose";
- `docs/design/13-forward-plate-evolution.md:209`: since Q12 `Reconstruction*` is "the preferred source to port".

> **Resolution (2026-10-18):** Aligned the matrix (rows at `:59` and `:374`) and note 13 §4 with group 1: port `src/maths` only; `src/app-logic/Reconstruction*` is a reference because it depends on the feature model and note 13 needs no plate circuit. A note was added to `group-1.md` G3. `audit/GPlates.md` was not changed.

**M4. Manifest licences are now inconsistent with the audits and with each other.** The 001da0d manifest edit updated 5 repos, which leaves three problems:
- **Stale audits.** `audit/Badlands.md`, `audit/Delft3D.md`, `audit/CESM.md:147` and `audit/MARBL.md` still say the manifest was not edited (pending C1 lists this and proposes a fix).
- **QGIS not updated.** Its entry still says `"GPL-2.0"`, while `CAPABILITY_MATRIX.md:432` and group 6a record GPL-2.0-or-later headers and a GPL-3.0-or-later PAL. Its `notes` field still says "projections", which group 6a Q3 found are only PROJ wrappers.
- **One string, two meanings.** GPlates is also `"GPL-2.0"` but means GPL-2.0-only (group 1).

The group records' "Not changed: `upstream-manifest.json`" lines are superseded by `001da0d`. Pending C1 says they should stay as dated history; this review only notes it.

> **Resolution (2026-10-18):** Updated the four stale audit sentences (`audit/Badlands.md`, `Delft3D.md`, `CESM.md`, `MARBL.md`) to say the manifest entry was rewritten on 2026-10-18. `upstream-manifest.json` is not Markdown, so the QGIS and GPlates entries were **not edited**; they are now pending decision C4. The group files' "Not changed" lines stay as dated history.

### Low

- **L1. VPLanet V9 and Phase 6a omit `fndFluxExactBinary`.** It is at `binary.c:2394` and is what `fdInstellation` (`system.c:315`) uses for circumbinary planets. The conclusion (no latitude-resolved two-star insolation) holds.
  > **Resolution (2026-10-18):** Added `fndFluxExactBinary` (`binary.c:2394`, used at `system.c:315`) and `fndFluxApproxBinary` (`:2365`) to `group-1.md` V9. `docs/ARCHITECTURE.md:999` (Phase 6a text) was not edited; its conclusion still holds.
- **L2. QGIS Q1 line citations are off by one to ten lines** (spot-check 2). The facts hold.
  > **Resolution (2026-10-18):** Line numbers corrected in `audit/QGIS.md`, `group-6a.md` Q1 and `pending-decisions.md` B4 (nodata `:433–441`, Horn `:443–445`, fast formula `:447–454`, multi-directional `:458–489`, zenith `:151`, azimuth `:152`, filter `:26–27`).
- **L3. MARBL B1 omits three optional metadata fields** (spot-check 3). The conclusion holds.
  > **Resolution (2026-10-18):** Added the optional `cannot change`, `must set` and `_append_to_config_keywords` fields to `group-3.md` B1.
- **L4. ParFlow P5 gives the case range as `:168–602`**, but case 5 runs to `:653`.
  > **Resolution (2026-10-18):** Case range corrected to `:168–653` in `group-2.md` P5 and `audit/ParFlow.md` (`/* End case 5 */` is at `:653`).
- **L5. `audit/MOM6.md:81–82` still rates the EOS "5/5 — TEOS-10 is international standard" and "fully extractable as a library"**, beside the corrected text saying TEOS-10 is absent. Group 3's leftover grep did not cover this.
  > **Resolution (2026-10-18):** `audit/MOM6.md` §3.6 rating changed to 4/5 and the effort line now separates the in-tree polynomials from TEOS-10. The 5/5 at `:210` rates the Roquet polynomial alone and was left.
- **L6. CC0 symbol packs.** Note 18 open question 1 (ship CC0 hand-drawn symbol sets?) bears on Phase 5c's "symbols", but the CC0 audit Prerequisite is at 10b. Harmless if 5c ships no third-party symbols. The phase text does not say which.
  > **Resolution (2026-10-18):** Recorded as pending observation D4; the phase text does not say whether 5c ships third-party symbols, and was not edited.
- **L7. Pipeline row 4c still lists "PISM (SIA/SSA), orogen glacial erosion"**, while Phase 7b now says the glacial-erosion law has no source chosen. These are consistent if orogen's heuristic is the fast-path default (note 22:36, :50). Pending B5 covers only the PISM half of the row.
  > **Resolution (2026-10-18):** Recorded as pending observation D4; no edit, since the rows are consistent if orogen's heuristic is the fast-path default.

## 4. Claims the reconciliation never checked that Phases 5–7 depend on

Everything below was outside the scope of groups 1, 2, 3 and 6a. Where I checked that a file exists, I say so; nothing below was otherwise verified.

**Phase 5**
- d3-geo / d3-geo-projection (D1) is "all projection math", and Phase 5 needs `invert` for every projection in "the d3 projection set" (§3.7 exact sampler, shader-vs-`invert` tests). It is not in `upstream/` and not installed, and `PROVENANCE.md` has no d3-geo entry (the §2 row is marked †). Group 6a flag 1 makes it the *only* source.

**Phase 5b**
- Note 17:56: orogen `js/config.js`. Does not exist (M2).
- Note 17:56: Azgaar options UI. Note 16:84: Azgaar editors ("exact files located when Phase 5b starts").
- Note 17:57: MESSAGEix/ixmp scenario parameters (Prerequisite only at 13; H3).
- Note 16:85: orogen interactive heightmap import (`import-main.js` exists).

**Phase 5c**
- mapgen4 and mewo2/terrain (Prerequisite present).
- CC0 symbol and font packs if 5c ships any (L6).

**Phase 6 (notes 10, 11)**
- orogen `climate-config.js` (`CLIMATE_DEFAULTS`) and `terrain-config.js` constants, which the parameter mapping is built on (files exist).

**Phase 6b (note 13)**
- orogen's plate stages as the parity baseline.
- tectonics.js T2 was confirmed from the audit ("re-checked"), not from new citations in the source.

**Phase 6c (note 21)**
- orogen `elevation.js` hotspot and island-arc stages (note 21:51), and the fallback "off → orogen's heuristics" (note 21:81). This includes its dynamic topography (M1).

**Phase 7 (note 12, note 14)**
- Azgaar `lakes.ts` (`getLakeEvaporation` at `:60`, the `closed` flag) and `features-generator.ts`: the files and the function exist, but their behaviour on "our lake layer" (note 12 §3.7) was never checked. Spike 1b ran them unmodified, but not with injected lake features.
- LPJmL `src/lpj/drain.c` lake and reservoir water balance (note 12:95; the file exists). Its Prerequisite is at 9b (H3).
- orogen `terrain-post.js` as the reference erosion until Phase 7 and as the fast detail erosion (§4 row 4).
- FastScape (Prerequisite present).

**Phase 7b (note 22)**
- orogen's glacial erosion (`terrain-post.js:402–434`, `glacialStrength`, exists) and `iceCover` classification, used for parity and the fast path (note 22:12, :50).
- The physical glacial-erosion law has no source (already flagged).

**Phase 7c (note 23)**
- orogen `js/ocean.js` heuristic current field for parity mode (exists).

## 5. What I ran

- `git diff --name-only`, `--stat` and the manifest diff over `121dc1e..HEAD`. I also ran a per-repo `rev-parse HEAD` against the manifest, plus `git status --porcelain` and `--ignored`, for all 30 checkouts.
- Read every reconciliation record in full (groups 1, 2, 3, 6a, pending decisions) and the full `docs/ARCHITECTURE.md` diff.
- For each spot-check, read the cited lines with `sed -n` and the absence claims with `grep -r` over the stated tree.
- Cross-document consistency: grepped the audits, the matrix, ARCHITECTURE and the notes for the superseded claims each group lists. I also mapped every unreconciled upstream to the notes citing it (`grep -l` over `docs/design/[0-9]*.md`) and those notes to phases through the §7.0 table.
- No `npm` command was run; nothing outside this file was modified.
