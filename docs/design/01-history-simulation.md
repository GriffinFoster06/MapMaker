# Design note 1: History, war, economics and politics simulation

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 13 (13a engine core, 13b economics, 13c politics and war; 13d is note 2) |
| Depends on | §3.4 timeline and agents, §3.5 counter-based RNG, note 9 (population, settlement, trade, borders), note 2 (languages) |

## 1. Problem

The requirement is a long-run simulation of war, economics, politics and human history over thousands of years, starting from Azgaar's static human layer (Q5). No upstream repo models conflict, state formation, diplomacy or dynamic economies in a form that can be extracted (matrix gap 1).

The simulation has to:
- be **deterministic and resumable mid-run** (§5);
- explain itself, through **causal event chains**;
- run a 5,000-year benchmark at 1-year ticks in the browser (Q6), and longer spans through coarser eras.

This note covers the engine core (tick loop, agent tables, event causality, RNG), plus politics, diplomacy, war and economics. Note 9 covers demography, settlements, trade flows and borders. Note 2 covers languages.

## 2. Canonical inputs and outputs

**Inputs**
- **t0 state from stage 11:** settlements, polities (from `states`), provinces, cultures, religions, routes, markets and goods; plus the physical layers (`koppen`, `soilFertility`, `mineral.*`, hydrology).
- **Parameters:**
  - conflict propensity;
  - trade openness;
  - technology growth rate;
  - era schedule (`dtYears`).

**Agent tables** (struct-of-arrays, `timeAxis: 'history'`)
- **`polities`:** government form, capital, treasury, tax rate, military strength (levies, professional), legitimacy, stability, technology level, dominant culture and religion, ruler entity (aggregated, not individuals), a sparse relations matrix (opinion, treaties, war state), and war goals.
- **`wars`:** belligerent sides, goal, war score, start tick, fronts (province pairs), casualties.
- **`treaties`:** kind (alliance, vassalage, trade pact, truce), parties, expiry.
- **`markets`:** prices per good, stock, and the settlements served (shared with note 9).

**Layers changed over time:** `polity`, `province`, `landUse` and `population` (from note 9), plus `devastation` (Float32, decays).

**Events:** war declared, battle, siege, peace, annexation, revolt, succession crisis, collapse, reform, treaty signed or broken, famine (from note 9), price shock. Each event carries `causes` (§3.4), for example harvest failure → famine → revolt → collapse.

## 3. Approach and algorithm choice

### 3.1 Tick structure

One tick advances `dtYears` (one year by default). Phases run in a **fixed order**, and each phase is data-parallel over its entities:

1. **Environment.** Climate anomaly per region: a keyed draw and a red-noise process for droughts and cold years. It scales harvest yields.
2. **Demography and settlement** (note 9).
3. **Production and markets.** Output per settlement from land use, labour and technology. Prices clear per market (§3.4).
4. **Trade flows** along routes (note 9). Tariffs and tribute are paid into treasuries.
5. **Polity budgets.** Taxes come in; upkeep (army, administration) goes out; deficits erode stability.
6. **Politics.** Stability, legitimacy, revolts, successions, reforms (§3.3).
7. **Diplomacy.** Opinion updates; treaties are made and broken (§3.5).
8. **War.** Declarations, campaigns, battles, sieges, peace (§3.6).
9. **Culture, religion and language** (note 2, at a coarser cadence of every 10 ticks).
10. **Bookkeeping.** Keyframes every K ticks (K = 50 by default), change logs, and event-log chunking.

**Determinism.** Every random draw is `hash(stream, tick, entityId, k)` (§3.5). Phases read the frozen state from the start of the phase and write into buffers that are committed at the end, so the order of entities inside a phase cannot change results. Conflicts between writers, such as two polities claiming one province, are resolved by stable keys: the highest score wins, and ties go to the lower id.

### 3.2 Aggregate agents, not individuals

Per Q6, agents are aggregates: settlements with population by cohort, polities, cultures and markets.
- Rulers are a row of traits per polity with a succession rule. There are no individual characters, except **named notable figures**: rulers, generals and founders are generated with names (note 2) for the event log only.
- This keeps a tick at O(settlements + polities + routes).
- **Budget:** about 10,000 settlements and 300 polities at roughly 1–3 ms per tick in a worker, so 5,000 ticks run in about 15 s, plus keyframing.

### 3.3 Politics

- **Stability** S ∈ [0, 1] is updated each tick from:
  - legitimacy;
  - the fiscal balance;
  - war score;
  - the share of the population of a different culture or religion;
  - devastation;
  - distance from the capital (overextension).
- **Revolt hazard** per province is a logistic function of local unrest. A revolt draw creates a rebel side in the war system.
- **Succession** happens when the ruler's term or lifespan ends (drawn from a hazard). A succession crisis has probability rising with low legitimacy and with the government form (elective vs hereditary).
- **Collapse.** A polity fragments when S < S_min for T ticks. Its provinces split along culture and province lines into successor polities.
- **Structural-demographic pressure** (Turchin & Nefedov 2009): elite overproduction, a proxy from population growth against land, raises instability with a lag. This produces long-period secular cycles rather than noise.
- **Government forms:** tribal, chiefdom, monarchy, republic, theocracy, empire. Transitions are driven by size, wealth and technology thresholds, and by reform events.

