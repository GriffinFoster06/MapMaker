# Reconciliation: pending decisions

2026-10-18. These are changes that reconciliation groups 1, 2, 3 and 6a raised (or that applying them turned up) and that were **not applied**, because they go beyond the pre-authorised plan updates. Each one waits for your decision. Nothing here reorders, adds or removes a phase or changes a pick until you decide it.

**Applied in the same session, not listed here:** the §7.0 status rows for 4a and 4b; the ODE integrator as a Phase 6a deliverable reused in 6c, with size lines in notes 20 and 21; two-star insolation as original code (note 20, Phase 6a); the groundwater-design prerequisite for stage 7g (Phase 7, notes 12 and 25); the D4 benchmark authored from scratch, with an explicit-versus-implicit tolerance (Phase 7); PISM's scope and the missing glacial-erosion law (Phase 7b, note 22); coastal landforms as new code, and the Roquet polynomial in place of TEOS-10 (Phase 7c, note 23); a physically based mass balance as new code, with the PDD default kept (Phase 7b, note 22); the five manifest licence fields; and the reconciliation and audit prerequisites in phases 5b, 5c, 7, 8b, 9b, 9d, 10b, 11b, 13 and 18.

Each entry gives the proposed change, the evidence and where the edit would go.

## A. Plan and estimate changes (need a decision)

### A1. Budget a TypeScript FFT for Smith–Barstad rain (Phase 7, I3)

- **Proposal:** add a `dmath` FFT for the tangent-plane window as an explicit Phase 7 deliverable under I3, with a size line (note 14 §7 or a Phase 7 note). No note budgets it now.
- **Evidence:** both references solve the linear model by FFT on a regular planar grid. PISM uses FFTW (`src/coupler/atmosphere/OrographicPrecipitationSerial.cc:101–103`, transfer function `:258–263`). Badlands uses its own mixed-radix FFT (`utils/classoro.f90` `fftmx` `:278`). Note 14 §4 already says "a tangent-plane window needs its own FFT through `dmath`", but note 14 §7 has no line for it. Source: `group-2.md` flag 7, B8, S3.
- **Why not applied:** it adds a deliverable and an estimate.

### A2. Keep or drop the physically based surface-mass-balance option, and size it (Phase 7b, note 22)

- **Proposal:** decide whether note 22 keeps the physically based SMB option. If it does, add a size line for a surface energy balance written from the CLM5 technical note, because note 22 §7's "Mass balance ~600" covers only the PDD default (its label now says so). If it does not, remove the option from §3.1.
- **Evidence:** CTSM computes melt inside its full surface energy balance and soil/snow phase change (`SoilTemperatureMod.F90:81` `PhaseChange`), and `GlacierSurfaceMassBalanceMod.F90` only books the result (`:132`, `:209`, `:214`). Source: `group-3.md` flag 1, L3.
- **Why not applied:** it is an estimate change, or a scope change.

### A3. Choose and size the label-placement work (Phase 5c, note 18)

*Revised after the independent review (`review.md` H1): the first version said QGIS PAL was the only implementation. That was wrong.*

- **Proposal:** decide which implementation Phase 5c ports for label collision handling, then raise note 18 §7's "Vector path and labels ~2,500" or split out a line for it, and say which in Phase 5c. Options:
  1. **Azgaar `src/controllers/label-spread.ts`** (MIT TypeScript, 1,030 lines): candidate generation (12 directions at six step distances, path start offsets), a collision model with burg-icon obstacles, conflict components, `refine` and simulated annealing seeded by `Alea` from the map seed (`:694–830`), with tests. Needs font metrics in place of SVG DOM measurement (`getComputedTextLength`, `getExtentOfChar`, `getBoundingClientRect`, `:478–583`) and a replacement for `path.getPointAtLength`. Already deterministic in ordering (`ids.sort()`, `:146`). It is a screen-space solver (paddings in screen pixels), so it must be adapted to a style-and-viewport-keyed run (note 18 §3.3).
  2. **QGIS PAL** (`src/core/pal/`, 10,857 lines, GPL-3.0-or-later): initial FALP solution (`problem.cpp:150`), then chain search (`pal.cpp:725`, `problem.cpp:535`). GEOS is a hard dependency (9 includes) and must be replaced by our own geometry. `std::sort` ties need stable sorts for determinism (Q2). Larger port, but a richer cost model (polygon, line and curved placement).
  3. Port `label-spread.ts` first and treat PAL as the later richer option.
- **Evidence:** `group-6a.md` A6 (corrected) and flag 2, K3 (CesiumJS has no collision code); `review.md` H1.
- **Why not applied:** it is an estimate change, and now also a choice between two picks.

### A4. Dynamic topography in note 21: an output with no method

