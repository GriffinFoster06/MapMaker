# New upstreams: tectonics.js and SongsOfFOSS

Date: 2026-10-03. Scope: add two repos to `upstream/`, audit them, update four rows of `audit/CAPABILITY_MATRIX.md`. No pick changed, no code extracted, nothing under `packages/**` or the shell touched. Eurace and WRF-Hydro were not consulted.

## 1. Result in one paragraph

Neither repo supplies code that MapMaker's design notes need. **tectonics.js** (JS, runs) is a working but crude forward plate model; it is a reference for note 13's interaction detection and crust pools, and does not supply note 13's event schedule, force balance or keyed RNG. **SongsOfFOSS** (Lua, could not be run here) is a game, not a history engine: it has no stability, revolt, collapse, currency, trade-route, religion-dynamics or language-change models, and its simulation RNG is unseeded. It does contain two small pieces that note 1 can learn from: a generalised Lanchester battle step and a damped per-province price rule. Both licences allow use in a GPL-3.0-only project; neither blocks anything.

## 2. Repos and licences

| | tectonics.js | SongsOfFOSS |
|---|---|---|
| Remote | https://github.com/davidson16807/tectonics.js | https://github.com/Calandiel/SongsOfFOSS |
| Commit | `e43927ce88e766b63e35e896f36bfb882a4c8de4` (2020-08-22) | `4c9f23e2568ca2f17892afa2c57b90fff11cd661` (2025-02-08) |
| Branch | master | master |
| `LICENSE` | **Creative Commons Attribution 4.0 International (CC BY 4.0)**, unmodified legal code, `LICENSE.txt` | **MIT**, Copyright (c) 2024 Calandiel, `LICENSE`, with exclusions |
| Language | JavaScript (browser, WebGL) | Lua 5.1/LuaJIT on LÖVE, FFI |
| Runs here | Yes (headless Chromium) | No (no `love`, `luajit` or `lua` installed; nothing installed) |

**GPL-3.0-only compatibility**
- **tectonics.js: compatible, per the FSF.** Read from the raw FSF licence list (`gnu.org/licenses/license-list.html`): CC BY 4.0 "is a non-copyleft free license … It is compatible with all versions of the GNU GPL; however, like all CC licenses, it should not be used on software." There is no copyleft. Obligations if anything is ever copied: credit the creator, link the licence, indicate changes (§3(a)); the repo names no copyright holder. CC BY 4.0 does not license patents (§2(b)(2)). The audit that was drafted first, and my own first reading, said "incompatible"; that was wrong and is corrected in `upstream-manifest.json` and `audit/tectonics.js.md`. Not legal advice.
- **SongsOfFOSS: MIT code is compatible** (keep the notice, log in `PROVENANCE.md`). The root `LICENSE` excludes `sote/emblems/`, `sote/engine/`, `sote/icons/`, `sote/music/` and `sote/data/`, which are governed by `sote/licensed_libraries_and_assets.txt` (LÖVE and bundled libraries: zlib, MIT, BSD, LGPL-2.1, GPL-2+/LGPL-2+ audio components; Bitser ISC; CPML MIT). The code worth reading (`game/economy`, `game/society`, `game/entities`, `game/raws`, `libsote/*.lua`) is outside the exclusions, so MIT. **Reference only:** `sote/engine/bins/win/libSOTE.dll` (a closed binary that generates terrain and plates; no source in the repo), the `sote/engine/*.lua` utilities (no header, not in the notices file: licence unstated), and the art, music and icon assets.

Neither licence is incompatible with GPL-3.0-only, so no repo is downgraded to reference-only on licence grounds. Both are treated as reference in practice for the technical reasons below.

## 3. What each repo offers, by requested area

### tectonics.js, for note 13 (forward plate evolution)

| Topic | Finding | Evidence |
|---|---|---|
| Plate motion | Rigid plates as 3×3 rotation matrices. Velocity per cell = boundary normal × buoyancy × constant from Schellart (2010) with hard-coded slab size. Two averaged rotation vectors (about plate centre and world centre) are multiplied. No explicit Euler pole or rate per plate. | `Tectonophysics.js:12-251` |
| Author's confidence | "WARNING: most of this is wrong!"; "negation shouldn't theoretically be needed!"; NaN → identity fallback | `Tectonophysics.js:125-132, 236-244` |
| Subduction | Cells under another plate and denser than mantle are detached one cell per step at the border; their sediment and felsic pools metamorphose; 85/15 felsic plutonic/volcanic accretion | `Lithosphere.js:224-306` |
| Rifting | Empty or singly-covered cells next to a plate border are filled with a fixed mafic column; no rift geometry, no randomness | `Lithosphere.js:170-223` |
| Collision, orogeny, events | **None.** Overlapping crust adds mass; isostasy gives height. No event log, no sutures | grep over model code returns nothing |
| Isostasy and age | Airy: `thickness·(1 − ρ/ρ_mantle)`; mafic density mixes over 0–250 Myr of age | `FluidMechanics.js:65-76`, `Crust.js:263-266` |
| Plate set | Re-derived every 150 Myr by image segmentation of a buoyancy-driven velocity field | `SupercontinentCycle.js`, `Lithosphere.js:398-426` |
| Time step | Wall-clock (`performance.now()`), so not reproducible in the app | `Simulation.js:66-86` |
| Mesh | `IcosahedronGeometry`, max level 6 = **40,962 cells**; ids are `Uint16` (65k limit) | `index.html:554, 579`, `Plate.js:71-72` |
| RNG | Mersenne Twister, state serialised; **not used** by plate motion, rifting or subduction. `Math.random` only in the starfield view | grep |

