# Provenance

Started in Phase 1. It is expanded in Phase 3, which adds module-level provenance for vendored code and a script that checks every vendored file against `upstream-manifest.json`.

## Calibration data (Q8)

Datasets are downloaded at tuning time into gitignored folders and are never committed.

| Dataset | Source URL | Retrieved | SHA-256 (archive) | License / terms | Used by |
|---|---|---|---|---|---|
| Köppen-Geiger climate classification, 0.5°, 1951–2000 (`Koeppen-Geiger-ASCII.txt`, version June 2006) | https://koeppen-geiger.vu-wien.ac.at/data/Koeppen-Geiger-ASCII.zip | 2026-10-03 | `4b85ca339b9aba4c6507ed0db9efad99334d56bd7010f417672a0c977b4b2f75` | No explicit license on the distribution site. The site asks for this citation: Kottek, M., J. Grieser, C. Beck, B. Rudolf, and F. Rubel, 2006: *World Map of the Köppen-Geiger climate classification updated*. Meteorol. Z., 15, 259–263. DOI 10.1127/0941-2948/2006/0130. Used for local scoring only and never redistributed. A formal license check is still needed before any redistribution†. | orogen `tuning/climate/` (spike 1a), extracted to `spikes/_work/orogen/tuning/climate/data/ascii/` |

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
