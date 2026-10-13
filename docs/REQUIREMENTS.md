# Requirements

This is the product specification. `docs/ARCHITECTURE.md` says how it is built and in what order (§7), and the design notes in `docs/design/` say how each system works.

## Vision

MapMaker is a personal, non-commercial project. The goal is the most complete realistic worldbuilder for fictional worlds that can be built. It should go further than Azgaar's Fantasy Map Generator, Inkarnate and Wonderdraft combined, and it should be a "god-like" maker: a world is simulated from the star system down to the streets of its towns and the lives of its rulers, and every part can be inspected, tuned and rewritten by hand.

- **Realism deep enough to recover Earth.** Every system goes as deep as it usefully can, in every direction. If Earth's starting conditions were set up properly, the simulation should produce Earth, or something close to it. Tectonics, climate and history are chaotic, so this is tested in layers (§ Earth tests) rather than as an exact match.
- **Ultimate user customisability.** Every parameter is exposed. Every layer and entity can be edited by hand, and the rest of the world re-simulates around the edits. Every simulated system can be switched off, replaced by a hand-authored version, or overridden by a fantasy rule.
- **Beautiful maps, not only simulation.** Besides data views, the app renders styled, artistic maps and provides the drawing tools to finish them. It aims to cover what Azgaar, Inkarnate and Wonderdraft offer, on top of a simulated world.
- **Aggregate open source.** Use every upstream we have, and more as they are found. Extract and adapt the best implementation of each subsystem, and build on it (ARCHITECTURE.md Q12).
- **No ceiling.** Scope and timeline are open-ended by design (ARCHITECTURE.md Q13). The domain catalogue below is the current list; new domains are added whenever they make worlds more real or more useful.

## Guiding principles

1. **Realistic core first.** The default world follows physics, ecology and history as closely as the models allow. Simplifications are documented, calibrated against Earth, and replaceable by better models later.
2. **The sphere is the only truth.** Flat maps, regional maps, city maps and exports are views of one canonical world.
3. **Everything is a parameter or an edit.** No hidden constants: every tunable value is a documented parameter, and every generated value can be overridden by a recorded edit.
4. **Deterministic and exactly resumable.** The same seed, parameters, edits and modules give the same world, bit for bit, on every supported browser and OS. A save resumes exactly.
5. **Fantasy is a layer, never a corruption.** Fantasy rules are switchable modules on top of the realistic core. With every module off, the world is the realistic world, unchanged.
6. **Earth recovery is the acceptance bar.** A system is "done" when it passes its Earth test, not when it looks plausible.
7. **Usable throughout.** The app is a usable tool from early on. Simulation depth is added phase by phase behind a working editor and map renderer (ARCHITECTURE.md Q14).
8. **Explainable.** Every generated feature can say why it exists: the stage, inputs, causes and events behind it.

## Deliverable

- A browser app, deployable on GitHub Pages if feasible.
- A desktop wrapper only where performance demands it. The browser build is the default target; desktop is a fallback, not a parallel product.
- Must work on Windows and Mac.
- Offline support is not required. It is welcome if it comes cheaply, for example through a service worker once the app is large.
- Open source, free and personal (non-commercial). Licences do not restrict which upstream code is used, but the licence of every extracted repo is still recorded (see `upstream-manifest.json` and `PROVENANCE.md`).

## Domain catalogue

Every capability below is in scope. The depth target for each is "as deep as is useful for worldbuilding and supported by a published model". Each line names the design note that specifies it; ARCHITECTURE.md §7 places it in a phase.

### Cosmos (note 20)

- Star type, luminosity and age; single and binary stars; habitable-zone checks.
- Orbit, eccentricity, obliquity, rotation period, precession and Milankovitch-style cycles.
- Moons: count, masses and orbits; tides; eclipses; night-sky appearance.
- Calendars derived from the day, month and year.
- Impacts: rate, craters, and their geological and climatic effects (with note 28).

### Geosphere (notes 13, 14, 21, 4, 5, 28)

- Mantle convection and plume (hotspot) placement, at parameterised depth.
- Plate tectonics as a static snapshot and as forward evolution over deep time (up to at least 1,000 Myr).
- Volcanism: arcs, rifts, hotspots, large igneous provinces, eruption history.
- Magnetic field (strength and reversals), isostasy and flexure.
- Heightmaps, structures and rock types (lithology) from tectonic history.
- Erosion: fast and slow passes, glacial, fluvial, aeolian and coastal.
- Minerals and ores, and soils.
- Natural hazards: earthquakes, eruptions, tsunamis, landslides.

### Hydrosphere and cryosphere (notes 12, 22, 23)

