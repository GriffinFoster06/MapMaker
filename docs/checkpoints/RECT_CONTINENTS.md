# Rectangular continents (decision P3, queue item Q2)

Investigation, 2026-10-19. Tools: `tools/tuning/earthlike/shape.mjs` (metrics), `rect-probe.mjs` (final worlds), `rect-stages.mjs` (per stage). No code under `packages/` was changed.

**User clarification (2026-10-19):** the defect is "blobby", with shapes that never occur on Earth, not literally rectangular. This matches finding 2 (compactness). The user expects Phase 6b (forward plate evolution) to improve it; Phase 6b's checkpoint should therefore include box fill and straight-coast share against the Earth bands as an explicit check, not an assumption.

## Method

The land mask of a world is rasterised to a 0.25° equirectangular grid (exact nearest cell). Per landmass of at least 2×10⁵ km²: **box fill** = area / area of its axis-aligned lat/lon bounding box (1 for a rectangle). For the coastline (|lat| < 75°): **straight** = share of length in stretches of 24 consecutive coast edges (about 480 to 670 km) that stay within 1.5 px of their chord, and **axisStraight** = the subset running along a parallel or meridian. Earth is measured the same way from the repo's Earth heightmap (`vendor/assets/earth.png`, imported at N = 200k). Earth is one sample, so only large differences count.

## Results (N = 200k, structured pipeline, seeds 1 to 8, final land mask)

| | box fill (area-weighted) | max box fill of a continent ≥ 10⁶ km² | straight | axisStraight |
|---|---|---|---|---|
| Earth | 0.345 | 0.50 | 0.138 | 0.013 |
| default settings | 0.409 | 0.62 | 0.052 | 0.005 |
| "most organic" (jitter 1, warp 1, roughness 0.5, smoothing 0, size variety 0.7) | 0.420 | 0.59 | 0.051 | 0.005 |

Stage by stage (stock pipeline, seeds 1 to 6, defaults): the land/ocean assignment per plate has straight 0.19 to 0.23 and a coastline of 200k km; after the elevation stage straight is 0.05 to 0.09 and the coastline 430k to 570k km; after erosion 0.03 to 0.04 and 560k to 670k km. Box fill barely moves (0.40 to 0.46 at every stage).

Sensitivity (4 seeds, N = 100k, final mask): plates 20, 40, 80, 120 give box fill 0.44, 0.45, 0.43, 0.50; continents 2, 4, 8 give 0.42, 0.43, 0.42; terrain warp 0 doubles the straight share (0.09), so warp does help. "Most organic" does not reduce box fill.

## Findings

1. **I did not reproduce visibly rectangular continents.** The worst continent has box fill 0.62 (Earth's most compact has 0.50), and the generated coastlines are not straighter than Earth's by these metrics (they are rougher at the 500 km scale). Axis-aligned straight coast is rare (0.5% against Earth's 1.3%).
2. **What is measurably different is compactness.** Generated landmasses fill their bounding box about 0.06 more than Earth's (0.41 against 0.345): they are fat blobs with a polygonal envelope, without Earth's long thin or branching shapes. That envelope is set by the **plate-level land/ocean assignment** (`ocean-land.js`, called from `coarse-plates.js`: whole plates become land or ocean), is the same at every later stage, and is not changed by plates (20 to 120), continents or the "organic" settings. Later stages only roughen the edge, and the roughening is weaker than the polygon: the image of default seed 3 shows facets of 20 to 40 degrees with near-straight sides.
3. **Pole bands.** Land touching the polar rows forms flat strips with horizontal streaks on an equirectangular map (seeds 3, 5, 8 in the probe). This is a lat/lon artefact of plate polygons reaching the pole plus the projection; it is excluded from the numbers (|lat| ≤ 75°) and may be what looks "rectangular" on the flat map.

## Proposal (not applied; it changes world hashes and the Q7 baselines)

Break the plate-polygon envelope before elevation: warp the plate-level land mask boundary with domain-warped noise (a few hundred km amplitude, seeded, applied to the cell-to-plate assignment used for the land/ocean decision), and add a compactness term (perimeter against area) to the continent selection. Tests: box fill and straight share against Earth bands over 8 seeds; world hashes re-recorded in the same commit (Q7 rule). This belongs with Phase 6b (plate evolution replaces the static plate map) unless the user wants it sooner. If the user can send a screenshot of a case they consider rectangular, run `rect-stages.mjs` on that seed and settings first; my probes did not show one.

## Limits

N = 200k preview resolution only; 8 seeds; Earth is a single sample; the coast metric works on a 28 km raster, so features under about 60 km are not judged.
