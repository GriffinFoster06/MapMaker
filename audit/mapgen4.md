# Audit: mapgen4

Audit scope: Phase 5c (Cartography v1: painterly/relief terrain rendering, hillshade/relief shading, coastlines, rivers, labels). Added 2026-10-19. Documentation only; nothing was extracted. Every claim cites a file and line in `upstream/mapgen4/` at the commit below. Dependencies are not installed in the checkout (no `node_modules/`), so their licences are listed from `package.json` names only and flagged unverified.

## 1. Overview

**mapgen4** (Red Blob Games, Amit Patel) is a small browser map generator whose declared goals are to "run fast enough to regenerate in real time as you paint terrain" and "look pretty instead of generating realistic terrain" (`README.org:7-8`). It is a single-author project, flagged unmaintained by the README badge (`README.org:5`).

- Remote: `https://github.com/redblobgames/mapgen4`, default branch `main`, HEAD `c1d8cb018a11a8b9e17d59233c36c176429d37eb` (committed 2026-03-29, 165 commits).
- Size: 2,227 lines in the top-level `*.ts`/`*.js`/`README.org` files (`render.ts` 758, `mapgen4.ts` 225, `map.ts` 385, `painting.ts` 267, `geometry.ts` 147). The vendored-by-subrepo `dual-mesh/` adds the mesh data structure (`dual-mesh/.gitrepo`, own `LICENSE`).
- There are no tests outside `dual-mesh/tests.js`; no golden values exist for the generator or the renderer.
- It is a **planar, non-geographic** generator: a 1000 x 1000 square of arbitrary units with no latitude, longitude, projection or metres.

## 2. Language, runtime, dependencies, build

- **Languages:** TypeScript (`*.ts`, imported with `.ts` extensions), plus GLSL ES 3.00 shaders embedded as template strings in `render.ts:237-448`.
- **Build:** `build.sh` + esbuild (`README.org:15-26`); `pnpm-lock.yaml` present. Points are precomputed at build time into `build/points-5.5.data` (`generate-points-file.ts`, `serialize-points.ts`) and fetched at run time (`mesh.ts:18`). The live path `choosePoints(...)` is commented out (`mesh.ts:13`, `mesh.ts:21`).
- **Dependencies (`package.json`):** `@redblobgames/prng`, `delaunator ^5`, `fast-2d-poisson-disk-sampling ^1`, `flatqueue ^2`, `gl-matrix ^3`, `simplex-noise ^4`. Not installed here, so their licences are unverified (believed permissive: MIT/ISC).
- **Runtime:** browser. The generator half is already a Web Worker (`worker.ts:15`, `worker.ts:79`, no DOM use). The renderer half requires `WebGL2` plus `EXT_color_buffer_float` and shows `alert()` if missing (`render.ts:50`, `render.ts:53-54`), reads `document.getElementById('mapgen4')` (`render.ts:494`) and uses `requestAnimationFrame` (`render.ts:690`). It cannot run in a worker or Node as written.
- **Build status:** not built or run during this audit (documentation-only task).

## 3. Subsystem inventory

### 3.1 Mesh and point generation
- **Where:** `generate-points.ts:39-72` (`choosePoints`), `mesh.ts:17-63` (`makeMesh`), `dual-mesh/create.ts`, `dual-mesh/index.ts`.
- **What it does:** Poisson-disc sampling (`fast-2d-poisson-disk-sampling`) in 1000 x 1000 (`generate-points.ts:43`); mountain peak points first at spacing 35, then the remaining points at spacing 5.5 (`config.js:12-13`, `generate-points.ts:48-64`); Delaunay via `Delaunator.from` (`mesh.ts:25`) with a "ghost" boundary structure.
- **Determinism:** seeded by `makeRandFloat(seed)` from `@redblobgames/prng` (`generate-points.ts:51`, `:62`). The shipped path loads a prebuilt points file rather than sampling at run time, so the mesh is a build artefact.
- **Rating: 3/5** for our needs (good for a planar painterly map; irrelevant to a sphere).
- **Extractability:** reference only. Our mesh is spherical.

