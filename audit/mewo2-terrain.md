# Audit: mewo2-terrain

> **Scope (2026-10-19):** written for Phase 5c (Cartography v1) only. Every claim is from the single source file `upstream/mewo2-terrain/terrain.js` (1,073 lines) read in full, plus `README.md` and `LICENSE.md`. Line numbers are those of that file at commit `a2511d6`. Nothing was executed (the repo has no HTML, no CSS, no tests and no build; it cannot run on its own). No code was extracted.

## 1. Overview

**mewo2/terrain** is Martin O'Leary's fantasy-map generator, "the algorithm behind @unchartedatlas" (`README.md:3`). The repository holds three files: `terrain.js`, `README.md`, `LICENSE.md`. The author calls the project finished and will not maintain it or take pull requests (`README.md:15-20`). The history is 4 commits, ending 2016-08-15 (HEAD `a2511d6b673ae92f5983f3343365ba9326c03b63`, branch `master`).

It produces a planar, black-and-white, hand-drawn-style map in SVG: a coastline contour, rivers, territory borders, hachure-like slope strokes, city dots and city/region name labels. Its value to MapMaker is as a compact **style and heuristics reference** for Phase 5c, not as an engine: the labelling is a greedy four-position test, the shading is a stochastic stroke scatter, and nothing is geographic.

## 2. Language, runtime, dependencies, build

- **Language:** ES5-style JavaScript (`"use strict"`, `var`, no modules, all functions global; `terrain.js:1`).
- **Not self-contained.** It needs, per `README.md:9-11`: D3 v4.2.0 (`d3.voronoi`, `d3.scan`, `d3.quantile`, `d3.min/max/mean`, `d3.path`, `d3.interpolateViridis`, selections), Adam Hooper's `js-priority-queue` (`PriorityQueue` at `:555`), and the author's separate `naming-language` repo (`makeRandomLanguage`, `makeName` at `:861`, `:900`, `:964`). None is vendored here.
- **No build, no tests, no CSS, no HTML.** Stroke and fill styling for the classes `river`, `coast`, `border`, `slope`, `city`, `region` is not in the repo; it lived in a page that is not included (only the city dots carry inline style, `:800-806`).
- **Dead or stale code** (so a reader is not misled): `findSinks` returns nothing (`:282-299`); `getSlope` has an unreachable branch after `continue` (`:361-365`); `visualizeDownhill`, `visualizeContour`, `visualizeBorders` call `drawPaths`/`getBorders` with signatures that no longer match (`:712-726`, `:776-785`); `visualizePoints`, `visualizeVoronoi` are debug views.
- **Browser portability:** the computation functions are plain JS and would run in a worker; the drawing functions need an SVG DOM through D3 selections (`:717-726`, `:728-773`, `:788-808`, `:947-959`, `:1017-1029`). Treat the whole file as a reference to re-implement, not to run.

## 3. Subsystem inventory

### 3.1 Label placement (city/town and region labels)
- **Where:** `drawLabels`, `terrain.js:854-1031`.
- **City and town labels (`:863-946`).** For each city in placement order, four candidate boxes are built around the marker (right, left, above, below; `:904-941`), box width estimated as `0.65 * fontSize/1000 * text.length` (`:902`; no font measurement). Each candidate is scored by `penalty()` (`:863-896`) and the minimum is chosen (`:942`). Penalty terms: +100 for each map edge the box crosses beyond a 0.45 margin (`:865-868`); +100 per overlap with an already placed city label (`:869-876`); +100 per city marker inside the box (`:877-882`); +1 per vertex of the river, coast or border polylines inside the box (`:883-894`). This is greedy, one pass, first-placed-wins; there is no search, no backtracking and no refinement. The path-avoidance term counts polyline *vertices*, not segment crossings, so a long segment through the box with no vertex inside costs 0.
- **Region labels (`:961-1016`).** One per territory (the first `nterrs` cities). The label centre is chosen by scanning **every mesh vertex** (`:971`) with an additive score: distance to the land centroid of the territory (weight 3000, `:974`), distance to the whole-territory centroid (weight 1000, `:975`), -3000 if outside the territory (`:976`), -4000 / -500 for overlapping a territory-capital / town marker (`:977-982`), -5000 for overlapping a city label (`:983-988`), -20000 for overlapping an already placed region label (`:990-998`), -500 over water (`:999`), -50000 if the box leaves the map (`:1000-1003`). Cost is O(vertices x (cities + labels)) per region.
- **Limits.** Labels are horizontal axis-aligned boxes only: no rotation, no curved or path-following labels, no label for rivers, seas, mountains or lakes, no leader lines, no priority ordering beyond the placement order, no zoom-level logic. Text width is a constant-per-character guess. The font sizes are fixed parameters (`defaultParams.fontsizes`, `:1066-1071`). Label text comes from the external language generator.
- **Quality rating: 2/5** as a placement engine; **useful as a readable heuristic and as a style (small, mostly horizontal, text near the dot).**
- **Extractability: reference only.** The penalty weights are ad hoc to a 1x1 map with 1000x SVG scaling and would need re-tuning in map pixels; the logic is simple enough to re-derive and offers nothing the current picks lack (see section 6).

