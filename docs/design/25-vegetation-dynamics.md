# Design note 25: Vegetation dynamics

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 9b |
| Depends on | Climate harmonics (notes 11, 24), soils (note 4), hydrology and groundwater (note 12), CO₂ (note 24), fire weather |
| Used by | Biomes (stage 8), erosion (cover factor), albedo and the water balance (coupling loop), fauna (note 26), soils (organic input), the human layer (forests, farmland, timber, fuel), map art (true-colour and forest symbols) |

## 1. Problem

Biomes today are a lookup from climate (Köppen plus Azgaar's matrix). Real vegetation is a dynamic state: plant types compete for light and water, fire resets succession, CO₂ changes water-use efficiency, and vegetation in turn changes erosion, albedo and runoff. Worlds with unusual climates (or past and future states on the geologic axis) need vegetation that follows from physiology, not from Earth's lookup table.

## 2. Canonical inputs and outputs

**Inputs:** monthly temperature, precipitation, radiation and humidity (from harmonics); soil water capacity and texture; CO₂; fire ignition; land use (from history, note 9).

**Outputs**
- `veg.pft.<type>` cover fractions for plant functional types (tropical evergreen, tropical deciduous, temperate broadleaf, temperate needleleaf, boreal, C3 grass, C4 grass, shrub, tundra, and desert succulents as an extension).
- `veg.biomass`, `veg.lai` (leaf area index), `veg.npp`, `veg.fireReturn` (years).
- `biome` refined from PFT composition (stage 8 classification uses it when vegetation is on).

## 3. Approach and algorithm choice

### 3.1 Model

An LPJ-style dynamic global vegetation model on L1 (or L0 for fast tiers): photosynthesis (Farquhar–Collatz with water stress), autotrophic respiration, allocation, establishment and mortality per PFT, bioclimatic limits, and soil-water dynamics. It runs to equilibrium (a few hundred model years with a fixed climate, accelerated by spin-up tricks) and, when the climate changes over time, transiently.

### 3.2 Fire

The SPITFIRE scheme (fire danger from fuel moisture and weather, spread and intensity, PFT-specific mortality) gives fire return intervals and shapes savanna and boreal mosaics.

### 3.3 Coupling

Vegetation cover enters erosion (cover factor), albedo and evapotranspiration (the water balance) in the bounded coupling loop at L0. Land use from history replaces natural vegetation with crops and pasture on the history axis.

### 3.4 Speed

Monthly time steps, with the equilibrium solved by a fixed number of spin-up years; WASM kernels if profiling needs them (note 38). Preview tiers use the biome lookup.

## 4. Upstream references (algorithm level)

- **LPJmL** `src/tree/`, `src/grass/` (PFT physiology), `src/soil/` (soil water, `infil_perc.c`), `src/spitfire/` (fire), `src/image/biome_classification.c` (biomes from PFTs), `src/crop/` (crops, for history-axis land use): port the core to TypeScript (allowed since Q12).
- **CTSM** `src/biogeochem/CNDV*Mod.F90` (DGVM), `CNFire*Mod.F90`: alternative formulations.
- **Literature:** Sitch et al. (2003) LPJ; Thonicke et al. (2010) SPITFIRE; Farquhar et al. (1980); Collatz et al. (1992).

## 5. Validation

- The port reproduces LPJmL outputs for a set of reference climate cells.
- Mass balance of carbon and water.

## 6. Open questions

1. Should nitrogen limitation be modelled, or is a parameterised fertility from soils enough?

## 7. Size estimate

| Part | LOC |
|---|---|
| PFT physiology and competition | ~3,000 |
| Soil water | ~800 |
| Fire | ~1,200 |
| Coupling and classification | ~600 |
| Tests | ~1,500 |

## 8. User controls and edit points

- Parameters: PFT set (including user-defined or fantasy PFTs via note 35), CO₂ fertilisation, fire ignition rate, growth rates.
- Edits: paint forest, grassland or desert (soft or pin); protect a forest from history-axis clearance; plant a new PFT in a region.
- Switch: vegetation `simulate | lookup | manual`.

## 9. Earth-recovery test

T2: with Earth's climate and soils, the PFT and biome map agrees with MODIS land cover above a target, and NPP correlates with MOD17 estimates. Fire return intervals fall in observed ranges per biome.
