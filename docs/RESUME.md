# Resume here

The living state of the project for any agent starting a session. **Update this file at every milestone** (the "Next", "Branches" and "Work log" parts); keep it short. Rules and method: `docs/OPERATING_GUIDE.md`. Decisions: `docs/DECISIONS_LOG.md`.

- **Last updated:** 2026-10-21, by the local agent (Claude Code), on `desktop-perf`: desktop speed investigation (decision E4), globe frame-starvation fix, `desktop:perf` tool. `handoff-setup` is merged (PR #12). Stopped; Phase 6 and its reconciliation not started.
- **Authorized through: Q4 (Electron).** Set by `scripts/authorize.sh`; only the user changes this line.

## What the user does next

Do these in order. Each step says why.

1. On GitHub, open the repository's **Pull requests** tab and the pull request named `desktop-perf` (the desktop speed investigation). Wait until every check at the bottom shows a green tick. Why: the checks run the project's tests on a clean machine, and merging only green work keeps `main` working.
2. Click **Merge pull request** (the default green button, not the arrow menu: do not choose "Squash" or "Rebase"), then **Confirm merge**. Then in the terminal, in the project folder, run `git checkout main && git pull` and `scripts/node24.sh npm run desktop:dev`, and rotate and zoom the globe. Why: the agent measured the desktop app as equal to the web app in Chromium (and found and fixed one frame-dropping flaw in the globe), but could not use a real trackpad, so only you can confirm it now feels right. If it still stutters, run `scripts/node24.sh npm run desktop:perf`, then type `/go desktop still stutters`; the agent reads decision E4 in `docs/DECISIONS_LOG.md` and goes on from there.
3. Open the **Actions** tab, choose **Nightly upstream parity** and check the latest run (started 2026-10-21 on `handoff-setup`) has a green tick. Why: it confirms the timeout fix works. If it is red, type `/go` and the agent will investigate.
4. In the terminal, in the project folder, copy and paste exactly:
   `scripts/authorize.sh 6`
   Why: it tells the agent it may now do the Phase 6 preparation (the documentation-only comparison of the newer orogen, GPlates and the other tectonic sources) and then Phase 6 itself (planet physics). It prepares a small change on a new branch `authorize-6` and uploads it.
5. On GitHub, open the pull request for `authorize-6` (the yellow **Compare & pull request** banner), click **Create pull request**, then **Merge pull request** as in step 2. Why: the agent only works as far as the merged `main` says.
6. Type `/go` in Claude Code. Why: it starts the agent, which reads everything it needs from the repository.

Optional, whenever convenient and never blocking: try the desktop app (`scripts/node24.sh npm run desktop:dev`), and see `docs/RELEASING.md` for building installers, tagging `v0.1.0` and publishing a release (publishing, signing certificates and any spending are yours).

## Branches

- `main` includes Phases 5, 5b, 5c, Q4 and the autonomy setup (PRs #8 to #12). `desktop-perf` (PR to `main`, ready for review) holds the desktop speed investigation and fix. The next phase branch is `phase-6`, created from updated `main` by `/go`.

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

- 2026-10-21: desktop-perf (user request, outside the authorization limit): Electron, web Chromium and Firefox measured equal on the M5 Pro (hardware Metal GPU, same frame cost and generation time); found and fixed `Globe.render()` starving frames under frame-rate pointer input (1 -> 151 draws per 150 moves; also the brush ring), new `globe.spec.ts` test, `npm run desktop:perf`, `docs/RELEASING.md` section, decision E4. Not confirmed with real trackpad input.

- 2026-10-21: handoff-setup: `.claude/settings.json` deny rules fixed; nightly `testTimeout` 300 s and `--maxWorkers=2` (W9); e2e overlay waits in `map.spec.ts` and `carto.spec.ts`; `/go`, `scripts/authorize.sh`, CLAUDE.md standing rules, "What the user does next" (W10).

- 2026-10-20: Item 0 (P5: newer orogen `47edc28` registered as `orogen-evolution`, docs and manifest only) and Q4: `apps/desktop` Electron shell (E1), native save/load/export dialogs, Electron smoke test (World hash equals Node), electron-builder macOS build, tag-triggered artifacts workflow, update check (E2), `docs/RELEASING.md`. Checkpoint Electron written; stopped.

- 2026-10-19: Phase 5c: conics, brush cursor, `packages/carto` (label-spread port, QGIS hillshade, styles and five themes, cartographic data, SVG overlay, exact styled PNG/SVG), styled GPU layer and globe labels in the app, save/load of `.mapmaker`. Checkpoint 5c written; stopped at the limit.

- 2026-10-19: 5b M3 (editor UI, registry levels/presets, `edit.spec.ts`) and checkpoint 5b written; 380 unit and 18 e2e tests pass. Stopped at the limit.
- 2026-10-19: M5: flat-map UI (`apps/web/src/flat/map-ui.ts`): globe/flat switch, 16 projections (GPU for 10), rotation, zoom 1–16× and pan, graticule/coastline/Tissot/distortion overlays, heightmap and SVG export through the exact path; `map.spec.ts` checks the exported PNG's bytes against Node in three browsers. Checkpoint 5 written; PR #8 marked ready. Stopped at the limit.

- 2026-10-19: M4: GLSL inverse/forward of the ten shader projections with float32 Cephes elementary functions (GPU built-ins were visibly inaccurate), cube-map + bounded walk lookup, three.js host and CPU fallback (`apps/web/src/flat/`), `gpu.spec.ts` in three browsers (≤ 0.0066 px at 1×, ≤ 0.0012 px at 16×; all lookup differences explained by float32 at edges). Draft PR #8 opened (CI runs only on PRs). Next: M5.

- 2026-10-19: M2 ruling (`ca50aae`: colour type 0 default, `fd.projection.*.png` re-recorded, no pre-Phase-5 hash changed) and M3 (`2e77a5a`: graticule, coastlines along land/sea Voronoi edges, Tissot circles and axes, distortion overlays, SVG and overlay PNG exports through the exact path, 0.05 px export resampling; 7 new probe keys). §3.7 rule 3 corrected. Authorization narrowed to Checkpoint 5 by the user. Next: M4.

- 2026-10-19: operating guide, decisions log and this file written by the cloud assistant. Phase 5 M0, M1, M2 done on `phase-5` (details: `docs/checkpoints/PHASE5_M0_MEMORY.md`, `PROVENANCE.md`, commit messages).
