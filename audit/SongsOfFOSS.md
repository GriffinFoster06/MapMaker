# Audit: SongsOfFOSS (Songs of the Eons)

Commit `4c9f23e2568ca2f17892afa2c57b90fff11cd661` (master, 2025-02-08). **Verified** = read in source (file and line given). **Inferred** = not checked directly. The first draft of this audit (by a subagent) was replaced after I checked it against the source. It had described formulas that appear in MapMaker's own design notes (the tâtonnement price rule, the logit migration utility, "5 age bands × 2 sexes", Coale–Demeny) as if they were SongsOfFOSS code. It had also said battle resolution was absent and invented a stability/collapse system, a stream-power erosion model and plate tectonics. None of those are in the repository.

## 1. Overview

A Lua/LÖVE tribal-to-medieval strategy game. 67,209 lines of Lua (verified, `find … -name '*.lua'`): `game/` 47,557, `libsote/` 8,386, `cpml/` 5,763, `engine/` 3,887, `test/` 1,184. A world of provinces (groups of hex tiles on an icosahedral grid) is populated with races, cultures, faiths, realms led by "characters", warbands, buildings and a goods economy. A player or AI acts through events and decisions. Early-stage: many `TODO`s, and `war.lua` is a data holder.

## 2. Language, runtime, dependencies, build

- **Language**: Lua 5.1 (LuaJIT) with FFI structs in hot economic code (`production-and-consumption.lua`) and in the world allocator.
- **Runtime**: LÖVE 2D. Launchers: `run-sote-windows.bat`, `run-sote-linux.sh` (Linux AppImage in `sote/engine/bins/linux`).
- **Terrain, tectonics and climate generation is a closed binary.** `libsote/libsote.lua` loads `engine/bins/win/libSOTE.dll` via `ffi.load` (`:165`, Windows only, with a `VirtualAlloc` reservation at a fixed address, `:126-149`) and passes it parameters such as `MajorPlates`, `MinorPlates`, `majPlateExpansion`. The DLL's source is **not in the repository**. The Lua in `libsote/` post-processes its output (`post-tectonic.lua` is 34 lines; rocks, soils, glaciation, hydrology, and a hex/icosahedral world container). `libsote.lua:106,115` and several functions in `world-generator.lua` (`:43-93`) read CSV files from hard-coded Windows paths (`d:\temp\sote_tilettes.csv`, `d:\temp\sote\<seed>\…`). A separate **legacy Lua plate seeder**, `game/world-gen/plate-gen.lua` (583 lines), is reachable only from a dev-mode debug button (`scenes/game.lua:250-258`): Perlin elevation, random plate starts, expansion, random speed and direction. It has no collision, subduction or erosion code. `sote/default/` holds a pre-generated default world as PNG layers (`heightmap.png`, `tectonics.png`, `volcanism.png`, `rocks.png`, `soil-*.png`, `waterflow-*.png`).
- **Does it run here? No (verified).** `love`, `luajit` and `lua` are not on PATH, and nothing was installed. Everything below is from reading the source. Pure-Lua logic could in principle run under stock LuaJIT, but the economy modules depend on globals (`WORLD`, `RAWS_MANAGER`) and LÖVE's RNG.
- **Browser feasibility**: none directly. Anything of value would be ported to TypeScript, not wrapped.

## 3. Subsystem inventory

