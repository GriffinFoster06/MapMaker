# MapMaker

A browser-first, realistic worldbuilder for fictional worlds, built around a canonical spherical world. It aims to simulate a world from its star system down to the streets of its towns and the lives of its rulers, deep enough that Earth's starting conditions give back something close to Earth, with every parameter exposed, every layer editable, and maps as good as the best drawing tools. Flat projections, regional detail, town plans and exports are views of that same world.

The scope is open-ended: cosmos, geosphere, oceans and ice, atmosphere, life and evolution, civilization and history, an optional fantasy layer, and a full editor and map-art toolkit. `docs/REQUIREMENTS.md` is the product specification; `docs/ARCHITECTURE.md` §7.0 is the roadmap.

The project prioritizes physical plausibility, deterministic generation, exact save/resume, and Earth-based calibration. It adapts working open-source implementations where suitable and records their provenance. License: [GPL-3.0-only](LICENSE).

## Current implementation

**Phase 4b (complete):** planet generation in the browser.
- Plate tectonics, terrain, erosion, climate and Köppen climate zones from the orogen generator.
- The result is shown on a 3D globe with selectable layers.
- Generation is *structured*: every large-scale decision is made once, on a fixed 20,000-cell reference world, and each resolution adds detail on top. A quick low-resolution preview of a seed therefore shows the same continents, mountain ranges, climates and river basins as the slow high-resolution run (see `docs/checkpoints/CHECKPOINT_4B.md`).

Orogen's interactive tools beyond its sliders (clicking a plate to flip it between land and ocean, plate density editing, heightmap import, image export) come with the editor and cartography phases (5b, 5c). Editing, flat map projections, cartography and the deeper simulations (ice, oceans, life, civilizations) are planned and not yet built; see `docs/ARCHITECTURE.md` §7.0 for the roadmap.

## How to use it

Open the app, either the live site below or a local copy (see [Run locally](#run-locally)), and use the controls above the globe.

1. **Seed:** any whole number. The same seed always gives the same world, on every browser and computer.
2. **Tier:** the number of cells in the world, from 20k to 2.56M. More cells give finer detail but take longer.

   | Tier | Time measured in Chromium on a 4-core cloud VM |
   |---|---|
   | 50k | 5 s |
   | 200k | 10 s |
   | 1M | 40 s |
   | 2.56M | about 2 minutes |
3. **Pipeline:**
   - `structured` (the default) is the faithful-preview generator.
   - `stock (parity)` runs the original orogen generator unchanged, for comparison.
4. **Preview first:** when checked and the tier is above 50k, a 50k preview of the same world appears within seconds and is then replaced by the full-resolution result.
5. **World settings:** orogen's 14 generation sliders, with orogen's own ranges and defaults. Hover over a slider for its explanation. Changes take effect on the next Generate.
   - **Shape your world:**
     - irregularity of the cell grid;
     - number of tectonic plates;
     - number of continents (1 gives a supercontinent; more gives archipelagos);
     - roughness;
     - continent size variety;
     - land coverage (from ocean world to desert world).
   - **Terrain sculpting:** terrain warp, smoothing, glacial, hydraulic and thermal erosion, and ridge sharpening.
   - **Climate:** a global temperature shift (−15 to +15 °C) and a precipitation shift (drier to wetter).

   *Reset to defaults* restores orogen's values. The page address always holds the seed, tier, pipeline and any changed settings, so *Copy link to this world* gives a link that rebuilds exactly the same world.
6. **Generate:** builds the world. The status text shows progress, and the box under the globe lists each stage's time.
7. **Layer:** chooses what the globe shows. You can switch layers at any time without regenerating. The layers are:
   - elevation;
   - Köppen climate zones;
   - plates;
   - tectonic stress;
   - summer and winter temperature, precipitation, pressure and wind speed;
   - ocean current speed.
8. **Globe:** drag to rotate, and scroll or pinch to zoom.

A typical workflow: try seeds and settings at 50k until you like a world, then generate the same seed at 1M or 2.56M for the detailed version. The large-scale layout stays the same. "Diagnostics", at the bottom of the page, runs the Chromium/Firefox determinism check; ordinary use does not need it.

## Live site

- Primary: https://mapmaker-aw8.pages.dev/ on Cloudflare Pages. It is cross-origin isolated and deploys from `main`; every pull request gets its own preview link.
- Mirror: https://griffinfoster06.github.io/MapMaker/ on GitHub Pages.

Both deployments are unmaintained since decision W7 (the app is desktop software for macOS and Windows; Firefox and Chromium only).

See `docs/ARCHITECTURE.md` Q18.

## Run locally

Use the project-local Node pinned in `.nvmrc`; the wrapper isolates Node, npm cache, and Playwright browsers under `.tools/`.

```sh
scripts/node24.sh npm ci
scripts/node24.sh npm run dev -w @mapmaker/web
```

1. On a fresh machine, set up `.tools/bin/fnm` first; see [Development](docs/DEVELOPMENT.md).
2. Open the URL Vite prints, usually http://localhost:5173/.
3. Generate a world as described above.

Large tiers need a desktop browser with several GB of free memory: about 2 GB for Chromium at 2.56M, more for Firefox. Safari/WebKit is not supported.

## Find your way around

- [Requirements](docs/REQUIREMENTS.md): product goals and scope.
- [Architecture](docs/ARCHITECTURE.md): resolved decisions and phased implementation plan.
- [Development](docs/DEVELOPMENT.md): code map, checks, calibration, and Claude Code/Codex handoffs.
- [Shared agent instructions](AGENTS.md): repository rules for both assistants.
- [Design notes](docs/design/README.md): 38 notes with algorithms, user controls, and Earth tests for every planned system.
- [Provenance](PROVENANCE.md): source commits, extraction records, dependencies, and licenses.

`upstream/` contains ignored, read-only reference checkouts. Shipped code lives in `apps/`, `packages/`, and `tools/`; `spikes/` holds earlier experiments.
