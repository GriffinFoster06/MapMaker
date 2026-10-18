# Reconciliation, group 6a: Azgaar, QGIS, CesiumJS (Phases 5 and 5c)

2026-10-18. Documentation only: no code, `upstream/` or `packages/gen-orogen/vendor/` file was changed, and no dependency was touched.

**Scope:** only the claims that drive decisions for Phase 5 (projections) and Phase 5c (cartography v1): which file or function is the pick, whether it exists, what it does, whether it can run deterministically through `dmath` in a worker, frame and units, and licence.

**Status of this pass: findings recorded, edits to other files NOT yet made.** The session hit its usage limit after verification. The corrections below still have to be applied to `audit/Azgaars-Fantasy-Map-Generator.md`, `audit/QGIS.md`, `audit/CesiumJS.md`, `audit/CAPABILITY_MATRIX.md` and notes 18 and 19, followed by a grep of each edited audit for contradictions.

**Method:** as in groups 1–3. One subagent per repo (Sonnet) checked the claims. The coordinator then re-read the key facts in the source. The first reports had these errors:
- the CesiumJS report summed the three projection files to 344 lines (they are 314);
- the CesiumJS report said the slope/aspect convention was ambiguous; it is east-based (below);
- the Azgaar and QGIS reports had no errors in the facts re-checked.

**Verdicts:** **Confirmed**, **Changed**, **Dropped** and **New**, as in group 3. **Feasibility:** **dmath** (port to TS, deterministic in a worker), **Ref** (algorithm or design reference only), **n/a**.

