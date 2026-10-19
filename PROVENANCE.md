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
| `apps/web/src/settings.ts` | orogen | `index.html` (the generation sliders `sJ`, `sP`, `sCn`, `sNs`, `sCsv`, `sLc`, `sTw`, `sS`, `sGl`, `sHEr`, `sTEr`, `sRs`, `sTmp`, `sPrc`: labels, ranges, steps, defaults, end labels and help text) | `cc2662b` | GPL-3.0 | `apps/web/src/settings.test.ts`: defaults equal `OROGEN_DEFAULTS` and lie in range; `gen-orogen/src/structured/params.test.ts`: every slider changes the world in both pipelines; e2e settings test. Help text lightly edited |
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
| `packages/projection/src/png.ts` (`crc32`, `chunk`, `encodePng16`, `quantise`) | orogen | `js/planet-mesh.js` (`_crc32Table`, `_crc32`, `_pngChunk`, `encode16BitGrayscalePNG`; the quantisation `(v·65535 + 0.5) \| 0` and the ranges of `heightmapColor`/`landHeightmapColor`) | `cc2662b` | GPL-3.0 | `packages/projection/src/png.test.ts`: orogen's encoder evaluated from `upstream/` unmodified gives the same signature, IHDR and IEND bytes and identical scanlines after inflate; decoded exports equal the quantised sampler raster for the absolute, land-only and custom mappings; golden hashes of three exports; strict probe keys `fd.projection.20000.*` in Node, Chromium, Firefox and WebKit. Phase 5 M2 port; changes: fflate `zlibSync` instead of `CompressionStream` (identical bytes on every engine), tEXt chunks recording mapping, range and projection, outside pixels grey 0 in colour type 0 by default (recorded as text), or alpha 0 in colour type 4 (grey + alpha) on request, mapping applied to the sampled metres rather than per vertex |
| `packages/core/src/rng/orogen-lcg.ts` | orogen | `js/rng.js` | `cc2662b` | GPL-3.0 | `rng/rng.test.ts`: 10⁶ draws equal upstream `makeRng` for four seeds |
| `packages/core/src/rng/alea.ts` | alea (npm, the package Azgaar depends on) | `alea.js` | `1.0.1` | MIT | `rng/rng.test.ts`: 10⁵ draws and exported state equal the npm package |
| `packages/core/src/rng/counter.ts` | Azgaars-Fantasy-Map-Generator | `src/generators/coastline-generator.ts` (`noise()`) | `3d94b80` | MIT | `rng/rng.test.ts`: equals the upstream function body (extracted from the source text) for 20,000 keys |

