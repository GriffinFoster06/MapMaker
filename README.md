# MapMaker

A browser-first fantasy world generator and simulator built around a canonical spherical world. Flat projections, regional detail, and exports are designed as views of that same world. The long-term scope includes tectonics, terrain, erosion, hydrology, climate, ecology, settlements, languages, politics, trade, and thousands of years of history.

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
- [Design notes](docs/design/README.md): algorithms and validation plans for later systems.
- [Provenance](PROVENANCE.md): source commits, extraction records, dependencies, and licenses.

`upstream/` contains ignored, read-only reference checkouts. Shipped code lives in `apps/`, `packages/`, and `tools/`; `spikes/` holds earlier experiments.
