# Design note 19: Asset library and drawing tools

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 10b |
| Depends on | Note 18 (styles and rendering), note 16 (editing UX), the save format (`assets/`) |
| Used by | Map art on every map type; note 34 city maps; note 36 encyclopedia illustrations |

## 1. Problem

Inkarnate and Wonderdraft are drawing programs: brushes, stamps, textures, paths, text and frames on a canvas. Users finish maps by hand, and they bring their own art. MapMaker needs the same tools, but layered on a simulated world: hand-drawn annotation must coexist with simulated data, follow the world when it changes where sensible, and export with it.

## 2. Canonical inputs and outputs

**Assets** (`assets/`, referenced by content hash): symbols and stamps (SVG or PNG with anchor and footprint), textures (tileable), brushes (shape, spacing, scatter, jitter), fonts, frames and cartouches, compass roses, scale-bar designs, colour palettes. Each asset carries metadata: tags, licence, source.

**Annotation layers** (part of the map, not of the world simulation): ordered layers of drawn objects:

```
{ id, kind: stroke | stamp | path | region | text | image, geometry (unit vectors on the sphere, or map-space for frame elements),
  style ref, anchor: 'world' | 'map', bindTo?: EntityRef }
```

- `anchor: 'world'` objects live on the sphere and appear in every projection and on the globe.
- `anchor: 'map'` objects (frames, titles, legends) live on a specific map layout.
- `bindTo` ties an annotation to an entity (a hand-drawn castle to a settlement), so it moves or is flagged if the entity changes.

## 3. Approach and algorithm choice

### 3.1 Tools

- **Brushes:** freehand painting with textures and colours on a raster annotation layer, in sphere space (strokes stored as vector paths with brush parameters, rasterised per view).
- **Stamps:** place symbols singly or by scatter-brush; auto-stamp fills a region with symbols (forest, hills) using deterministic density placement.
- **Paths:** roads, borders, coastline embellishments, rivers drawn as styled paths.
- **Regions:** filled polygons with textures and edges.
- **Text:** labels on curves, text boxes, title cartouches.
- **Layout:** frames, legends, compass, scale bar, insets, page size and DPI.

### 3.2 Simulation versus annotation

Drawing a mountain stamp is annotation (map art); sculpting elevation is a world edit (note 16). The UI makes the distinction explicit and offers conversions: "make this real" turns a drawn mountain range into an elevation edit, a drawn river into a hydrology pin, a drawn border into a political edit.

### 3.3 Asset library

- Ships with CC0 and similarly open packs (candidates listed in `audit/CAPABILITY_MATRIX.md`).
- Users import their own assets (stored in the save by hash, deduplicated).
- Tag search, favourites and per-style asset sets.

## 4. Upstream references (algorithm level)

- **Azgaar** (MIT code; checked in reconciliation group 6a):
  - the emblem generator, `src/generators/emblems-generator.ts`. It outputs data, uses the global `Math.random`, and needs an injected RNG. The SVG is drawn by `src/renderers/emblems/renderer.ts` with shield geometry in `shieldPositions.ts`;
  - assets: 338 heraldry charges in `public/charges/`, relief icon `<symbol>`s in `src/index.html` (catalogue `src/data/relief-icons.ts`), and burg and marker icons in `public/images/icons/` and `public/images/markers/`. **These assets have no documented licence** upstream (`docs/wiki/Policy.md:54` says they carry their own licences but names none). Find each source before shipping any.
- **Godot** `editor/` canvas tools and undo-redo patterns; `core/math/` geometry helpers.
- **Candidates to audit:** open-source map-drawing tools and CC0 asset packs (listed in the matrix).
- Inkarnate and Wonderdraft are proprietary: feature reference only, by public documentation.

## 5. Validation

- Annotation never changes a `World` hash.
- Bound annotations follow their entity across re-simulation, or are flagged.
- Save and load preserve every asset by hash; exports embed the assets used.

## 6. Open questions

1. Raster painting on the sphere at high zoom: per-patch raster tiles, or vector strokes only?
2. Licences of Azgaar's bundled assets: the 338 heraldry charges (`public/charges/`), the relief `<symbol>`s (`src/index.html`) and the icons (`public/images/`) have no documented licence (`docs/wiki/Policy.md:54` names none; the root MIT `LICENSE` covers the code). Each needs a documented licence source before any is bundled; this is part of the Phase 10b prerequisite, and Phase 5c ships no third-party symbols until then.

## 7. Size estimate

| Part | LOC |
|---|---|
| Annotation model and storage | ~1,200 |
| Tools (brush, stamp, path, region, text) | ~4,000 |
| Layout and print | ~1,500 |
| Asset library UI and import | ~1,500 |
| Tests | ~1,000 |

## 8. User controls and edit points

All tools above, plus per-asset settings (scale, rotation, colour, flip), layer visibility, locking, grouping and opacity.

## 9. Earth-recovery test

Not applicable (map art). The "make this real" conversions are tested through note 16's tests.
