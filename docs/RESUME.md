# Resume here

The living state of the project for any agent starting a session. **Update this file at every milestone** (the "Next", "Branches" and "Work log" parts); keep it short. Rules and method: `docs/OPERATING_GUIDE.md`. Decisions: `docs/DECISIONS_LOG.md`.

- **Last updated:** 2026-10-22, by the local agent (Claude Code), on `perf-fixes` (user request, outside the authorization limit): items 1 to 4 of the performance study's "pull forward" list, with before and after numbers (`docs/checkpoints/PERFORMANCE_STUDY.md` section 10, decisions PF1 to PF5). Stopped; Phase 6 and its reconciliation not started.
- **Authorized through: Q4 (Electron).** Set by `scripts/authorize.sh`; only the user changes this line.

## What the user does next

Do these in order. Each step says why.

1. Open `docs/checkpoints/PERFORMANCE_STUDY.md`, section 10 "After the first fixes" (on GitHub: the pull request `perf-fixes`, "Files changed"). Read the decisions PF2 (the globe's faster draw path is used only where a check says the picture is identical, so Firefox keeps the old path) and PF3 (canvas drawing not adopted). Why: these are the two places where the result differs from what you asked for in the letter; tell the agent if you disagree.
2. On GitHub, open the pull request `perf-fixes`. Wait until every check at the bottom shows a green tick, then click **Merge pull request** (the default green button) and **Confirm merge**. Why: the fixes reach `main`.
3. In the terminal, in the project folder, copy and paste exactly: `scripts/authorize.sh 6`. Why: it lets the agent start Phase 6 (the documentation-only comparison of the newer orogen, GPlates and the other tectonic sources, then planet physics). It prepares a small change on a new branch `authorize-6` and uploads it.
4. On GitHub, open the pull request for `authorize-6` (the yellow **Compare & pull request** banner), click **Create pull request**, then merge it as in step 2.
5. Type `/go` in Claude Code.

The fifth item of the study (the shared-memory kernel API) is not started; it is still before Phase 6 in the study's order and needs your word ("do item 5").

Optional, whenever convenient and never blocking: try the desktop app (`scripts/node24.sh npm run desktop:dev`) and pan the zoomed-out globe at 1M cells or more with labels on; if you still see long frames with labels off, the study says the cause is the GPU (7 to 8 ms of an 8.3 ms frame), which a hidden test window cannot show. See `docs/RELEASING.md` for installers, tagging `v0.1.0` and publishing (publishing, signing certificates and any spending are yours).

## Branches

- `main` includes Phases 5, 5b, 5c, Q4, the autonomy setup, the desktop speed fix, the CI/nightly fixes and the label fix with the no-focus test modes (PRs #8 to #17). `perf-study` (PR to `main`, ready for review) holds the performance study. The next phase branch is `phase-6`, created from updated `main` by `/go`.

## Done (one line each)

- **Phase 5** (projection and distortion; `docs/checkpoints/CHECKPOINT_5.md`): merged, PR #8.
- **Phase 5c** (cartography v1; `docs/checkpoints/CHECKPOINT_5C.md`): merged, PR #10.
- **Q4** (Electron desktop app, E1 to E3; `docs/checkpoints/CHECKPOINT_ELECTRON.md`; build and release: `docs/RELEASING.md`): on `phase-electron`.
- **Q1 to Q3** (docs P1/P4, rectangular-continents study, Earth-like preset sweep) and **Phase 5b** (editor core; `docs/checkpoints/CHECKPOINT_5B.md`): merged, PR #9.

## Next

- Phase 6 (planet physics) is next. Its first step is the documentation-only reconciliation Prerequisite (ARCHITECTURE §7, decision P5): `orogen-evolution` (`47edc28`) together with GPlates, tectonics.js, ASPECT and the other tectonic candidates, per-component picks (`docs/reconciliation/README.md` §4, §5). Needs the user to authorize "6" (see above). Not started.
- Missing for a polished first version, logged not built: settlements and political borders (Phase 18 names are placeholders); more than one font family; globe labels for river and range paths use the plan only; no styled export of the globe view; river drawing threshold is a heuristic; an app icon.

## Waiting on the user

Nothing blocks the agent. User-only actions are in "What the user does next". Optional later: enable branch protection on `main`; release steps and signing options are in `docs/RELEASING.md`; an app icon (1024 px PNG).

## Known issues and watch list

- Pending reconciliation items and deferred upstreams: `docs/reconciliation/README.md` and the Prerequisite lines in ARCHITECTURE §7.
- STATUS.md's long handoff text is historical; this file and the checkpoint table are current.

## Starting a session

Type `/go` (or any first message). `.claude/commands/go.md` is the whole prompt; the user does not write prompts (decision W10).

## Work log (newest first; 2 to 4 lines per milestone)

- 2026-10-22: perf-fixes (user request): label re-plan sliced and allocation-free (19 to 34 ms task -> slices, median 1 to 2 ms, longest 5 to 8 ms); globe front-face culling and triangle order only where verified identical (Metal: yes, Firefox and software GL: no; 1M globe GPU -28%, 2.56M -7%); flat-map overlay cache and sliced texture upload (pan p95 41 to 67 ms -> 9 ms in Chromium/Electron; study's 1.8 s stall corrected); layer switch in the worker (longest frame 33 to 108 ms -> 10 ms). Decisions PF1 to PF5.

- 2026-10-21: perf-study (user request): `docs/checkpoints/PERFORMANCE_STUDY.md`. Generation is single-core, 84% in the detail-elevation stage (2.56M: 31.5 s, 1965 MB); five hot spots are 57%; native noise is 1.62x JS with identical bits; panning spike = label re-plan (19 to 30 ms, `lonLatAt` per mask cell), GC at most 5.3 ms, globe GPU 7 to 8 ms of 8.33 ms. Scripts `scripts/perf-*.mjs`, data `docs/perf-study/`, decisions PS1 to PS4. No product code changed.

- 2026-10-21: labels-quality (user request): item 0, hidden-by-default desktop test modes (keeps painting hidden, covered or minimised; `capture.spec.ts` proves it), recorded and watch modes replace the visible mode (C4). Labels: looked first (`scripts/label-shots.mjs`, `docs/feedback/labels/DEFECTS.md`), then regions raster + screen mask, area names on their own ground, smoothed least-turning river and range stretches, globe limb, stability by a map-aligned grid; 36 new placement tests (decisions L1 to L7; `docs/checkpoints/CHECKPOINT_LABELS.md`).

- 2026-10-21: nightly-probe-fix (user request): probe stability test runs in a worker thread (C1); `MAPMAKER_TEST` and `MAPMAKER_TEST_VISIBLE` desktop modes and a standing no-focus rule (C2); `ci.yml` split into parallel jobs, heavy gates only when dependent files change, nightly schedule, caches (C3). Timings before and after: `docs/DECISIONS_LOG.md` C3.

- 2026-10-21: desktop-perf (user request, outside the authorization limit): Electron, web Chromium and Firefox measured equal on the M5 Pro (hardware Metal GPU, same frame cost and generation time); found and fixed `Globe.render()` starving frames under frame-rate pointer input (1 -> 151 draws per 150 moves; also the brush ring), new `globe.spec.ts` test, `npm run desktop:perf`, `docs/RELEASING.md` section, decision E4. Not confirmed with real trackpad input.

- 2026-10-21: handoff-setup: `.claude/settings.json` deny rules fixed; nightly `testTimeout` 300 s and `--maxWorkers=2` (W9); e2e overlay waits in `map.spec.ts` and `carto.spec.ts`; `/go`, `scripts/authorize.sh`, CLAUDE.md standing rules, "What the user does next" (W10).

- 2026-10-20: Item 0 (P5: newer orogen `47edc28` registered as `orogen-evolution`, docs and manifest only) and Q4: `apps/desktop` Electron shell (E1), native save/load/export dialogs, Electron smoke test (World hash equals Node), electron-builder macOS build, tag-triggered artifacts workflow, update check (E2), `docs/RELEASING.md`. Checkpoint Electron written; stopped.

- 2026-10-19: Phase 5c: conics, brush cursor, `packages/carto` (label-spread port, QGIS hillshade, styles and five themes, cartographic data, SVG overlay, exact styled PNG/SVG), styled GPU layer and globe labels in the app, save/load of `.mapmaker`. Checkpoint 5c written; stopped at the limit.

- 2026-10-19: 5b M3 (editor UI, registry levels/presets, `edit.spec.ts`) and checkpoint 5b written; 380 unit and 18 e2e tests pass. Stopped at the limit.
- 2026-10-19: M5: flat-map UI (`apps/web/src/flat/map-ui.ts`): globe/flat switch, 16 projections (GPU for 10), rotation, zoom 1–16× and pan, graticule/coastline/Tissot/distortion overlays, heightmap and SVG export through the exact path; `map.spec.ts` checks the exported PNG's bytes against Node in three browsers. Checkpoint 5 written; PR #8 marked ready. Stopped at the limit.

- 2026-10-19: M4: GLSL inverse/forward of the ten shader projections with float32 Cephes elementary functions (GPU built-ins were visibly inaccurate), cube-map + bounded walk lookup, three.js host and CPU fallback (`apps/web/src/flat/`), `gpu.spec.ts` in three browsers (≤ 0.0066 px at 1×, ≤ 0.0012 px at 16×; all lookup differences explained by float32 at edges). Draft PR #8 opened (CI runs only on PRs). Next: M5.

- 2026-10-19: M2 ruling (`ca50aae`: colour type 0 default, `fd.projection.*.png` re-recorded, no pre-Phase-5 hash changed) and M3 (`2e77a5a`: graticule, coastlines along land/sea Voronoi edges, Tissot circles and axes, distortion overlays, SVG and overlay PNG exports through the exact path, 0.05 px export resampling; 7 new probe keys). §3.7 rule 3 corrected. Authorization narrowed to Checkpoint 5 by the user. Next: M4.

- 2026-10-19: operating guide, decisions log and this file written by the cloud assistant. Phase 5 M0, M1, M2 done on `phase-5` (details: `docs/checkpoints/PHASE5_M0_MEMORY.md`, `PROVENANCE.md`, commit messages).
