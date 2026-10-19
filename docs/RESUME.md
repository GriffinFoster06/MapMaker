# Resume here

The living state of the project for any agent starting a session. **Update this file at every milestone** (the "Next", "Branches" and "Work log" parts); keep it short. Rules and method: `docs/OPERATING_GUIDE.md`. Decisions: `docs/DECISIONS_LOG.md`.

- **Last updated:** 2026-10-19, by the local agent (Claude Code), after M3 and the M2 ruling.
- **Authorized through: Checkpoint 5 (end of Phase 5).** Edit this line to extend or shorten; the agent never goes past it. The autonomous run through Phase 5c (the items below Phase 5) starts only after the user confirms Phase 5 and extends this line.
- **Suggested model/effort for the next batch:** Sonnet 5.5 medium for M3 and M5; Opus 5.5 medium for M4 (GLSL and cross-browser float32), high only after a failed attempt.

## Branches

- `main` = `b51bd40`: Phase 4b, the settings panel, reconciliation of 16 upstreams, all pending decisions applied. This operating guide arrives by a PR from `claude/bold-dijkstra-k0fgj1`; merge it first.
- `phase-5` (origin): Phase 5 M0 (memory work R1 to R7), M1 (registry, `ProjectionView`, distortion), M2 (exact CPU sampler, d3-dmath alias, 16-bit PNG export, probe v5), the M2 ruling (`ca50aae`) and M3 (`2e77a5a`: vector path, Tissot, distortion overlays). `claude/bold-dijkstra-k0fgj1` (this guide) is merged into `phase-5`. Not merged to `main`.
- Whatever `git log phase-5` shows is the truth. Skip to the first unfinished item.

## Next

### Phase 5 remaining (branch `phase-5`)

Do in this order; milestones commit and push separately.

1. ~~**Rulings first**~~ **done** (`ca50aae`; §3.7 rule 3 corrected in `2e77a5a`). Was (decision 5-4): plain 16-bit greyscale PNG by default, outside pixels = 0 recorded in the text chunk, transparent-outside as an option; say in the commit that the `fd.projection` probe hashes are re-recorded because they are new in this phase and that no pre-Phase-5 hash changed. Correct `docs/ARCHITECTURE.md` §3.7 rule 3 (decision 5-6).
2. ~~**M3, vector path**~~ **done** (`2e77a5a`). Was: graticule, exact coastlines traced along land/sea cell edges, the Tissot overlay (true indicatrix shapes from `geoCircle`, plus the ellipse axes), distortion overlays; all through `geoPath`. Interactive display may use stock d3; anything exported (SVG or PNG) goes through the exact path. Tests: pole (±90°) and antimeridian cases, the World-hash guard.
3. **M4, GPU shaders — next** (Opus medium): GLSL ports of the inverse formulas for the set in decision 5-5 (using three); data lookup through a triangle-id cube map plus a bounded walk across neighbouring triangles, matching the CPU path except where float32 precision falls exactly on a triangle edge; other projections fall back to the CPU path at reduced resolution. Tests: each GLSL inverse against d3 `invert`, shader-versus-d3 pixel difference, in Chromium, Firefox and WebKit.
4. **M5, app and checkpoint:** globe/flat-map switch, projection and rotation controls, distortion and Tissot overlays, Export heightmap button; end-to-end tests; `docs/checkpoints/CHECKPOINT_5.md` (template in the guide §9, including the M0 memory outcome and R8 as a Phase 7 item). Phase 5 tests (ARCHITECTURE §7): analytic distortion values, distortion at ±90°, pole and antimeridian pixel tests, shader versus d3 `invert`, projection switching leaves every World hash unchanged.
5. Open the PR `phase-5` → `main` (ready for review) and continue; do not wait for the merge.

### Between Phase 5 and 5b (small, in this order)