### 3.1 Tick loop and event system
- **Where**: `game/entities/world.lua:368-689`; events in `game/raws/events/` (20 files, 3,898 lines), decisions in `game/raws/decisions/`, effects in `game/raws/effects/`.
- **Order of operations (verified)**: (1) drain `events_queue`; each event's options are scored with `ai_preference()` and the best viable one's `outcome()` runs, unless the root is the player character, which pauses the tick. (2) Each tick `current_tick_in_month` increments, and provinces registered under that bucket id in `WORLD.settled_provinces_by_identifier` run their **monthly** update: vegetation relaxation towards ideal cover; realm `prerun`; per-province `employ → buildings → production/consumption → upkeep/wealth_decay/infrastructure/research/recruitment → pop_growth`; then per-realm AI (explore, treasury, military), `construct`, `court`, `education`, `realm_economic_update` (price ODE below), `events.run`, and patrol launches; then per-character `decide.run_character`. (3) Hourly and daily counters advance deferred events and actions (`delay` in days). (4) At month 12 → year: `pop_aging.age`, and tax counters reset.
- **Quality: 3/5** as a game loop; a reference for note 1's phase ordering, not a drop-in. **Extractability: tangled** (global `WORLD`, per-entity object graphs).

### 3.2 Economy and prices
- **Where**: `game/economy/realm-economic-update.lua:149-234`, `game/raws/values/economical.lua:98-107`, `game/economy/employment.lua:15-125`, `production-and-consumption.lua` (1,236 lines), `diet-breadth-model.lua`.
- **Price formation (verified).** Prices are **state per province per good** (`province.local_prices`, initialised to 0.0001). Each month, for each province and each good, with `supply = local_production`, `demand = local_demand`, `trade_volume = sqrt(demand + supply + stockpile) + 1`, `change_rate = sqrt(price)`, `balance_power = max(demand − supply − 0.1, 0)` if positive (or the negative balance), the update is
  `d price = balance_power/trade_volume · 0.1 · change_rate − stockpile/trade_volume · 0.05 · change_rate + max(0, 1/(price+1) − 0.5) · base_price/trade_volume · 0.1 + mean_neighbour_price − price`
  (constants in `main.lua:97-98`). The last term pulls each price to the mean of neighbouring provinces: a stand-in for trade. This is **not** the `p·exp(η(D−S)/(S+D))` tâtonnement of note 1 §3.4.
- **Money**: one abstract unit. Treasuries (`realm.budget.treasury`), pop savings, province `local_wealth`/`trade_wealth`. A grep for `currency|coinage|coin` finds only UI icon names, so **there are no currencies, exchange rates or debasement**.
- **Trade**: no routes or caravans. `realm-economic-update.lua:109-129` diffuses 5% of each good's stock and wealth to neighbouring provinces each month, with the comment "until addition of properly working trade routes".
- **Employment** (`employment.lua`): each month one eligible pop per province is sampled, buildings are scored by projected profit (`min(31, profit/10) + U(0, 0.1)`), and a building is picked by **softmax** (`exp(ln2 · profit)`) against one uniform draw.
- **Consumption**: needs by life-need and use-case with weighted price expectation (`production-and-consumption.lua:82-100`); not read in full.
- **Quality: 3/5** (a working local-market model with sensible damping). **Extractability: tangled**: FFI structs, globals, `love.math.random`. The price rule itself is about 40 lines and portable.
- **Could serve**: note 1 §3.4 (as an alternative price rule to compare against tâtonnement; it already includes stockpile pressure and neighbour coupling).

