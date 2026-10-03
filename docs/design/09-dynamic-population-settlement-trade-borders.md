# Design note 9: Dynamic population, settlement, trade and borders

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 13a (demography, settlements), 13b (trade), 13c (borders, with note 1) |
| Depends on | Stage 11 t0 (Azgaar generators via the facade), note 1 tick structure, note 4 soils |

## 1. Problem

Azgaar produces a convincing **static** human layer: population per cell, burgs, cultures, states, provinces and routes. It has no dynamics (matrix gap 10). This note is the bridge from that t0 snapshot to a living history:
- people grow, migrate and starve;
- settlements are founded, grow, decline and are abandoned;
- trade flows over routes, and routes appear and fade;
- borders move.

The simulation must start from Azgaar's state **exactly**, so tick 0 equals stage 11's output.

## 2. Canonical inputs and outputs

**Inputs**
- **From stage 11:** `population` per cell, `settlements` (Azgaar burgs: cell, offset, population, port, capital), `cultures`, `polities` (states), `provinces` and `routes` (cell paths, type).
- **Physical layers:** `koppen`, `biome`, `soilFertility`, `soilDepth`, `discharge`, `mineral.*`, elevation and slope.
- **Parameters:** fertility, mortality, migration propensity, agricultural productivity (by technology), trade friction.

**Agent tables** (`timeAxis: 'history'`)
- **`settlements`:** population by cohort (5 age bands × 2 sexes), food stock, buildings (capital proxy), rank (hamlet to metropolis), founding tick, abandonment tick.
- **`routes`:** a graph with edge cost, capacity, usage (exponential moving average), and creation and abandonment ticks.

**Time-varying layers:** `population` (rural, per cell), `habitability`, `landUse` (cropland, pasture, forest, wild), `culture`, `polity`, `province`.

**Events:** settlement founded or abandoned, famine, epidemic, migration wave, route opened or closed, border change (from conquest, revolt or annexation), province reorganised.

## 3. Approach and algorithm choice

### 3.1 t0 conversion (exact)

- The cohort structure comes from a stable-population model (Coale–Demeny-style life table, chosen by technology level), scaled to the Azgaar population, so every settlement's total equals Azgaar's.
- Rural population per cell is copied from the facade's `pop`.
- Route geometry and types are copied from Azgaar.
- A **t0 parity test** asserts that every agent table equals stage 11's output.

### 3.2 Carrying capacity

K(cell) = area × agricultural potential(technology) × f(soil fertility, Köppen growing season, slope, water access), plus pastoral and fishing terms.

The agricultural potential is a net-primary-productivity proxy from temperature and precipitation (the Miami model, Lieth 1975), so it can be calibrated against Earth.

### 3.3 Demography

For each settlement and rural cell, per tick:
- births and deaths come from cohort rates;
- mortality rises with density over K (logistic pressure) and with food shortage;
- **famine** happens when the food stock goes negative after a bad harvest (note 1, environment phase), and adds excess mortality and out-migration;
- **epidemics** have a hazard rising with urban size and trade connectivity; they spread along routes as an SIR wave across settlements, with an event per wave.

### 3.4 Migration

Each region's movers choose a destination by **multinomial logit**, in the style of UrbanSim location choice:

U = β₁·log(K − P) + β₂·wages + β₃·same culture − β₄·travel cost − β₅·danger

The candidate destinations are settlements and frontier cells within a travel-cost radius. Flows are drawn from the probabilities with keyed draws, and are aggregate (counts, not individuals).

### 3.5 Settlement founding, growth and decline

- **Founding.** A frontier cell whose rural density and utility exceed a threshold founds a hamlet. The site is chosen by **Azgaar's burg site-scoring rules**: river confluence, coast, harbour, defensibility, extracted from `burgs-generator.ts` as a scoring function.
- **Rank** follows population thresholds, with hysteresis.
- **Abandonment** happens when population stays below a minimum for T ticks.
- **Growth** comes from natural increase plus net migration. Urban productivity scales super-linearly with size (Bettencourt et al. 2007), which produces rank–size dynamics.