### 3.2 Coastline rendering
- **Where:** `contour` `:509-522`, `mergeSegments` `:613-661`, `relaxPath` `:663-672`, `cleanCoast` `:413-456`, drawing in `drawMap` `:1034`/`:1038`.
- **What it does.** The coast is the sea-level (height 0) isoline of the Voronoi-cell height field: every Voronoi edge whose two end heights straddle the level contributes a segment between the two adjacent triangle-circumcentre points (`:512-519`); edges near the map border are skipped (`:515`, `isnearedge` `:149-155`). `mergeSegments` joins segments into polylines by repeatedly scanning for a segment that touches an open path end (an O(n^2) loop, `:638-654`). `relaxPath` applies one 1-2-1 smoothing pass (weights 0.25/0.5/0.25, `:666-667`) to the interior points; it is applied to rivers and borders (`:545`, `:610`) but **not** to the coast in `drawMap` (`:1034` stores the raw `contour` output). `cleanCoast` (`:413-456`) removes one-cell spits and one-cell lakes before extraction for generation.
- **Not present:** no fractal detail, no coastal bands, waves or hatching, no lake treatment, no thickness variation. The look is the polyline of the Voronoi cells with whatever CSS the missing page applied.
- **Rating: 2/5. Extractability: trivial to re-derive; the `mergeSegments` idea (isoline from mesh edges) is generic.**

### 3.3 River rendering
- **Where:** `getRivers` `:524-546`, `getFlux` `:334-352`, `downhill` `:259-280`.
- **What it does.** Flux is area-accumulated downhill (`:334-352`; each vertex starts at 1/N and is summed to its steepest-descent neighbour in height-sorted order). A vertex is a river vertex if flux > `limit * (land fraction)` (`:532`, `:535`), `limit = 0.01` in `drawMap` (`:1033`). Each qualifying vertex links to its downhill neighbour (to the midpoint if that neighbour is under water, `:538-542`). Links are merged and given one `relaxPath` pass (`:545`). All rivers draw at the same stroke (class `river`, `:1037`); there is no width from discharge, no meanders, no tributary ordering, no river names.
- **Rating: 2/5.** **Extractability:** re-derive only.

### 3.4 Slope shading and contours (relief)
- **Where:** `visualizeSlopes`, `terrain.js:728-773`; `trislope` `:458-476`.
- **What it does.** There is **no hillshade and no contour-line map layer** (the only isoline code is the coast, 3.2). Relief is drawn as short strokes ("hachures"): for each land vertex (`:733`) it averages the facet gradients of its neighbours (`:738-742`; x-slope divided by 10), keeps the vertex only if `|s| >= runif(0.1, 0.4)` (`:745`, random per vertex), and draws a stroke of length `r*runif(1,2)*...` tilted by the slope (`:746`, `:759`), or up to 4 jittered strokes when steep (`:749-757`, jitter from `rnorm`). The direction is always "x-gradient only" (strokes lean one way regardless of aspect), so it is an art stylisation, not a lighting model.
- **Rating: 2/5 as shading; 3/5 as an art-style idea (sparse hand-drawn slope ticks).** **Extractability:** reference. Uses `Math.random` (`runif`, `rnorm`) and D3 DOM output.

### 3.5 City placement
- **Where:** `cityScore` `:478-492`, `placeCity` `:493-498`, `placeCities` `:500-507`.
- **What it does.** Greedy, one city at a time: score = sqrt(flux) (river/valley proximity) + two edge-proximity terms (`0.01 / (|x| - width/2)`; the sign makes values negative inside the map, i.e. a penalty near the border) - sum over placed cities of `0.02 / distance` (mutual repulsion, `:488`); water and near-edge vertices get -999999 (`:481-483`). The best vertex wins (`d3.scan(score, d3.descending)`, `:496`). Default 15 cities, of which the first 5 are "capitals" (`:1064-1065`). No coastal/harbour bonus, no biome, no elevation, no population, no names. First `nterrs` cities become territory seeds.
- **Rating: 2/5.** Compact, deterministic given the field. **Extractability:** reference.

### 3.6 Territories and borders (supporting)
- **Where:** `getTerritories` `:548-595`, `getBorders` `:597-611`.
- **What it does.** Multi-source Dijkstra from the capitals through the Voronoi graph with travel cost: `horiz * (1 + 0.25*(climb/horiz)^2 + 100*sqrt(flux))`, uphill damped by 10, a flat 1000 cost for crossing the coast and 100 on water (`:556-565`). Borders are Voronoi edges between differing owners on land (`:606-608`). This yields natural borders along rivers, ridges and coasts. Out of scope for 5c unless region labels need territories, but it is the best-explained cost model in the file.