- **Q1.** Docs: state decisions P1 and P4 in `docs/REQUIREMENTS.md`, `docs/design/15-earth-test-suite.md` and `docs/ARCHITECTURE.md` (Earth-like preset as an early deliverable; Electron wrapper after 5c; no seed reproduces Earth); add the rectangular-continent defect (P3) to the Phase 6 section.
- **Q2.** Investigate the rectangular continents (P3). No user link needed: sweep several seeds at default and "most organic" settings, measure, find the origin; write `docs/checkpoints/RECT_CONTINENTS.md`; fix it only if small and clearly safe, else propose.
- **Q3.** Earth-likeness sweep (decision P2): `tools/tuning/earthlike/` and `docs/earth-tests/DEFAULTS_SWEEP.md`. Tools only; do not touch `packages/`, `OROGEN_DEFAULTS`, goldens or baselines. Objective: weighted Earth-distance from metrics computable from data in the repo (the Earth heightmap and Kottek data used by `tools/tuning/climate/`): land fraction; hypsometric curve (Wasserstein); slope distribution; continent count and landmass-area distribution; Köppen shares by area and latitude band; river density and Hack's law (`tools/tuning/realism/`); and two shape metrics for P3 (share of coastline in long near-straight segments; fit of each landmass to an axis-aligned box). List any missing Earth dataset (for example plate sizes from PB2002) as a missing input; invent no numbers. Search: Latin hypercube over the 14 sliders (ranges in `apps/web/src/settings.ts`) at a preview tier, at least 5 seeds per configuration; pilot of about 30 configurations first, report time per configuration, size the full run to a few hours, make it resumable and chunked, refine the best with more seeds, validate on held-out seeds, report slider sensitivities. Then add the best configuration as an "Earth-like" preset in the settings panel (tests: preset values, URL round trip) without changing any default. The compute is local and cheap in tokens: start it in the background, work on the next item, check once.

### Phase 5b, then 5c (then stop)

- **5b Prerequisite:** reconcile Godot, orogen, Azgaar (editors and options UI) and MESSAGEix with prompt 1 in `docs/reconciliation/README.md` (documentation only; Sonnet subagents; one group file, e.g. `group-5b.md`). Then Phase 5b per `docs/ARCHITECTURE.md` §7.
- **5c Prerequisite:** audit mapgen4 and mewo2/terrain with prompt 2 in that README. Then Phase 5c: label placement by porting Azgaar's `label-spread.ts` first (own font metrics), QGIS hillshade formula, no third-party symbols (decision W4).
- After the 5c checkpoint report: Q4 (optional Electron wrapper, decision P4) only if the user has added "Electron: go" to "Waiting on the user"; otherwise stop at the limit.

## Waiting on the user

(none)

User-only actions, whenever convenient and never blocking: merge the PRs the agent opens; enable branch protection on `main`; extend **Authorized through**.

## Known issues and watch list

- Remote CI for `phase-5` had not been observed when this was written (the cloud session could not see it). Check the Actions tab first; the probe job runs on Ubuntu, macOS and Windows and the new `npm run probe` script uses a Node loader hook (`packages/projection/alias/register.mjs`), so a Windows path problem would show there.
- Pending reconciliation items and deferred upstreams: `docs/reconciliation/README.md` and the Prerequisite lines in ARCHITECTURE §7.
- STATUS.md's long handoff text is historical; this file and the checkpoint table are current.

## Kickoff prompt (paste to start or resume an autonomous batch)

```
You are continuing MapMaker autonomously. Read AGENTS.md, docs/OPERATING_GUIDE.md and docs/RESUME.md, then work through "Next" in docs/RESUME.md up to the "Authorized through" limit, following the operating guide: decide rather than ask, stop only for its hard stops, keep to its usage budget (targeted checks while working, the full per-milestone checks once, no repeated benchmark matrices), commit and push each milestone, keep docs/RESUME.md and docs/DECISIONS_LOG.md current, and keep chat messages short. Start by checking git log on the phase branch to see which items are already done.
```

## Work log (newest first; 2 to 4 lines per milestone)

- 2026-10-19: M2 ruling (`ca50aae`: colour type 0 default, `fd.projection.*.png` re-recorded, no pre-Phase-5 hash changed) and M3 (`2e77a5a`: graticule, coastlines along land/sea Voronoi edges, Tissot circles and axes, distortion overlays, SVG and overlay PNG exports through the exact path, 0.05 px export resampling; 7 new probe keys). §3.7 rule 3 corrected. Authorization narrowed to Checkpoint 5 by the user. Next: M4.

- 2026-10-19: operating guide, decisions log and this file written by the cloud assistant. Phase 5 M0, M1, M2 done on `phase-5` (details: `docs/checkpoints/PHASE5_M0_MEMORY.md`, `PROVENANCE.md`, commit messages).