### 3.2 Terrain shaping (elevation)
- **Where:** `map.ts:40-55` (mountain distance field by BFS with jitter), `map.ts:60-80` (precomputed simplex noise at 6 octaves), `map.ts:118-199` (`assignTriangleElevation`), `map.ts:201-220` (`assignRegionElevation`), `painting.ts` (128 x 128 painted constraint map, `painting.ts:18`, `:30`).
- **What it does:** a painted or noise "constraint" map is bilinearly sampled (`map.ts:132-153`), noisy coastlines are added (`map.ts:159`), then land is blended between low-amplitude hills and worley-like mountain peaks, weighted by `e*e` (`map.ts:184-190`). Ocean depth gets noise (`map.ts:193`). Elevation is clamped to [-1, +1] (`map.ts:195-196`).
- **Units:** dimensionless, -1..0 water, 0..+1 land (`painting.ts:30`, `colormap.ts:7`). No metres.
- **Rating: 3/5** for terrain, but it is a look-first generator. Out of scope for 5c except as a statement of what its renderer expects as input.
- **Extractability:** reference only.

### 3.3 Hydrology (flow, rivers geometry)
- **Where:** `map.ts:309-346` (`assignDownslope`), `map.ts:349-360` (`assignMoisture`), `map.ts:363-385` (`assignFlow`), `geometry.ts:96-145` (`setRiverGeometry`), rainfall `map.ts:242-290`.
- **What it does:** a priority-queue flood from deep ocean upward gives a downslope edge per triangle (`map.ts:316-345`); flow accumulates leaves-to-root over that order (`map.ts:373-383`) with flow proportional to rainfall squared (`map.ts:368`); trunks are lowered to the tributary elevation so rivers never run uphill (`map.ts:380-382`). River width is `sqrt(flow - MIN_FLOW) * spacing * RIVER_WIDTH` divided by edge length (`geometry.ts:102-106`). Each river segment is emitted as one or two triangles carrying a width at each end (`geometry.ts:118-141`).
- **Geometry character:** rivers are drawn along the mesh dual edges. There is no vector polyline, no meandering and no smoothing step. The shader draws a width-modulated band inside each triangle (`render.ts:250-271`); the author's own comment records that widths are inconsistent between adjacent triangles and that anti-aliasing is not pixel-accurate (`render.ts:261-266`).
- **Valley carving (notable):** coastal and river edges are folded as valleys and others as ridges (`geometry.ts:69-79`), and mountains get `mountain_folds` valleys (`geometry.ts:48`). The land pass lowers terrain near rivers (`render.ts:297-303`) and the drape pass lowers elevation again around rivers (`render.ts:383-386`).
- **Determinism:** CPU, typed arrays, no randomness in this stage. `Math.exp` is used for `MIN_FLOW` and `RIVER_WIDTH` (`geometry.ts:97-98`).
- **Rating: 2/5** as a cartographic river drawer (triangle-edge bands, no path); **3/5** as flow accumulation.
- **Extractability:** reference only; the river rasteriser is tied to the mesh and WebGL.

### 3.4 Relief shading (hillshade)
- **Where:** `render.ts:348-429` (`frag_drape`), `render.ts:641-665` (`drawDrape`), params at `mapgen4.ts:51-63`.
- **What it does:** reads a 2048 x 2048 R16F elevation texture (`render.ts:453`, `:529`), takes a 4-neighbour finite difference (`render.ts:373-377`) and builds a normal `normalize(zS-zN, zE-zW, overhead * texel)` (`render.ts:378`). The light vector is `normalize(light_angle, mix(slope, flat, normal.z))` (`render.ts:379`), so flat terrain is lit with a different elevation angle than steep terrain; this is a deliberate non-physical art control. Final `light = ambient + max(0, dot(L, N))` (`render.ts:380`). Single light, azimuth `light_angle_deg` (default 80, `mapgen4.ts:51`) plus the view rotation (`render.ts:642`).
- **Comparison to QGIS hillshade:** QGIS (current pick, `audit/CAPABILITY_MATRIX.md` Cartography row, `core/raster/qgshillshaderenderer.cpp`) is the physically defined Horn-style shading with altitude, azimuth, z-factor and a multi-directional mode. mapgen4's version is simpler (one azimuth, unit-less z scaling via `overhead`, no altitude angle) and runs on a normalised -1..+1 unit-less height, so it is not metric-correct. It adds the `slope`/`flat` blend, which is a useful artistic lever QGIS does not expose.
- **Determinism:** GPU float math in a fragment shader (R16F half-float textures). Not bit-reproducible across GPU or driver, so unsuitable for golden hashes.
- **Rating: 3/5** (pretty, controllable, not physical).
- **Extractability:** the maths is 6 lines and trivially re-implemented on the CPU. No code needed from here.

