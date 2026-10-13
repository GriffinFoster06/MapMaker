# Design note 35: Fantasy framework: rule overrides, magic, peoples and creatures

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 15 (framework and first modules); modules can be added at any later time |
| Depends on | The module system (§3.9, Q15), the parameter registry (note 17), editing (note 16), every simulated system it hooks into |
| Used by | Worlds that are not purely realistic: high and low fantasy, mythic geography, non-human peoples |

## 1. Problem

The product is a fantasy worldbuilder with a realistic core. Users want magic, elves and dwarves, dragons, floating islands, a world tree, a sunless underworld. Bolting these on would break realism and determinism and turn every system into special cases. The design must let fantasy be as deep as the realistic systems (magic that has sources, flows and costs, and changes ecology, economy and war) while guaranteeing that with fantasy off, the world is exactly the realistic world (Q15).

## 2. Canonical inputs and outputs

**Inputs:** the enabled modules and their parameters (`World.modules`); module-specific edits.

**Module manifest:**

```
{ id: 'magic.ley', version, params: schema, layers: ['magic.flux', 'magic.ley'], tables: ['leyLines'],
  hooks: [ { at: 'after:5', kind: 'term', target: 'precip', fn }, { at: 'stage', id: 'F1', inputs: [...], outputs: [...] } ],
  peoples?: [...], species?: [...], technologies?: [...], pfts?: [...] }
```

**Outputs:** module layers (`magic.*`, `mod.<id>.*`), module tables, and the documented changes the module's hooks make to core outputs.

## 3. Approach and algorithm choice

### 3.1 Hook types

- **Parameter overrides:** change a physical or model constant beyond realistic ranges (a heavier sun, a stronger Coriolis, a 1,000-day year).
- **Additive terms:** a module adds a term to a core equation (magic-driven uplift, a mana-dependent rainfall term, a fertility bonus).
- **New stages:** a module adds a stage with declared inputs and outputs (a magic field, a creature ecology).
- **Data packs:** new peoples, species, PFTs, technologies (spells as technologies), faiths, building styles.
- **Geography rules:** constrained edits plus rules (a floating island is an elevation pin with no isostasy and its own drainage; a world tree is a structure with ecological effects).

### 3.2 The first modules

1. **Magic as a field.** A scalar `magic.flux` with sources (tectonic stress, ley lines from plate-boundary geometry, hotspots, or user-placed nexuses), diffusion and flow along ley lines, consumption by users (populations with magical technology), and depletion and recovery. Effects on ecology (magical PFTs and creatures where flux is high), economy (magic as a resource and good), war (magical military technology), and religion (sacred sites at nexuses).
2. **Peoples.** Additional sapient species with their own biology (lifespan, fertility, diet, habitat preference, which feed demography and prehistory, note 30), cultures, naming styles (note 2) and starting origins: elves, dwarves, orcs and the like as presets, all user-editable.
3. **Creatures.** Fantasy species in the fauna model (note 26): dragons as apex predators with huge ranges and low densities, and so on, with ecological constraints (energy budgets) unless the user turns them off.
4. **Rule overrides.** Preset bundles of overrides (eternal summer, a flat-ish low-gravity world, two suns).
5. **Mythic geography.** Floating islands, a world tree, an underworld layer, impossible mountains, as geography rules.

### 3.3 Isolation and determinism

- With no modules enabled, every stage's input hash is identical to the realistic pipeline's: a CI test enforces bit-identical outputs (Q15).
- Modules use injected RNG streams named by module id, `dmath`, and the single-producer rule, like core code.
- Module order is explicit and part of the hash.

### 3.4 Realism within fantasy

Modules document their deviations, and the Earth tests (note 15) can run with a module on to show its effect, so "how far from Earth does this magic push the world" is measurable.

## 4. Upstream references (algorithm level)

- **SongsOfFOSS** `raws/race*.lua`: multiple sapient races with different parameters in one simulation.
- **Azgaar** cultures and their fantasy naming sets; its markers (monsters, ruins) as content.
- **Godot**/**FLAMEGPU2**: module and plugin patterns for agents.
- No upstream simulates magic; this is original design.

## 5. Validation

- The empty-module identity test (Q15).
- Each module's documented effects are tested (for example, "flux > threshold implies magical PFT presence").
- Enabling and then disabling a module restores the original world hash.

## 6. Open questions

1. Should modules be able to replace a core stage entirely (not only add terms)? Proposed: yes, through the pipeline-variant mechanism, with the replacement declared in the manifest.

## 7. Size estimate

| Part | LOC |
|---|---|
| Module system and hooks (shared with note 37) | ~1,500 |
| Magic field module | ~2,000 |
| Peoples and creatures | ~1,500 (+ data) |
| Overrides and mythic geography | ~1,500 |
| Tests | ~1,200 |

## 8. User controls and edit points

- Per module: enable, order, parameters (simple to expert), and module-specific edits (place a nexus, draw a ley line, place a floating island).
- A "fantasy amount" macro at the simple level (note 17).

## 9. Earth-recovery test

The identity test is the Earth-recovery guarantee: with fantasy off, every Earth test result is unchanged. With modules on, the Earth tests report the module's deviation instead of gating.
