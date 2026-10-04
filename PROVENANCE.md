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
| `packages/core/src/rng/orogen-lcg.ts` | orogen | `js/rng.js` | `cc2662b` | GPL-3.0 | `rng/rng.test.ts`: 10⁶ draws equal upstream `makeRng` for four seeds |
| `packages/core/src/rng/alea.ts` | alea (npm, the package Azgaar depends on) | `alea.js` | `1.0.1` | MIT | `rng/rng.test.ts`: 10⁵ draws and exported state equal the npm package |
| `packages/core/src/rng/counter.ts` | Azgaars-Fantasy-Map-Generator | `src/generators/coastline-generator.ts` (`noise()`) | `3d94b80` | MIT | `rng/rng.test.ts`: equals the upstream function body (extracted from the source text) for 20,000 keys |

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
| `packages/core/src/mesh/spatial-index.ts` | Cube-map buckets plus a greedy Delaunay-graph walk (standard technique). Tested against brute force. | n/a |
| `packages/core/src/**` (everything else), `packages/engine/src/**`, `tools/**`, `apps/web/src/**` | Shell infrastructure defined as new work by ARCHITECTURE §3–§6: frame, units, `dmath`, layer registry, entity tables, timeline, event log, `World`, save format, stage runner, worker protocol, probe, provenance checker. | n/a |

## Runtime dependencies

| Package | Version | License | Purpose |
|---|---|---|---|
| delaunator | 5.0.1 | ISC | Spherical Delaunay through stereographic projection (same version orogen loads) |
| fflate | 0.8.2 | MIT | ZIP container for `.mapmaker` |

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