### 3.3 Population, demography and migration
- **Where**: `game/society/pop-growth.lua` (151 lines), `pop-aging.lua` (25), `game/entities/pop.lua` (301), `game/raws/events/migration.lua` (903), `game/raws/decisions/diplomacy.lua`.
- **Representation (verified): individual `POP` objects** with `age`, race, culture, faith, sex, `need_satisfaction`, savings, home province. **Not cohorts.**
- **Growth** (`pop-growth.lua:11-150`): monthly per province. Constants `death_rate = 0.003333` ("4% per year") and `birth_rate = 0.005833` ("7% per year"). Each pop draws: starvation death if life-need satisfaction is below a threshold, old-age death above `elder_age`, and birth (scaled by `race.fecundity` and an age ramp) if above teen age. `province.foragers_limit` and `province:population_weight()` are computed (`:13-14`) and **never used**, so there is no density-dependent mortality or carrying capacity in this function. No epidemic code: `health.lua` (74 lines) is an event file; not reviewed.
- **Migration is not a utility or logit model.** It is leader-driven group moves, as events and decisions: `migrate-realm` and `migrate-realm-invasion` (`decisions/diplomacy.lua`), and `migration-merge` / `migration-colonize` / `migration-swap` / `migration-invasion-*` (`events/migration.lua`). `migration-colonize` (`:181-340`) moves **up to 6** working-age home pops, plus an expedition leader and the province's technologies, to a target province and founds a new realm there (name and colour from the founder's culture and language). Softmax appears only in `employment.lua`.
- **Quality: 2/5** (a simple individual-based birth-death model; migration is a gameplay mechanic). **Extractability: loose** for `pop-growth.lua` (pure arithmetic around `POP`); tangled for migration.
- **Could serve**: note 9 only as a contrast. Note 9 specifies cohorts, carrying capacity, logit migration and SIR epidemics; SongsOfFOSS has none of these.

### 3.4 Realms, borders and politics
- **Where**: `game/entities/realm.lua` (617), `province.lua` (895), `raws/events/succession.lua` (334), `coup.lua` (161), `raws/effects/diplomacy.lua`, `political.lua`.
- **Ownership** is a plain mapping: `Realm:add_province` / `remove_province` (`realm.lua:209-224`). Provinces are the border unit, created at world generation (`world-gen/province-gen.lua`).
- **Border changes** occur only through the migration events above (a realm founded by an expedition, merged, or invading) and through succession: if a ruler dies with no successor the realm is dissolved and a new realm is created in its capital province (`succession.lua:100-165`). **There is no influence field, no revolt, no stability, legitimacy, civil war or collapse model**: a repo-wide grep for `stability|legitimacy|rebel|civil.war` returns **zero** hits in `game/`. The audit's draft text about those was invented.
- **Coups** (`coup.lua`) and **tribute** (`diplomacy.lua`: `set_tributary`/`unset_tributary`) exist as discrete mechanics.
- **War entity**: `entities/war.lua` (32 lines) holds `attackers`, `defenders` and `claims`. The code that would create wars is commented out (`decisions/war-decisions.lua:326-327`), and `claims` is never read, so **war outcomes do not transfer provinces**.
- **Quality: 2/5. Extractability: tangled.**
- **Could serve**: note 9 §3.7 and note 1 §3.3: not at all (these systems are what SongsOfFOSS lacks); only the data fields (`tributary`, `overseer`, ranks) are of mild interest.

### 3.5 Warbands and battle resolution
- **Where**: `game/entities/warband.lua` (459), `army.lua` (185), `pop.lua:240-301`, `raws/unit-types*.lua`, `raws/events/raid-events.lua` (640), `raws/effects/military.lua` (921), `society/recruitment.lua`.
- **Warband (verified)**: a set of `POP`s, each mapped to a `UnitType` with `base_attack`, `base_armor`, `speed`, health; plus `supplies`, `supplies_target_days = 60`, `morale = 0.5`, upkeep, a status (`idle`, `raiding`, `preparing_raid`, `patrol`, `attacking`, `travelling`, …), and a leader/commander/recruiter. Strength is the sum of per-pop `(health, attack, armor, speed)` (`warband.lua:199-210`); attack is scaled by the pop's warrior job efficiency (`pop.lua:240-242`).
- **Battle resolution exists: `Army:attack(prov, spotted, defender)` (`army.lua:89-182`).** Per side it averages attack, armour, speed and hp per head, then:
  - `defender_advantage = 1.1`, plus `U(0, 0.65)` if the attackers were spotted (`love.math.random()`);
  - `damage_attacker = max(1, atk − def_armor)/max(1, def_hp·def_stack)`, `damage_defender = defender_advantage · max(1, def_atk − atk_armor)/max(1, atk_hp·atk_stack)`;
  - forward Euler with `dt = 0.5`: `power −= damage_defender·dt·defpower^e`, `defpower −= damage_attacker·dt·power^e`, with `e = 0.1` ("1 for square law, 0 for linear law"); the loop ends when either side's power falls below the 0.7 "run away" threshold;
  - the survivors fraction kills off the same fraction of each side's warbands.
  It is a **generalised Lanchester attrition with an exponent between the linear and square laws**, with a defender advantage and a rout threshold, and no terrain, fortification or supply term. Callers: tribute raids (`raid-events.lua:290`), covert raids (`:419`), migration invasions (`migration.lua:826`). Sieges exist as mechanics in raid events (not read in detail).