| `packages/gen-orogen/src/port/rng.ts` | orogen | `js/rng.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/foundation.test.ts`: bit-identical to the vendored JS in dmath native mode. Phase 4b M2 port; changes: types only |
| `packages/gen-orogen/src/port/simplex-noise.ts` | orogen | `js/simplex-noise.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/foundation.test.ts`: bit-identical to the vendored JS in dmath native mode. Phase 4b M2 port; changes: types only |
| `packages/gen-orogen/src/port/sphere-mesh.ts` | orogen | `js/sphere-mesh.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/foundation.test.ts`: bit-identical to the vendored JS in dmath native mode (5k, 20k). Phase 4b M2 port; changes: Math.asin/sin/cos → dmath, Delaunator imported, `adjTriList` alias added |
| `packages/gen-orogen/src/port/climate-util.ts` | orogen | `js/climate-util.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/foundation.test.ts`: bit-identical to the vendored JS in dmath native mode. Phase 4b M2 port; changes: Math.log/exp → dmath |
| `packages/gen-orogen/src/port/color-map.ts` | orogen | `js/color-map.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/foundation.test.ts`: bit-identical to the vendored JS in dmath native mode. Phase 4b M2 port; changes: types only |
| `packages/gen-orogen/src/port/plate-physics.ts` | orogen | `js/plate-physics.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/plate-physics.test.ts`: bit-identical to the vendored JS in dmath native mode, full tectonics chain (coarse physics, super-plates, hi-res physics, debug expansion) at seeds 12345/777 N = 20k, 200k, plus P = 10/200 and degenerate worlds. Phase 4b M2 port; changes: Math.pow/acos/cos/sin → dmath, types, two unused imports dropped |
| `packages/gen-orogen/src/port/super-plates.ts` | orogen | `js/super-plates.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/plate-physics.test.ts` (as above, plus the plateVec fallback paths). Phase 4b M2 port; changes: types only |
| `packages/gen-orogen/src/port/plates.ts` | orogen | `js/plates.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/tectonic-post.test.ts`: bit-identical to the vendored JS in dmath native mode (generatePlates at three P/seed settings; smoothAndReconnectPlates after projection to 20k and 200k). Phase 4b M2 port; changes: Math.cos/sin → dmath, boolean sums via Number(), types |
| `packages/gen-orogen/src/port/ocean-land.ts` | orogen | `js/ocean-land.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/tectonic-post.test.ts`: bit-identical in native mode at five continent/variety/coverage settings. Phase 4b M2 port; changes: Math.exp → dmath, types |
| `packages/gen-orogen/src/port/coarse-plates.ts` | orogen | `js/coarse-plates.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/tectonic-post.test.ts`: generateCoarsePlates and projectCoarsePlates (20k, 200k) bit-identical in native mode, seeds 12345 and 777. Phase 4b M2 port; changes: types only |
| `packages/gen-orogen/src/port/terrain-post.ts` | orogen | `js/terrain-post.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/tectonic-post.test.ts`: every export at several settings, and the runPostProcessing sequence at 20k (two seeds) and 200k, bit-identical in native mode. Phase 4b M2 port; changes: Math.asin/pow → dmath, one unused import dropped, types |
| `packages/gen-orogen/src/port/elevation.ts` | orogen | `js/elevation.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/elevation.test.ts`: assignElevation end to end (every array, Set and debug layer) bit-identical to the vendored JS in dmath native mode at seeds 12345/777 N = 20k and 12345 at 200k, with and without super plates and mantle field; every exported helper directly. Phase 4b M2 port; changes: 61 transcendentals → dmath, two `** 2` → multiplication, console.log diagnostics and their counters dropped, three unread `noise.fbm` samples in buildSkeleton dropped (pure calls), unused imports/names removed, types |
| `packages/gen-orogen/src/port/wind.ts` | orogen | `js/wind.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/wind-ocean-koppen.test.ts`: computeWind (two tilt/noise settings), computeGradients (Float32 and Float64 outputs), smoothstep, bit-identical to the vendored JS in dmath native mode at seeds 12345/777 N = 20k and 12345 at 200k; also checks V8 `q ** 2` = `q * q`. Phase 4b M2 port; changes: transcendentals → dmath, nine `** 2` → multiplication, dead locals removed, types |
| `packages/gen-orogen/src/port/ocean.ts` | orogen | `js/ocean.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/wind-ocean-koppen.test.ts`: computeOceanCurrents with and without `r_lon`, bit-identical to the vendored JS in dmath native mode at seeds 12345/777 N = 20k and 12345 at 200k. Phase 4b M2 port; changes: transcendentals → dmath, console.log dropped, unused destructured fields dropped, types |
| `packages/gen-orogen/src/port/koppen.ts` | orogen | `js/koppen.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/wind-ocean-koppen.test.ts`: classifyKoppen with and without `r_westness`, and KOPPEN_CLASSES, bit-identical to the vendored JS in dmath native mode at seeds 12345/777 N = 20k and 12345 at 200k. Phase 4b M2 port; changes: unread `tempSubBand` dropped, types |
| `packages/gen-orogen/src/port/temperature.ts` | orogen | `js/temperature.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/temperature-precip.test.ts`: computeTemperature with stage, non-default and fallback inputs and climate switches off, bit-identical to the vendored JS in dmath native mode at seeds 12345/777 N = 20k and 12345 at 200k. Phase 4b M2 port; changes: Math.cos/pow → dmath, console.log blocks and their tally dropped, types |
| `packages/gen-orogen/src/port/precipitation.ts` | orogen | `js/precipitation.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/temperature-precip.test.ts`: computePrecipitation with stage, non-default and fallback inputs, bit-identical to the vendored JS in dmath native mode at seeds 12345/777 N = 20k and 12345 at 200k. Phase 4b M2 port; changes: Math.pow → dmath, console.log dropped, types |
| `packages/gen-orogen/src/port/heuristic-precip.ts` | orogen | `js/heuristic-precip.js` | `cc2662b` | GPL-3.0 | `gen-orogen/src/port/temperature-precip.test.ts`: computeHeuristicWindField and computeHeuristicPrecipitation, bit-identical to the vendored JS in dmath native mode at seeds 12345/777 N = 20k and 12345 at 200k. Phase 4b M2 port; changes: types only |
| `packages/gen-orogen/src/port/index.ts` | (facade) | — | — | — | `gen-orogen/src/port-parity.test.ts`: with `./vendor` replaced by these ports, the shell pipeline reproduces all 69 stock orogen arrays bit for bit (N = 20k seeds 12345/777, 200k). Original facade code; same exports as `src/vendor.ts` |

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
| `packages/core/src/multilevel/reference.ts` | Phase 4b, design note 14 §2. The L0 reference mesh is orogen's coarse mesh (`upstream/orogen/js/coarse-plates.js` @ cc2662b, GPL-3.0: `buildSphere(N_COARSE, COARSE_JITTER, makeRng(seed + 137))`), built through the extracted `SphereMesh` and `OrogenLcg`; no new code is copied. Test: `packages/gen-orogen/src/reference-mesh.test.ts` (byte-identical topology and f32 points to vendored `generateCoarsePlates`, seeds 12345 and 777). | GPL-3.0 (the construction it reproduces) |
| `packages/core/src/multilevel/operators.ts` | Phase 4b, design note 14 §3.4–3.5. Restriction, barycentric prolongation and correction after the multigrid transfer operators of Briggs, Henson & McCormick, *A Multigrid Tutorial* (SIAM 2000); anchoring after spectral nudging (von Storch, Langenberg & Feser 2000). The correction (guarded R∘P iterations plus per-cell bumps vanishing on Voronoi edges) and the per-cell exponential bump of the multiplicative anchor are original. Test: `packages/core/src/multilevel/multilevel.test.ts` (R∘C = I, zero-mean detail, P on constants and linear functions, mass conservation, anchoring, bump shape, determinism; N = 5k, 50k, 200k). | n/a |
| `packages/core/src/hydro/priority-flood.ts` | Priority-flood depression routing (Barnes, Lehman & Mulla 2014), ported from this project's `tools/tuning/ab/sphere.mjs` `basins`/`MinHeap` (Phase 1 spike code, original to MapMaker); adds receivers, drainage area and major basins with a divide band. Test: `packages/core/src/hydro/priority-flood.test.ts` (outlets identical to the spike `basins` at 5k and 40k; receiver, order and area invariants). | n/a |
| `packages/core/src/mesh/spatial-index.ts` | Cube-map buckets plus a greedy Delaunay-graph walk (standard technique). Tested against brute force. | n/a |
| `tools/tuning/ab/sphere.mjs` | Moved unchanged from `spikes/lib/sphere.mjs` (Phase 1 spike code, original to this project): CSR adjacency, dual areas, Delaunay-walk locator, 1° grid sampling, point sets, priority-flood basins. Phase 4a: the locator walk now fixes each pass's neighbour range (re-reading it after a move swept unrelated cells); identical results on 600k real queries, ~20x faster; spike 1c test still exact. | n/a |
| `tools/tuning/ab/ab.mjs` | Ported from `spikes/1c/ab.mjs` (original to this project) to run on the shell pipeline. Adds the three Checkpoint 2 metrics (hypsometry KS on native preview land cells, river-mouth distance for the top-10 basins; Köppen on the 1° grid was already measured). Test: `tools/tuning/ab/ab.test.ts` reproduces spike 1c's committed numbers exactly. River-mouth distance uses `greatCircleKm` (atan2 of cross and dot products; Phase 4a fix for the acos-on-Float32 error of ~0.8 km at zero separation), tested on golden angles and a run compared with itself. | n/a |
| `packages/projection/src/distortion.ts` | Phase 5 M1, ARCHITECTURE §3.7. Tissot-indicatrix quantities (areal scale, maximum angular deformation, h, k) from the Jacobian, after Snyder, *Map Projections: A Working Manual* (USGS PP 1395, 1987), §4. Jacobian by five-point central differences of d3's raw projections in the geographic east/north frame; singular values in closed form from the conformal and anticonformal parts of the 2×2 Jacobian (standard); pole limits by extrapolation with estimated order (Aitken's Δ² process). Tests: `packages/projection/src/distortion.test.ts` (closed forms for equirectangular, Mercator, transverse Mercator, sinusoidal, orthographic, stereographic, azimuthal equal-area and equidistant, gnomonic; equal-area and conformal sets; pole rules at ±90° for every projection; the extrapolation on L + C·δ^p). | n/a |
| `packages/core/src/mesh/locate.ts` | Phase 5 M2: the containing-Delaunay-triangle search (most interior triangle at the nearest site, then a visibility walk) and gnomonic barycentric weights, moved unchanged out of `MultiLevel.buildInterpolation` (Phase 4b) so prolongation and the projection sampler share it. Tests: `packages/projection/src/sampler.test.ts` (cells and weights bit-identical to `MultiLevel.interpCells`/`interpWeights`); the unchanged probe keys `structured.*` and the nine-world hash comparison (200k, 1M, 2.56M × seeds 1, 777, 12345). | n/a |
| `packages/projection/src/sampler.ts`, `exact/kernels.ts` | Phase 5 M2, ARCHITECTURE §3.7 raster path: the exact CPU inverse sampler (invert, domain check, canonical unit vector, nearest cell, containing triangle, barycentric or nearest rule), row-band tiling and the engine-worker kernels (`worldKernel` op). Tests: `sampler.test.ts` (brute-force nearest cell and containing triangle, bit-identical under any row tiling, pole-centred pixels, antimeridian), `exact/kernels.test.ts` (worker results equal the direct path), `world-guard.test.ts` (World hash unchanged by every projection's view, sampling, export and distortion). | n/a |
| `packages/projection/alias/d3-dmath.mjs`, `alias/register.mjs`, `src/exact/geo-math.ts`, `src/exact/projection-math.ts`, `src/exact/index.ts` | Phase 5 M2 (decision 2): a module-resolution alias that builds a second copy of d3-geo 3.1.1 and d3-geo-projection 4.0.0 for the exact path, reading their files unmodified and replacing only their `src/math.js` with shims that route transcendental functions through dmath (Vite/Vitest plugin and Node loader hooks). The shims restate d3's `math.js` definitions (ISC). Test: `src/exact/exact.test.ts` (shim exports and constants equal d3's, functions within 1 ULP; the copy calls dmath and stock d3 does not; bit-identical to stock d3 in dmath native mode; within 8 ULP forward and 32 ULP inverse of stock d3 in fdlibm mode, 128 for Hammer's inverse). | n/a |
| `packages/projection/src/registry.ts`, `view.ts`, `d3-geo-projection.d.ts` | Phase 5 M1: projection registry with pole classes and the scale factors that make d3's stereographic and Robinson raws true to their published definitions; `ProjectionView` (d3 projection fitted to an output size, inverse with the §3.7 domain check). Wrappers around d3-geo and d3-geo-projection, which are used unmodified. Test: `packages/projection/src/view.test.ts`. | n/a |
| `packages/gen-orogen/src/**` (except `orchestration.ts`) | The orogen adapter (F1–F4): layer descriptors, per-world scratch, the six stages, the stock-shape view and the stock oracle runner. Defined as new work by ARCHITECTURE §3.6. | n/a |
| `packages/core/src/**` (everything else), `packages/engine/src/**`, `tools/**`, `apps/web/src/**` | Shell infrastructure defined as new work by ARCHITECTURE §3–§6: frame, units, `dmath`, layer registry, entity tables, timeline, event log, `World`, save format, stage runner, worker protocol, probe, provenance checker. | n/a |

## Runtime dependencies

| Package | Version | License | Purpose |
|---|---|---|---|
| delaunator | 5.0.1 | ISC | Spherical Delaunay through stereographic projection (same version orogen loads) |
| fflate | 0.8.2 | MIT | ZIP container for `.mapmaker`; zlib for the 16-bit PNG export (`packages/projection`, Phase 5, same pinned version) |
| three | 0.160.0 | MIT | Globe rendering (WebGL2). Same version orogen loads |
| pngjs | 7.0.0 | MIT | PNG decode for the Earth heightmap in the tuning harness (`tools/tuning`) |
| d3-geo | 3.1.1 | ISC | Phase 5: the projection set, `invert`, rotation, `geoPath` (`packages/projection`). The only projection source (reconciliation group 6a flag 1). Brings d3-array 3.2.4 (ISC) and internmap 2.0.3 (ISC) |
| d3-geo-projection | 4.0.0 | ISC | Phase 5: Mollweide, Robinson, Winkel tripel, Eckert IV, sinusoidal, Hammer (`packages/projection`). Brings commander 7.2.0 (MIT), used only by its command-line tools, which MapMaker does not run |

## Development dependencies (Phase 3)

| Package | Version | License | Purpose |
|---|---|---|---|
| @eslint/js | 9.36.0 | MIT | Lint |
| eslint | 9.36.0 | MIT | Lint, including the `Math.random` and `dmath` bans |
| typescript-eslint | 8.44.1 | MIT | Lint |
| typescript | 5.9.2 | Apache-2.0 | Strict type checking |
| @types/three | 0.160.0 | MIT | Types for three |
| vite | 7.1.7 | MIT | Web build |
| vitest | 3.2.4 | MIT | Unit tests |
| @playwright/test | 1.55.1 | Apache-2.0 | Cross-engine tests (Chromium 140, Firefox 141, WebKit 26) |
| esbuild | 0.25.10 | MIT | Worker bundling in tests |
| tsx | 4.20.6 | MIT | Runs the Node probe and provenance checker |
| @types/node | 24.5.2 | MIT | Types |
| @types/delaunator | 5.0.3 | MIT | Types |
| alea | 1.0.1 | MIT | Reference implementation for the Alea parity test |
| coi-serviceworker | 0.1.7 | MIT | Source of the copied COOP/COEP shim |
| @types/d3-geo | 3.1.1 | MIT | Types for d3-geo (Phase 5). d3-geo-projection has no types package; `packages/projection/src/d3-geo-projection.d.ts` declares the parts used |
| @types/geojson | 7946.0.16 | MIT | GeoJSON types used by @types/d3-geo (Phase 5) |

## CI deployment tools (not npm dependencies)

| Tool | Version | License | Purpose |
|---|---|---|---|
| cloudflare/wrangler-action | v3 | MIT OR Apache-2.0 | GitHub Action that deploys `apps/web/dist` to Cloudflare Pages (`.github/workflows/cloudflare.yml`) |
| wrangler | 4.143.0 | MIT OR Apache-2.0 | Cloudflare CLI, run by the action and by `npx` in the same workflow; never bundled |

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
