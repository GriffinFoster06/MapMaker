# Checkpoint 5b: editing core

Branch `phase-5b` (PR #9 to `main`). Milestones M1 to M3, 2026-10-19. ARCHITECTURE §3.8 and §7 (Phase 5b).

## 1. What was built

- **Prerequisite, reconciliation** (`docs/reconciliation/group-5b.md`): Godot, orogen, Azgaar (editors, options UI) and MESSAGEix; corrections to notes 16, 17, 19, 21, the audits and the capability matrix.
- **M1, engine** (`packages/core/src/edits/`, `packages/engine/src/{edits,stale,hash-state}.ts`): `World.edits` (log with cursor, gesture-based undo/redo, saved only when non-empty so old hashes are unchanged), `World.systems` (simulate | manual | off per stage; mesh and `ref.pass` not switchable), per-stage edit hashing, stale-stage analysis with reasons, run-from-stage.
- **M2, terrain edits** (`packages/gen-orogen/src/edits/`): brush/polygon/cell regions with falloff; raise, lower, smooth, flatten, terrace, noise, set, land, sea; categorical Köppen and plate paint; hotspot and ridge seeds; pin/soft/seed modes; parameter edits. Applied in the structured detail pass before climate, with a lapse-rate temperature adjustment.
- **M3, app** (`apps/web/src/editor/`, `app.ts`, `index.html`): tool palette and brush controls on the globe and flat map, system switches, dirty-stage list, re-run from a stage, cancel, undo/redo; parameter panel levels (simple/advanced/expert) and presets (incl. Earth-like) from the settings registry; protocol ops `edit`, `systems`, `stale`.

## 2. Checks run

- Lint, typecheck, build, `provenance:check`: pass.
- Unit tests: 380 passed, 1 skipped (new: engine edits 10, gen-orogen edits 18, web editing 5, settings 6).
- E2E (Chromium + Firefox): 18 passed, including `edit.spec.ts` (stroke → re-run `detail.pass` → equals Node with the same edit records; undo/redo hashes).
- Required tests: replay save→load→hash equal; pinned values survive re-simulation; unedited regions unchanged for local stages; undo restores the previous hash. All covered.
- Remote CI on the final push: see PR #9.

## 3. Decisions

`docs/DECISIONS_LOG.md` 5b-1 to 5b-7 (edit log, application by the producing stage, seeds as additive relief, system switches, tool vocabulary, parameter edits, registry scope).

## 4. Deviations and plan text to change

- Only the 14 world sliders are in the registry; the expert tier is empty (orogen's ~446 constants are not overridable without touching `vendor/`). Propose a later registry pass.
- Edits change local temperature, Köppen and drainage; precipitation and wind come from the 20k reference mesh and do not react to local edits. Large structural edits need Phase 6b.

## 5. Known gaps

- No brush cursor or live GPU preview; a stroke shows after the re-run.
- Parity pipeline has no plate paint (structured only).
- Next (5c prerequisite): audit mapgen4 and mewo2/terrain (prompt 2), then label placement. Not started: 5b is the authorized stop.

## 6. Waiting on the user

Review this checkpoint and merge PR #9 (after PR #8); W7 feature-level candidates in `docs/RESUME.md`.
