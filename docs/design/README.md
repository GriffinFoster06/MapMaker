# Design notes

These notes specify the systems that have no usable upstream implementation, plus the systems added by the architecture decisions. Notes 1–14 were written in Phase 2 (`audit/CAPABILITY_MATRIX.md`, Gaps; note 13 from decision Q9, note 14 from decision D5). Notes 15–38 were added on 2026-10-13 for the full product scope (ARCHITECTURE.md Q13–Q17). `docs/ARCHITECTURE.md` §7.0 places every note in a phase.

## Template

Every note uses these nine sections:
1. problem;
2. canonical inputs and outputs (layers, entities, events);
3. approach and algorithm choice;
4. upstream references (any upstream may be ported or used as a reference, whatever its licence, since ARCHITECTURE.md Q12; Eurace and WRF-Hydro were excluded when notes 1–14 were written);
5. validation method;
6. open questions;
7. size estimate;
8. user controls and edit points: the parameters exposed (note 17), the edits that act on the system (note 16), and its system switch (`simulate | manual | off`);
9. Earth-recovery test: which Earth test layer (T1–T4, note 15) the system contributes to, with metrics and data.

Sections 8 and 9 were added on 2026-10-13 (Q16, Q17) and retrofitted to notes 1–14.

A note that changes the architecture says so in a "Consequences for ARCHITECTURE.md" subsection under Approach. Those changes are applied to `ARCHITECTURE.md` and listed in its Resolved decisions section.

Notes 14, 3, 6 and 13 were written first, because they could change the architecture.

## Index by track

### Platform and experience

| # | Note | Phase | Changes the architecture? |
|---|---|---|---|
| 6 | [Regional-patch refinement](06-regional-patch-refinement.md) | 11 | **Yes, a refinement:** §3.1 patch meshes |
| 7 | [STL export](07-stl-export.md) | 12 | No |
| 8 | [Parameter-scale documentation](08-parameter-scale-documentation.md) | 8 | No |
| 14 | [Resolution-independent structure for faithful previews](14-resolution-independent-structure.md) | 4b | **Yes:** §3, §4 |
| 15 | [Earth test suite (T1–T4) and gating](15-earth-test-suite.md) | 8, 18, every phase | **Yes:** Q17 |
| 16 | [User editing, edit log, locks and re-simulation](16-user-editing.md) | 5b | **Yes:** §3.8, §5 |
| 17 | [Parameter registry, presets and expertise levels](17-parameter-registry.md) | 5b, 8 | No |
| 18 | [Cartographic rendering and map styles](18-cartographic-rendering.md) | 5c, 10b | No (views only) |
| 19 | [Asset library and drawing tools](19-asset-library-and-drawing-tools.md) | 10b | **Yes:** §5 assets |
| 36 | [Worldbuilder tools: encyclopedia, timeline, branches](36-worldbuilder-tools.md) | 16 | **Yes:** §5 branches, articles |
| 37 | [Plugin, mod and scripting API](37-plugin-api.md) | 17 | **Yes:** §3.9 |
| 38 | [Scaling the whole simulation](38-scaling.md) | 14 | **Yes:** §6.6 |

### Earth system

| # | Note | Phase | Changes the architecture? |
|---|---|---|---|
| 3 | [Partial-world inference](03-partial-world-inference.md) | 11 | **Yes:** §4 step 0p |
| 10 | [Physical → simulation parameter mapping](10-physical-parameter-mapping.md) | 6 | No |
| 11 | [Continuous seasons](11-continuous-seasons.md) | 6 | **Yes:** §3.2 climate layers |
| 12 | [Lake and basin hydrology](12-lake-and-basin-hydrology.md) | 7 | No |
| 13 | [Forward plate evolution over deep time](13-forward-plate-evolution.md) | 6b | **Yes:** §3.2–3.4, §4, §5, §7 |
| 20 | [Astronomy: star systems, moons, tides, orbital cycles](20-astronomy.md) | 6a | **Yes:** stage 0a, `bodies` |
| 21 | [Interior: mantle plumes, volcanism, magnetic field, isostasy](21-interior-and-volcanism.md) | 6c | **Yes:** stage 2i |
| 22 | [Cryosphere and sea level](22-cryosphere-and-sea-level.md) | 7b | **Yes:** stage 4c |
| 23 | [Ocean dynamics, tides and coasts](23-ocean-dynamics-and-coasts.md) | 7c | **Yes:** stages 5o, 7k |
| 24 | [Atmosphere dynamics, weather and paleoclimate](24-atmosphere-and-paleoclimate.md) | 8b | **Yes:** stage 5a variant |
| 4 | [Soils](04-soils.md) | 9 | No |
| 5 | [Mineral and ore resources](05-mineral-resources.md) | 9 | No (deposits keyed at L0, which follows note 14) |
| 28 | [Natural hazards and disasters](28-natural-hazards.md) | 9e | **Yes:** stage 9h, `hazardEvents` |

### Life

| # | Note | Phase | Changes the architecture? |
|---|---|---|---|
| 25 | [Vegetation dynamics](25-vegetation-dynamics.md) | 9b | **Yes:** stage 8v |
| 26 | [Fauna, species ranges and food webs](26-fauna-and-food-webs.md) | 9c | **Yes:** stage 8f, `species` |
| 27 | [Evolution and speciation](27-evolution-and-speciation.md) | 9d | **Yes:** stage 9e, `taxa` |
| 29 | [Disease and epidemics](29-disease-and-epidemics.md) | 9e, 13 | **Yes:** `pathogens` |

### Civilization

| # | Note | Phase | Changes the architecture? |
|---|---|---|---|
| 9 | [Dynamic population, settlement, trade and borders](09-dynamic-population-settlement-trade-borders.md) | 13 | No |
| 1 | [History, war, economics and politics simulation](01-history-simulation.md) | 13 | No |
| 2 | [Language evolution](02-language-evolution.md) | 13d | No |
| 30 | [Human origins, prehistory and migration](30-human-origins-and-prehistory.md) | 13h | **Yes:** stage 11p variant |
| 31 | [Technology and innovation](31-technology-and-innovation.md) | 13e | **Yes:** `technologies` |
| 32 | [Religion, ideology and culture dynamics](32-religion-ideology-culture.md) | 13f | **Yes:** `faiths`, `ideologies` |
| 33 | [Characters, dynasties and the narrative chronicle](33-characters-dynasties-chronicle.md) | 13g | **Yes:** `persons`, `dynasties` |
| 34 | [Settlement morphology: towns, cities and streets](34-settlement-morphology.md) | 11b | **Yes:** stage 11s, `townPlans` |

### Imagination

| # | Note | Phase | Changes the architecture? |
|---|---|---|---|
| 35 | [Fantasy framework: rule overrides, magic, peoples, creatures](35-fantasy-framework.md) | 15 | **Yes:** Q15, §3.9 |
