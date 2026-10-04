# MapMaker

Sphere-canonical world generator. TypeScript monorepo (npm workspaces). License: GPL-3.0-only.

## Rules

- **Never modify `upstream/`.** It is a read-only reference checkout (restore with `scripts/restore-upstream.sh`).
- **Extract instead of writing original code.** Copy or port from `upstream/` where a usable implementation exists. Write original code only for what the architecture defines as new, or where no upstream has it.
- **Log every extraction in `PROVENANCE.md`**: source path, commit, license, destination, test. Original code from a published algorithm is logged too.
- **Each extraction needs a test** that checks it against the upstream behaviour or a golden value.
- **Update `STATUS.md` at every checkpoint.**
- **Stop at each phase boundary and wait for the user.** Do not start the next phase.
- No `Math.random` in `packages/**`. Simulation math goes through `dmath`. **Exception:** `packages/gen-orogen/vendor/` is verbatim upstream code (lint-ignored). It calls `Math.*` and `Math.random` directly (the latter only in `planet-worker.js`, a test-only oracle), so it runs only in stages flagged `parity`, inside `dmath.withMode('native')`. Tests make `Math.random` throw during pipeline runs.
- `dmath` defaults to `'fdlibm'` in every realm. The stage runner fails any non-parity stage that enters `'native'`.

## Commands

All Node, npm and npx calls go through `scripts/node24.sh` (project-local Node 24 from `.tools/`; system Node is not used).

```
scripts/node24.sh npm ci
scripts/node24.sh npm run lint
scripts/node24.sh npm run typecheck
scripts/node24.sh npm test              # Vitest, all workspaces
scripts/node24.sh npm run build
scripts/node24.sh npm run e2e           # Playwright: Chromium, Firefox, WebKit
scripts/node24.sh npm run provenance:check
```

## Docs

- `docs/ARCHITECTURE.md`: decisions, canonical model, pipeline, phased plan (§7). Read first.
- `docs/design/README.md`: index of the Phase 2 design notes (1–14).
- `docs/spikes/PHASE1_REPORT.md`: Phase 1 measurements.
- `docs/REQUIREMENTS.md`, `audit/CAPABILITY_MATRIX.md`: requirements and upstream audit.
- `PROVENANCE.md`: provenance and licenses. `STATUS.md`: current phase and checkpoint state.
