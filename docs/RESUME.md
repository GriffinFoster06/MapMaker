# Resume here

The living state of the project for any agent starting a session. **Update this file at every milestone** (the "Next", "Branches" and "Work log" parts); keep it short. Rules and method: `docs/OPERATING_GUIDE.md`. Decisions: `docs/DECISIONS_LOG.md`.

- **Last updated:** 2026-10-19, by the local agent (Claude Code), on `phase-5c`: housekeeping done; 5c starting.
- **Authorized through: Checkpoint 5c and Q4** (end of Phase 5c, Cartography v1, then the Electron desktop app for macOS and Windows). Edit this line to extend or shorten; the agent never goes past it.

## Branches

- `main` includes Phase 5 (PR #8) and Phase 5b (PR #9), both merged. Current work: `phase-5c`.

## Done (one line each)

- **Phase 5** (projection and distortion; `docs/checkpoints/CHECKPOINT_5.md`): merged, PR #8.
- **Q1 to Q3** (docs P1/P4, rectangular-continents study, Earth-like preset sweep) and **Phase 5b** (editor core; `docs/checkpoints/CHECKPOINT_5B.md`): merged, PR #9.

## Next

- **5c Prerequisite:** audit mapgen4 and mewo2/terrain with prompt 2 in `docs/reconciliation/README.md`.
- **Phase 5c** per `docs/ARCHITECTURE.md` §7, plus conic projections, a brush cursor and the end-to-end usability check (including save/load of `.mapmaker`). Then stop at Checkpoint 5c.
- Q4 (Electron wrapper, decision P4) only when the user sends the next prompt.

## Waiting on the user

- Nothing. (W7 feature-level candidates were ruled on as decision W8.)

User-only actions, whenever convenient and never blocking: merge the PRs the agent opens; enable branch protection on `main`; extend **Authorized through**.

## Known issues and watch list

- Pending reconciliation items and deferred upstreams: `docs/reconciliation/README.md` and the Prerequisite lines in ARCHITECTURE §7.
- STATUS.md's long handoff text is historical; this file and the checkpoint table are current.

## Kickoff prompt (paste to start or resume an autonomous batch)

```
You are continuing MapMaker autonomously. Read AGENTS.md, docs/OPERATING_GUIDE.md and docs/RESUME.md, then work through "Next" in docs/RESUME.md up to the "Authorized through" limit, following the operating guide: decide rather than ask, stop only for its hard stops, keep to its usage budget (targeted checks while working, the full per-milestone checks once, no repeated benchmark matrices), commit and push each milestone, keep docs/RESUME.md and docs/DECISIONS_LOG.md current, and keep chat messages short. Start by checking git log on the phase branch to see which items are already done.
```

## Work log (newest first; 2 to 4 lines per milestone)

- 2026-10-19: 5b M3 (editor UI, registry levels/presets, `edit.spec.ts`) and checkpoint 5b written; 380 unit and 18 e2e tests pass. Stopped at the limit.
- 2026-10-19: M5: flat-map UI (`apps/web/src/flat/map-ui.ts`): globe/flat switch, 16 projections (GPU for 10), rotation, zoom 1–16× and pan, graticule/coastline/Tissot/distortion overlays, heightmap and SVG export through the exact path; `map.spec.ts` checks the exported PNG's bytes against Node in three browsers. Checkpoint 5 written; PR #8 marked ready. Stopped at the limit.

- 2026-10-19: M4: GLSL inverse/forward of the ten shader projections with float32 Cephes elementary functions (GPU built-ins were visibly inaccurate), cube-map + bounded walk lookup, three.js host and CPU fallback (`apps/web/src/flat/`), `gpu.spec.ts` in three browsers (≤ 0.0066 px at 1×, ≤ 0.0012 px at 16×; all lookup differences explained by float32 at edges). Draft PR #8 opened (CI runs only on PRs). Next: M5.

- 2026-10-19: M2 ruling (`ca50aae`: colour type 0 default, `fd.projection.*.png` re-recorded, no pre-Phase-5 hash changed) and M3 (`2e77a5a`: graticule, coastlines along land/sea Voronoi edges, Tissot circles and axes, distortion overlays, SVG and overlay PNG exports through the exact path, 0.05 px export resampling; 7 new probe keys). §3.7 rule 3 corrected. Authorization narrowed to Checkpoint 5 by the user. Next: M4.

- 2026-10-19: operating guide, decisions log and this file written by the cloud assistant. Phase 5 M0, M1, M2 done on `phase-5` (details: `docs/checkpoints/PHASE5_M0_MEMORY.md`, `PROVENANCE.md`, commit messages).
