# Requirements

## Deliverable

- A browser app, deployable on GitHub Pages if feasible.
- A desktop wrapper only where performance demands it (i.e., the browser build is the default target; desktop is a fallback, not a parallel product).
- Must work on Windows and Mac.
- Offline support is not required.
- Open source and free. License conflicts between extracted subsystems are ignored for now, but the license of every extracted repo must be recorded (see `upstream-manifest.json`).

## Scope

Everything involved in simulating a fantasy world, end to end:

- Tectonics
- Heightmap generation
- Erosion
- Hydrology (rivers, lakes, watersheds)
- Climate: temperature, wind, ocean currents, precipitation, seasons
- Biomes
- Soils
- Resources
- Population and settlement
- Cities and towns
- Languages and names
- Political borders
- Trade
- A long-run simulation of war, economics, politics, and full human history across thousands of years

## Planet and map

- Support whole planets and regional patches, down to the most detailed scale that is still map-worthy.
- Detail must be consistent across zoom levels (no discontinuities between whole-planet and regional views).
- Must support both a globe view and flat projections: Mercator, equirectangular, equal-area, and the other major projections. `orogen` (in `upstream/`) is a strong reference for this.

## Whole-world mode

Derive everything (tectonics, climate, biomes, history, etc.) from a set of world/planet parameters.

## Partial-world mode

Given a regional map plus a set of world conditions, infer the most likely tectonic and continental context surrounding the region, then derive the region's climate and biomes from that inferred context — so the region is logically consistent with a plausible whole planet, even though the rest of the planet is never fully generated.

## Import

Support importing heightmaps and other existing maps/layers as a starting point for generation.

## Realism and performance

- Prioritize realism over speed.
- Provide a fidelity/speed slider before each generation run: a fast, rough seed preview, followed by a slow, detailed run using the same seed (so the preview is a true preview of the final result, not a different generation).

## Export

- PNG heightmaps
- SVG
- STL
- As many additional export formats as feasible
- A custom save format that captures full generation state, so a world can be reloaded and resumed exactly where it left off

## Calibration

Calibrate all generation parameters against real Earth data — elevation, climate, Köppen climate zones — so that parameter scales are anchored to reality. If a parameter value of `1.0` represents Earthlike conditions, the effect of values like `0` or `1.5` should be known and documented.

## Provenance

Every module extracted or adapted from an upstream repo must be logged with:

- Source repo
- Source file(s)
- Source commit hash
- License

`upstream-manifest.json` records the repo-level license and commit for every upstream reference; module-level provenance (per extracted feature) is tracked separately as extraction work happens.

## Engineering approach

- Prefer extracting and adapting real, working code from the best available open-source implementation of each subsystem over writing original code from scratch. Write original code only when no suitable existing implementation can be found.
- Work autonomously where possible, but in checkpointed steps that are reviewed before continuing to the next step.
