# Status

Updated at every checkpoint.

| Checkpoint | State |
|---|---|
| 1 (Phase 1 spikes) | Done |
| 2 (Phase 2 design notes) | Done |
| 3 (Phase 3 shell) | Done |
| 3b (Checkpoint 3 decisions: `dmath` fdlibm mode) | Reached and reviewed. |
| 4a (Phase 4a orogen in the shell, globe) | Done (open items resolved; `docs/checkpoints/LOCAL_BASELINE.md`) |
| 4b (Phase 4b structured pipeline behind the Q7 A/B gate) | Done, accepted 2026-10-14 (`docs/checkpoints/CHECKPOINT_4B.md`) |
| World settings panel (PR #5) | Merged (`121dc1e`) |
| Reconciliation, groups 1, 2, 3 and 6a | Done 2026-10-18; independent review fixed (`docs/reconciliation/`). Other upstreams deferred |
| 5 (Projection and distortion layer) | **Reached 2026-10-19; waits for the user's review** (`docs/checkpoints/CHECKPOINT_5.md`, PR #8) |

## Current handoff — 2026-10-18, Claude Code (cloud to local; catch-up and reconciliation)

**Why now:** the user is moving from cloud sessions to local work, which is a change of environment. This section covers everything since the 2026-10-13 handoffs below. Branch `catchup/reconciliation` (base `main` at `121dc1e`, the merge of PR #5). Nothing here started Phase 5.

**What changed since the last handoff**

1. **Phase 4a is complete.** The three open items in the Codex handoff are resolved in the tree: the A/B river-mouth metric (fixed in `16796dc`: `greatCircleKm` uses `atan2(|cross|, dot)`), `tools/tuning/ab-baseline.json` (present), and the browser benchmark reports (`docs/benchmarks/PHASE4A.md`, `phase4a-*-linux.json`).
2. **Phase 4b is complete and accepted (2026-10-14).** The structured pipeline (reference pass on the 20k mesh L0, detail pass at N, ports of 18 orogen modules) is the app's default; stock orogen stays as the `parity` variant. All seven original Q7 metrics meet target at the 200k tier; two targets are still missed (50k vs 2.56M coast p95; native-cell hypsometry KS) and are regression-only until invariant I3 moves into Phase 7. A CI `ab-gate` (1M final) and nightly `ab-gate-full` (2.56M) and realism gate (`tools/tuning/realism/gate.mjs`) exist. Details and the ten acceptance decisions: `docs/checkpoints/CHECKPOINT_4B.md`. Peak browser memory is to be measured at the start of the next phase, before new features (decision 8).
3. **PR #5, World settings panel (`4ecb49a`, merged as `121dc1e`).** All 14 of orogen's generation sliders in the app (labels, ranges and defaults from upstream `index.html` @ `cc2662b`), Reset to defaults, and seed, tier, pipeline and changed settings kept in the page URL with Copy link. Only non-default values are sent, so default worlds stay bit-identical. Tests: `apps/web/src/settings.test.ts`, `packages/gen-orogen/src/structured/params.test.ts`, and an e2e settings test.
4. **Local baseline (`docs/checkpoints/LOCAL_BASELINE.md`, commit `e1478ec`).** A read-only audit of this checkout against the old STATUS (see Checks below). It lists which parts of the earlier handoffs are stale; the sections below are kept as history.
5. **Reconciliation of 16 upstreams (documentation only).** Groups 1 (GPlates, tectonics.js, ASPECT, VPLanet), 2 (Badlands, ParFlow, WRF-Hydro, PISM, Delft3D), 3 (CESM, CTSM, MOM6, MARBL) and 6a (Azgaar, QGIS, CesiumJS, for Phases 5 and 5c only) checked the 2026-10-13 planning claims against the pinned source. Method, status of every repo and the reusable prompts: `docs/reconciliation/README.md`. Corrections were applied to the audits, `audit/CAPABILITY_MATRIX.md`, design notes and the Prerequisite lines in `docs/ARCHITECTURE.md` §7; phase text was not otherwise edited. Findings that matter for the next phases:
   - **Phase 5:** no `upstream/` repo has projection code (QGIS and CesiumJS only wrap PROJ or implement three simple projections). d3-geo is the only source and is not yet in `PROVENANCE.md`.
   - **Phase 5c:** hillshade pick is QGIS's `qgshillshaderenderer.cpp`, not the filter. Label collision handling has two candidates, Azgaar's seeded `controllers/label-spread.ts` (DOM text measurement to replace) and QGIS PAL (GEOS to replace); this was first reported wrongly as PAL-only and corrected after the review (pending decision A3). Azgaar's charges and icons have no documented licence.
   - **Phase 6a/6c:** two-star insolation is original code; ASPECT has no plume placement or usable dynamic topography; note 21 lists `interior.dynamicTopography` with no method (A4).
   - **Phase 7:** Badlands incision is explicit with a CFL step, so the D4 benchmark carries a scheme tolerance; ParFlow's Richards solver is reference only (closed-form curves port) and groundwater needs a design before stage 7g; the FFT for Smith–Barstad rain is not budgeted (A1).
   - **Phase 7b/7c:** PISM has no erosion; CTSM's glacier file only books mass balance; MOM6's TEOS-10 is not in the checkout (use the in-tree Roquet polynomial); Delft3D has no wave formulas and no landform rules.
   - **Records:** CESM's `LICENSE.txt` grants no permissions; MARBL has no generated docs and no ranges. Five manifest `license` strings were rewritten in `001da0d`.
6. **Independent review of the reconciliation (`docs/reconciliation/review.md`, commit `4b50a74`)** found one wrong claim (Azgaar label collision), a missing `README.md`, and Prerequisite placement gaps. Wrong or contradictory findings were fixed in Markdown only and each finding has a Resolution line.

**Open items:** `docs/reconciliation/pending-decisions.md` is the list. They need the user: A1 (FFT budget), A2 (physical mass-balance option), A3 (which label solver), A4 (dynamic topography), A5 (Azgaar asset licences), the B clarifications, C2 to C4 (ASPECT World Builder licence version, Phase 13 table blank line, the QGIS and GPlates manifest entries) and D3 (Prerequisite placement: LPJmL, MESSAGEix, UrbanSim, GAMA, FLAMEGPU2 and SongsOfFOSS are reconciled later than a phase that cites them; orogen, and Azgaar, QGIS and CesiumJS outside Phases 5/5c, have no Prerequisite line).

**Deferred reconciliations** (each is a **Prerequisite** line in `docs/ARCHITECTURE.md` §7; full table in `docs/reconciliation/README.md`): Godot (5b); LPJmL, SLiM, RangeShiftR (9b); PostGIS (11b); Eurace, UrbanSim, LIAM2, MESSAGEix, GAMA, FLAMEGPU2, OpenSpiel, SongsOfFOSS (13). Candidate audits: mapgen4 and mewo2/terrain (5c), FastScape (7), GISS ModelE/ROCKE-3D/ExoCAM (8b), gen3sis (9d), CC0 asset packs (10b), TownGeneratorOS (11b), Glottolog/Seshat/HYDE datasets (18).

**Checks actually run**

| Check | Result | When / scope |
|---|---|---|
| `npm run lint`, `typecheck`, `test`, `build`, `provenance:check`, `e2e` | All passed: tests 258 passed, 0 failed, 1 skipped (259); e2e 18 passed (Chromium, Firefox, WebKit); provenance 24 vendored files, 41 headers, 18 direct / 246 total packages | **Historical**: `docs/checkpoints/LOCAL_BASELINE.md`, local run at `121dc1e` on 2026-10-18. Not re-run since |
| `upstream/` against `upstream-manifest.json` | 30 of 30 present at their pinned commits, trees clean | Local baseline and `review.md`, 2026-10-18 |
| `npm run provenance:check` | Passed (24 vendored, 41 headers, 18 direct / 246 total) | Re-run this session after the review fixes; the manifest was not edited |
| Relative Markdown link check (script over `git ls-files '*.md'` outside `upstream/`) | **Passed**: 97 files, 46 relative links, 0 broken. Backticked doc paths also resolve, except planned outputs (`docs/PARAMETERS.md`, `docs/earth-tests/REPORT.md`) and an Azgaar-internal path | This session, after `docs/reconciliation/README.md` was created |
| `ab-gate`, `ab-gate-full`, realism gate, `REQUIRE_UPSTREAM=1` strict test, remote CI | **Not run, no claim** | Depend on data or remote runs not exercised here |

Since `121dc1e` only Markdown files and five `license.spdx` strings in `upstream-manifest.json` changed. No code, `upstream/` or `packages/gen-orogen/vendor/` file changed, so the code checks above are expected to be unaffected, but that is an inference, not a re-run.

**Addendum (2026-10-18): pending decisions resolved.** The user ruled on every item in `docs/reconciliation/pending-decisions.md` (A1–A5, B1–B5, C1–C4, D1–D4); each is now under "Resolved 2026-10-18" there, and the "Open items" and "Deferred reconciliations" paragraphs above are superseded. Documentation and manifest only: `upstream-manifest.json` QGIS and GPlates `license.spdx`/`notes` (commits unchanged); `provenance:check` and `lint` passed after the edit. New Prerequisite lines in `docs/ARCHITECTURE.md` §7:
- **5b:** Godot; orogen (every design-note claim citing it, especially notes 17 and 21); Azgaar editors and options UI; MESSAGEix.
- **7:** FastScape audit; LPJmL (`src/lpj/drain.c`); Azgaar `lakes.ts` and `features-generator.ts` (plus the groundwater design before 7g).
- **9b:** SLiM and RangeShiftR (LPJmL moved to 7). **9c:** GAMA and FLAMEGPU2. **9e:** SongsOfFOSS. **10:** UrbanSim.
- **10b:** CC0 asset packs, plus a documented licence source for Azgaar's charges, relief symbols and icons (Phase 5c ships no third-party symbols until then).
- **13:** Eurace, LIAM2, OpenSpiel. **14** and **16:** CesiumJS. **17:** QGIS Processing.
- Unchanged: 5c (mapgen4, mewo2/terrain), 8b, 9d, 11b, 18.

**Local setup:** `scripts/node24.sh npm ci`, then the commands in `AGENTS.md`. `upstream/` is present locally; the nightly-style strict path (`REQUIRE_UPSTREAM=1`) has not been run.

**Next concrete step: Phase 5 (projection and distortion layer).** Stop and wait for the user first (§7). Before starting: decide the Phase 5 projection source (d3-geo, with its `PROVENANCE.md` entry, since no upstream has projection code); measure peak browser memory per 4b decision 8; and read the Phase 5 text in `docs/ARCHITECTURE.md` §7 and the Prerequisite lines of 5b and 5c (Godot reconciliation; mapgen4 and mewo2/terrain audits).

## Previous handoff — 2026-10-13, Claude Code (planning overhaul for the full vision) *(superseded for status, test counts and Next by the section above)*

**Task:** the user asked to overhaul and expand every plan to meet the full vision, however ambitious: all domains ("any and everything": life and ecology, astronomy and deep Earth, a fantasy layer, deep civilization), interleaved delivery (usable editor and maps early), and a full design note for every new system. Documentation only; no code, tests, `upstream/` or vendor files changed, and no phase was started. Phase 4a remains in progress with its open work unchanged (below).

**Changes:**
- `docs/REQUIREMENTS.md` rewritten as the full product specification: vision, eight guiding principles, a domain catalogue by track (cosmos, geosphere, hydrosphere and cryosphere, atmosphere, biosphere, civilization, fantasy, experience), customisation (parameters, edits, locks, system switches, modules, branches), Earth tests T1–T4, and expanded import and export lists.
- `docs/ARCHITECTURE.md`: decisions **Q13** (unbounded scope), **Q14** (interleaved delivery), **Q15** (fantasy as modules; empty-module identity test), **Q16** (edits as deterministic inputs), **Q17** (Earth tests as a permanent gate). New §3.8 (edits, locks, constraints), §3.9 (modules), §3.10 (new tables and layer namespaces); an expanded pipeline table in §4; edits, modules, branches, assets, styles and articles in the §5 save format; §6.6 scaling; and §7.0, a roadmap with tracks, an ordered phase table, a dependency diagram and a vision-to-phase-to-note map. New phases: 5b (editor core), 5c (cartography v1, the first usable app), 6a, 6c, 7b, 7c, 8b, 9b–9e, 10b, 11b, 13e–13h, 15–18. Existing phase numbers are unchanged.
- `docs/design/`: template extended to nine sections (8. user controls and edit points, 9. Earth-recovery test), retrofitted to notes 1–14, with Q12 upstream updates in notes 1, 4, 12 and 13. **24 new notes (15–38)**: Earth test suite, editing, parameter registry, cartography, assets and drawing tools, astronomy, interior, cryosphere, oceans and coasts, atmosphere and paleoclimate, vegetation, fauna, evolution, hazards, disease, human origins, technology, religion and culture, characters and chronicle, town plans, fantasy, worldbuilder tools, plugin API, scaling. Index regrouped by track.
- `audit/CAPABILITY_MATRIX.md`: new "Expanded scope" section with picks re-decided after Q12 (GPlates, WRF-Hydro, Eurace, LPJmL, RangeShiftR), new domains mapped to upstreams, and candidate upstreams to audit (TownGeneratorOS, mapgen4, mewo2/terrain, gen3sis, ModelE/ROCKE-3D, FastScape, CC0 asset packs, datasets).
- `README.md`, `AGENTS.md`, `docs/DEVELOPMENT.md`: pointers to the specification, roadmap and 38 notes; planned future packages listed.

**Checks run:**
- A script check of every relative Markdown link (none broken), that every note 1–38 has sections 1–9 and is indexed, that every new phase has a checkpoint, that Q/D ids are unique, and that notes 15–38 all appear in the §7.0 roadmap: all passed.
- `npm run lint` and `npm run provenance:check` **could not run** in this container: the project-local Node (`.tools/bin/fnm`) is not installed here. The change touches only Markdown; CI runs both checks on push.
- Remote CI on PR #1 was red before this work on the two known `tools/tuning/ab/ab.test.ts` failures, which are also red on `main` (below). This change does not affect them.

**Unverified:** upstream file paths cited in notes 15–38 come from the per-repo audits; `upstream/` was not checked out in this session, so they were not re-checked against source. Candidate upstreams are not audited yet.

**Next:** unchanged for Phase 4a (fix the A/B river-mouth metric, generate the Q7 baseline, collect the browser benchmark report, then Checkpoint 4a). The new phases follow §7.0 in order, each stopping at its checkpoint; the roadmap and notes are drafts for the user's review.

## Previous handoff — 2026-10-13, Claude Code (vision and licence decision)

**Task:** align the docs with the user's product vision. Documentation only; no code, tests, upstream or vendor files changed. Phase 4a remains in progress, and its open work (below, from the Codex handoff) is unchanged.

**Changes:**
- `docs/REQUIREMENTS.md`: new **Vision** section. MapMaker is a personal, non-commercial, fully customisable realistic worldbuilder. Its realism should be deep enough that Earth conditions produce an Earth-like world, tested in three layers: statistical, physics given Earth, and deep time. It covers hand-editing with re-simulation, artistic map styling (aiming at Azgaar/Inkarnate/Wonderdraft), and aggregating every upstream. Scope gains map art and hand-editing.
- `docs/ARCHITECTURE.md`: new resolved decision **Q12**. Licences no longer restrict upstream use: Eurace and WRF-Hydro are allowed, and GPlates code may be ported. Licences are still logged in `PROVENANCE.md`. The §2 integration rows, F10, the status-of-claims licence rules and the Phase 2 template are updated to match. A new Known-gaps row lists the vision items that have no design note or phase yet.
- `AGENTS.md`: the source-restriction rule is replaced by Q12, and the project description points to the Vision.
- Design notes 1, 3, 12 and 13, `docs/design/README.md` and `audit/CAPABILITY_MATRIX.md`: "excluded / no code" notes are marked as superseded by Q12.

**Checks:** none run (docs only).

**Next:** unchanged for Phase 4a (see below). Separately, at a checkpoint, agree on design notes and phase slots for the new vision items, and decide which licence-decided upstream picks to re-decide (GPlates for notes 3 and 13, WRF-Hydro for Phase 7, Eurace for Phase 13b).

## Previous handoff — 2026-10-13, Codex

**Task:** repository onboarding and shared Claude Code/Codex workflow. Started from a clean working tree at `2dcd3f2` on `main`. Phase 4a remains in progress; this session does not complete its checkpoint or start Phase 4b.

**Changes:** moved the existing project rules into root `AGENTS.md`, preserving the extraction, determinism, provenance, and phase-boundary rules; `CLAUDE.md` now imports that single shared source. Added `README.md` and `docs/DEVELOPMENT.md` with product orientation, a code map, development/validation commands, and handoff procedure. Fixed two existing lint errors in `scripts/bench-report.mjs` by importing Node's `process` and `console` explicitly. No simulation behavior, upstream/vendor files, dependency versions, or global tools changed. Changes are uncommitted.

**Local validation** (Node v24.21.0 through `scripts/node24.sh`; optional upstreams and Earth data available):

| Check | Result |
|---|---|
| `npm run lint` | Passed after the benchmark-script import fix; initially failed with two `no-undef` errors. |
| `npm run typecheck` | Passed. |
| `npm test` | **143 passed, 2 failed, 1 skipped** (146 total). Both failures were present before this session's edits, in `tools/tuning/ab/ab.test.ts`; details below. The skipped test is the opt-in `REQUIRE_UPSTREAM` preflight. |
| `npm run build` | Passed. |
| `npm run provenance:check` | Passed: 24 vendored files, 20 source headers, 18 direct / 246 total npm packages. |
| `npm run e2e` | **12 passed**, across Chromium, Firefox and WebKit. Includes local production build, deterministic probes, isolation shim, globe rendering/layer switching, and browser/Node layer equality. |

These are local observations, not a fresh verification of remote CI or the deployed site. Historical results below describe earlier checkpoints and are superseded by this section for current test counts and open work.

### Findings and remaining Phase 4a work

- **Working foundation:** sphere geometry, typed layers/entities, RNG state, deterministic math, stage orchestration, worker transport, save/load/resume tests, vendored orogen parity, globe views, and Earth calibration harness exist. The five future subsystem directories (`planet`, `erosion`, `human`, `projection`, `history`) remain placeholders. History support in core and the dummy stage are infrastructure, not a human-history simulator.
- **A/B metric correctness:** the self-comparison test reports mean river-mouth distance `0.8176300987595833` km instead of zero (`ab.test.ts:38`). `basinAgree` in `tools/tuning/ab/ab.mjs` uses `acos(dot)` on Float32 mouth vectors without normalizing their lengths. This is a likely cause, to confirm with a focused fix/test; do not relax the assertion just to pass it.
- **Missing Q7 baseline:** `tools/tuning/ab-baseline.json` is absent, although its coverage test, runner, and README expect it. Fix metric correctness first, then run the full prescribed seeds/tiers and review the actual baseline. Do not replace the missing file with fabricated or reduced-tier data.
- **Missing benchmark evidence:** the browser benchmark spec and report generator exist, but no `docs/benchmarks/phase4a-*.json` or `PHASE4A.md` report is present in this checkout. Full tiers were not run in this onboarding task. Measure each browser/tier and inspect recorded per-tier failures, not only the test exit code.
- **Current product limits:** the adapter accepts only Earth radius (6,371 km); arbitrary radius plumbing belongs to later planet physics work. The displayed cell tiers are stock orogen at different resolutions, not yet faithful previews. The reference/detail restructure and regression gate belong to Phase 4b. Flat projections, regional inference/refinement, full exports, and the real human/history systems remain future work.
- **Save limitation:** v0 uses copied snapshots and synchronous ZIP creation; large-world streaming remains Phase 12 work. Worker cancellation is cooperative; synchronous vendored stages do not offer fine-grained interruption.

**Next concrete step:** fix and validate the A/B river-mouth metric, generate/review the complete stock Q7 baseline, and collect the Phase 4a browser benchmark report. Then prepare Checkpoint 4a for user review. Follow `docs/ARCHITECTURE.md` §7's boundary before starting Phase 4b.

**For either agent:** read this section and inspect the actual working tree before editing. Update this section at the next handoff so the next agent has current results and a concrete continuation. The user requested shared onboarding/setup; remaining implementation work above is recorded for a subsequent task.

## Phase 3 results (2026-10-04)

- **Unit tests:** 117 pass locally (with `upstream/` present). CI runs 112 and skips 5: the upstream-parity tests (`SphereMesh` and the RNGs against `upstream/orogen` and Azgaar) need the `upstream/` checkout, which CI does not have. They are covered in CI by committed golden hashes. Lint, `tsc -b` and `provenance:check` clean. (The earlier "87 passing" counted the skipped tests.)
- **Cross-engine tests:** 9 Playwright runs (determinism and COOP/COEP shim, in Chromium 140, Firefox 141 and WebKit 26) pass locally, in CI on ubuntu, macOS and **Windows x64**, and against the live site.
- **CI:** `checks` (ubuntu) and `determinism` (ubuntu, macOS, Windows) green; Pages deployed to https://griffinfoster06.github.io/MapMaker/ with a live smoke test.

## Checkpoint 3b: `dmath` fdlibm mode (2026-10-04)

- **Implemented:** `dmath.mode = 'fdlibm'` is a line-by-line TypeScript port of netlib fdlibm 5.3 (`packages/core/src/fdlibm.ts`, `log2` from FreeBSD msun), covering all 22 transcendentals that `packages/**` may call only through `dmath`. `dmath.setMode()` and `dmath.withMode()` switch modes. **At Checkpoint 3b the default was still `'native'`; Phase 4a changed it to `'fdlibm'`**, with native mode confined to explicit parity blocks, and the save manifest records the current mode. Logged in `PROVENANCE.md`. Lint now also bans the `**` operator in `packages/**`.
- **Tested against reference C:** 22,675 vectors from the unmodified C compiled with FMA contraction off (`tools/fdlibm-vectors/`, regenerate with `gen.sh`), bit-identical for every function. The test fails when a constant is corrupted.
- **Probe v2:** the whole probe also runs in fdlibm mode (84 `fd.` keys: dmath sweeps, Float64 mesh points, areas, circumcentres, topology, history, and a 1M-cell Float64 mesh). All `fd.` keys are strict in CI. Native-mode libm keys stay report-only.
- **CI result (run 37165939177):** all `fd.` keys match on ubuntu x64, macOS arm64 and Windows x64, in Node, Chromium, Firefox and WebKit. Native-mode libm keys still diverge as before (22 in Node on ubuntu and Windows, 0 on macOS arm64, which produced the golden file).
- **Cost (2.56M cells, Node 24 arm64, median of 5):** mesh build +6% at f64 and +13% at f32; point generation 1.39×; `pow` is 4.2× per call, other functions 1.05–2×. Details in the Q3 row of `docs/ARCHITECTURE.md`.
- **Triangle flips:** none. Float64 points differ between modes by up to 29 ULP at 1M cells, but the triangle arrays are identical at 200k, 1M and 2.56M cells.

## New upstreams: tectonics.js and SongsOfFOSS (2026-10-03)

- **Added** to `upstream/` and `upstream-manifest.json` (restore script unchanged; tested from a scratch copy). Audits: `audit/tectonics.js.md`, `audit/SongsOfFOSS.md`. Report: `docs/spikes/NEW_UPSTREAMS.md`. Four rows of `audit/CAPABILITY_MATRIX.md` updated; **no pick changed**, no code extracted, shell untouched. Phase 4a not started.
- **Licences:** tectonics.js is CC BY 4.0 (the FSF lists it as GPL-compatible; attribution needed). SongsOfFOSS is MIT except `sote/emblems`, `engine`, `icons`, `music`, `data`; its terrain generator is a closed binary, `libSOTE.dll`.
- **Findings:** tectonics.js is a crude forward plate model (40,962 cells max, 54 ms/step measured, no collision/orogeny/events); reference for note 13 only. SongsOfFOSS has no stability, revolt, currency, trade-route or language-change models and an unseeded RNG; its `Army:attack` Lanchester-style step and price rule are the only pieces note 1 can learn from.
- **Caution:** both audits were rewritten after the first subagent drafts proved partly wrong (details in `NEW_UPSTREAMS.md` §5).

## Known issues for later phases

- **Phase 12 (save streaming):** the v0 snapshot copies world data (about double peak memory) and writes the container with `zipSync`. Move to streaming writes and chunk-at-a-time hashing, so peak memory stays near one chunk.
- **Phase 13 (history simulation):** keep tick-loop state in integers or Float32-rounded values where possible. Route every transcendental through `dmath`, and run the simulation in `'fdlibm'` mode. Avoid `pow` in hot loops (4.2× the native cost); use multiplication or a lookup table for fixed exponents.
- **CI coverage:** ordinary CI skips tests that need `upstream/`, but `.github/workflows/nightly.yml` now restores orogen/Azgaar and Earth ground truth, runs tests with `REQUIRE_UPSTREAM=1`, and checks vendored bytes. This supersedes the earlier suggestion to add a scheduled job. Its latest remote run was not checked during onboarding.

## Open decisions for review

1. ~~Whether canonical Float64 paths should switch `dmath` to `'fdlibm'` by default.~~ **Resolved (Phase 4a):** the default is `'fdlibm'` at module load in the shell and every worker; `'native'` only inside `withMode('native')` in the orogen parity path, enforced by the stage runner.
2. The deviations listed in the Checkpoint 3 report.
