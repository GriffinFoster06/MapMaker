# Design note 30: Human origins, prehistory and migration

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 13h (stage 11p, a variant of stage 11) |
| Depends on | Fauna and domesticable species (note 26), vegetation and wild crops (note 25), climate and ice ages (notes 22, 24), sea level and land bridges, hazards and disease (notes 28, 29), languages (note 2) |
| Used by | History t0 (instead of Azgaar's static human layer, Q5), T4 Earth tests (note 15), cultures and language families, the chronicle's deep past |

## 1. Problem

Q5 started history from Azgaar's static human layer and left "grow from first settlements" for later. A realistic world needs the deep story: where people (or several sapient species, note 35) arise, how they disperse across continents and land bridges during ice ages, where foraging gives way to farming, and which places become the first towns. That story explains why cultures and language families sit where they do. It is also the core of the T4 Earth test: with Earth's geography, farming should start in a few plausible centres at plausible times.

## 2. Canonical inputs and outputs

**Inputs:** a chosen origin (or origins) and start time; habitat, climate and sea level on the history axis (prehistory runs with coarse eras, §3.4, for example 100-year ticks); wild plants and animals with domesticability traits (notes 25, 26).

**Outputs**
- `peoples` table (populations with traits, technology level, subsistence mode).
- Population density over time; dispersal routes; foraging, pastoral and farming zones.
- Domestication events (which species, where, when) and their spread.
- The first settlements, cultures and proto-languages, handed to the history engine as t0 (replacing or seeding Azgaar's generators).

## 3. Approach and algorithm choice

### 3.1 Dispersal

A wave-of-advance model (Fisher–KPP reaction–diffusion) on the mesh, with diffusivity and growth set by habitat quality and subsistence mode; barriers (deserts, ice, sea beyond a crossing distance that grows with technology) and corridors (coasts, rivers, land bridges at low sea level). Coastal routes are favoured (the "coastal express" hypothesis), as a parameter.

### 3.2 Subsistence and domestication

Foraging carrying capacity from NPP and fauna; domestication occurs where domesticable species, sedentism and population pressure coincide (a hazard rate from those factors), producing a small number of independent centres. Farming then spreads by demic diffusion and cultural adoption, slowed by climate mismatch (east–west axes spread faster than north–south, a measurable outcome rather than a rule).

### 3.3 First settlements and cultures

Sedentary populations above a density threshold found villages; cultural and linguistic divergence follows isolation and time (note 2's proto-language generation per founding population). The output is a t0 state compatible with the note 9 and note 1 engines.

### 3.4 Speed

Prehistory runs at coarse ticks over tens of thousands of years on L0 or a coarse L1, with the timeline's era schedule (§3.4) switching to finer ticks as settlements appear.

## 4. Upstream references (algorithm level)

- **SLiM** spatial models and cultural-evolution recipes (`QtSLiM/recipes/`): dispersal and cultural trait patterns.
- **GAMA** agent models, **LIAM2** (alignment), **UrbanSim** (location choice) for settlement founding.
- **SongsOfFOSS** `game/society/pop-growth.lua`, `game/raws/events/migration.lua`: a game-scale demography and migration loop.
- **Literature:** Ammerman & Cavalli-Sforza (1971, 1984) wave of advance; Fort (2012) demic diffusion; Larson et al. (2014) domestication centres; Diamond (1997) axis orientation; Pinhasi et al. (2005) Neolithic spread dates; HYDE (Klein Goldewijk) for population back-casts.

## 5. Validation

- The wave-of-advance speed matches the analytic value √(4Dr) in homogeneous habitat.
- Dispersal respects sea-crossing limits.

## 6. Open questions

1. One origin or several (multiregional)? Proposed: a parameter, defaulting to one origin chosen by habitat suitability, with fantasy peoples (note 35) able to add more.

## 7. Size estimate

| Part | LOC |
|---|---|
| Dispersal engine | ~1,500 |
| Subsistence and domestication | ~1,500 |
| First settlements and cultures | ~1,200 |
| Handover to t0 | ~600 |
| Tests | ~1,200 |

## 8. User controls and edit points

- Parameters: origin(s), start time, growth rates, sea-crossing ability, domestication propensity.
- Edits: place an origin (seed), block or open a corridor, force a domestication centre, place a first city.
- Switch: prehistory `simulate | off` (off: Azgaar-style static t0, Q5).

## 9. Earth-recovery test

T4: on Earth's geography with an African origin, people reach every continent through plausible routes and land bridges; farming arises in a handful of centres (Fertile Crescent, China, Mesoamerica, Andes, New Guinea, Sahel or Ethiopia) at plausible times (order of 10 ka before present), and its spread speed in Europe is close to the observed ~1 km/yr.
