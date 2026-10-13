# Design note 18: Cartographic rendering and map styles

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 5c (v1: styles, hillshade, labels, themes); Phase 10b (v2: full map art with note 19) |
| Depends on | Phase 5 projection and inverse sampling (§3.7), the vector path via `geoPath`, the layer registry |
| Used by | Every view and image export; note 19 drawing tools; note 34 city maps; note 36 encyclopedia maps |

## 1. Problem

The app must produce maps people want to look at and use: atlas-quality physical and political maps, fantasy parchment maps, and everything Inkarnate and Wonderdraft let a user make by hand, but driven by the simulated world. The data views in Phase 5 are correct but not beautiful. A style system is needed that turns canonical layers into cartography, on the globe and in every projection, without ever changing the world (the requirements' rule: views never alter data).

## 2. Canonical inputs and outputs

**Inputs:** any layer or entity table; the projection and viewport; a **style** (below); the annotation layers and assets of note 19.

**Style** (`styles/<name>.json`, non-authoritative, stored in the save):

```
{ name, base: 'atlas' | 'physical' | 'parchment' | 'political' | 'satellite' | ...,
  layers: [ { source: 'layer:elevation' | 'table:rivers' | 'annot:<id>', filter?, symbolizer, minScale?, maxScale? } ],
  palettes, fonts, textures, labelRules, frame, legend }
symbolizer = fill (ramp | categorical | texture) | relief (hillshade, multi-directional, sky-view) |
             line (width by attribute, casing, taper) | symbol (stamp sets by attribute, density) | label
```

**Outputs:** pixels (WebGL2/WebGPU) and vector output (SVG, PDF) for the same style; nothing in `World`.

## 3. Approach and algorithm choice

### 3.1 Two rendering paths, one style

- **Raster path:** per-pixel inverse projection (§3.7) samples continuous layers (elevation, climate) and applies fills, relief shading and textures in a shader. Exact CPU path for exports, GPU path for interaction (the Phase 5 tests already compare them).
- **Vector path:** coastlines (marching squares on the sphere), rivers, borders, routes and labels are geometry, projected with d3-geo and drawn as SVG or canvas paths, so they stay crisp at any zoom and export as true vectors.

### 3.2 Relief and terrain art

- Hillshade (single and multi-directional), slope and aspect shading, sky-view factor and ambient occlusion from elevation at the view scale.
- **Hand-drawn terrain styles:** mountains, hills, forests and dunes rendered as stamped symbols placed by density from the canonical layers (elevation, slope, `veg.*`, biome), oriented along ridgelines, with deterministic placement (seeded by cell id, so the same world gives the same map).
- Coastline styles: ripple lines, hatching, shallow-water tints from bathymetry.

### 3.3 Labels

Labels for every named entity (seas, ranges, rivers, settlements, regions), placed by priority with collision avoidance; curved labels along rivers and ranges; area labels spread along a region's skeleton. Deterministic for a given world, style and viewport. Fonts from the asset library (note 19).

### 3.4 Themes

Built-in themes: atlas (physical), political, parchment fantasy, ink-and-wash, satellite-like true colour (from biome, vegetation, snow and soil colour), climate, and historical (borders at a chosen tick). Each theme is a style file; users duplicate and edit them.

### 3.5 Map types

World maps (any projection), globe, regional maps (patches), city maps (note 34), and battle or scene maps (local high-resolution patches with a top-down style).

### 3.6 Performance

Tiled rendering with per-tile caches keyed by world hash and style hash; level-of-detail for symbols and labels.

## 4. Upstream references (algorithm level)

- **Azgaar** renderers (`src/renderers/`: relief icons, coastline, rivers, labels, emblems) and its style presets: the fantasy-map vocabulary; extract the symbol placement and label logic.
- **QGIS** `src/analysis/raster/qgshillshadefilter.cpp` and the symbology and labelling engine (`src/core/symbology/`, `src/core/labeling/`): rule-based styles and the PAL label placement design.
- **CesiumJS** imagery layers and terrain shading on the globe.
- **orogen** `planet-mesh.js` colour maps and `scene.js`.
- **Candidates to audit:** redblobgames mapgen4 (painterly terrain rendering), mewo2/terrain (Martin O'Leary's fantasy map style and label placement).
- **Literature:** Imhof, *Cartographic Relief Presentation*; Jenny et al. on shaded relief; Christensen's label placement.

## 5. Validation

- Switching style or theme never changes a `World` hash (a guard test, like the projection guard).
- Golden images per theme and projection, compared with a pixel tolerance; vector output compared structurally.
- Label placement deterministic across runs and engines.

## 6. Open questions

1. Should hand-drawn symbol sets ship with the app (CC0 packs) or be fetched on first use?

## 7. Size estimate

| Part | LOC |
|---|---|
| Style model and engine | ~2,500 |
| Raster shaders and relief | ~1,500 |
| Vector path and labels | ~2,500 |
| Themes | ~1,000 |
| Tests and goldens | ~1,500 |

## 8. User controls and edit points

- The style editor: every symbolizer is editable, with live preview.
- Per-entity overrides: label text, size, curve, position and visibility; symbol replacement; these are style-level overrides, not world edits, unless the user renames the entity itself.
- Export settings per map (size, DPI, frame).

## 9. Earth-recovery test

Indirect. A satellite-like theme of a T2 Earth world should be recognisably Earth-like side by side with a real true-colour mosaic; the colour pipeline is validated on real data (biome and land-cover colour mapping against MODIS land cover).