### 3.7 Style
- **What is defined in the code:** fixed font sizes (region 40, city 25, town 20, `:1066-1071`), city dots `r = 10` for capitals and `4` for towns, white fill, black 5-unit round stroke (`:802-806`), SVG viewBox of 1000 units per extent unit, Y axis down (`:1051-1054`). Everything else (line widths, fills, fonts, colours) is **not in the repo**. Palette code is limited to a Viridis debug view (`:709`).
- **Look:** monochrome pen-and-ink, sparse and uncluttered. A usable inspiration for a "hand-drawn atlas" preset; not a style system (no stylesheet, no layering rules, no presets).

### 3.8 Terrain generation (not relevant to 5c, noted for completeness)
`generateCoast` (`:822-838`): random tilt + cone + 50 Gaussian bumps, 10 relaxations, `peaky`, stream-power-like erosion (`erosionRate`, `:370-382`), quantile sea level, `fillSinks` (`:301-332`, epsilon-fill that iterates to a fixed point). It is a toy relative to orogen; ignored.

## 4. Internal data representation

- **Mesh:** `makeMesh` (`:85-136`) builds a planar Voronoi mesh from `d3.voronoi()` clipped to a rectangle (`:78-83`). Points are generated with one Lloyd-relaxation step (`:69-76`). Fields are arrays of per-**Voronoi-vertex** values with the mesh attached as `.mesh`; "vertices" are Voronoi vertices (triangle circumcentres), the dual of the usual cell-based layout, and rivers/coast live on their graph (`adj`, `edges`).
- **Frame and units:** planar and unitless. Extent defaults to width 1, height 1 centred on the origin (`:34-37`, `:80-82`); Y increases downward in the SVG (`:1051-1054`, viewBox scaled x1000). Height is normalised to [0,1] by `peaky` (`:214-216`) then shifted so the chosen quantile is zero (`setSeaLevel`, `:404-411`): sea level is 0 by construction, there are no metres, no latitude/longitude, no projection and no concept of scale.
- **Output:** SVG elements created by D3; no data export; no save/resume.

## 5. License

- **File path:** `LICENSE.md` (present).
- **SPDX:** `MIT`. Text begins "This code is licensed under the MIT License", "Copyright (c) 2016: Martin O'Leary", standard permission and warranty-disclaimer paragraphs.
- **Dependencies the code calls but does not ship:** D3 (BSD-3 for v4 as far as is general knowledge; not verified here), js-priority-queue and naming-language (licences not read; not present in this checkout). Record separately if ever adopted.
- Per ARCHITECTURE Q12 the licence does not restrict use. No extraction is proposed.

## 6. Capability coverage and verdict against the current Cartography pick

Current pick (`audit/CAPABILITY_MATRIX.md:401`, "Cartography and map art"): Azgaar relief placement, coastline, river paths, label path fitting and the seeded overlap solver `controllers/label-spread.ts`; QGIS hillshade renderer and PAL label placement; rule-based styles as design. mewo2/terrain was listed as a candidate (`CAPABILITY_MATRIX.md:414`, "Fantasy map style and label placement", Phase 5c).