- **Quality: 3/5** for the battle function (small, clear, a usable seed for note 1 §3.6); the rest is game mechanics. **Extractability**: `Army:attack` plus `get_total_strength` are about 130 lines, MIT, loose. They need the random draw replaced by a keyed draw, and a test against hand-computed golden values (no Lua runtime was available to run the reference).
- **Could serve**: note 1 §3.6 (battles: yes, as a reference or a small port; declarations, campaigns on a route graph, sieges, war score and peace: no).

### 3.6 Culture, religion, language
- **Where**: `game/entities/culture.lua` (66 lines), `religion.lua` (59), `language.lua` (187), `raws/race*.lua`.
- **Culture**: a colour, a `Language`, a culture group, `traditional_units`, `traditional_militarization` (0.1), and foraging preferences. **Religion**: `Religion` {name, colour} and `Faith` {name, colour, `burial_rites = 'burial'`}. Both are labels with no doctrine, no spread or conversion model (the faith is inherited by newborns in `pop-growth.lua`).
- **Language (verified, `language.lua`)**: an inventory drawn from a **fixed frequency-ordered list** of 11 vowels and 24 consonants, truncated by a geometric drop-off (`DROPOFF_C 0.96`, `_V 0.87`, `_S 0.80`) with minimums; up to 7 syllable templates (`V, CV, CVn, CVr, CVl, CVC, VC`); 10 province, 10 realm, 10 adjective suffixes and 2 rank words generated as random words; `random_word(n)` concatenates syllables. Culture, faith, realm and province names are `random_word` plus a suffix, title-cased. **No feature bundles, no sonority rules (the earlier draft was wrong), no lexicon, no change over time, no borrowing, no splits.** Every draw is `love.math.random`.
- **Quality: 2/5. Extractability: loose** (about 190 lines of pure string code).
- **Could serve**: note 2 §3.1 only trivially; note 2 specifies feature-bundle inventories, sonority-based phonotactics, a lexicon, SCA-style sound change, borrowing and splits. SongsOfFOSS has none.

### 3.7 World generation (libsote), ecology, hydrology, soils
`libsote/` Lua (8,386 lines): `glaciation/` (793-line `glacial-formation.lua`), `hydrology/` (`calculate-waterflow` 522, `gen-rivers` 575, `gen-dynamic-lakes` 379, `waterbody` 137), `soils/` (about 1,500 lines across 8 files), `gen-rocks`, `gen-climate` (153), `hex-utils`, `icosa-defines`, `world-allocator` (524), `world.lua` (760, FFI-backed arrays). **Not reviewed in detail.** There is no stream-power erosion, subduction or priority-flood code in `libsote/` (grep for `stream.power`, `subduct`, `Planchon|priority.flood` returns nothing); terrain, plates and the first-pass climate come from `libSOTE.dll`. The seeded RNG wrapper `libsote/randomness.lua` is used by the soil, rock and glaciation generators (`world.seed + 19832`, PCG hash), so **world generation is partly seeded; the game simulation is not** (§4). Relevant to MapMaker only as a reference for hex/icosa data layout. Not part of the requested focus.

## 4. Internal data representation

