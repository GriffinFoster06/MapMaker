# MapMaker

A browser-first, realistic worldbuilder for fictional worlds, built around a canonical spherical world. It aims to simulate a world from its star system down to the streets of its towns and the lives of its rulers, deep enough that Earth's starting conditions give back something close to Earth, with every parameter exposed, every layer editable, and maps as good as the best drawing tools. Flat projections, regional detail, town plans and exports are views of that same world.

The scope is open-ended: cosmos, geosphere, oceans and ice, atmosphere, life and evolution, civilization and history, an optional fantasy layer, and a full editor and map-art toolkit. `docs/REQUIREMENTS.md` is the product specification; `docs/ARCHITECTURE.md` §7.0 is the roadmap.

The project prioritizes physical plausibility, deterministic generation, exact save/resume, and Earth-based calibration. It adapts working open-source implementations where suitable and records their provenance. License: [GPL-3.0-only](LICENSE).

## Current implementation

**Phase 4a, in progress:** the TypeScript shell runs orogen's terrain and climate stages in a worker and displays a Three.js globe with selectable layers. The core includes spherical meshes, typed layers, entities, timelines, seeded RNGs, deterministic math, and a versioned save container. Most later simulation systems are still planned. See [STATUS.md](STATUS.md) for current checks and unfinished work.

## Run locally

Use the project-local Node pinned in `.nvmrc`; the wrapper isolates Node, npm cache, and Playwright browsers under `.tools/`.

```sh
scripts/node24.sh npm ci
scripts/node24.sh npm run dev -w @mapmaker/web
```

On a fresh machine, set up `.tools/bin/fnm` first; see [Development](docs/DEVELOPMENT.md). Follow the Vite URL printed in the terminal.

## Find your way around

- [Requirements](docs/REQUIREMENTS.md): product goals and scope.
- [Architecture](docs/ARCHITECTURE.md): resolved decisions and phased implementation plan.
- [Development](docs/DEVELOPMENT.md): code map, checks, calibration, and Claude Code/Codex handoffs.
- [Shared agent instructions](AGENTS.md): repository rules for both assistants.
- [Design notes](docs/design/README.md): 38 notes with algorithms, user controls, and Earth tests for every planned system.
- [Provenance](PROVENANCE.md): source commits, extraction records, dependencies, and licenses.

`upstream/` contains ignored, read-only reference checkouts. Shipped code lives in `apps/`, `packages/`, and `tools/`; `spikes/` holds earlier experiments.
