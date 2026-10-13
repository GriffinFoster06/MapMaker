# Design note 16: User editing, edit log, locks and re-simulation

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 5b (core and terrain tools); every later phase adds edit tools for its own layers and entities |
| Depends on | Stage runner, manifests and invalidation (`packages/engine`), layer registry and entities (`packages/core`), the save format (§5) |
| Used by | Everything the user changes by hand; branches (note 36); fantasy geography (note 35); T2 Earth tests (note 15) pin Earth data through it |

## 1. Problem

The user must be able to change anything: sculpt a mountain range, move a coastline, put a hotspot or a city somewhere, rename a river, force a war. The world must then re-simulate around the change. Three constraints make this hard:

- **Determinism and exact resume.** A hand edit must replay to the same world, and a save must capture it.
- **Survival across re-runs.** If the user edits a river and then changes the climate, the river edit must survive (or be reported if it cannot).
- **Locality and cost.** Most stages are global (climate, erosion), so "re-simulate around the edit" can mean re-running much of the pipeline. The UX must make this visible and cheap where possible.

## 2. Canonical inputs and outputs

**Edit record** (`World.edits`, §3.8):

```
{ id, seq, branch, target, region, op, payload, mode, weight?, createdAt, label? }
target  = { kind: 'layer', id, mesh } | { kind: 'entity', table, id } | { kind: 'param', key } | { kind: 'event', axis, at }
region  = CellSet (run-length packed) | Polygon (unit-vector ring) | Brush stroke (path + radius + falloff) | null
op      = set | add | scale | smooth | noise | paint | create | delete | move | rename | link
mode    = pin | soft | seed
```

**Outputs:** none directly. Each stage that produces a target reads the edits for that target and applies them as boundary conditions (pin), penalty terms (soft) or replaced draws (seed).

**Derived state:** `editCursor` (undo position), `staleStages` (for the UI), `orphanedEdits` (targets that vanished).

## 3. Approach and algorithm choice

### 3.1 Edits are inputs, not mutations

A stage is `stage(inputs, params, rng, edits[target ∈ outputs])`. The edit subset is part of the stage's input hash, so the existing invalidation re-runs exactly the producer and its dependants. Nothing writes to a layer outside its producer, which keeps the one-producer rule (§3.2) intact.

### 3.2 The three modes

- **pin**: hard constraint. The stage writes the edited value and treats it as fixed. Examples: elevation in a region (a Dirichlet boundary for erosion), a land mask, a river course (`receiver` pinned), a border, a name.
- **soft**: the stage minimises its usual objective plus `weight × ‖field − edit‖²` over the region, or blends `field ← (1−w)·field + w·edit` after each iteration for iterative stages. Example: "make this area wetter", which climate respects approximately and downstream stages then follow.
- **seed**: replaces a random decision with the user's. Examples: a hotspot location, a plate seed, a city founding, a war declaration. The stage simulates from the seed, so its consequences are physical (a hotspot track, a city's growth).

### 3.3 Edit tools per domain (built as each phase lands)

| Phase | Tools |
|---|---|
| 5b | elevation sculpt (raise, lower, smooth, flatten, terrace, noise), land/sea paint, categorical paint for any enum layer, plate and hotspot seeds, parameter edits |
| 6–8 | plate motion pins, ice and ocean edits, climate soft edits |
| 9–9e | soil, vegetation and species-range paint; place deposits; introduce or remove species |
| 10–11b | settlement, route, border, culture and religion edits; town-plan editing |
| 13 | event edits on the history timeline: force, forbid, schedule |
| 15 | fantasy geography (floating islands, world tree) as pins plus module rules |

### 3.4 Survival and re-anchoring

- **Entities** keep stable ids across re-runs where the stage can match them (by position and kind); an edit to entity X survives if X is matched.
- **Cell-region edits** are stored as geometry (polygons and brush strokes in unit vectors), not cell ids, so they re-rasterise onto any mesh (fidelity changes, patches).
- **Orphans.** When a target vanishes (the edited river no longer exists after a climate change), the edit is kept and flagged in the UI with "re-apply as seed", "convert to pin" or "discard".

### 3.5 Locality and speed

- The UI shows the stages an edit makes stale and an estimate of re-run time.
- **Local fast paths.** Stages that are local (classification, soils, rendering) re-run on the affected cells only, using the change set of their inputs. Global stages re-run fully, at preview tier first for immediate feedback, then at the final tier in the background (note 38).
- **Live preview.** While a brush is held, a non-authoritative GPU preview (§6.3) shows the result; the authoritative re-run happens on release.

### 3.6 Undo, redo, branches

- Undo moves `editCursor` back; redo forward. The world at a cursor is "replay edits[0..cursor]", cached by stage hashes.
- A new edit after an undo truncates the redo tail, unless the user forks a branch (note 36).

### 3.7 System switches

Per system: `simulate | manual | off`. `manual` makes the producer a pass-through of the edit log (the user paints the whole layer or imports it); `off` removes its outputs, and dependants fall back to defaults or are disabled. The pipeline-variant machinery (one producer per layer per variant) already supports this.

### 3.8 Consequences for ARCHITECTURE.md

Q16, §3.8, `World.edits`, §5 `edits/`.

## 4. Upstream references (algorithm level)

- **Azgaar** editors (its heightmap, burg, state, province, culture and religion editors in the UI modules; exact files located when Phase 5b starts): the breadth of edit tools a worldbuilder expects, and their UX. Behaviour reference; its edits mutate state directly, which this design avoids.
- **orogen**: the interactive heightmap import and the planet code as a recipe.
- **Godot** `editor/` undo-redo manager (`core/object/undo_redo.*`): an action-log pattern.
- **Literature:** constrained optimisation with penalty terms; Barnes et al. (2020) for pinned drainage.

## 5. Validation

- Replay determinism: random edit sequences, save at random points, reload, finish: identical hashes.
- Pin survival: after any re-run, pinned values are bit-identical.
- Locality: a pinned edit in region A leaves outputs of local stages bit-identical outside A.
- Orphan handling: forced-orphan cases are flagged, never dropped.

## 6. Open questions

1. Soft-edit weights: one global scale per domain, or per edit?
2. Should edits to upstream stages (elevation) warn when they would orphan many downstream edits (towns, borders)?

## 7. Size estimate

| Part | LOC |
|---|---|
| Edit log, modes, hashing, undo | ~1,200 |
| Re-anchoring and orphans | ~800 |
| Terrain tools (5b) | ~2,000 |
| Per-domain tools (later phases) | ~500–1,500 each |
| Tests | ~1,500 |

## 8. User controls and edit points

This note is the edit system. Its own controls: brush size, strength and falloff; snapping; the mode (pin, soft, seed) per tool, with sensible defaults; the visible stale-stage list; and the "re-simulate now / later" choice.

## 9. Earth-recovery test

T2 depends on this note: Earth's real elevation, plates and ice enter the pipeline as pinned edits. The acceptance test is that a world built from Earth data pinned through the edit log is identical to the same data imported directly (the Phase 11 import path).
