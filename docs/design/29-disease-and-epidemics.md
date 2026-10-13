# Design note 29: Disease and epidemics

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 9e (pathogen pool and reservoirs); Phase 13 (epidemics in history) |
| Depends on | Fauna and domestication (notes 26, 30), climate (vectors), settlement and trade networks (note 9), demography (note 1) |
| Used by | History (plagues, depopulation, collapse), the "germs" side of contact between peoples, the chronicle |

## 1. Problem

Disease is one of the strongest forces in human history: the Black Death, the Columbian exchange, endemic malaria shaping where people could live. A realistic history needs pathogens tied to ecology (animal reservoirs, vectors, climate), crowd diseases that require dense populations, and epidemics that travel along trade routes, with immunity making the first contact between long-separated populations catastrophic.

## 2. Canonical inputs and outputs

**Inputs:** fauna and livestock (reservoirs), climate (vector ranges), population density and settlement sizes, the route network and traffic, contact events between peoples.

**Outputs**
- `pathogens` table: transmission mode (contact, airborne, vector, water), reservoir species, R₀ range, case fatality, immunity duration, climate limits, origin.
- `disease.burden.<pathogen>` (endemic prevalence) on the history axis.
- Epidemic events with causes (origin, spread path, deaths), feeding demography and the chronicle.

## 3. Approach and algorithm choice

- **Origins:** zoonotic spillover from reservoir species, more likely with domestication and dense settlement (crowd diseases need a critical community size, Black 1966).
- **Endemic burden:** vector-borne diseases from climate suitability (temperature and humidity for vectors) and population.
- **Epidemics:** a metapopulation SEIR model on settlements connected by the route network, run at the history tick (with sub-steps for fast epidemics), with immunity stocks per population; contact between previously separated populations triggers exchange.
- **Determinism:** counter-based draws per (pathogen, settlement, tick).

## 4. Upstream references (algorithm level)

- **FLAMEGPU2**, **GAMA** example models (epidemic agent models), **SLiM** (host–pathogen recipes): patterns.
- **SongsOfFOSS** population and migration code: a game-scale demography reference.
- **Literature:** Kermack & McKendrick (1927); Black (1966) critical community size; Diamond (1997); McNeill, *Plagues and Peoples* (1976); Wolfe, Dunavan & Diamond (2007) origins of major human diseases.

## 5. Validation

- Metapopulation SEIR reproduces analytic final-size relations in simple cases.
- Crowd diseases do not persist below the critical community size.

## 6. Open questions

1. Should disease have a strong default effect, given how dominant it can be in history?

## 7. Size estimate

| Part | LOC |
|---|---|
| Pathogen generation and reservoirs | ~800 |
| Endemic burden | ~500 |
| Metapopulation epidemics | ~1,500 |
| Tests | ~800 |

## 8. User controls and edit points

- Parameters: spillover rates, virulence and transmissibility scales, immunity duration.
- Edits: create a pathogen, start an epidemic (seed), make a region disease-free, give a people immunity.
- Switch: disease `simulate | off`.

## 9. Earth-recovery test

T4: on Earth's geography with Old World domestication, crowd diseases arise in the dense agrarian regions, and contact with long-isolated populations produces large mortality, in line with historical estimates at order-of-magnitude level; vector-borne burden follows the tropical belt.