| Capability | mewo2 present? | Rating | Extractability | Beats current pick? | Why |
|---|---|---|---|---|---|
| Label placement (point labels) | yes, greedy 4-candidate penalty (`:863-946`) | 2/5 | reference | **No** vs Azgaar `label-spread.ts` and QGIS PAL | `label-spread.ts` is a seeded simulated-annealing/refinement solver (per `audit/Azgaars-Fantasy-Map-Generator.md` 3.28). PAL generates many candidates per feature type with a conflict-graph search (chain search). mewo2 tries four positions once and never revises; the box is an estimate. Its penalty list (edge, label, marker, line) is a good checklist for our energy terms, nothing more. |
| Label placement (area/region) | yes, full-vertex scan score (`:961-1016`) | 2/5 | reference | **No** | A weighted nearest-to-centroid heuristic. Azgaar's pole-of-inaccessibility plus raycast fit and PAL's polygon candidates handle shape and size; the mewo2 score cannot rotate, curve, or fit the box inside the region. The idea of penalising land/water and capital/town markers separately is worth copying as a design note. |
| Path/curved labels | no | - | - | n/a | Azgaar `label-arc.ts`, PAL line labels. |
| Coastline rendering | contour of the height field, no fractal, no smoothing applied (`:509-522`, `:1034`) | 2/5 | re-derive | **No** | Azgaar `coastline-generator.ts` fractalises per feature with a seeded RNG and adds waves/bands. mewo2 gives the raw Voronoi polyline. |
| River rendering | flux threshold, constant width, 1 smoothing pass (`:524-546`) | 2/5 | re-derive | **No** | Azgaar `river-generator.ts` has discharge widths and meander. mewo2 is a strict subset. |
| Slope / relief shading | stochastic x-gradient stroke scatter (`:728-773`) | 2/5 (3/5 as style) | reference | **No** vs QGIS hillshade; **maybe as a complement** | It is not a shading model: no sun azimuth/altitude, no aspect, no z-factor, non-deterministic. QGIS hillshade (incl. multi-directional) is the right base layer. The sparse-tick look could inform a "hachure" art preset, but Azgaar already carries `heightmap-hachures.ts` and relief icons. |
| Contour lines | only the sea-level isoline (`:509-522`) | 1/5 | trivial | **No** | No generic elevation contours. The mesh-edge isoline plus `mergeSegments` is generic, but we need marching squares/triangles on the sphere-sampled raster, and a smoothing/simplification step. |
| City placement | greedy flux + edge + repulsion (`:478-507`) | 2/5 | reference | **Partly useful, not a replacement** | Azgaar's burgs use habitability and population. The mutual-repulsion greedy loop is easy and deterministic and would work as a spacing step on top of a score, but mewo2's score has no coast/harbour, biome or elevation terms. |
| Territories / borders | Dijkstra with slope/river cost (`:548-611`) | 3/5 | reference | Not in the matrix row (political layer) | Best-explained cost model; useful later for borders, not for 5c. |
| Style system | hard-coded sizes + inline city style; CSS missing (`:1061-1072`, `:800-806`) | 1/5 | - | **No** | Azgaar ships 14 JSON presets with a schema. Only the look (pen-and-ink, sparse) is a reference. |

**Net verdict:** nothing in mewo2-terrain displaces a pick. Keep the matrix row as it is; list mewo2 as a **non-picked style reference** (pen-and-ink look, sparse slope ticks, the four-position-plus-penalty framing of point labels, mutual-repulsion city spacing, cost-distance territories). Close the "candidate" status.

## 7. Phase 5c fit: determinism, worker, frame

- **Determinism: no as written.** Randomness is `Math.random` through `runif` (`:3-5`), `generatePoints` (`:43`), `mountains` (`:233`), `visualizeSlopes` (`:745-746`), plus `rnorm` with hidden module state `z2` (`:7-28`). Per project rules (no `Math.random` in `packages/**`, `dmath` for math) any reuse would have to replace these with the seeded RNG. The label code itself has no random calls but depends on `makeRandomLanguage`/`makeName` (external, unseeded) and on `d3.scan` for the argmin; tie-breaking comes from that library and was not read.
- **Worker:** label scoring and path construction use no DOM and could run in a worker once written against plain arrays. The drawing half is D3/SVG and DOM only. Text metrics are an estimate (`0.65*size*chars`), so there is no font dependency, but also no accuracy; our label solver needs real glyph metrics supplied to it.
- **Frame/units:** planar, unitless, Y-down, 1x1 default extent, sea level at 0 by quantile. It would apply only inside a local tangent or projected map frame, after converting metres and pixels (the conversion the Azgaar audit already assumes). It has no notion of the canonical +Z/+X/+Y sphere, no latitude scaling, no antimeridian handling and no sea-level in metres.
- **Scale behaviour:** all weights (100/1000/3000/50000, 0.01/0.02) are tuned to 1x1 extent with ~16k points (`:1064`); they do not scale with output size or font size.

## 8. Verdict

**Commit** `a2511d6b673ae92f5983f3343365ba9326c03b63`, branch `master`, licence MIT (`LICENSE.md`, Copyright (c) 2016 Martin O'Leary), last activity 2016-08-15, abandoned by the author.

**What is worth taking (as ideas only):**
1. The label-penalty checklist (edge, other labels, point markers, line features) as a sanity list for our energy function.
2. A region-label score that separates land centroid, territory centroid, water and marker overlap (`:971-1003`) as a quick fallback for small or convex regions.
3. The pen-and-ink style: sparse slope ticks, monochrome, small city dots with a white fill.
4. Greedy mutual-repulsion city spacing and the cost-distance territory model.

**What to skip:** everything else. It has fewer features than the current picks in every Phase 5c row, is not deterministic, lacks its own dependencies, and its units cannot map to the sphere without a rewrite.

**Biggest risks if anyone extracts it anyway:** hidden randomness, missing dependencies (`d3`, `js-priority-queue`, `naming-language`), unscaled weights, no tests, and dead/stale functions that look live.

**Open questions:** the original page and stylesheet (the real visual reference) are not in this repo; the live look is only available from the author's notes site (`README.md:25`), which was not fetched.