### 3.5 Outlines, coast edge and relief "ink"
- **Where:** `render.ts:307-325` (depth pass), `render.ts:406-426` (outline and coast logic in `frag_drape`), params `outline_depth/strength/threshold/coast/water` (`mapgen4.ts:59-63`).
- **What it does:** renders terrain height into a depth FBO (`render.ts:319-325`, `:530`), then in the drape shader compares the depth at six offset taps above and below the pixel (`render.ts:406-412`) and darkens where a nearer/higher surface sits next to a farther one (`render.ts:413`, the classic screen-space silhouette trick). A separate branch strengthens the line at the coast, but only where no river is within the tap radius (`render.ts:416-426`). Output is `colour * light / outline` (`render.ts:428`).
- **Effect:** ink-like ridgelines and a coast line that scale with the oblique view (`render.ts:651` multiplies the tap offset by `zoom`).
- **Determinism:** same GPU caveat as 3.4. It is also a raster effect, so it does not yield an SVG/vector coastline.
- **Comparison to Azgaar coastline (`generators/coastline-generator.ts`, `renderers/coastal-waves.ts`):** Azgaar produces a seeded *vector* coastline (`fractalize`, Alea, per audit 3.28) with wave bands and SVG masks; mapgen4 produces a *raster* silhouette line. They solve different problems (editable, exportable vector coast versus a cheap depth-edge look).
- **Rating: 4/5** as a painterly raster effect; **not** a coastline generator.
- **Extractability:** reference only (idea of a depth-edge pass); would be reimplemented as a CPU pass over our own height raster.

### 3.6 Hypsometric/biome colour
- **Where:** `colormap.ts:7-58`; sampled at `render.ts:390`; neutral override `u_biome_colors` (`render.ts:364-365`, `:391-392`).
- **What it does:** builds a 64 x 64 lookup (`colormap.ts:8-9`) indexed by elevation (x) and moisture (y). Three fixed shallow-water bands at the sea-level columns (`colormap.ts:20-33`), a depth-darkening ocean (`colormap.ts:34-37`), and land that is a moisture-dependent tan/green blended toward white with elevation (`colormap.ts:38-47`, adapted from a "terrain-from-noise" article, `colormap.ts:38`).
- **Determinism:** pure CPU, no randomness; writes into `Uint8Array` (truncation on assignment, `colormap.ts:49-52`), so it is repeatable.
- **Rating: 3/5.** Simple and attractive; far less rich than a Köppen/biome-keyed palette.
- **Extractability:** loosely coupled; ~50 lines, trivially portable. It does not beat the orogen colour maps that the matrix lists as a secondary source for this row.

### 3.7 View and projection
- **Where:** `render.ts:699-717`, `render.ts:565-578`.
- **What it does:** an orthographic-plus-oblique hybrid projection (`render.ts:703-713`, with the matrix element at `[9] = 1` copying y into z) with tilt, rotate and zoom. Terrain is displaced vertically by `mountain_height` (`render.ts:716`). `screenToWorld` inverts it for picking (`render.ts:565-578`).
- **Relevance:** planar and map-unit only. It cannot render our sphere or a map projection; it is a reference for a "tilted painterly relief" view of a local patch.
- **Rating: 3/5. Extractability:** reference only.

### 3.8 Labels
- **None.** A search of `render.ts`, `mapgen4.ts` and the other top-level sources for label/text/font/placement finds only DOM slider labels (`mapgen4.ts:79-123`). mapgen4 provides no label placement, text rendering or collision handling.

### 3.9 Export
- **Where:** `render.ts:731-747`, `mapgen4.ts:132-144`.
- **What it does:** a PNG screenshot of the 2048 x 2048 canvas via `gl.readPixels`, row-flipped (`render.ts:731-743`) and downloaded as `mapgen4-<seed>.png` (`mapgen4.ts:140`). No SVG, no data export, no save format.

## 4. Internal data representation

