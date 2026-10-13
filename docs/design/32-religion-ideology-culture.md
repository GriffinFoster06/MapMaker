# Design note 32: Religion, ideology and culture dynamics

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 13f |
| Depends on | History engine (note 1), cultures and languages (notes 2, 9), Azgaar's static religions (t0), technology (note 31), persons (note 33) |
| Used by | Politics (legitimacy, stability, alliances, holy wars), culture borders on maps, calendars and festivals (note 20), architecture styles (note 34), the chronicle and encyclopedia |

## 1. Problem

Azgaar generates religions and cultures at t0 but they do not change. In real history, faiths are founded, spread along trade routes and through conquest, schism, reform and syncretise; ideologies rise with new social conditions; cultures diverge, assimilate and blend. These dynamics drive much of politics. Note 1 lists "culture, religion and language" as a tick phase but gives religion and ideology no model.

## 2. Canonical inputs and outputs

**Inputs:** populations and their culture, language and faith shares; contact network; polity policies (tolerance, state religion); persons (founders, prophets, reformers).

**Outputs**
- `faiths` table: doctrine traits (a vector: theism, ritualism, proselytism, asceticism, hierarchy, tolerance, …), institutions, holy places, founder, parent faith (a tree), schisms.
- `ideologies` table: political and social ideas with traits and conditions of appeal.
- Per-population shares of cultures, faiths and ideologies on the history axis; events (founding, conversion waves, schism, reform, persecution).

## 3. Approach and algorithm choice

- **Cultural traits** as vectors that drift (neutral change) and converge under contact (Axelrod's culture model, with bounded confidence), producing divergence in isolation and blending at contact zones.
- **Faith spread** as a contagion over the contact network, weighted by proselytism, state support, trade intensity and the doctrine's fit to local conditions (a logit choice per population, from UrbanSim's discrete-choice machinery).
- **Founding and schism** as hazard events: new faiths arise with founders (note 33) under stress (crisis, inequality, contact), inheriting traits from a parent with mutations; schisms when internal heterogeneity passes a threshold.
- **Ideologies** appear when their conditions are met (literacy, urbanisation, technology, inequality) and spread like faiths.
- **Effects:** shared faith raises legitimacy and alliance odds; differences raise conflict odds; doctrines affect economic and demographic parameters in documented ways.

## 4. Upstream references (algorithm level)

- **Azgaar** `religions-generator.ts`, `cultures-generator.ts`: t0 structures and naming.
- **SongsOfFOSS** `game/entities/religion.lua`, `culture.lua`: minimal game-scale structures.
- **UrbanSim** `urbansim/urbanchoice/mnl.py`: multinomial logit for conversion choice.
- **SLiM** cultural-trait recipes: transmission patterns.
- **Literature:** Axelrod (1997); Boyd & Richerson, *Culture and the Evolutionary Process*; Stark, *The Rise of Christianity* (growth rates); Whitehouse et al. (Seshat) on moralising religions.

## 5. Validation

- Isolated populations diverge; connected populations converge (Axelrod regime tests).
- Conversion follows the network; growth curves are logistic in simple cases.

## 6. Open questions

1. How explicit should doctrines be (generated texts and tenets for the encyclopedia, or trait vectors only)? Proposed: trait vectors, with generated summaries from note 36.

## 7. Size estimate

| Part | LOC |
|---|---|
| Culture trait dynamics | ~800 |
| Faith spread, founding and schism | ~1,500 |
| Ideologies | ~800 |
| Effects wiring | ~600 |
| Tests | ~800 |

## 8. User controls and edit points

- Parameters: drift and convergence rates, proselytism scale, schism threshold, tolerance defaults.
- Edits: create or edit a faith (doctrine, holy sites, founder), convert a region at a time (seed), forbid a faith's spread, write a culture's traits.
- Switch: religion and culture dynamics `simulate | manual | off`.

## 9. Earth-recovery test

T4: on Earth's geography, a few faiths spread to continental scale along trade networks while many local ones persist; the number of major faith families and their spread scales are in the range of the historical record (order of magnitude).