- **Grid**: icosahedral hex tiles with axial (q, r, face) coordinates, `world.coord`, six neighbours per tile (`libsote/world.lua`, `hex-utils.lua`, `icosa-defines.lua`), FFI typed arrays for tile fields. Provinces group tiles. Resolution is chosen at generation; no refinement.
- **Time**: tick counters with hour, day (rolls at 31), month (12), year. Monthly work per province happens at the tick bucket the province is registered under.
- **Serialization**: `engine/bitser.lua` (ISC) for whole-world saves.
- **RNG and determinism (verified).** `love.math.random` is called **196 times** in the game code (largest users: `raws/technology-loader.lua` 36, `entities/realm.lua` 21, `world-gen/spawn-tribes.lua` 17, `entities/language.lua` 15, `world-gen/plate-gen.lua` 14, then `raws/events`, `raws/decisions`, `raws/effects`, `pop-growth`, `employment`, `army`). `game/scenes/world-gen.lua:91` seeds Lua's `math.random` from `os.time()`. The simulation is not seeded and the draw order depends on iteration over `pairs()` of tables keyed by objects (inferred: Lua's order for object keys depends on addresses), so it is **not reproducible and not resumable**. `libsote/randomness.lua` is seeded but only used by world generation.
- **Units**: arbitrary game units; temperatures in °C; ticks as above.
- **Cross-zoom consistency**: none.

## 5. License

- **Verified**: root `LICENSE` is **MIT, Copyright (c) 2024 Calandiel**, covering "all files *except*" `sote/emblems/`, `sote/engine/`, `sote/icons/`, `sote/music/` and `sote/data/`, which are governed by `sote/licensed_libraries_and_assets.txt` (1,453 lines: LÖVE and its bundled libraries under zlib, MIT, BSD, LGPL-2.1, GPL-2+/LGPL-2+ for some audio components, plus text for Bitser (ISC) and CPML (MIT)).
- **Where the relevant code lives**: `game/economy`, `game/society`, `game/entities`, `game/raws`, `game/world-gen` and `libsote/*.lua` are **outside** the excluded list, so they are MIT. `sote/data/` contains only a font and a PNG, not game data (the earlier draft was wrong). The game's `require "engine.*"` utilities (`engine/table.lua`, `queue.lua`, `graph.lua`, `string.lua`) sit **inside the excluded `sote/engine/`**, carry no licence header and are not listed in the notices file, so their licence is unstated. They are small utilities and would be rewritten, not copied. `engine/bitser.lua` is ISC. `engine/bins/` holds LÖVE binaries and **`libSOTE.dll`, a closed binary with no licence text of its own** (not extractable).
- **Compatibility with GPL-3.0-only**: MIT code can be incorporated into a GPL-3.0-only work with its copyright and permission notice kept (log source, commit and licence in `PROVENANCE.md`). That covers the Lua in `game/` and `libsote/`. **Reference only**: `libSOTE.dll` (no source), the `engine/` utilities (licence unstated), and the assets in `emblems/`, `icons/`, `music/`, `data/`, `portraits/`, `textures/`, `sfx/` (not examined individually).
- **Confidence: high** for the MIT scope of `game/`; medium for the non-listed `engine/` utilities. Not legal advice.