- **Proposal:** one of three: (a) drop `interior.dynamicTopography` from note 21 §2; (b) add a §3 method for it (a buoyancy or stress model) with a size line; or (c) keep the output and compute it with orogen's existing heuristic, `applyDynamicTopography` (`upstream/orogen/js/elevation.js:2412`, stage 10: `r_mantleNorm` × `DYNAMIC_TOPO_UPLIFT` or `DYNAMIC_TOPO_SUBSIDENCE`, constants in `js/terrain-config.js:522`; also in the vendored copy and `audit/orogen.md`), which is the fallback note 21:81 already implies for "interior off". Option (c) costs nothing extra but gives a mantle-norm heuristic, not a physical field.
- **Evidence:**
  - Note 21 §2 lists `interior.dynamicTopography` as an output (`21-interior-and-volcanism.md:21`), but no part of §3 computes it.
  - §4 says ASPECT's `dynamic_topography.cc` is only a formula, h = (−σ·n − p_surface)/(Δρ g) (`:304–316`), and needs the FEM stress field.
  - `group-1.md` S2 stated that "note 21 has no dynamic-topography output, so nothing depends on it". The note's own §2 contradicts that. S2 and flag 4 now carry a correction pointing here (`review.md` M1).
  - Source: `group-1.md` S2 and flag 4.
- **Why not applied:** it changes a note's outputs or adds a method.

### A5. Undocumented Azgaar asset licences (Phase 10b, note 19)

- **Proposal:** add to Phase 10b's prerequisite (or to note 19's open questions) that Azgaar's bundled heraldry charges, relief symbols and icons need a documented licence source before any is bundled.
- **Evidence:**
  - `public/charges/` holds 338 SVGs. The relief `<symbol>`s are in `src/index.html`, and the icons are in `public/images/`.
  - `docs/wiki/Policy.md:54` says they "carry their own licences" but names none. The root `LICENSE` (MIT) is the only licence file.
  - Source: `group-6a.md` flag 5, licence table.
- **Why not applied:** the user-authorised 10b prerequisite covers the CC0 packs only; adding Azgaar's assets widens it.

## B. Optional clarifications to phase text (no plan change)

These restate findings already recorded in the notes. Each reconciliation flag said "no phase change"; they are listed so you can choose to put them in the phase text.

- **B1. Phase 6 vs 6a boundary.**
  - **Proposal:** a sentence in Phase 6 saying that Phase 6 takes orbital elements as fixed inputs and that secular evolution (DistOrb, DistRot) is Phase 6a.
  - **Evidence:** DistOrb and DistRot have no steady-state insolation formulas, and insolation comes from POISE (`poise.c:5530`, `:5602`). Source: `group-1.md` V2, flag 3.
- **B2. Phase 6c: plume placement is original code.**
  - **Proposal:** say so in the Phase 6c bullet.
  - **Evidence:** ASPECT has no plume-placement model. World Builder's `plume.cc` is user-placed geometry, and note 21 §3.2 already plans placement from Sleep (1990) and Davies (1988). Source: `group-1.md` S3, flag 4.
- **B3. Phase 7 and WRF-Hydro.**
  - **Proposal:** if the WRF-Hydro reach routing is ported in Phase 7, say in the phase text that the native model is single precision (a tolerance oracle only), that channel geometry is synthesised, and that gravity follows the planet.
  - **Evidence:** note 12 §4 already says this (`group-2.md` W1, W3, flag 3). Phase 7's bullets do not name WRF-Hydro, and whether to port it is still "Phase 7 evaluates" (note 12 §4).
- **B4. Phase 5c hillshade and symbols.**
  - **Proposal:** name the QGIS hillshade renderer formula in Phase 5c: Horn derivatives, the GDAL formula and multi-directional weighting, with cell size in sphere metres. Also say that Azgaar relief placement needs a cell-keyed RNG in place of the global `Math.random`.
  - **Evidence:** `qgshillshaderenderer.cpp:433–489`; `relief-generator.ts:28`, `:60`, `:64`, `:193`, `:197`, `:198`. Note 18 §4 already carries both (`group-6a.md` Q1, A3, flags 3–4).
- **B5. Pipeline row 4c** (`docs/ARCHITECTURE.md` §4, Expanded pipeline).
  - **Proposal:** change "PISM (SIA/SSA)" to "PISM (SIA/SSA formulations and exact tests; new solver)", to match the Phase 7b text.
  - **Evidence:** `group-2.md` S1.
  - **Why not applied:** it is outside §7.

## C. Record corrections outside the authorised files

