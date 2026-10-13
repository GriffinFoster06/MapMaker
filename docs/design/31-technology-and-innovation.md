# Design note 31: Technology and innovation

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 13e |
| Depends on | History engine (note 1), population and trade (note 9), resources and minerals (notes 5, 10 goods), prehistory (note 30) |
| Used by | Production and economy (note 1), war (military technology), settlement morphology (note 34: walls, building types), naval reach and trade, the chronicle, fantasy (note 35: magic as an alternative or complement) |

## 1. Problem

Note 1 has a scalar "technology level" per polity. Real technology is a graph: bronze needs copper and tin, iron needs smelting heat, ocean navigation needs ships and astronomy. Innovations arise in big, connected populations, spread along contact networks, and are sometimes lost (Tasmania). A realistic history needs this structure, because it explains why some regions pull ahead and why geography matters.

## 2. Canonical inputs and outputs

**Inputs:** a technology graph (built in, editable, extensible by modules); per-population size, connectivity (routes, trade volume), resources available (minerals, domesticates), institutions (note 32).

**Outputs**
- `technologies` table: nodes with prerequisites (technology and resource), effects (productivity multipliers, military strength, range of travel, construction types, carrying capacity), and era tags.
- Per-population known-technology bitsets on the history axis; discovery and loss events with causes.

## 3. Approach and algorithm choice

- **Invention** as a hazard rate per population and technology whose prerequisites are met: proportional to population size and connectedness (the collective-brain effect, Henrich 2004), scaled by resource availability and an institutional factor.
- **Diffusion** along the contact network (trade, migration, conquest), with a probability per tick that grows with contact intensity and decreases with cultural distance.
- **Loss** when a population shrinks below a maintenance threshold for complex technologies.
- **Effects** feed productivity, military, mobility and construction in note 1 and note 34.
- **Graph:** a built-in Old-World-and-beyond graph from the Neolithic to the early-modern era (several hundred nodes) as data, so modules (note 35) can add magic or alternative paths.

## 4. Upstream references (algorithm level)

- **SongsOfFOSS** technology and production code (`game/raws/` technologies, `production-and-consumption`): a game-scale tech graph and effects.
- **Eurace** productivity and capital-vintage modules (`Inv_Goods_Vintage/`) for how technology raises output.
- **Literature:** Henrich (2004) Tasmania; Kremer (1993) population and technological change; Diamond (1997); Basalla, *The Evolution of Technology*.

## 5. Validation

- Larger, better-connected populations innovate faster, a monotone test.
- Isolated small populations can lose technologies.

## 6. Open questions

1. How far should the built-in graph go (to industrialisation and beyond)? Proposed: early-modern by default, extendable.

## 7. Size estimate

| Part | LOC |
|---|---|
| Graph data and loader | ~800 (+ data) |
| Invention, diffusion, loss | ~1,200 |
| Effects wiring | ~800 |
| Tests | ~800 |

## 8. User controls and edit points

- Parameters: invention and diffusion rates, loss threshold, graph selection.
- Edits: grant or remove a technology for a people at a time (seed or pin), edit the graph (nodes, prerequisites, effects), forbid a technology world-wide.
- Switch: technology `simulate | manual | off` (off: note 1's scalar level).

## 9. Earth-recovery test

T4: on Earth's geography and domesticates, the regions that reach metallurgy and writing first are among the historical early centres, and east–west connected Eurasia accumulates technology faster than isolated regions, as a statistical outcome across seeds.
