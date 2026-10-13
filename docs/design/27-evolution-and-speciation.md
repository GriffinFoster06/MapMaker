# Design note 27: Evolution and speciation over deep time

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 9d |
| Depends on | Plate evolution and paleogeography (note 13), paleoclimate (note 24), ice ages (note 22), hazards and impacts (notes 20, 28), large igneous provinces (note 21) |
| Used by | Fauna and flora species pools (notes 25, 26), the encyclopedia's tree of life (note 36), fantasy species (note 35), human origins (note 30) |

## 1. Problem

Why does an island have its own birds, why do two continents share mammals, why did a whole group vanish? On a real planet the answer is evolution over the plate and climate history. A realistic world whose species are just generated for the present has no such story. This note evolves clades on the geologic axis, so that biogeography follows from paleogeography: separations produce divergence, collisions produce interchange, catastrophes produce extinctions and radiations.

## 2. Canonical inputs and outputs

**Inputs:** keyframed paleogeography (land, sea, elevation, climate) on the geologic axis; extinction drivers (impacts, LIPs, rapid climate change); starting conditions (a seeded set of founding lineages, and the time life appears, a parameter).

**Outputs**
- `taxa` table: a phylogenetic tree (parent, origin time, extinction time, trait vector, ancestral range).
- Present-day species pool for note 26 (and PFT variants for note 25), with phylogeny and ranges.
- Events on the geologic axis: radiations, mass extinctions, faunal interchanges (with causes, so the chronicle can explain them).

## 3. Approach and algorithm choice

### 3.1 Lineages on a coarse grid

Lineages live on the reference mesh (L0) with ranges as cell sets, stepping at the geologic Δt (about 1 Myr). Each step:
- **range dynamics**: expansion into suitable connected cells, contraction where the climate leaves the niche;
- **speciation**: allopatric (when a range is split by a barrier for longer than a threshold), peripatric (founder populations on islands), with trait divergence by drift and selection toward local optima;
- **extinction**: background (a rate depending on range size) plus events (impacts, LIPs, rapid climate change) with selectivity by traits;
- **trait evolution**: Brownian or Ornstein–Uhlenbeck processes on traits (body mass, thermal niche, diet), with niche conservatism.

### 3.2 Coupled with plate evolution

The same event schedule as note 13: when continents collide, interchange occurs; when they rift, vicariance splits ranges. Deterministic by counter-based draws keyed on (lineage id, step, k).

### 3.3 Fast and slow passes

Like note 13, a fast pass at large Δt decides the tree and major events; a slow pass refines ranges. Preview-stable by construction.

### 3.4 Not genetics

Population genetics (alleles, haplotypes) is out of scope for the deep-time model; SLiM's individual-based genetics inspire only the speciation and trait rules. A per-species genetic model can be a later module.

## 4. Upstream references (algorithm level)

- **SLiM** `core/population.cpp`, `core/subpopulation.cpp`, `core/spatial_map.cpp`: spatial population structure and speciation recipes (concepts; full genetics not used).
- **RangeShiftR** `src/RScore/GeneticFitnessTrait.cpp`, `DispersalTrait.cpp`: trait inheritance in range dynamics.
- **Literature:** gen3sis (Hagen et al. 2021, *PLoS Biol.*), a spatially explicit eco-evolutionary simulator on paleo-landscapes, as the closest published model (a candidate upstream to audit); Raup & Sepkoski (1982) mass extinctions; Simpson's adaptive radiations.

## 5. Validation

- Tree statistics (tree balance, lineage-through-time curves) in the range of empirical phylogenies.
- Vicariance and dispersal patterns follow the plate history.

## 6. Open questions

1. When does life start, and does the model start from complex life or from a single ancestor? Proposed: a parameter, with "complex life from N founding lineages at T Myr" as the default.

## 7. Size estimate

| Part | LOC |
|---|---|
| Lineage and range engine | ~2,000 |
| Speciation, extinction, traits | ~1,500 |
| Coupling with paleogeography | ~800 |
| Export to fauna and flora pools | ~600 |
| Tests | ~1,200 |

## 8. User controls and edit points

- Parameters: speciation and extinction rates, niche conservatism, founding lineages, start time.
- Edits: schedule a mass extinction (seed), protect a lineage, introduce a lineage at a time and place, name a clade.
- Switch: evolution `simulate | off` (off: note 26 generates the present-day pool directly).

## 9. Earth-recovery test

T3: run from a Pangaea-like start with Earth parameters; the present-day pool shows Earth-like biogeographic realms (distinct faunas on long-isolated continents, interchange where continents joined), island endemism, and diversification curves within the range of the fossil record's statistics.
