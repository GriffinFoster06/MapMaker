# Design note 36: Worldbuilder tools: encyclopedia, timeline and branches

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 16 |
| Depends on | Entities and event log (§3.3, §3.4), the chronicle (note 33), editing (note 16), maps (note 18) |
| Used by | Writers and game masters using a world; exports (Markdown and HTML) |

## 1. Problem

A simulated world is only useful to a writer or game master if they can find their way around it: look up a city, read its history, see who ruled when, compare "what if this battle had gone the other way", and keep their own notes. Azgaar has editors and a few overviews; World Anvil-style wikis have the writing tools but no simulation. MapMaker can join them: every entity is already a record with a history.

## 2. Canonical inputs and outputs

**Inputs:** every entity table, the event log and chronicle, maps and styles, user notes.

**Outputs**
- `articles` (§3.10, stored in `articles/`): one per entity, generated from data (a template per entity type) plus user-written sections; cross-links; tags.
- Timeline views on both axes (geologic and history), with filters.
- Branches (`branches.json`): forks of the world at a stage or tick, with their own edits.
- Exports: a browsable HTML site or Markdown vault of the world.

## 3. Approach and algorithm choice

### 3.1 Encyclopedia

Generated sections are live (they update when the world changes); user sections are text the user owns. Each article has a mini-map, key facts, a timeline and links. Search across names, tags and text.

### 3.2 Timeline and scrubbing

The history scrubber loads keyframes and replays change logs (§3.4) to show any tick; maps and articles follow the scrubbed time.

### 3.3 Branches

A branch records its parent, fork point (stage id or tick) and its own edits. Shared prefixes are cached by stage hashes, so branches cost only their divergent part. Branch comparison shows differences in maps, statistics and chronicle.

### 3.4 Notes and planning

Notes pinned to places, entities or ticks; plot threads that link events; tags and to-do markers for worldbuilding work.

## 4. Upstream references (algorithm level)

- **Azgaar** overviews (states, cultures, burgs, military, charts) as data views to extract.
- **CesiumJS** `Clock.js`, `JulianDate.js`: time-dynamic UI patterns.
- **LIAM2**, **MESSAGEix** scenario management: branching scenarios as a concept.

## 5. Validation

- Articles regenerate deterministically from the same world.
- Branch replay: a branch reproduces its world from parent plus edits.

## 6. Open questions

1. Should articles be editable rich text or Markdown? Proposed: Markdown with live data blocks.

## 7. Size estimate

| Part | LOC |
|---|---|
| Article generation and templates | ~2,000 |
| Encyclopedia UI and search | ~2,000 |
| Timeline and scrubber | ~1,500 |
| Branches | ~1,000 |
| Export | ~800 |

## 8. User controls and edit points

Writing and editing articles, notes and tags; creating, naming, comparing and merging branches; choosing what the export contains.

## 9. Earth-recovery test

Not applicable (tools). Branch and article determinism are tested in §5.
