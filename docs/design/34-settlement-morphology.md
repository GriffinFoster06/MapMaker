# Design note 34: Settlement morphology: towns, cities and streets

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 11b |
| Depends on | Settlements and history (notes 9, 1), terrain and rivers at patch resolution (note 6), technology and culture (notes 31, 32), hazards (note 28) |
| Used by | City maps (notes 18, 19), the encyclopedia, battle and scene maps, history (sieges use walls and districts) |

## 1. Problem

A worldbuilder needs to zoom from the continent into a town: streets, walls, a harbour, a market square, temples, districts. Azgaar links to a separate city generator; Inkarnate and Wonderdraft make users draw cities by hand. MapMaker should generate plans that follow from the world: the river and hills on the site, the town's size, age, wealth, culture, faith and technology, and its history (old core, later walls, a burned district).

## 2. Canonical inputs and outputs

**Inputs:** settlement entity (population, rank, founding time, functions: port, market, fortress, holy site), its history (growth curve, sieges, disasters), the local patch (elevation, rivers, coast) at about 1–10 m resolution, culture and faith (style), technology (walls, building types).

**Outputs**
- `townPlans` table, keyed by settlement and history tick (plans change over time): street graph, blocks and lots, walls and gates, districts (with functions), landmarks, building footprints (optional detail level).
- Coordinates in the local tangent frame of the settlement, anchored to the sphere (§3.1 positions as cell id plus offset).

## 3. Approach and algorithm choice

- **Growth replay:** the plan is grown along the settlement's history: a founding core at the best site (river crossing, harbour, hilltop), organic accretion along roads, planned extensions in eras with strong polities, walls when the town's era and threat require them, suburbs outside the walls, and rebuilding after disasters.
- **Street networks:** road-driven growth (primary roads from the regional route network, then secondary streets by tensor-field or L-system growth), adapted to slope and water; grid plans where the culture or era favours them.
- **Blocks and buildings:** blocks subdivided into lots; building footprints by function and density.
- **On demand:** plans are generated only for settlements the user opens (or above a size threshold), deterministic from the settlement id, so they cost nothing for unvisited towns.

## 4. Upstream references (algorithm level)

- **Candidate to audit:** watabou's TownGeneratorOS (Medieval Fantasy City Generator, open source): ward-based city layout, walls and districts.
- **UrbanSim** `urbansim/models/` (location choice) for land-use allocation in big cities.
- **Godot** `core/math/` (Delaunay, geometry helpers).
- **PostGIS** `liblwgeom/` (polygon operations, buffering, simplification) as an algorithm reference for block geometry.
- **Literature:** Parish & Müller (2001) procedural cities; Chen et al. (2008) tensor-field street modelling; Kostof, *The City Shaped*.

## 5. Validation

- Street networks are connected; no streets in water or on cliffs beyond the slope limit.
- Plans regenerate identically from the same settlement history.

## 6. Open questions

1. How detailed should buildings be (footprints only, or interiors for scene maps)? Proposed: footprints, with interiors as a later module.

## 7. Size estimate

| Part | LOC |
|---|---|
| Site and growth replay | ~1,500 |
| Street networks | ~2,000 |
| Walls, districts, blocks, buildings | ~2,000 |
| Tests | ~1,000 |

## 8. User controls and edit points

- Parameters: style per culture (organic, grid, radial), density, wall thresholds.
- Edits: move or draw streets, walls and districts; place landmarks; rename anything; regenerate a district only.
- Switch: town plans `simulate | manual | off`.

## 9. Earth-recovery test

T4: street-network statistics (intersection density, block size, street orientation entropy, circuity) for generated pre-industrial towns fall within the ranges measured on real historical towns of similar size and region (Boeing 2019 orientation entropy as one metric).