Measured by me (headless Chromium via Playwright, paused sim, fixed 5 Myr steps, this machine, one seed):
- 40 steps at 40,962 cells: median **54.2 ms**, max 101.3 ms per `invalidate+calcChanges+applyChanges` of the whole Universe.
- Same seed, two fresh page loads: hashes of `top_plate_map` and `total_crust` at steps 0, 1, 2, 9, 19, 29, 39 are **identical**. Plates: 5, then 6 at step 39.
- Total crust mass is not constant (2.08e12, 3.41e12, 2.07e12, 1.98e12, 1.82e12, 1.70e12, 1.62e12 at those steps), consistent with overlaps adding mass by construction.
- One engine and one machine only. Cross-engine bit-identity is untested; the code uses native `Math.*`.

**Could it feed note 13?** At algorithm level only, and thinly. The note specifies quaternion rotations composed from per-plate ω_i, a fast pass with a torque balance (Forsyth & Uyeda, Conrad & Lithgow-Bertelli, ported from orogen's `plate-physics.js`), a slow kinematic replay at 1 Myr, scheduled events (rift, subduction, collision, orogeny stamping, suture merges) and counter-based keyed RNG. tectonics.js offers the idea of detecting overlaps and gaps by resampling per-plate masks to a global mesh (the note's detection mesh), subduction by removal of dense overlapped crust with accretion, and a worked example of crust pools. It has none of the note's other parts, and its velocity model should not be copied (the author disowns it). Note 13's own cost table (10–20 ms fast step) is its own estimate and is not comparable with the 54 ms above.

### SongsOfFOSS, for notes 1, 2 and 9

| Area | Finding | Evidence |
|---|---|---|
| Prices | State per province per good. Monthly ODE: demand–supply imbalance and stockpile terms scaled by √price, a restoring term towards base price, and relaxation to the mean neighbouring price. **Not** the tâtonnement of note 1 §3.4 | `economy/realm-economic-update.lua:149-234`, constants `main.lua:97-98` |
| Currency, trade | One abstract money unit; no currencies. No trade routes: 5% of stock and wealth diffuses to neighbours monthly "until addition of properly working trade routes" | `realm-economic-update.lua:27-129` |
| Employment | One pop per province per month; softmax on projected building profit | `economy/employment.lua:15-125` |
| Population | Individual `POP` objects, monthly Bernoulli births and deaths from fixed rates; `foragers_limit` and `population_weight()` are computed and unused (no carrying capacity) | `society/pop-growth.lua:11-150` |
| Migration | Leader-driven group events (`migration-colonize` moves up to 6 families, founds a realm; merge, swap, invasion). No utility or logit model | `raws/events/migration.lua`, `raws/decisions/diplomacy.lua` |
| Realms, borders | Ownership map (`add_province`); changes only via migration events and succession. **Zero** hits for stability, legitimacy, rebel, civil war | `entities/realm.lua:209-224`, `raws/events/succession.lua:100-165` |
| War entity | Data holder; war creation commented out; `claims` never read, so wars do not transfer provinces | `entities/war.lua`, `decisions/war-decisions.lua:326-327` |
| Warbands | Sets of `POP`s with unit types (attack, armour, speed, hp), supplies, morale, status | `entities/warband.lua` |
| Battle | **`Army:attack`**: per-head averages, defender advantage 1.1 (+U(0,0.65) if spotted), forward-Euler with `dt = 0.5` and exponent 0.1 ("1 for square law, 0 for linear"), rout at 0.7. No terrain, fortification or supply. Used by tribute raids, covert raids and migration invasions | `entities/army.lua:89-182` |
| Culture, religion | Colour, language, unit mix, foraging preferences; religion is a name, a colour and `burial_rites` | `entities/culture.lua`, `religion.lua` |
| Language | Fixed frequency-ordered phoneme lists with geometric drop-off, 7 syllable templates, random-word and suffix generation. Static; no lexicon, sonority rules, sound change or borrowing | `entities/language.lua` |
| Terrain, plates | Closed Windows binary `libSOTE.dll` via FFI; the Lua plate seeder is a dev-only debug button; no stream-power, subduction or priority-flood code in the Lua | `libsote/libsote.lua:126-165`, `scenes/game.lua:250-258` |
| Determinism | 196 unseeded `love.math.random` calls in game code; `math.randomseed(os.time())`; iteration over object-keyed `pairs()` (inferred). World-generation soils, rocks and glaciation use a seeded wrapper | `libsote/randomness.lua`, `scenes/world-gen.lua:91` |