- Ocean circulation (wind-driven and thermohaline), sea-surface temperature, upwelling, sea ice.
- Tides, coastal processes, deltas, beaches, reefs, sediment.
- Rivers, lakes with water balance, endorheic basins, salt lakes, wetlands, groundwater and aquifers.
- Glaciers, ice sheets, permafrost, and sea level over time (ice volume, isostasy, ocean-basin volume).

### Atmosphere (notes 10, 11, 24)

- General circulation, winds, pressure and fronts; storms and cyclones.
- Temperature, precipitation and continuous seasons.
- Climate classification (Köppen) and its variability: droughts, cold years, monsoon strength.
- Atmospheric composition (CO₂, O₂) as a parameter, and paleoclimate over deep time (greenhouse and icehouse states).

### Biosphere (notes 25, 26, 27, 29)

- Vegetation: plant functional types, biomass, fire, succession and dynamic biomes.
- Fauna: species, ranges, population dynamics, migration and food webs.
- Evolution and speciation over deep time: clades, extinctions, adaptive radiations, endemism on islands.
- Domesticable plants and animals, as inputs to civilization.
- Disease: pathogens, reservoirs and epidemics, for wildlife and people.

### Civilization (notes 9, 1, 2, 30–34)

- Human origins and prehistory: emergence, dispersal and migration routes, foraging, the spread of agriculture, from an empty planet or from a chosen start.
- Population, demography and settlement, from camps to megacities.
- Settlement morphology: town and city layouts, streets, walls, districts, buildings.
- Cultures, languages (with evolution and naming), religions and ideologies.
- Technology and innovation: discovery, diffusion and loss.
- Economy, resources, production, markets and trade.
- Politics, diplomacy, borders, war, rebellion and collapse.
- Individuals: rulers, dynasties, notable figures, their lives and decisions.
- A causal chronicle: every event explains its causes, and the history reads as a narrative.

### Fantasy (note 35)

- Rule overrides: change physical constants or any model with a documented alternative.
- Magic as a simulated field and resource with its own sources, flows, costs and effects on every other system.
- Non-human peoples and sapient species, with their own biology, cultures and languages.
- Creatures and monsters, as species in the fauna model.
- Fantastical geography (floating islands, a world tree, ley lines) as constrained edits plus module rules.
- All of it switchable per world, and recorded in the save.

### Experience (notes 6, 7, 16–19, 36, 37)

- Globe view and switchable flat projections (below).
- Cartographic art: styles, palettes, hillshading, textures, symbols, labels, fonts, frames, legends, compasses; regional, city and battle maps.
- A full editor (below).
- Worldbuilder tools: an encyclopedia and wiki of every entity, a timeline, a history scrubber, notes, and what-if branches.
- Import, export and save (below).
- A plugin and scripting API for new rules, stages, styles and tools.

## Customisation

- **Parameters.** Every tunable value is a parameter with a unit, a range and documented effects (note 17, extending note 8). Parameters are grouped by domain and shown at three levels:
  - *simple*: a few world-level sliders;
  - *advanced*: per-system controls;
  - *expert*: every constant.

  Presets ("Earth", "Mars-like", "archipelago world", "ice age", and others) are saved parameter sets.
- **Edits.** Any layer value, region or entity can be edited (note 16): painted, sculpted, drawn, moved, renamed, created or deleted. Edits are recorded in an edit log in the save and replay deterministically.
- **Locks and constraints.** An edit can be a hard pin (never changed by simulation) or a soft constraint (simulation keeps it approximately). Downstream systems re-simulate around them.
- **System switches.** Any system can be off, simulated, or hand-authored. For example: draw the coastlines yourself and simulate the climate, or simulate the terrain and write the history yourself.
- **Modules.** Fantasy rules and plugins are per-world modules. Turning a module off restores the world without it.
- **Branches.** A world can be forked at any stage or history tick into what-if branches (note 36).

## Planet and map

