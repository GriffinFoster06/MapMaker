# Provenance

Started in Phase 1; expanded in Phase 3 with module-level provenance. `npm run provenance:check` (`tools/provenance/check.ts`) enforces it in CI: vendored files are compared byte-for-byte with `upstream/` at the commit in `upstream-manifest.json`, every source file with a `// Provenance:` header needs a row below, files copied from npm are compared with `node_modules`, and every direct npm dependency needs a row with its installed version and license. All packages in `package-lock.json` must have a license on the GPL-3.0-only-compatible allowlist.

## Calibration data (Q8)

Datasets are downloaded at tuning time into gitignored folders and are never committed.

| Dataset | Source URL | Retrieved | SHA-256 (archive) | License / terms | Used by |
|---|---|---|---|---|---|
| Köppen-Geiger climate classification, 0.5°, 1951–2000 (`Koeppen-Geiger-ASCII.txt`, version June 2006) | https://koeppen-geiger.vu-wien.ac.at/data/Koeppen-Geiger-ASCII.zip | 2026-10-03 | `4b85ca339b9aba4c6507ed0db9efad99334d56bd7010f417672a0c977b4b2f75` | No explicit license on the distribution site. The site asks for this citation: Kottek, M., J. Grieser, C. Beck, B. Rudolf, and F. Rubel, 2006: *World Map of the Köppen-Geiger climate classification updated*. Meteorol. Z., 15, 259–263. DOI 10.1127/0941-2948/2006/0130. Used for local scoring only and never redistributed. A formal license check is still needed before any redistribution†. | orogen `tuning/climate/` (spike 1a), extracted to `spikes/_work/orogen/tuning/climate/data/ascii/` |

## Extracted modules

Code ported from, or copied out of, an upstream. Each has a test that pins it to upstream behaviour or a golden value.