**Could it feed the notes?**
- **Note 1.** Battles: a small usable reference, and a port candidate: `Army:attack` plus `Warband:get_total_strength`, about 130 lines, MIT. It needs the random draw replaced by a keyed draw, terrain, fortification and supply terms added as the note requires, and a golden-value test (no Lua runtime was available to run the reference, so values would be computed by hand or by a TS reimplementation checked independently). Prices: a comparison model for §3.4. Tick order: a worked example for §3.1. Everything else the note needs (stability, legitimacy, revolt, collapse, diplomacy and treaties, war declaration, campaigns, sieges, peace, causal event chains) is **absent**.
- **Note 2.** Nothing beyond trivial name generation. The note's feature-bundle inventories, sonority-based phonotactics, lexicon, sound-change engine, borrowing and splits are all absent.
- **Note 9.** Nothing. The note specifies cohorts, carrying capacity, logit migration, SIR epidemics, gravity-model trade and influence-field borders; SongsOfFOSS has individual pops with fixed rates, no carrying capacity, group-colonisation events, no trade flows and no border dynamics.

## 4. Matrix updates (no picks changed)

| Row | Change |
|---|---|
| 1. Tectonics | Added tectonics.js (rating 3, loose, JS, CC-BY-4.0, algorithm reference) at rank 3; VPLanet moved to 4. Added SongsOfFOSS as "-" (closed DLL). Pick (orogen) and GPlates note unchanged; a note line added. |
| 13. Population and settlement | Added SongsOfFOSS (rating 2, loose, MIT) at rank 5. Pick unchanged. |
| 15. Languages and names | Added SongsOfFOSS (rating 2, loose, MIT) at rank 2; SLiM to 3. Pick unchanged. |
| 18. History / war / economics | Added SongsOfFOSS row (partial: battle step and price rule, 3/5 each; absent items listed). Existing verdict and the "Gap: original code" paragraph unchanged. |

New audit files: `audit/tectonics.js.md`, `audit/SongsOfFOSS.md` (same seven sections as the others).

## 5. How this was verified, and what was wrong the first time

Each audit was first drafted by a subagent (one per repo). I then checked the drafts against the source and rewrote both. The drafts contained errors that would have propagated into the matrix:

- **tectonics.js draft**: cited a non-existent `Erosion.js`; claimed "1M cells at 60 FPS" (the mesh is capped at 40,962); claimed a verified same-seed "rifting lines" determinism test (no RNG is used in plate logic); called the Schellart code a "reference implementation" (the author says it is mostly wrong); credited it with collision, orogeny, arc, ophiolite and event-log logic (none exists); presented note 13's own 10–20 ms estimate as a tectonics.js measurement; and said CC BY 4.0 was GPL-incompatible (the FSF says compatible).
- **SongsOfFOSS draft**: presented formulas from MapMaker's own design notes (tâtonnement `p·exp(η(D−S)/(S+D))`, the logit migration utility, "5 age bands × 2 sexes", Coale–Demeny) as SongsOfFOSS code; said battle resolution was absent (it is `Army:attack`); described a stability/succession-crisis/collapse system (zero hits); described stream-power erosion and plate tectonics in Lua (they are in the closed DLL); said the seeded RNG module was UI-only (it seeds world generation); and said `sote/data/` held game data (it holds a font and a PNG).

The tables in §3 cite file and line for every claim. Items not reviewed are marked "not reviewed" in the audits, not rated.

## 6. Open items

- SongsOfFOSS was not run (no LÖVE). Everything is from reading; the unread areas are `libsote/` hydrology, soils and glaciation, `production-and-consumption.lua` beyond its first 135 lines, siege logic in `raid-events.lua`, `health.lua`, character and AI modules.
- tectonics.js: karma tests were not run; climate, atmosphere, name generator and projection views were not reviewed; timings come from one machine and one engine.
- If a port of `Army:attack` is wanted, it needs a PROVENANCE entry (MIT notice for Calandiel), a keyed-RNG replacement, and a test whose golden values are computed independently of the TS port.