- Support whole planets and regional patches, down to the most detailed scale that is still map-worthy, and town plans below that (note 34).
- Detail must be consistent across zoom levels (no discontinuities between whole-planet and regional views).
- Globe accuracy comes first. The canonical world representation is the sphere (planet-first), and it is the only source of truth. Flat maps are never separate data; they are views computed from the sphere.
- Must support both a globe view and switchable flat projections: equirectangular (the default), Mercator, equal-area, and the other major projections.
  - Distortion is a mathematical consequence of the projection, computed from the sphere (for example per-point area, angular, and scale distortion from the projection's Jacobian, and optionally a Tissot indicatrix overlay). Nothing in the world data is adjusted to suit a projection.
  - Flat views and flat exports are rendered by inverse-projecting each output pixel back to latitude/longitude and sampling the sphere, so poles and the antimeridian are handled by the sphere rather than patched in the flat map.
  - Switching projection never regenerates or alters the world.
  - `orogen` (in `upstream/`) is the reference for the globe view and provides equirectangular only. It is not a multi-projection reference (corrected per `audit/CAPABILITY_MATRIX.md`), and its own review notes pole and antimeridian seam artifacts.
  - No repo in `upstream/` contains browser-ready multi-projection code. Projection math comes from a third-party library (`d3-geo` / `d3-geo-projection`, plus `proj4js` if needed), recorded as a dependency in `PROVENANCE.md`.

## Whole-world mode

Derive everything (cosmos, tectonics, climate, life, history and the rest) from a set of world and planet parameters.

## Partial-world mode

Given a regional map plus a set of world conditions, infer the most likely tectonic and continental context surrounding the region, then derive the region's climate and biomes from that inferred context. The region is then logically consistent with a plausible whole planet, even though the rest of the planet is never fully generated.

## Import

- Import heightmaps and other existing maps and layers (biomes, rivers, borders, settlements) as a starting point for generation.
- Import Azgaar `.map` files.
- Import a painted or scanned image as a guide layer to trace or to convert into edits.
- Import real Earth datasets (for the Earth tests and for Earth-based worlds).

## Realism and performance

- Prioritize realism over speed.
- Provide a fidelity/speed slider before each generation run: a fast, rough seed preview, followed by a slow, detailed run using the same seed. The preview must be a true preview of the final result, not a different generation.
- Whether low-resolution output is a faithful preview of high-resolution output must be verified by an A/B test early in the build, not assumed.
- Deep-time and long-history runs may take a long time. They run in the background with progress, pause, resume and checkpoints, and the app stays usable while they run (note 38).

## Earth tests

Earth recovery is tested in layers (note 15). Every layer is a permanent regression gate once it exists (ARCHITECTURE.md Q17).

1. **T1, statistical Earth.** An Earth-parameter world matches Earth's statistics: land fraction, hypsometry, Köppen shares, plate sizes and speeds, seafloor-age distribution, river and drainage statistics (Hack's law), lake counts, biome areas and species-richness gradients.
2. **T2, physics given Earth.** Given Earth's real elevation (and plates and ice where needed), the downstream climate, Köppen zones, ocean currents, biomes, hydrology, soils and vegetation match real Earth data.
3. **T3, deep-time Earth.** Evolving from a Pangaea-like supercontinent with Earth parameters gives Earth-like statistics over deep time: supercontinent cycles, orogen ages, ice ages.
4. **T4, civilization sanity.** Given Earth's geography, the human layer gives plausible results: population densities, city-size distributions (Zipf), the timing and centres of the spread of agriculture, state sizes and lifetimes, trade-route placement and language-family counts.

## Export

- PNG heightmaps (16-bit), and PNG and JPEG images of any styled view.
- SVG and PDF (vector).
- STL and other 3D formats (OBJ, glTF).
- GeoJSON, GeoTIFF and PNG tiles.
- Azgaar `.map`, where the data maps across.
- Encyclopedia and chronicle export (Markdown or HTML).
- As many additional export formats as feasible.
- A custom save format that captures full generation state (including RNG state, the edit log, modules and branches), so a world can be reloaded and resumed exactly where it left off.

## Calibration

Calibrate all generation parameters against real Earth data (elevation, climate, Köppen climate zones, and every domain with a public dataset), so that parameter scales are anchored to reality. The Earth tests above are the end goal of calibration. If a parameter value of `1.0` represents Earthlike conditions, the effect of values like `0` or `1.5` should be known and documented.

## Provenance

Every module extracted or adapted from an upstream repo must be logged with:

- Source repo
- Source file(s)
- Source commit hash
- License

`upstream-manifest.json` records the repo-level license and commit for every upstream reference. Module-level provenance (per extracted feature) is tracked separately, in `PROVENANCE.md`, as extraction work happens. Third-party packages used as dependencies, and external datasets, are logged too.

## Engineering approach

- Prefer extracting and adapting real, working code from the best available open-source implementation of each subsystem over writing original code from scratch. Every repo in `upstream/` is eligible, regardless of licence. Write original code only when no suitable existing implementation can be found.
- Keep looking for new upstreams. `audit/CAPABILITY_MATRIX.md` lists candidates to audit for each domain.
- `audit/CAPABILITY_MATRIX.md` also lists the capabilities with no usable upstream implementation. Original code is expected there, and each such item gets a design note before it is built.
- Work autonomously where possible, but in checkpointed steps that are reviewed before continuing to the next step.