| File | Upstream | Upstream path | Commit / version | License | Test |
|---|---|---|---|---|---|
| `packages/core/src/mesh/sphere-mesh.ts` | orogen | `js/sphere-mesh.js` | `cc2662b` | GPL-3.0 | `mesh/mesh.test.ts`: byte-identical `triangles`, `halfedges`, `adjList`, `adjTriList` and Float32 `r_xyz` (inverse permutation) at N = 20k and 200k; committed golden hash for CI |
| `packages/gen-orogen/src/orchestration.ts` | orogen | `js/planet-worker.js` (`computeTriangleElevations`, `computeDetailDampenField`, `computeOrogenicField`, `runPostProcessing`) | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: the stages that call these produce all 69 stock arrays bit for bit (N = 20k, 200k). Ported to TypeScript; per-step timing dropped, arithmetic and call order unchanged |
| `tools/tuning/climate/lib/koppen-distance.mjs` | orogen | `tuning/climate/lib/koppen-distance.mjs` | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: Köppen class similarity; baseline at N = 40k and 160k reproduces the committed numbers exactly, and with `upstream/orogen` present (nightly) metrics, confusion matrix and Köppen output equal the stock harness's |
| `tools/tuning/climate/lib/ground-truth.mjs` | orogen | `tuning/climate/lib/ground-truth.mjs` | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: Kottek grid loader; baseline at N = 40k and 160k reproduces the committed numbers exactly, and with `upstream/orogen` present (nightly) metrics, confusion matrix and Köppen output equal the stock harness's |
| `tools/tuning/climate/lib/render.mjs` | orogen | `tuning/climate/lib/render.mjs` | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: comparison maps; baseline at N = 40k and 160k reproduces the committed numbers exactly, and with `upstream/orogen` present (nightly) metrics, confusion matrix and Köppen output equal the stock harness's |
| `tools/tuning/climate/lib/score.mjs` | orogen | `tuning/climate/lib/score.mjs` | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: scoring (`runClimate` now runs the shell's `orogen.climate` and `orogen.koppen` stages); baseline at N = 40k and 160k reproduces the committed numbers exactly, and with `upstream/orogen` present (nightly) metrics, confusion matrix and Köppen output equal the stock harness's |
| `tools/tuning/climate/evaluate.mjs` | orogen | `tuning/climate/evaluate.mjs` | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: entry point; baseline at N = 40k and 160k reproduces the committed numbers exactly, and with `upstream/orogen` present (nightly) metrics, confusion matrix and Köppen output equal the stock harness's |
| `tools/tuning/climate/optimize.mjs` | orogen | `tuning/climate/optimize.mjs` | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: auto-tuner, made async; baseline at N = 40k and 160k reproduces the committed numbers exactly, and with `upstream/orogen` present (nightly) metrics, confusion matrix and Köppen output equal the stock harness's |
| `tools/tuning/climate/param-space.mjs` | orogen | `tuning/climate/param-space.mjs` | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: parameter space; baseline at N = 40k and 160k reproduces the committed numbers exactly, and with `upstream/orogen` present (nightly) metrics, confusion matrix and Köppen output equal the stock harness's |
| `tools/tuning/climate/lib/earth-context.mjs` | orogen | `tuning/climate/lib/earth-context.mjs` | `cc2662b` | GPL-3.0 | Rewritten to build the context through the shell (`mesh` stage, `importHeightmap`); same test as above (elevation and ground truth per region are byte-equal to the stock context) |
| `packages/gen-orogen/src/import-heightmap.ts` | orogen | `tuning/climate/lib/earth-context.mjs` (`sampleBilinear`, `grayscaleToElevation`, `sampleHeightmap`, `deriveSyntheticPlates`, the import sequence) | `cc2662b` | GPL-3.0 | `tools/tuning/climate/tuning.test.ts`: the shell's imported elevation, plates and Köppen output equal the stock context's byte for byte (nightly), and the baseline objective reproduces exactly |
| `packages/core/src/fdlibm.ts` | fdlibm (netlib, Sun Microsystems) | `e_acos.c e_acosh.c e_asin.c e_atan2.c e_atanh.c e_cosh.c e_exp.c e_hypot.c e_log.c e_log10.c e_pow.c e_rem_pio2.c e_sinh.c k_cos.c k_rem_pio2.c k_sin.c k_tan.c s_asinh.c s_atan.c s_cbrt.c s_cos.c s_expm1.c s_log1p.c s_scalbn.c s_sin.c s_tan.c s_tanh.c` | 5.3 (http://www.netlib.org/fdlibm; no VCS, source file SHA-256 values are recorded in `tools/fdlibm-vectors/vectors.json`) | Sun permissive notice ("Copyright (C) 1993 by Sun Microsystems, Inc. ... Permission to use, copy, modify, and distribute this software is freely granted, provided that this notice is preserved."), kept in the file header | `fdlibm.test.ts`: 22,675 reference vectors (hex bit patterns, NaNs canonicalised) from the unmodified C compiled with `-ffp-contract=off`, bit-identical for sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh, atanh, exp, expm1, log, log1p, log10, pow, cbrt and two-argument hypot, including special values, subnormals and Payne-Hanek-range arguments |
| `packages/core/src/fdlibm.ts` (`log2` only) | FreeBSD msun | `lib/msun/src/e_log2.c`, `lib/msun/src/k_log.h` | `f12b76524d7bbf3d6c1a890834b6f8d018704ef0` (freebsd-src) | BSD-2-Clause, with the Sun permissive notice above (the file derives from fdlibm) | `fdlibm.test.ts`: log2 vectors from the unmodified FreeBSD C, same procedure. netlib fdlibm 5.3 has no log2. |
| `packages/core/src/rng/orogen-lcg.ts` | orogen | `js/rng.js` | `cc2662b` | GPL-3.0 | `rng/rng.test.ts`: 10⁶ draws equal upstream `makeRng` for four seeds |
| `packages/core/src/rng/alea.ts` | alea (npm, the package Azgaar depends on) | `alea.js` | `1.0.1` | MIT | `rng/rng.test.ts`: 10⁵ draws and exported state equal the npm package |
| `packages/core/src/rng/counter.ts` | Azgaars-Fantasy-Map-Generator | `src/generators/coastline-generator.ts` (`noise()`) | `3d94b80` | MIT | `rng/rng.test.ts`: equals the upstream function body (extracted from the source text) for 20,000 keys |

## Vendored files (verbatim copies)

Copied byte-for-byte from `upstream/orogen` at `cc2662b` into `packages/gen-orogen/vendor/`, never edited. `provenance:check` compares each with `git show cc2662b:<path>` whenever `upstream/orogen` is present (the nightly job). Vendored JS is excluded from lint and from `dmath` rules; it calls `Math.*` directly, so it runs only on the orogen parity path (`dmath.withMode('native')`, stages flagged `parity`).

| File | Upstream | Upstream path | Commit | License | Test |
|---|---|---|---|---|---|
| `packages/gen-orogen/vendor/js/climate-config.js` | orogen | `js/climate-config.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/climate-util.js` | orogen | `js/climate-util.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/coarse-plates.js` | orogen | `js/coarse-plates.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/color-map.js` | orogen | `js/color-map.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/elevation.js` | orogen | `js/elevation.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/heuristic-precip.js` | orogen | `js/heuristic-precip.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/koppen.js` | orogen | `js/koppen.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/ocean-land.js` | orogen | `js/ocean-land.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/ocean.js` | orogen | `js/ocean.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/planet-worker.js` | orogen | `js/planet-worker.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: used as the stock-orogen oracle in tests only, never imported by shipped code; contains `Math.random` seed fallbacks (lines 204, 921) that tests make throw; `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/plate-physics.js` | orogen | `js/plate-physics.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/plates.js` | orogen | `js/plates.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/precipitation.js` | orogen | `js/precipitation.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/rng.js` | orogen | `js/rng.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/simplex-noise.js` | orogen | `js/simplex-noise.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/sphere-mesh.js` | orogen | `js/sphere-mesh.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/super-plates.js` | orogen | `js/super-plates.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/temperature.js` | orogen | `js/temperature.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/terrain-config.js` | orogen | `js/terrain-config.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/terrain-metrics.js` | orogen | `js/terrain-metrics.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/terrain-post.js` | orogen | `js/terrain-post.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/js/wind.js` | orogen | `js/wind.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/parity.test.ts`: shell output equals stock output (the `planet-worker.js` copy is the oracle); `provenance:check` byte-compares with `upstream/orogen` |
| `packages/gen-orogen/vendor/assets/earth.png` | orogen | `assets/earth.png` | `cc2662b` | GPL-3.0 | `tools/tuning`: input heightmap of the Earth tuning harness (Step 7); `provenance:check` byte-compares |
| `packages/gen-orogen/vendor/LICENSE` | orogen | `LICENSE` | `cc2662b` | GPL-3.0 | License text of the vendored files; `provenance:check` byte-compares |

## Files copied from npm packages

Compared byte-for-byte with `node_modules` by the checker.

| File | Package | File in package | License |
|---|---|---|---|
| `apps/web/public/coi-serviceworker.js` | `coi-serviceworker@0.1.7` | `coi-serviceworker.js` | MIT (Guido Zuidhof and contributors) |

## Original modules

Written for MapMaker. Where a published algorithm was implemented from its reference description, it is named here.

| File | Basis | License of the basis |
|---|---|---|
| `packages/core/src/rng/sfc32.ts` | sfc32, "Small Fast Counting" generator, Chris Doty-Humphrey (PractRand), implemented from the reference description. No published test vectors exist; the test compares with an independent BigInt transcription of the reference. | Public domain |
| `packages/core/src/rng/splitmix64.ts` | SplitMix64, Sebastiano Vigna (<https://prng.di.unimi.it/splitmix64.c>), implemented from the reference. The test uses the published seed-0 vector. | Public domain |
| `tools/fdlibm-vectors/vectors.json` | Generated data: output of the unmodified netlib fdlibm 5.3 and FreeBSD `e_log2.c` (see the `fdlibm.ts` rows), produced by `tools/fdlibm-vectors/gen.sh` (compiles the C and runs `driver.c`). Inputs come from a fixed xorshift64 stream plus a list of special values. Not an extraction of code. | Numerical results of the Sun-licensed sources; no separate license |
| `packages/core/src/mesh/spatial-index.ts` | Cube-map buckets plus a greedy Delaunay-graph walk (standard technique). Tested against brute force. | n/a |
| `packages/gen-orogen/src/**` (except `orchestration.ts`) | The orogen adapter (F1–F4): layer descriptors, per-world scratch, the six stages, the stock-shape view and the stock oracle runner. Defined as new work by ARCHITECTURE §3.6. | n/a |
| `packages/core/src/**` (everything else), `packages/engine/src/**`, `tools/**`, `apps/web/src/**` | Shell infrastructure defined as new work by ARCHITECTURE §3–§6: frame, units, `dmath`, layer registry, entity tables, timeline, event log, `World`, save format, stage runner, worker protocol, probe, provenance checker. | n/a |

## Runtime dependencies

| Package | Version | License | Purpose |
|---|---|---|---|
| delaunator | 5.0.1 | ISC | Spherical Delaunay through stereographic projection (same version orogen loads) |
| fflate | 0.8.2 | MIT | ZIP container for `.mapmaker` |
| pngjs | 7.0.0 | MIT | PNG decode for the Earth heightmap in the tuning harness (`tools/tuning`) |

## Development dependencies (Phase 3)

| Package | Version | License | Purpose |
|---|---|---|---|
| @eslint/js | 9.36.0 | MIT | Lint |
| eslint | 9.36.0 | MIT | Lint, including the `Math.random` and `dmath` bans |
| typescript-eslint | 8.44.1 | MIT | Lint |
| typescript | 5.9.2 | Apache-2.0 | Strict type checking |
| vite | 7.1.7 | MIT | Web build |
| vitest | 3.2.4 | MIT | Unit tests |
| @playwright/test | 1.55.1 | Apache-2.0 | Cross-engine tests (Chromium 140, Firefox 141, WebKit 26) |
| esbuild | 0.25.10 | MIT | Worker bundling in tests |
| tsx | 4.20.6 | MIT | Runs the Node probe and provenance checker |
| @types/node | 24.5.2 | MIT | Types |
| @types/delaunator | 5.0.3 | MIT | Types |
| alea | 1.0.1 | MIT | Reference implementation for the Alea parity test |
| coi-serviceworker | 0.1.7 | MIT | Source of the copied COOP/COEP shim |

## Phase 1 spike dependencies

These are used only in `spikes/` and are not shipped.

| Package | Version | License | Purpose |
|---|---|---|---|
| delaunator | 5.0.1 | ISC | Same version orogen loads from its CDN; used to run orogen headless |
| pngjs | 7.0.0 | MIT | PNG output for spike images and for orogen's tuning harness |
| esbuild | 0.25.10 | MIT | Bundles orogen and Azgaar modules for browser and Node spikes |
| playwright | 1.55.1 | Apache-2.0 | Cross-engine determinism runs, and Azgaar round-trip tests |

## Toolchain (project-local, `.tools/`, gitignored)

| Tool | Version | License | Notes |
|---|---|---|---|
| fnm | 1.39.0 | GPL-3.0 | Release binary in `.tools/bin`, with `FNM_DIR=.tools/fnm` |
| Node.js | 24.21.0 (pinned in `.nvmrc`) | MIT | Run through `scripts/node24.sh`. System Node 22.19.0 is unchanged |
| Playwright browsers | Chromium 140.0.7339.186, Firefox 141.0, WebKit 26.0 | various | Installed to `.tools/ms-playwright` |

## Upstream code used in spikes

Spikes run upstream code from copies in `spikes/_work/` (gitignored). `upstream/` is never modified.

| Spike file | Upstream | Files | Commit | License |
|---|---|---|---|---|
| `spikes/lib/orogen.mjs`, `spikes/1a/*` | orogen | `js/*` (run unmodified) | `cc2662b` | GPL-3.0 |
| `spikes/1d/apply-pins.py`, `spikes/1d/pins.diff` | orogen | patch to `js/plates.js`, `js/coarse-plates.js`, `js/ocean-land.js`, `js/planet-worker.js` | `cc2662b` | GPL-3.0 |
| `spikes/1b/units.mjs` | orogen | `elevToHeightKm` formula from `js/color-map.js` | `cc2662b` | GPL-3.0 |
| `spikes/1b/*` | Azgaar | `src/generators/{voronoi,lakes,features-generator,river-generator}.ts` (bundled unmodified) | `3d94b80` | MIT |
| `spikes/1a/*` | VPLanet | full source, built natively with clang to produce golden data | `dd55da7` | MIT |