## 6. Capability coverage summary

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | libsote/libsote.lua | Plate generation happens in the closed `libSOTE.dll`; no source here. |
| Heightmap generation | no | — | — | libsote/world-generator.lua | Produced by the DLL; Lua only post-processes. |
| Erosion | partial | — | tangled | libsote/glaciation/ | Glaciation code in Lua (not reviewed); no stream-power or hillslope code found. |
| Hydrology (rivers/lakes/watersheds) | yes | — | loose | libsote/hydrology/ | Waterflow, rivers, dynamic lakes in Lua (not reviewed). |
| Climate – temperature | partial | — | loose | libsote/gen-climate.lua | Not reviewed; first-pass climate appears to come from the DLL. |
| Climate – wind | partial | — | loose | libsote/gen-climate.lua | Wind-speed layers exist; not reviewed. |
| Climate – ocean currents | no | — | — | — | Not found. |
| Climate – precipitation | partial | — | loose | libsote/gen-climate.lua | Not reviewed. |
| Climate – seasons | partial | — | loose | libsote/world.lua | January/July temperature and rainfall layers; no seasonal cycle. |
| Biomes | yes | — | loose | raws/biomes-loader.lua | Data-table biomes; not reviewed. |
| Soils | yes | — | loose | libsote/soils/ | Parent material, alluvial, sand dunes, volcanic silt, sediment load; not reviewed. |
| Resources | yes | — | loose | raws/trade-goods.lua, raws/resource-loader.lua | 30 `TradeGood:new` definitions plus foraging resources. |
| Population & settlement | yes | 2/5 | loose | society/pop-growth.lua | Individual-based Bernoulli births and deaths; carrying-capacity variables unused. |
| Cities & towns | no | — | — | — | Not found as a separate model. |
| Languages & names | partial | 2/5 | loose | entities/language.lua | Random phoneme and syllable generator; static; unseeded. |
| Political borders | partial | 1/5 | tangled | entities/realm.lua | Province ownership map; changes only via migration events and succession. |
| Trade | partial | 2/5 | tangled | economy/realm-economic-update.lua | Per-province price ODE with neighbour smoothing and 5% stock diffusion; no routes or currencies. |
| Long-run history/war/economics/politics sim | partial | 2/5 | tangled | entities/world.lua, raws/events/ | Event/decision game loop; no stability, legitimacy or revolt model; war claims unused. |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | libsote/icosa-defines.lua | Single icosahedral hex grid. |
| Globe view | yes | — | tangled | scenes/game/planet-shader.lua | LÖVE shader view; not reviewed. |
| Flat projections | no | — | — | — | Not found. |
| Partial-world inference | no | — | — | — | Not found. |
| Import of heightmaps/layers | partial | — | tangled | libsote/world-loader.lua, default/ | Loads PNG layers and saved worlds; not reviewed. |
| Fidelity/speed slider with same-seed preview | no | — | — | — | Not found. |
| Export (PNG/SVG/STL/other) | no | — | — | — | Not found. |
| Full-state save/resume format | yes | 2/5 | loose | engine/bitser.lua, scenes/world-loader.lua | Bitser dump of world state; resumed runs diverge (unseeded RNG). |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | Not found. |
| Planet-parameter derivation | no | — | — | — | Hand-set parameters. |

## 7. Verdict

- **Worth taking (algorithm or small port)**:
  1. `Army:attack` plus `Warband:get_total_strength` (about 130 lines, MIT): a generalised Lanchester step with a defender advantage and a retreat threshold, directly relevant to note 1 §3.6. It lacks terrain, fortification and supply terms that note 1 requires.
  2. The per-province price rule (`realm-economic-update.lua:149-234`, about 40 lines): a damped supply-demand model with stockpile pressure and neighbour coupling, usable as a comparison for note 1 §3.4.
  3. The tick order (monthly bucketed province updates, then realm AI, then events) as a worked example for note 1 §3.1.
- **Not usable for notes 1, 2 and 9**: religion (labels only), culture beyond a colour and a unit mix, language evolution (none), migration as a demographic process (none), borders as dynamics (none), stability/revolt/collapse (none), war declaration, campaigns, sieges and peace (none, with claims unused), epidemics (none found). Population dynamics are weaker than note 9's cohort and carrying-capacity design.
- **Determinism**: the simulation is unseeded and its iteration order is object-keyed; anything taken would need keyed draws and stable ordering. That is a rewrite for most of it, not a retrofit.
- **Overall**: reference only for the three items above. SongsOfFOSS is a game, not a history engine, and its terrain generator is a closed Windows DLL.