- **C1. Per-repo audits that describe the manifest as unedited.** *Done in the review follow-up (2026-10-18): the four audits now say the entry was rewritten. The manifest itself was not touched (it is not Markdown); see C4.*
  - **Proposal:** update the "manifest" sentences in the §5 sections of `audit/Badlands.md` ("Matches manifest"), `audit/Delft3D.md` ("Manifest match: Incomplete … not edited in this pass"), `audit/CESM.md` ("the manifest is configuration and was not edited") and `audit/MARBL.md` ("not edited: configuration"). They should say that the manifest now records the reconciled licence (2026-10-18).
  - **Why not applied:** the per-repo audits were not among the files to update. The group records (`group-1.md` … `group-3.md`, "Not changed") are dated history and should stay as they are.
- **C2. ASPECT World Builder licence version** (found while updating the manifest).
  - **Finding:** `contrib/world_builder/LICENSE` is the LGPL-2.1 text, but the source headers say "the GNU Lesser General Public License … either version 2 of the License, or (at your option) any later version" (`contrib/world_builder/source/world_builder/features/plume.cc:6–9`). The World Builder also bundles vtu11 under BSD-3-Clause (`include/vtu11/LICENSE:1`) and RapidJSON (`include/rapidjson/license.txt`).
  - **Proposal:** record this in `audit/ASPECT.md` §5 and decide whether the manifest should say "LGPL-2.0-or-later headers, LGPL-2.1 text". The manifest now says LGPL-2.1, matching `group-1.md`.
  - **Why not applied:** it goes beyond what the reconciliation found.
- **C3. Phase 13 sub-phase table renders broken.**
  - **Finding:** in `docs/ARCHITECTURE.md` Phase 13, a blank line separates the 13a–13d rows from the 13e–13h rows. The second block has no header or delimiter row, so GitHub renders it as plain text.
  - **Proposal:** delete the blank line.
  - **Why not applied:** it is a formatting fix outside the authorised items.

- **C4. Manifest entries still out of step with the audits (`review.md` M4).** `upstream-manifest.json` is configuration, not Markdown, so it was left alone.
  - **QGIS:** `license.spdx` says `"GPL-2.0"`, while the matrix and `group-6a.md` record GPL-2.0-or-later headers and a GPL-3.0-or-later PAL; its `notes` field still says "projections", which group 6a Q3 found are PROJ wrappers only.
  - **GPlates:** `"GPL-2.0"` means GPL-2.0-only (group 1), the same string QGIS uses for or-later.
  - **Proposal:** edit both entries, then run `scripts/node24.sh npm run provenance:check`.

## D. Observations (no action proposed)

- **D3. Where the deferred reconciliations sit (`review.md` H3, H4) — needs a decision, phase text not edited.** Several Prerequisite lines come after the first phase whose design note cites the upstream, and some unchecked upstreams have none. See the status table in `README.md`.
  - **Later than the first dependent phase:** LPJmL (Prerequisite at 9b; first cited by note 12:95 `src/lpj/drain.c` for Phase 7, then notes 15, 4); MESSAGEix (13; note 17:57, Phase 5b); UrbanSim (13; note 9, Phase 10); GAMA and FLAMEGPU2 (13; note 26, Phase 9c; note 29, Phase 9e); SongsOfFOSS (13; note 29:33, Phase 9e). FastScape (7) is right only if erosion is its sole use; the matrix names note 21, which does not mention it.
  - **No Prerequisite at all:** orogen (cited by 21 notes, including 12, 13, 16, 17, 21, 22, 23; vendored and parity-tested, which may justify the exemption, but that is not stated; the claims of notes 17 and 21 were wrong or unchecked: `review.md` M1, M2); Azgaar outside Phases 5/5c (note 16:84, note 17:56 for Phase 5b; note 12 for Phase 7; notes 5, 9); QGIS outside Phase 5c (note 37:31, Phase 17); CesiumJS outside Phases 5/5c (note 38:52, Phase 14; note 36, Phase 16).
  - **Proposal:** move or add Prerequisite lines (for example LPJmL before Phase 7; MESSAGEix before 5b; an orogen and Azgaar pass before 5b), or record an explicit exemption for orogen.
- **D4. Two smaller items from the review.** (`review.md` L6) Note 18 open question 1 (ship CC0 symbol sets?) bears on Phase 5c's "symbols", but the CC0 audit is a Prerequisite at 10b; fine if 5c ships no third-party symbols, but the phase text does not say. (`review.md` L7) Pipeline row 4c still lists "PISM (SIA/SSA), orogen glacial erosion" while Phase 7b says the glacial-erosion law has no source; consistent if orogen's heuristic is the fast-path default (note 22:36, :50). B5 covers only the PISM half.
- **D1. The 9b prerequisite covers 9c's sources too.** It reconciles SLiM and RangeShiftR, whose main consumer is note 26 (Phase 9c), as well as LPJmL (note 25). That was applied as instructed. Doing them before 9b is earlier than strictly needed, which is harmless.
- **D2. `STATUS.md` still shows Phase 4a in progress.** Its table and handoff were not edited: `STATUS.md` changes only at an agent switch (AGENTS.md).