- **Mesh:** `TriangleMesh` dual Delaunay/Voronoi half-edge structure (`dual-mesh/index.ts`), regions `r`, triangles `t`, sides `s`; `numSolidTriangles` excludes ghost elements (`geometry.ts:100`).
- **Fields:** `Float32Array`/`Int32Array` per triangle, region or side (`map.ts:104-115`): `elevation_t`, `elevation_r`, `rainfall_r`, `moisture_t`, `s_downslope_t`, `flow_t`, `flow_s`.
- **Coordinates and units:** planar x,y in [0, 1000] (`generate-points.ts:43`, `render.ts:501` scales by 1/500 into clip space); y is down. Elevation and humidity/rainfall are unit-less (-1..+1 and 0..1). Wind is an angle in the plane (`map.ts:248-249`). Distance units are mesh units; river width is scaled by `spacing` (`geometry.ts:104`). **No frame, latitude or metre unit exists**, so any use needs an explicit conversion from our canonical metres (+Z north frame) to a local patch.
- **RNG:** `@redblobgames/prng` `makeRandFloat(seed)` feeds `simplex-noise`'s `createNoise2D` (`map.ts:61`), the mountain BFS jitter (`map.ts:49`, `:227`) and Poisson sampling (`generate-points.ts:51`). No `Math.random` in the files read (a grep of the top-level `*.ts` found none).
- **Transcendentals:** `Math.exp` (`geometry.ts:97-98`), `Math.pow` (`map.ts:164`), `Math.cos`/`Math.sin` (`map.ts:248-249`), `Math.sqrt` (exact, `geometry.ts:48`, `:104`, `mesh.ts:44`). Under our rule these would go through `dmath`.
- **Sort stability:** `r_wind_order.sort(...)` with a numeric comparator (`map.ts:254`); ties are resolved by the ES2019 stable sort, so results repeat in conforming engines.
- **Resumability:** none. State is regenerated from parameters each time (`worker.ts:47-59`), which is deterministic given identical inputs but has no checkpoint.

## 5. License

**SPDX: Apache-2.0.**

- **File path:** `LICENSE` at the repo root; it is the stock Apache License 2.0 text (header lines 1-4), and the appendix boilerplate is left unfilled (`{yyyy} {name of copyright owner}`), so the copyright holder comes from per-file headers instead.
- **Per-file headers:** "Copyright 2018 Red Blob Games ... License: Apache v2.0" in `map.ts:3-5`, `colormap.ts:2-4`, `config.js:2-4`, `worker.ts:2-4`, `geometry.ts:2-4`; `render.ts:3-4` and `generate-points.ts:3-4` use "@license Apache-2.0".
- **Sub-component:** `dual-mesh/LICENSE` is also Apache-2.0, and `dual-mesh/package.json` declares `"license": "Apache-2.0"`.
- **Third-party dependencies:** not vendored in the tree; licences of the six packages are unverified (see section 2).
- **Practical notes:** Apache-2.0 is one-way compatible with GPL-3.0-only (our licence). An extraction must keep the copyright and NOTICE text and mark changes. `PROVENANCE.md` must record it. Under ARCHITECTURE.md Q12 the licence does not restrict use.

## 6. Capability coverage summary

Compared against the current pick in `audit/CAPABILITY_MATRIX.md` ("Cartography and map art" row: Azgaar relief/coastline/label-spread, QGIS hillshade + PAL).

| Capability | Present? | Rating | Extractability | Key files | Beats current pick? |
|---|---|---|---|---|---|
| Hillshade / relief shading | yes | 3/5 | loose (re-implement) | `render.ts:373-380` | **No.** QGIS `qgshillshaderenderer.cpp` is metric-correct (altitude, azimuth, z-factor, multi-directional). mapgen4 is single-azimuth, unit-less. Borrow only the `slope`/`flat` art blend (`render.ts:379`) as an optional lever. |
| Relief outline / silhouette "ink" | yes | 4/5 | reference | `render.ts:406-426` | **Complements.** Azgaar relief is icon placement (`relief-generator.ts`); mapgen4 gives a continuous screen-space ridge/coast line. No equivalent in QGIS/Azgaar. Worth reimplementing on the CPU over our own height raster as the painterly layer. |
| Mountain relief geometry (ridge/valley folding) | yes | 3/5 | reference | `geometry.ts:48`, `:69-79` | **Different style.** Mesh-fold relief is continuous and 3D-oblique; Azgaar icons are discrete. Not a replacement for icons; informs the painterly layer. |
| Coastline (vector) | no | n/a | n/a | (none; coast is a contour of the quad mesh, `map.ts:159`) | **No.** Azgaar `coastline-generator.ts` (seeded `fractalize`, SVG) remains the pick. mapgen4 offers only a raster coast line (`render.ts:416-426`). |
| Rivers (path/width) | partial | 2/5 | reference | `geometry.ts:96-145`, `render.ts:250-271` | **No.** Triangle-edge bands, no polyline, no meanders; author notes width artefacts (`render.ts:261-266`). Azgaar `river-generator.ts` (meander + path) stays. Borrow only the valley-carving idea (`render.ts:297-303`, `:383-386`). |
| Flow accumulation | yes | 3/5 | loose | `map.ts:309-385` | Not applicable to the 5c row (hydrology is Azgaar/Delft3D territory). Standard priority-flood plus leaf-to-root accumulation. |
| Hypsometric tint / palette | yes | 3/5 | loose | `colormap.ts:7-58` | **No.** Tiny elevation x moisture LUT; orogen colour maps/Köppen palette are richer. |
| Labels (placement/collision) | no | n/a | n/a | (none) | **No.** Nothing to compare; Azgaar `label-spread.ts` + QGIS PAL stay. |
| Oblique/tilted view | yes | 3/5 | reference | `render.ts:699-717` | N/A (planar). Not usable on a sphere; reference for a local-patch relief view. |
| PNG export | yes | 2/5 | n/a | `render.ts:731-747` | No. Screenshot only, GPU-dependent. |
| Determinism in a worker | partial | n/a | n/a | `worker.ts`, `map.ts` | Generator half: yes (typed arrays, seeded PRNG, no DOM). Renderer half: no (WebGL2 float textures, `document`, `rAF`). |

