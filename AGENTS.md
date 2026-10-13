# MapMaker: shared agent instructions

Sphere-canonical world generator. TypeScript monorepo (npm workspaces). License: GPL-3.0-only.

Personal, non-commercial project. The product vision is in `docs/REQUIREMENTS.md` (Vision): a realistic, fully customisable worldbuilder for fictional worlds. Licences are recorded but do not restrict which upstream may be used (ARCHITECTURE.md Q12).

## Session start and handoff

These instructions apply repository-wide to Codex, Claude Code, and other coding agents. Keep shared rules here; `CLAUDE.md` imports this file.

1. Read `STATUS.md` for the current phase, latest validation, and next work.
2. Read `docs/ARCHITECTURE.md`, especially its resolved decisions and §7, then the design notes relevant to the task. `docs/REQUIREMENTS.md` defines product intent.
3. Inspect `git status --short --branch` and recent commits. Preserve existing edits, including work left by the other agent. A change of agent is not authorization to discard or redo work.
4. Use `docs/DEVELOPMENT.md` for the code map and local workflow.

At each checkpoint or handoff, update the current handoff section of `STATUS.md`: what changed, checks actually run and their results, remaining failures, and the next concrete step. Label historical results and unverified claims. Keep durable decisions in the architecture/design documents and extraction records in `PROVENANCE.md`, rather than relying on chat history or private agent memory.

Default to one agent editing a checkout at a time. If the user requests simultaneous work, use separate branches/worktrees and agree on ownership; do not switch or reset a checkout another session is using. Do not commit or push merely to hand off unless requested.

## Rules

- **Never modify `upstream/`.** It is a read-only reference checkout (restore with `scripts/restore-upstream.sh`).
- **Extract instead of writing original code.** Copy or port from `upstream/` where a usable implementation exists. Write original code only for what the architecture defines as new, or where no upstream has it.
- **Log every extraction in `PROVENANCE.md`**: source path, commit, license, destination, test. Original code from a published algorithm is logged too.
- **Each extraction needs a test** that checks it against the upstream behaviour or a golden value.
- **Update `STATUS.md` at every checkpoint.**
- **Stop at each phase boundary and wait for the user.** Do not start the next phase. Routine work within an authorized phase does not need a new approval at each step.
- No `Math.random` in `packages/**`. Simulation math goes through `dmath`. **Exception:** `packages/gen-orogen/vendor/` is verbatim upstream code (lint-ignored). It calls `Math.*` and `Math.random` directly (the latter only in `planet-worker.js`, a test-only oracle), so it runs only in stages flagged `parity`, inside `dmath.withMode('native')`. Tests make `Math.random` throw during pipeline runs.
- `dmath` defaults to `'fdlibm'` in every realm. The stage runner fails any non-parity stage that enters `'native'`.
- Keep `packages/gen-orogen/vendor/` verbatim. Put changes in adapters or adjacent TypeScript ports.
- Record new third-party dependencies in `PROVENANCE.md` too.
- The sphere is the source of truth. Canonical frame: +Z north, +X (0°N, 0°E), +Y (0°N, 90°E); canonical elevation is metres. Respect adapter-private `orogen.*` layers and explicit frame/unit conversions.
- Quality over size and speed: optimize only up to the point of noticeable loss, and measure any output-changing optimization against full quality before adopting it (`docs/REQUIREMENTS.md`, Realism and performance).
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
