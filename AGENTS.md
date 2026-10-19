# MapMaker: shared agent instructions

Sphere-canonical world generator. TypeScript monorepo (npm workspaces). License: GPL-3.0-only.

Personal, non-commercial project. The product vision is in `docs/REQUIREMENTS.md` (Vision): a realistic, fully customisable worldbuilder for fictional worlds. Licences are recorded but do not restrict which upstream may be used (ARCHITECTURE.md Q12).

## Session start and handoff

These instructions apply repository-wide to Codex, Claude Code, and other coding agents. Keep shared rules here; `CLAUDE.md` imports this file.

1. Read `docs/OPERATING_GUIDE.md` (how to work without the user in the loop: authorization, decision rules, hard stops, usage budget) and `docs/RESUME.md` (where to continue now). Then `STATUS.md` for the checkpoint table and history, and `docs/DECISIONS_LOG.md` for decisions made outside the architecture document.
2. Read `docs/ARCHITECTURE.md`, especially its resolved decisions and §7, then the design notes relevant to the task. `docs/REQUIREMENTS.md` defines product intent.
3. Inspect `git status --short --branch` and recent commits. Preserve existing edits, including work left by the other agent. A change of agent is not authorization to discard or redo work.
4. Use `docs/DEVELOPMENT.md` for the code map and local workflow.

Update the current handoff section of `STATUS.md` **only when the user says they are switching agents** (or explicitly asks for it); do not spend time on handoff notes otherwise. Until then, the record lives in commit messages, the PR description and the files the work itself produces. When a handoff is requested, write one complete section covering everything since the last handoff: what changed, checks actually run and their results, remaining failures, and the next concrete step. Label historical results and unverified claims. Keep durable decisions in the architecture/design documents and extraction records in `PROVENANCE.md`, rather than relying on chat history or private agent memory.

Default to one agent editing a checkout at a time. If the user requests simultaneous work, use separate branches/worktrees and agree on ownership; do not switch or reset a checkout another session is using. Do not commit or push merely to hand off unless requested; commits and pushes at milestones follow `docs/OPERATING_GUIDE.md` §7.

## Rules

- **Never modify `upstream/`.** It is a read-only reference checkout (restore with `scripts/restore-upstream.sh`).
- **Extract instead of writing original code.** Copy or port from `upstream/` where a usable implementation exists. Write original code only for what the architecture defines as new, or where no upstream has it.
- **Log every extraction in `PROVENANCE.md`**: source path, commit, license, destination, test. Original code from a published algorithm is logged too.
- **Each extraction needs a test** that checks it against the upstream behaviour or a golden value.
- **Keep the record current, cheaply.** At every milestone update `docs/RESUME.md` (a few lines) and, for non-obvious choices, `docs/DECISIONS_LOG.md`. At every checkpoint add one line to the `STATUS.md` checkpoint table. Write a full `STATUS.md` handoff section only when the user announces an agent switch (see Session start and handoff).
- **Phases and authorization.** `docs/RESUME.md` names the checkpoint the user has authorized work through. Finish each phase's checkpoint report and continue into the next phase until that limit; stop and wait at the limit, and never start a phase beyond it. Within the authorized range decide rather than ask; the only reasons to wait are the hard stops in `docs/OPERATING_GUIDE.md` §4.
- No `Math.random` in `packages/**`. Simulation math goes through `dmath`. **Exception:** `packages/gen-orogen/vendor/` is verbatim upstream code (lint-ignored). It calls `Math.*` and `Math.random` directly (the latter only in `planet-worker.js`, a test-only oracle), so it runs only in stages flagged `parity`, inside `dmath.withMode('native')`. Tests make `Math.random` throw during pipeline runs.
- `dmath` defaults to `'fdlibm'` in every realm. The stage runner fails any non-parity stage that enters `'native'`.
- Keep `packages/gen-orogen/vendor/` verbatim. Put changes in adapters or adjacent TypeScript ports.
- Record new third-party dependencies in `PROVENANCE.md` too.
- The sphere is the source of truth. Canonical frame: +Z north, +X (0°N, 0°E), +Y (0°N, 90°E); canonical elevation is metres. Respect adapter-private `orogen.*` layers and explicit frame/unit conversions.
- Quality is never traded for size or speed, across every part of the project and every medium: optimize only where the result is indistinguishable from full quality, measured before adoption. The examples in `docs/REQUIREMENTS.md` (Realism and performance) illustrate the principle; they are not its limits.
- Preserve exact resume and deterministic outputs. Do not refresh golden hashes or calibration baselines simply to make a failing test pass; investigate and explain intentional changes.
- Do not destructure `dmath` at module load; mode switches replace its functions.
- Every repo in `upstream/` may be extracted, ported or used as an algorithm reference, whatever its licence (ARCHITECTURE.md Q12). Pick the best implementation on quality and fit. Licences are still recorded in `PROVENANCE.md` for every extraction.

## Commands

All Node, npm and npx calls go through `scripts/node24.sh` (project-local Node 24 from `.tools/`; system Node is not used).

```
scripts/node24.sh npm ci
scripts/node24.sh npm run dev -w @mapmaker/web
scripts/node24.sh npm run lint
scripts/node24.sh npm run typecheck
scripts/node24.sh npm test              # Vitest, all workspaces
scripts/node24.sh npm run build
scripts/node24.sh npm run e2e           # Playwright: Chromium, Firefox, WebKit
scripts/node24.sh npm run provenance:check
```

Run checks appropriate to the change and report failures honestly. Full benchmarks and Q7 baseline generation are separate, expensive tasks; see `docs/DEVELOPMENT.md`. Do not weaken checks or hide missing artifacts.

## Docs

- `docs/DEVELOPMENT.md`: code map, development commands, and Claude Code/Codex handoffs.
- `docs/ARCHITECTURE.md`: decisions, canonical model, pipeline, roadmap (§7.0) and phased plan (§7). Read first.
- `docs/design/README.md`: index of the design notes (1–38) and their nine-section template.
- `docs/spikes/PHASE1_REPORT.md`: Phase 1 measurements.
- `docs/REQUIREMENTS.md`, `audit/CAPABILITY_MATRIX.md`: requirements and upstream audit.
- `PROVENANCE.md`: provenance and licenses. `STATUS.md`: current phase and checkpoint state.
