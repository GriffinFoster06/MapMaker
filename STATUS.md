# Status

Updated at every checkpoint.

| Checkpoint | State |
|---|---|
| 1 (Phase 1 spikes) | Done |
| 2 (Phase 2 design notes) | Done |
| 3 (Phase 3 shell) | Done |
| 3b (Checkpoint 3 decisions: `dmath` fdlibm mode) | Reached and reviewed. |
| 4a (Phase 4a orogen in the shell, globe) | **In progress** |

## Phase 3 results (2026-10-04)

- **Unit tests:** 117 pass locally (with `upstream/` present). CI runs 112 and skips 5: the upstream-parity tests (`SphereMesh` and the RNGs against `upstream/orogen` and Azgaar) need the `upstream/` checkout, which CI does not have. They are covered in CI by committed golden hashes. Lint, `tsc -b` and `provenance:check` clean. (The earlier "87 passing" counted the skipped tests.)
- **Cross-engine tests:** 9 Playwright runs (determinism and COOP/COEP shim, in Chromium 140, Firefox 141 and WebKit 26) pass locally, in CI on ubuntu, macOS and **Windows x64**, and against the live site.
- **CI:** `checks` (ubuntu) and `determinism` (ubuntu, macOS, Windows) green; Pages deployed to https://griffinfoster06.github.io/MapMaker/ with a live smoke test.

## Checkpoint 3b: `dmath` fdlibm mode (2026-10-04)

- **Implemented:** `dmath.mode = 'fdlibm'` is a line-by-line TypeScript port of netlib fdlibm 5.3 (`packages/core/src/fdlibm.ts`, `log2` from FreeBSD msun), covering all 22 transcendentals that `packages/**` may call only through `dmath`. `dmath.setMode()` and `dmath.withMode()` switch modes. **The default is still `'native'`** (orogen parity); canonical Float64 paths opt in with `'fdlibm'`, and the save manifest records the current mode. Logged in `PROVENANCE.md`. Lint now also bans the `**` operator in `packages/**`.
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
- **CI coverage:** the upstream-parity tests are skipped in CI (no `upstream/` checkout). A scheduled job that restores `upstream/` and runs them would close the gap.

## Open decisions for review

1. ~~Whether canonical Float64 paths should switch `dmath` to `'fdlibm'` by default.~~ **Resolved (Phase 4a):** the default is `'fdlibm'` at module load in the shell and every worker; `'native'` only inside `withMode('native')` in the orogen parity path, enforced by the stage runner.
2. The deviations listed in the Checkpoint 3 report.
