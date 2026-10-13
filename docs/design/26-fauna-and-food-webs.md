# Design note 26: Fauna, species ranges and food webs

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 9c |
| Depends on | Vegetation (note 25), climate, hydrology, ocean productivity (note 23), evolution (note 27, for the species pool on the geologic axis) |
| Used by | Resources (game, fish, furs, ivory), domestication (note 30), disease reservoirs (note 29), fantasy creatures (note 35), the encyclopedia (note 36), map art (creature symbols) |

## 1. Problem

Worlds have animals: herds that migrate, predators, fish in the seas, birds on islands, species found nowhere else. Azgaar has none beyond resources; orogen has none. For realism the fauna must follow habitat and history: richness peaks in the tropics, islands hold endemics, mountains split ranges. For worldbuilding, individual species need names, traits and ranges the user can browse and edit, and civilisations need to know which animals can be hunted or domesticated.

## 2. Canonical inputs and outputs

**Inputs:** habitat layers (biome, PFTs, NPP, climate, water, elevation, ocean productivity); the species pool (from note 27, or generated directly when evolution is off).

**Outputs**
- `species` table (§3.10): taxon link, body mass, diet guild (herbivore, carnivore, omnivore, detritivore; marine, freshwater, terrestrial, aerial), thermal and moisture niche, dispersal ability, social structure, domesticability traits (diet, growth rate, temperament, herd structure: Diamond's criteria), name (via language, note 2).
- Range maps: per species, a compressed cell set or a habitat-suitability field with occupancy.
- `fauna.richness` per guild, `fauna.biomass` per guild, `fauna.migration` routes (seasonal) for migratory species.

## 3. Approach and algorithm choice

### 3.1 Species pool and niches

Species are generated with traits drawn from allometric and ecological distributions (body-mass distributions, niche widths) so that the pool has realistic structure: many small species, few large ones. With evolution on (note 27), the pool and its phylogeny come from the geologic axis instead.

### 3.2 Ranges

Habitat suitability from each species' niche against the habitat layers, then occupancy by dispersal from origin areas through suitable cells (a cost-distance spread limited by barriers such as oceans, mountains and deserts). RangeShiftR's individual-based dispersal and population dynamics provide the process model for the fine tier; the coarse tier uses the cost-distance approximation.

### 3.3 Food webs

Guild-level biomass from NPP through trophic transfer efficiencies (roughly 10% per level), the niche model of food-web structure (Williams & Martinez 2000) linking species within a region, and predator–prey constraints on body-mass ratios. Population sizes are guild biomass divided among species by abundance distributions.

### 3.4 Migration

Seasonal migrants follow the seasonal harmonics: routes between breeding and wintering ranges along low-cost corridors.

### 3.5 Scale

Thousands of species are fine for the table; per-species range fields are compressed. Only named, notable species get full detail; the rest are represented in guild aggregates (note 38's level of detail).

## 4. Upstream references (algorithm level)

- **RangeShiftR** `src/RScore/{Individual,Population,Species,DispersalTrait,Landscape}.cpp`: individual-based dispersal and range dynamics; port the core for the fine tier (allowed since Q12).
- **SLiM** `core/spatial_map.cpp`, `core/interaction_type.cpp`: spatial interaction kernels.
- **GAMA**, **FLAMEGPU2**: agent-based simulation patterns for herds and migrations.
- **Literature:** Williams & Martinez (2000) niche model; Brown et al. (2004) metabolic theory; Diamond, *Guns, Germs, and Steel* (domestication criteria); MacArthur & Wilson (1967) island biogeography.

## 5. Validation

- Trophic biomass pyramids are consistent with NPP and transfer efficiencies.
- Ranges never cross impassable barriers for species without the dispersal ability.

## 6. Open questions

1. How many species to simulate per world by default (hundreds of notable ones plus aggregates, or thousands)?

## 7. Size estimate

| Part | LOC |
|---|---|
| Species generation and traits | ~1,200 |
| Range and dispersal (coarse and fine) | ~2,500 |
| Food webs and biomass | ~1,200 |
| Migration | ~600 |
| Tests | ~1,200 |

## 8. User controls and edit points

- Parameters: species-pool size, trait distributions, dispersal scale, transfer efficiency.
- Edits: create, edit or remove a species; paint or pin its range; introduce a species somewhere (a seed: it spreads from there); mark a species as domesticable or extinct.
- Switch: fauna `simulate | manual | off`.

## 9. Earth-recovery test

T1/T2: the latitudinal richness gradient, the species–area relation on islands, endemism rates on isolated islands, and the correlation of terrestrial-vertebrate richness with observed (IUCN-derived) richness maps on Earth's habitat, within tolerances set at Phase 9c.