### 3.6 Trade and routes

- **Flows** between settlement pairs follow a **gravity model**, F_ij ∝ (S_i^α · D_j^β)/c_ij^γ, where supply S and demand D are per good class (prices from note 1 §3.4) and c_ij is the least-cost path cost on the route graph.
- **Path costs** come from terrain (slope, rivers and fords, sea lanes for ports) and route type.
- **Route evolution.** Usage is an exponential moving average.
  - An edge with sustained high usage is upgraded: track → road → highway, or a sea lane gets ports.
  - An edge with low usage decays and closes.
  - A new edge is built when the ratio of potential flow to cost on a missing link exceeds a threshold. Candidate links are the k nearest settlements, costed with Azgaar's `routes-generator.ts` cost function.

### 3.7 Borders

Control of each province (or cell) by a polity follows an influence field: power at the capital, decaying with travel cost, plus garrison and loyalty. This is a dynamic version of Azgaar's state-expansion cost model in `states-generator.ts`.
- **Peaceful drift:** an unclaimed or contested frontier cell flips when one influence exceeds another's by a margin for T ticks.
- **Violent change:** conquest and revolt transfers (note 1) override drift.
- **Provinces** are re-derived when a polity's provinces become disconnected, or exceed a size bound. Azgaar's `provinces-generator.ts` algorithm runs again on the affected polity only.

### 3.8 Determinism and cost

- Every random choice is keyed: `(stream, tick, settlementId or cellId, k)`.
- Migration and trade are computed on the frozen state of the tick and committed together.
- Gravity-model flows use a sparse k-nearest set (k = 16), so the cost per tick is O(S·k).

## 4. Upstream references (algorithm level)

- **Azgaar** `population-generator.ts`, `burgs-generator.ts`, `routes-generator.ts`, `states-generator.ts`, `provinces-generator.ts`, `cultures-generator.ts`: t0 extraction and the scoring and cost functions. MIT.
- **UrbanSim:** logit location choice and relocation-rate ideas.
- **RangeShiftR:** dispersal-kernel ideas for frontier diffusion, as a reference only.
- **Literature:**
  - Lieth (1975), the Miami NPP model;
  - Coale & Demeny (1983), model life tables;
  - Zipf (1949);
  - Bettencourt et al. (2007), *PNAS* 104;
  - Wilson (1970), *Entropy in Urban and Regional Modelling* (gravity model);
  - Kermack & McKendrick (1927), SIR.

## 5. Validation

- **t0 parity:** tick 0 equals stage 11's output exactly.
- **Conservation:** births − deaths ± migration closes per tick, globally and per settlement.
- **Stylised facts** over 10 seeds and 5,000 years, with bounds set at Checkpoints 13a and 13b:
  - city rank–size slope near −1;
  - the share of the population that is urban rises with technology;
  - settlement spacing has central-place regularity (nearest-neighbour ratio > 1);
  - population tracks K with lags;
  - famine frequency is in a plausible range.
- **Border sanity:** polities stay contiguous unless an event explains the split; no cell is claimed twice.
- **Determinism and resume:** hash equality across save and resume, and across worker counts.

## 6. Open questions

1. **Rural population resolution:** per L1 cell (fine, costly at 2.56M) or per province? I propose per cell up to 200k cells and per province above that, with cells as a derived view.
2. **Naval trade and colonisation:** in 13b, or later?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| t0 conversion | ~600 |
| Carrying capacity | ~400 |
| Demography and epidemics | ~1,200 |
| Migration | ~600 |
| Settlements | ~900 |
| Trade and routes | ~1,500 |
| Borders and provinces | ~1,000 |
| Tests and stylised-facts harness | ~1,800 |
| **Total** | **~8,000** |
