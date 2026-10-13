# Design note 33: Characters, dynasties and the narrative chronicle

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 13g |
| Depends on | History engine and event log (note 1), politics, religion (note 32), languages and names (note 2), technology (note 31) |
| Used by | Politics (rulers' decisions, successions), the encyclopedia (biographies, family trees), the chronicle, map labels (named battles, founders) |

## 1. Problem

Note 1 uses aggregate agents, with "named notable figures for the event log only" (D10). Worldbuilders want people: rulers with personalities, dynasties with feuds and marriages, generals, prophets, founders, and a history that reads like history ("in 412 the young queen Aseri, last of the Orvan line, …"). Individuals must matter to outcomes where history says they do (successions, wars of personal ambition) without making the simulation cost explode.

## 2. Canonical inputs and outputs

**Inputs:** polities and their offices; cultures (naming, inheritance customs); faiths; events from note 1.

**Outputs**
- `persons` table: name, birth and death, culture, faith, traits (ambition, competence, piety, cruelty, …, a small vector), offices held, relations (parents, spouses, children, rivals), and notable deeds (event links).
- `dynasties` table: lineage trees, claims, prestige.
- The **chronicle**: a structured, causal narrative derived from the event log, with generated text per event and per era.

## 3. Approach and algorithm choice

### 3.1 Who is simulated

Only notable people: holders of offices (rulers, heirs, chancellors, generals, high priests), founders, and those created by notable events. Everyone else stays aggregate (note 38's level of detail). A typical world holds tens of thousands of persons over its history, which is cheap.

### 3.2 Lives and decisions

Persons age, marry (alliances by polity strategy and custom), have children (fertility from demography), and die (age, war, disease, intrigue). Rulers' traits modulate polity decisions in note 1 (war propensity, tax policy, reforms) within bounds, and successions follow the polity's succession law (primogeniture, election, tanistry, …) with crises when claims compete.

### 3.3 Chronicle generation

Every event already has `causes` (§3.4). The chronicle groups events into episodes (a war with its battles, a succession crisis) and eras, ranks them by significance, and renders text from templates with grammar and naming from the culture's language (note 2). The text is deterministic; users can edit or annotate it (articles, note 36). Optional language-model rewriting is a user-side plugin (note 37), never part of the simulation.

## 4. Upstream references (algorithm level)

- **SongsOfFOSS** `game/raws/events/succession.lua`, `coup.lua`, `game/entities/realm.lua`: succession, coups and ruler-driven events.
- **Azgaar** name and title generators.
- **OpenSpiel** game abstractions for strategic choices (concepts only).
- **Literature:** Turchin (elite overproduction and secular cycles); Crusader Kings-style character mechanics as design inspiration (feature level).

## 5. Validation

- Genealogies are consistent (no cycles, plausible ages at birth and death).
- Succession laws are applied correctly in unit tests; ruler traits shift decisions in the documented direction.

## 6. Open questions

1. How much should individuals affect aggregate outcomes by default? Proposed: a "great person influence" parameter, moderate by default.

## 7. Size estimate

| Part | LOC |
|---|---|
| Persons, families, offices | ~1,500 |
| Decisions and successions | ~1,200 |
| Chronicle grouping and ranking | ~1,000 |
| Text templates and grammar | ~1,500 |
| Tests | ~1,000 |

## 8. User controls and edit points

- Parameters: great-person influence, notable-person threshold, succession-law defaults, chronicle verbosity.
- Edits: create a character, set traits, arrange a marriage, kill or save someone at a time (seed or pin), rewrite a chronicle entry.
- Switch: characters `simulate | manual | off` (off: note 1's aggregate rulers).

## 9. Earth-recovery test

T4: reign-length and dynasty-duration distributions, and the frequency of succession crises, fall within the range of historical datasets for comparable succession laws.
