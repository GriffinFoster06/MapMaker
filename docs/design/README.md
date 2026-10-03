# Design notes (Phase 2)

These notes cover the capabilities that have no usable upstream implementation (`audit/CAPABILITY_MATRIX.md`, Gaps), plus notes 13 (decision Q9) and 14 (decision D5).

Every note uses the template from `docs/ARCHITECTURE.md` §7, Phase 2:
1. problem;
2. canonical inputs and outputs (layers, entities, events);
3. approach and algorithm choice;
4. upstream references (algorithm level only; Eurace and WRF-Hydro excluded);
5. validation method;
6. open questions;
7. size estimate.

A note that changes the architecture says so in a "Consequences for ARCHITECTURE.md" subsection under Approach. Those changes are applied to `ARCHITECTURE.md` and listed under "Changes from the Phase 2 design notes" in its Resolved decisions section.

Notes 14, 3, 6 and 13 were written first, because they could change the architecture.

| # | Note | Phase | Changes the architecture? |
|---|---|---|---|
| 1 | [History, war, economics and politics simulation](01-history-simulation.md) | 13 | No |
| 2 | [Language evolution](02-language-evolution.md) | 13d | No |
| 3 | [Partial-world inference](03-partial-world-inference.md) | 11 | **Yes:** §4 step 0p |
| 4 | [Soils](04-soils.md) | 9 | No |
| 5 | [Mineral and ore resources](05-mineral-resources.md) | 9 | No (deposits keyed at L0, which follows note 14) |
| 6 | [Regional-patch refinement](06-regional-patch-refinement.md) | 11 | **Yes, a refinement:** §3.1 patch meshes |
| 7 | [STL export](07-stl-export.md) | 12 | No |
| 8 | [Parameter-scale documentation](08-parameter-scale-documentation.md) | 8 | No |
| 9 | [Dynamic population, settlement, trade and borders](09-dynamic-population-settlement-trade-borders.md) | 13 | No |
| 10 | [Physical → simulation parameter mapping](10-physical-parameter-mapping.md) | 6 | No |
| 11 | [Continuous seasons](11-continuous-seasons.md) | 6 | **Yes:** §3.2 climate layers |
| 12 | [Lake and basin hydrology](12-lake-and-basin-hydrology.md) | 7 | No |
| 13 | [Forward plate evolution over deep time](13-forward-plate-evolution.md) | 6b | **Yes:** §3.2–3.4, §4, §5, §7 |
| 14 | [Resolution-independent structure for faithful previews](14-resolution-independent-structure.md) | 4b | **Yes:** §3, §4 |