### 3.4 Economics

- **Goods** come from Azgaar's `goods-generator`, extended by soils and minerals.
- Each **market** clears prices with tâtonnement: p ← p·exp(η·(D − S)/(S + D)) per tick, with bounded steps.
- **Settlement production** follows a Cobb–Douglas function of labour, land quality and capital (buildings).
- **Consumption** has subsistence first; demand for luxuries grows with income.
- **Treasuries** collect taxes as a share of production and trade, plus tribute.
- **Debasement** and **price shocks** become events when price changes exceed thresholds.
- Inter-regional trade volumes come from note 9's gravity model. This note owns the prices that feed that model.

### 3.5 Diplomacy

- Pairwise **opinion** is driven by shared culture and religion, trade volume, borders, past wars, rivalry over the same province, and alliances.
- **Treaties:**
  - an alliance forms when there is a common threat and opinion exceeds a threshold;
  - vassalage forms when the power ratio exceeds a threshold and the weaker side's survival is threatened;
  - trade pacts follow trade volume.
- Decisions are **one-shot evaluations of expected utility**, with a utility per option and a logit choice, rather than tree search. OpenSpiel's game abstraction is a reference only. Full game-theoretic solving is out of the budget.

### 3.6 War

- **Declaration.** The war-goal utility (claimed provinces' value × expected win probability − expected cost) must exceed a threshold set by the conflict-propensity parameter and modified by stability.
- **Campaigns** move armies along the route graph toward targets on the front, by least-cost path.
- **Battles** are resolved with Lanchester-type attrition (Lanchester 1916), using a square law for ranged and modern warfare, a linear law for melee-era warfare, and terrain and fortification multipliers. A keyed draw supplies the variance.
- **Sieges** reduce a fortified settlement's supplies; capture flips province control.
- **War score** accumulates from battles and occupation. Peace is negotiated when one side's war score or exhaustion crosses a threshold: occupied claimed provinces are transferred, and tribute or vassalage may follow.
- **Consequences:** devastation, population loss (into note 9), trade disruption, stability shocks.

### 3.7 Causality

Each event records `causes`, the ids of events that pushed a decisive term past its threshold. For example, a revolt cites the famine and tax-rise events that raised unrest above the revolt threshold that tick. A small **attribution rule** keeps this cheap: every state variable that crosses a threshold keeps the last event that changed it by more than ε. The UI can then walk chains backwards.

## 4. Upstream references (algorithm level)

- **Azgaar** `states-generator.ts`, `provinces-generator.ts`, `routes-generator.ts`, `markets-generator.ts`, `military-generator.ts`: t0 structures and the expansion-cost idea. MIT, extracted for t0 only.
- **UrbanSim:** multinomial-logit discrete choice (location and option choice), as an idea.
- **LIAM2:** process ordering and alignment in microsimulation, as an idea.
- **OpenSpiel:** game and state abstractions for diplomacy, as a reference only.
- **MESSAGEix:** cost-minimising commodity flow, as an idea for trade; not used.
- **Eurace:** excluded.
- **Literature:** Lanchester (1916); Turchin & Nefedov, *Secular Cycles* (2009); Turchin, *Historical Dynamics* (2003); Cederman (1997) agent-based state formation.

## 5. Validation

- **Determinism and resume.** Run 500 ticks, save at 237, reload, finish, and compare hashes (the CI test from §5). Results must be the same whether the worker pool has 1 or 8 workers.
- **Conservation.** Population accounting closes every tick: births − deaths ± migration (note 9). Treasury flows close.
- **Stylised facts**, over 10 seeds and 5,000 years, with bounds set at Checkpoint 13c:
  - polity lifetimes are heavy-tailed (median about 150–300 years);
  - war frequency per polity-century is in a plausible historical range;
  - largest-polity share of land shows rise and fall;
  - secular cycles appear in population (spectral peak at 150–300 years when the structural-demographic term is on);
  - the city rank–size slope is near −1 (with note 9).
- **Causal chains.** Every collapse event has at least one cause. No event cites a future event.
- **Performance.** Ticks per second at the benchmark scale, per browser.

## 6. Open questions

1. ~~**Individual characters.**~~ **Resolved at Checkpoint 2:** aggregate agents, with named notable figures for the event log only (D10).
2. **Technology.** Should it be a single scalar per polity (proposed), or a small tech tree that gates government forms and warfare laws?
3. **Religion.** Should it be dynamic (schisms, conversion), in 13c or deferred?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Engine core (tick loop, phases, buffers, keyframes, event log, causality) | ~2,500 |
| Politics | ~1,500 |
| Economics and markets | ~1,500 |
| Diplomacy | ~800 |
| War | ~2,000 |
| Tests and stylised-facts harness | ~2,500 |
| **Total (excluding notes 2 and 9)** | **~10,800** |
