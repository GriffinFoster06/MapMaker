# Development and agent handoffs

## Reading order and goals

Read `STATUS.md` for the current state, `ARCHITECTURE.md` for approved decisions and the phase plan, and `REQUIREMENTS.md` for product intent. The 38 notes in `design/` describe future implementations; a design note is not evidence a feature exists. `ARCHITECTURE.md` §7.0 gives the roadmap and which phase builds each note.

MapMaker is a new strict TypeScript shell around selected upstream implementations. One spherical `World` owns canonical state. Generation runs in workers; views sample that state. The fidelity slider uses a fixed reference pass plus a detail pass, because Phase 1 showed that stock orogen at low resolution is not a faithful preview of its high-resolution output. That restructure is **Phase 4b**; it was accepted at Checkpoint 4b, 2026-10-14.

## Code map

| Location | Responsibility / useful entry points |
|---|---|
| `apps/web/` | Vite browser shell. `src/app.ts` connects the UI to the engine (pipeline select: structured by default, stock for debugging; preview-first at 50k); `src/engine-worker.ts` starts the orogen host; `src/globe/` renders and colors the Three.js globe. |
| `packages/core/` | `World`, canonical frame/units, Fibonacci sphere and spatial index, typed layer registry, columnar entities, time-varying layers, event log, RNG service, fdlibm math, save/load and hashing. `multilevel/`: the 20k reference mesh L0 and the R/P/C transfer operators with anchoring (note 14). `hydro/`: priority-flood drainage and major basins. |
| `packages/engine/` | `runner.ts` resolves stages, checks producers/writes, hashes inputs (reads may name another mesh: `reference/ref.elevRaw`), skips unchanged work, records outputs and a `referenceHash` on detail-pass stages, and handles checkpoints/cancellation. `host.ts` and `client.ts` implement the worker protocol; `pool.ts` provides kernel workers. |
| `packages/gen-orogen/` | Two pipeline variants. **Stock** (`default`/`parity`, Phase 4a): six stages in `src/stages.ts` (mesh, tectonics, elevation, erosion, climate, Köppen) running the vendored JS in native mode. **Structured** (Phase 4b, note 14): `src/structured/` — `ref.pass` runs orogen once on the 20k reference mesh (`reference.ts`), `detail.pass` adds detail at N and anchors it to the reference (`detail.ts`). `src/port/` holds TypeScript ports of the vendored modules (bit-identical in native mode, `port-parity.test.ts`) that the structured stages run in fdlibm. `scratch.ts` reconstructs disposable adapter state; `import-heightmap.ts` supports the headless Earth harness. `stock.ts`/`view.ts` support parity testing. `vendor/` is immutable source. |
| `packages/projection/` | Phase 5: projection registry (d3-geo, d3-geo-projection), `ProjectionView` with the inverse domain check, distortion with the §3.7 pole rules, the exact CPU sampler and exports (`exact/`, d3-dmath alias in `alias/`), the vector path and overlays, and the GPU shaders (`gpu/`). |
| `apps/web/src/flat/` | Phase 5: the flat map (three.js host of the GPU shaders, CPU fallback through the engine worker). |
| `packages/planet`, `erosion`, `human`, `history` | README placeholders for later phases; not implemented workspace packages yet. The dummy history stage tests serialization, not real history simulation. |
| Planned, not created yet | Packages proposed by the 2026-10-13 roadmap, created when their phase starts: `editor` (notes 16, 17), `carto` (18, 19), `astro` (20), `interior` (21), `cryo` and `ocean` (22, 23), `atmos` (24), `bio` (25–29), `civ` extensions in `human`/`history` (30–34), `fantasy` and `plugins` (35, 37), `tools` (36). Names may change at the phase checkpoint. |
| `tools/determinism/` | Shared Node/browser probe, committed golden hashes, strict/report-only comparison rules. |
| `tools/provenance/` | Checks vendored bytes against pinned upstream commits when available, source headers, copied assets, and dependency licenses. |
| `tools/tuning/climate/` | Headless Earth calibration through the shell, Kottek data fetcher, optimizer, committed climate baseline; `lib/structured.mjs` scores the structured pipeline's climate (decision D7). |
| `tools/tuning/ab/` | Q7 fidelity harness (spike 1c lineage) for either pipeline (`--pipeline parity|structured`); `gate.mjs` is the regression gate against `tools/tuning/ab-baseline.structured.json` (CI `ab-gate`, nightly with the 2.56M final). |
| `tools/tuning/realism/` | Realism statistics of a world (hypsometry, slope, Hack's law, river density), stock against structured; `gate.mjs` fails a flatter or out-of-bounds structured world against `baseline.json` (nightly, 2.56M). |
| `tools/fdlibm-vectors/` | Reference C vector generation for the deterministic math port. |
| `apps/web/e2e/`, `apps/web/bench/` | Cross-browser correctness checks and separate performance measurements. |
| `spikes/`, `audit/` | Historical feasibility experiments/results and upstream capability assessments. Not shipped in the app. |
| `.github/workflows/` | CI checks, three-OS determinism matrix, nightly upstream parity, deployments with live smoke tests: Cloudflare Pages (`cloudflare.yml`, primary, native COOP/COEP from `apps/web/public/_headers`, a preview per pull request; needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets) and GitHub Pages (`pages.yml`, mirror, opt-in `?coi` shim). See ARCHITECTURE.md Q18. |

The runtime path is `app.ts` → `EngineClient` → browser engine worker → `startOrogenHost` → `runPipeline` (variant `structured`, or `parity` for stock) → `World`. Mesh/layer copies return to the main thread for rendering. Browser and Node hosts reuse the same generation packages.

## Local tools

All local Node/npm/npx invocations use `scripts/node24.sh`. `.nvmrc` is the version source of truth. The wrapper uses `.tools/bin/fnm`, installs the pinned Node if necessary, and sets project-local npm cache and Playwright browser paths. No global configuration changes are needed.

The current checkout already has this toolchain. For a new machine, install the platform's fnm executable at `.tools/bin/fnm` and make it executable, then run the wrapper. Original setup/reproduction notes are in `spikes/PHASE1_REPORT.md` §How to reproduce (its historical Node version is superseded by `.nvmrc`).

```sh
scripts/node24.sh node --version
scripts/node24.sh npm ci
scripts/node24.sh npm run dev -w @mapmaker/web
```

To install browser binaries into this project's cache:

```sh
scripts/node24.sh npx playwright install chromium firefox webkit
```

Reference repos and calibration data are optional for basic development. Restore only needed upstreams rather than downloading the entire reference collection:

```sh
scripts/restore-upstream.sh orogen Azgaars-Fantasy-Map-Generator
tools/tuning/climate/fetch-kottek.sh
```

These scripts use pinned commits/checksums. Never edit reference repos or vendored source to fix a test. Earth ground truth and local caches are ignored by Git.

## Validation

```sh
scripts/node24.sh npm run lint
scripts/node24.sh npm run typecheck
scripts/node24.sh npm test
scripts/node24.sh npm run build
scripts/node24.sh npm run provenance:check
scripts/node24.sh npm run e2e
```

`npm test` covers core/engine behavior, stock-orogen parity, save/resume, deterministic probes, calibration, and the A/B harness. Tests needing optional upstreams or ground truth can skip when those inputs are absent. `REQUIRE_UPSTREAM=1` enables the nightly job's required-input check. Record passed, failed, and skipped counts; an installed toolchain does not imply a green suite.

`npm run e2e` builds and serves on port 4173 and runs Chromium, Firefox, and WebKit: determinism, isolation shim, and globe/layer checks. It may reuse an existing server locally; ensure that server serves the current checkout. `E2E_BASE_URL` targets a remote site. On Linux, headless Firefox has no WebGL, so its globe test fails headless; run `FIREFOX_HEADED=1 xvfb-run -a scripts/node24.sh npm run e2e` (CI does the same on Linux). `npm run build` produces `apps/web/dist`; Vite may warn about bundle size.

For an isolated test, use `scripts/node24.sh npx vitest run <test-file>`. The Node-only probe entry is `scripts/node24.sh npm run probe`.

## Expensive measurements

Full performance tiers and Q7 baseline generation are phase work, not prerequisites for every documentation edit. They can take substantial time and memory. Do not invent baseline values or suppress tests when an artifact is missing.

```sh
# Browser timing/memory; restrict tiers for a short run.
BENCH_TIERS=50k,200k scripts/node24.sh npm run bench -- --project=chromium
# Engine worker alone (no globe, no transfers), with per-process peaks; writes phase4b-worker-*.json.
BENCH_MODE=worker BENCH_TIERS=2.56M scripts/node24.sh npm run bench -- --project=webkit
# Report from existing measured JSON files (does not run benchmarks).
scripts/node24.sh node scripts/bench-report.mjs
# Earth evaluation (requires downloaded Kottek ground truth).
scripts/node24.sh npx tsx tools/tuning/climate/evaluate.mjs --n 40000 --seed 1234
# Full stock Q7 baseline: three seeds, previews 50k/200k, finals 1M/2.56M.
NODE_OPTIONS=--max-old-space-size=24000 scripts/node24.sh npx tsx tools/tuning/ab/run.mjs
# Structured pipeline: the same, written to ab-baseline.structured.json; then the regression gate.
NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx tools/tuning/ab/run.mjs --pipeline structured
scripts/node24.sh npx tsx tools/tuning/ab/gate.mjs --current tools/tuning/ab-baseline.structured.json
# Realism statistics, stock against structured (2.56M by default).
NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx tools/tuning/realism/realism.mjs
# Realism gate (nightly): structured only, against tools/tuning/realism/baseline.json.
NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx tools/tuning/realism/realism.mjs --pipelines structured --out realism-current.json
scripts/node24.sh npx tsx tools/tuning/realism/gate.mjs --current realism-current.json
```

Browser measurements write `docs/benchmarks/phase4b-*.json` for the structured pipeline (default) or `docs/benchmarks/phase4a-*.json` with `BENCH_VARIANT=parity` (stock orogen); the report writes `docs/benchmarks/PHASE4A.md`. The Q7 runner writes `tools/tuning/ab-baseline.json`, with raw runs under ignored `tools/tuning/results/ab/`. Fix metric correctness before recording the baseline. Review measured artifacts and provenance before committing them. The benchmark spec records per-tier failures in JSON, so inspect `ok`/`error` fields as well as process exit status.

## Switching between Claude Code and Codex

Both tools read the same rules: Codex discovers root `AGENTS.md`; Claude Code imports it through `CLAUDE.md`. Use `STATUS.md` as the shared working memory rather than duplicating a separate per-agent task list.

When the user says they are switching agents (and only then), update its current handoff section with:

- The task and phase worked on, resulting behavior, and relevant files.
- Commands actually run, results, and input/environment limitations.
- Remaining problems and the next concrete step.
- Any decision awaiting the user, including the applicable phase boundary.

The receiving agent reads that section and checks the working tree/recent commits before editing. Uncommitted work is a valid handoff; describe it and preserve it. Default to taking turns in the shared checkout. Use separate worktrees if simultaneous work is explicitly requested. Avoid machine-specific agent settings or hooks unless a concrete need appears; the project already supplies its own toolchain wrapper.