## 7. Verdict

### What to extract (nothing now; ideas to reimplement)
1. **Depth-edge outline pass (`render.ts:406-426`)** as a CPU image pass over a height raster, for the painterly ridge/coast line. Reimplemented from the idea, so no code is copied. Needs a golden test on a fixed raster.
2. **`slope`/`flat` light-elevation blend (`render.ts:379`)** as an optional shading control layered on the QGIS-style hillshade.
3. **River valley carving (`render.ts:297-303`, `:383-386`, `geometry.ts:69-79`)** as a reference for sinking the terrain under rivers before shading.

### What to skip
- The WebGL pipeline (framebuffers, float textures, `render.ts:46-231`, `:455-753`). It is GPU-dependent, main-thread bound and cannot give bit-identical output.
- Mesh and point generation, terrain shaping, rainfall, painting UI: planar, unit-less, not spherical.
- River geometry as a drawer, and the colormap.

### Biggest risks
1. **Frame and units:** a planar 1000 x 1000 unit-less world with no projection. Any reuse needs an explicit metres-to-unit conversion and a local tangent patch; it must never leak into the sphere-canonical layers.
2. **Determinism:** the visible look comes from GPU shaders (half-float R16F, `render.ts:529`, `:530`), which cannot be golden-hashed across GPUs. Only a CPU port is testable.
3. **`Math.*` in the generator** (`exp`, `pow`, `cos`, `sin`) would have to go through `dmath` if any of it is ported.
4. **No upstream tests or goldens** to check an extraction against; every port needs its own golden values.
5. **Dependencies unverified** (no `node_modules`): licence records for six packages would need confirming before any extraction.

### Open questions
1. Does the depth-edge look survive on a CPU pass at export resolutions (65k px), or does it need a resolution-dependent tap radius (`render.ts:651` ties it to zoom)?
2. Is the `slope`/`flat` blend worth the extra controls beside metric hillshade, or only a style preset?
3. Should painterly relief be a vector (SVG hachure, Azgaar `heightmap-hachures.ts`) or a raster layer? mapgen4 only supports the raster option.

### Summary
1. Commit `c1d8cb018a11a8b9e17d59233c36c176429d37eb`, branch `main`, `https://github.com/redblobgames/mapgen4`.
2. Licence Apache-2.0 (`LICENSE`, per-file headers; `dual-mesh/` also Apache-2.0); GPL-3.0-compatible, notices and change marks required.
3. Planar 1000 x 1000 unit-less map; elevation -1..+1; no lat/lon, no metres.
4. Generator (`worker.ts`, `map.ts`, `geometry.ts`) is DOM-free and seeded; uses `Math.exp/pow/cos/sin`, which need `dmath`.
5. Renderer is WebGL2-only, main-thread, GPU-float: not deterministic, not worker-ready.
6. Hillshade (`render.ts:373-380`): does not beat QGIS; only the `slope`/`flat` blend is worth borrowing.
7. Outline/silhouette pass (`render.ts:406-426`): no equivalent in Azgaar or QGIS; best idea here, reimplement on CPU.
8. Coastline and rivers: do not beat Azgaar (raster edge only; triangle-band rivers, no path).
9. Labels: none; Azgaar label-spread and QGIS PAL stay.
10. Verdict: reference only for 5c; no extraction; keep the matrix picks and add mapgen4 as the source for the relief-outline idea.