| Repo | Commit | Licence (as found) | To record |
|---|---|---|---|
| Azgaar | `3d94b80` | MIT, `LICENSE:3` "Copyright 2017-2024 Max Haniyeu (Azgaar)". The root `LICENSE` is the only licence file. **No OGL content**: a grep for OGL or "open game" finds nothing. The bundled assets have no documented licence: 338 heraldry charges in `public/charges/`, relief `<symbol>`s in `src/index.html`, and the icons in `public/images/`. `docs/wiki/Policy.md:54` says they "carry their own licences" but names none. Vendored libraries in `public/libs/` mostly have no headers | Audit §5; note 19 (assets unverified) |
| QGIS | `901db8d` | `COPYING` is the GPL-2 text. Sampled QGIS headers are **GPL-2.0-or-later** (`qgshillshadefilter.cpp:9–13`). The **PAL files are GPL-3.0-or-later** (libpal, © 2008 Maxence Laurent, HEIG-VD; `src/core/pal/pal.cpp:1–20`). Both can go into GPL-3.0-only MapMaker; the audit's "must be GPL-2.0" is wrong. In `external/`, spatialindex is MIT since 1.8.0 (not LGPL-2.0), odbccpp is Apache-2.0 (not BSD-2), and there is no qhull | Manifest "GPL-2.0" (configuration, not edited); audit §5; matrix licence table |
| CesiumJS | `e1d443e` | Apache-2.0, **with a patent grant** (`LICENSE.md:75` §3; the audit's "no patent clause" is wrong). `LICENSE.md` is 890 lines: an appendix from line 209 lists 44 third-party entries, including NVIDIA FXAA (custom terms), Source Sans Pro (OFL 1.1) and CC-BY 3.0 icons in the examples. It also lists Cesium patents (`:205–207`). There is no NOTICE file; `ThirdParty.json` exists | Audit §5 |

No code is extracted from these repos for Phases 5 or 5c yet, so `PROVENANCE.md` needs no rows now.

## Azgaar

Frame: planar pixels (`options.map.graph.width/height`), heights 0–100 with sea level 20. The geographic box is a **linear** lat/lon mapping: `getLongitude` and `getLatitude` (`src/utils/commonUtils.ts:245`, `:257`). There is no inverse and no projection layer.

| # | Claim (our docs) | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| A1 | Projections: "Mercator, equirectangular, equal-area, equidistant; correct mathematics", "projection math ~100 LOC"; view-3d "flat orthographic projection" | audit §3.19, §3.20, §6 | **Dropped**. Only two `d3.geo*` users exist. `draw-coordinates.ts:25` uses `geoEquirectangular` for the graticule. `controllers/world-configurator.ts:8` uses `geoOrthographic` for a 200 px preview globe in the UI (the matrix line 16 misses this one). `view-3d-renderer.ts` (1,228 lines, not ~600) is a textured `SphereGeometry(1,64,64)` (`:997`) or a `PlaneGeometry` heightfield (`:740`, `:751`) | grep `geo[A-Z]…(` over `src/` | n/a. Phase 5 pick stays d3-geo (D1) |
| A2 | "renderers (`src/renderers/`: relief icons, coastline, rivers, labels, emblems)… extract the symbol placement and label logic" | note 18 §4 | **Changed**: the picks are in several places, and some are generators (rows below) | below | below |
| A3 | Relief icon placement | note 18 §4; audit §3.2 | **Changed**: `src/generators/relief-generator.ts` (210 lines), `ReliefModule.generate` with a Poisson-disc sampler (`:149–210`). It calls the global `Math.random` (`:28`, `:60`, `:64`, `:193`, `:197`, `:198`) and `ra()`. `draw-relief-icons.ts` (52 lines) only emits `<use>` | read | dmath, with an injected RNG keyed by cell (note 18 §3.2 requires cell-id seeding) |
| A4 | Coastline | note 18 §4 | **New detail**: shape is `src/generators/coastline-generator.ts` (289 lines; `fractalize` `:143`, seeded per feature by Alea `:73`). Effects are `coastal-waves.ts` (78 lines, local Alea `:27`), `heightmap-hachures.ts` (184), `lake-ripples.ts` and `draw-coastal-bands.ts` (SVG masks). The ocean pattern is a PNG | read | Shape, waves, hachures: dmath (pixel frame → sphere tangent plane). Bands: Ref |
| A5 | Rivers | note 18 §4 | **New detail**: `river-generator.ts:487–576` (`addMeandering`, `getRiverPath`) with `meander` (`utils/pathUtils.ts:424`), variable width from flux, Catmull-Rom. Uses `Math.sin/atan2` | read | dmath |
| A6 | Labels "placed by priority with collision avoidance; curved labels" | note 18 §3.3, §4 | **Changed**: **Azgaar has no label collision avoidance**; a grep of `renderers/labels/` and `labels-generator.ts` finds none, and only zoom bounds per group apply. State labels: ray-cast from the state's pole (`renderers/labels/fit-state-label.ts`, 184 lines; `label-raycast.ts`). Burg labels: a 3-point arc (`label-arc.ts`, 39 lines). Text width comes from the heuristic `estimateTextWidth`, with no font metrics | read | Path fitting: dmath. Collision: take PAL from QGIS instead (Q2) |
| A7 | Style presets | note 18 §4 | **Confirmed**: 14 JSON styles in `public/styles/` plus `generators/default-styles.json`, schema `styles-schema.ts` (334 lines). They are SVG-attribute-shaped | read | Ref (theme vocabulary) |
| A8 | Export SVG/PNG/JPEG/tiles/GeoJSON, `export.ts` ~900 | audit §3.24; matrix | **Confirmed** (909 lines). PNG rasterises the serialised SVG in a canvas; GeoJSON uses the linear lon/lat | read | Ref (DOM) |
| A9 | Emblem generator, relief, burg and marker icons | note 19 §4 | **Changed**: `generators/emblems-generator.ts` (503 lines; global `Math.random` via `P`/`rw`) outputs data. SVG is drawn by `renderers/emblems/renderer.ts`. The 338 charges have **no documented licence** | read | Generator: dmath with an injected RNG. Assets: licence unverified |
| A10 | Sizes "~122k LOC, 500 files, ~476 TS" | audit §1–2 | **Changed**: `src/` has 431 `.ts` files and 111,746 lines | `find`/`wc` | n/a |
| A11 | Hillshade | — | **New**: Azgaar's only shading is the WebGL satellite texture, `draw-satellite-texture.ts:352` (sun at (−0.55, −0.55, 0.85)). There is no 2D hillshade | read | Ref |

## QGIS

| # | Claim | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| Q1 | `src/analysis/raster/qgshillshadefilter.cpp` for hillshade | note 18 §4 | **Changed**: the pick is the renderer, `src/core/raster/qgshillshaderenderer.cpp` (655 lines). It uses Horn (1981) derivatives with nodata replaced by the centre (`:443–448`), the GDAL fast formula (`:452–454`), and a **multi-directional** USGS 4-azimuth weighting (`:458–492`). Units: altitude in degrees, zenith = 90 − alt (`:152`); azimuth clockwise from north, with the sign flipped for y-down (`:153`); cell size in map units (`:149–150`). The filter (76 lines) treats its `lightAngle` as a **zenith** angle (`:23–24`), which is inconsistent with the renderer | read | dmath (sqrt, sin, cos). Cell size in metres on the sphere (∝ cos φ in x) is new code |
| Q2 | "symbology and labelling engine… rule-based styles and the PAL label placement design" | note 18 §4; matrix line 401 | **Confirmed**, detail added. PAL is in `src/core/pal/` (10,857 lines). It generates candidates per feature, takes an initial FALP solution (`problem.cpp:150`), then runs **chain search**, the only method used (`pal.cpp:725`, `problem.cpp:535`); POPMUSIC and tabu are declared in `pal.h:66–75` but not implemented. The cost model is `costcalculator.cpp` (280 lines). Curved labels: `feature.cpp:1571` `curvedPlacementAtOffset`. No RNG. **GEOS is a hard dependency** (9 includes). Ties in `std::sort` are possible nondeterminism. Rule-based renderer (1,752 lines) and labelling (669) depend on Qt | read | PAL algorithm: dmath port with our own geometry and stable sorts. Rule-based: Ref (design) |
| Q3 | Projections "5/5", "extractable ~8k LOC", "directly reusable" | audit §3.1, §6, §7 | **Changed**: `src/core/proj/` (13,665 lines) contains no projection maths; it wraps PROJ, which is not in the checkout. `QgsCoordinateReferenceSystem::factors` (`qgscoordinatereferencesystem.cpp:1546`) only forwards `proj_factors` (scales, angular distortion, Tissot axes) | read | n/a. Its field names are a reference for the Phase 5 distortion output |
| Q4 | `src/analysis/raster/`: "lacks curvature", "extractable ~4.5k" | audit §3.2 | **Changed**: `qgstotalcurvaturefilter.cpp:30–45` exists (total curvature only). The pure kernels are each under 160 lines; the rest is GDAL I/O and the raster calculator | read | dmath (small) |
| Q5 | Sizes "~412k lines of C++" | audit §1–2 | **Changed**: `src/` has 3,162 `.cpp` and 3,264 `.h` files (counts correct) but 1,911,784 lines | `wc` | n/a |
| Q6 | Licence "GPL-2.0… MapMaker must be GPL-2.0"; external spatialindex LGPL, odbccpp BSD-2, qhull | audit §5 | **Changed** (licence table above) | read | n/a |

## CesiumJS

Frame: the ECEF unit normal is (cosφ cosλ, cosφ sinλ, sinφ) (`packages/core/Source/Ellipsoid.js:326–335`). That is **+Z north, +X (0°, 0°), +Y (0°, 90°E), identical to canonical**. Radians throughout. WGS84 radii (6378137, 6378137, 6356752.314…) are at `:763`, `UNIT_SPHERE` at `:772`; the audit's "~6.371M m" is wrong.

| # | Claim | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| K1 | `WebMercatorProjection`, `GeographicProjection`, ~500 LOC, standalone; "arbitrary ellipsoids" | audit §3.2, §6, §7; matrix row 21 | **Changed**: the three files are in `packages/core/Source/` and total 314 lines. WebMercator is **spherical** on `ellipsoid.maximumRadius` (`:27`), clamped at ≈85.0511°. Geographic is plate carrée, x = λa, y = φa. There are no other projections | read | Ref: golden values to cross-check d3 `geoMercator` and `geoEquirectangular` |
| K2 | "imagery layers and terrain shading on the globe" | note 18 §4 | **Changed**: the globe has Lambert lighting only, no hillshade (`Shaders/GlobeFS.glsl`). The usable closed forms are per-vertex slope and aspect (`GlobeVS.glsl:241–251`; aspect measured from east), the Slope, Aspect, ElevationContour and ElevationBand materials in `Shaders/Materials/`, and the imagery brightness, contrast, hue (YIQ), saturation and gamma (`GlobeFS.glsl:233–263`) | read | dmath or GPU (trivial). Hillshade comes from QGIS Q1 |
| K3 | Labels | note 18 | **New**: no declutter or collision code (grep of the `Label*` and `Billboard*` files). Glyphs are SDF via `bitmap-sdf` | grep | n/a |
| K4 | Geometry "~200k LOC"; RNG in ThirdParty | audit §3.5, §3.8 | **Changed**: 96 `*Geometry.js` files, 20,289 lines. RNG is the npm `mersenne-twister`, seedable through `CesiumMath.setRandomNumberSeed` (`Math.js:983`) | `wc`; read | n/a |
| K5 | `QuadtreePrimitive.js` LOD "and cross-fade" | note 6 refs | **Changed**: screen-space-error LOD (`maximumScreenSpaceError` = 2); **no imagery cross-fade** exists | read | Ref |
| K6 | Paths `Ellipsoid.js`, `Cartographic.js`, `Clock.js`, `JulianDate.js` | audit §3.1; note 36 | **Confirmed**, in `packages/core/Source/` | `ls` | Ref |
| K7 | Sizes 2,339 files, ~814k JS lines, 319 GLSL, v1.146.0, Node ≥ 22 | audit §1–2 | **Confirmed**; 349,714 of the JS lines are Specs | `wc` | n/a |

## Flags for Phase 5 and 5c (phase text not edited)

1. **Phase 5:** no `upstream/` repo supplies projection code. d3-geo (D1) remains the only source. QGIS and CesiumJS add only reference values (Q3, K1).
2. **Phase 5c labels:** "labels (with collision handling)" cannot come from Azgaar or CesiumJS. The only implementation is QGIS PAL (FALP plus chain search, GPL-3.0-or-later), which needs its GEOS geometry replaced and stable sorting to be deterministic. That is a larger port than note 18 §7 implies.
3. **Phase 5c hillshade:** use the QGIS renderer formula (Q1), including multi-directional. Cell size must come from sphere metres, not map units.
4. **Phase 5c symbols and coastlines:** Azgaar relief placement uses the global `Math.random`; it needs a cell-keyed RNG to satisfy note 18 §3.2. All Azgaar geometry is planar pixels and must run in a local tangent frame.
5. **Asset licences:** Azgaar's charges and icons have no documented licence. Before any are bundled (note 18 open question 1, note 19), they need a source.

## Remaining work

- Apply A1–A11, Q1–Q6 and K1–K7 to the three audits, to `audit/CAPABILITY_MATRIX.md` (line 16 also misses `geoOrthographic`; row 21 needs the CesiumJS path and line count; the licence table needs QGIS GPL-2.0-or-later and the PAL GPL-3.0-or-later) and to notes 18 §4 and 19 §4.
- Grep each edited audit for contradictions.
