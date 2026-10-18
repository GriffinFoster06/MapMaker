# Design note 17: Parameter registry, presets and expertise levels

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 5b (registry and panel); Phase 8 (scales and documentation, with note 8); every phase registers its parameters |
| Depends on | Note 8 (the 1.0 = Earth convention and sweeps), note 10 (physical parameter mapping) |
| Used by | The parameter panel, presets, the save format (`params.json`), the Earth tests (note 15), modules (note 35) |

## 1. Problem

"Every parameter exposed" means hundreds of values across every domain. Without structure the user drowns, values drift out of sync with the code, and nothing says what a value does. orogen has a handful of sliders; Azgaar has dozens of options; the full scope has an order of magnitude more.

## 2. Canonical inputs and outputs

**Registry entry** (declared next to the code that uses it):

```
{ key: 'climate.lapseRate', domain: 'climate', unit: 'K/km', default: 6.5,
  range: [3, 10], scale: 'linear' | 'log', earth: 6.5, level: 'simple' | 'advanced' | 'expert',
  label, help, doc: 'docs/PARAMETERS.md#climate-lapserate', stage: '5', affects: [...stages],
  physical?: true, derivedFrom?: 'planet.*' }
```

**Outputs:** `World.params` (flat map), validated against the registry; `docs/PARAMETERS.md` generated from the registry plus the note 8 sweeps; preset files (`presets/*.json`).

## 3. Approach and algorithm choice

### 3.1 One registry, declared in code

Each package registers its parameters at module load. A lint rule forbids numeric literals for tunable constants in stage code: tunable values go through `params.get(key)`. Unregistered keys fail the stage runner.

### 3.2 Levels

- **simple**: about 10–20 world-level controls (planet size, land fraction, temperature, wetness, mountainousness, plate activity, life richness, civilization start, history length, fantasy amount).
- **advanced**: per-system controls (tens per domain).
- **expert**: every registered constant, including model coefficients.

Simple controls are **macros**: each maps to a documented set of advanced and expert values (for example "mountainousness" scales uplift rates and collision strength). Changing an underlying value marks the macro as "custom".

### 3.3 Presets

A preset is a partial parameter map plus a module set (note 35) and optional edits. Built-ins: Earth (passes T1), Earth at the Last Glacial Maximum, hothouse Earth, Mars-like, ocean world, archipelago, Pangaea, tidally locked, high fantasy, low fantasy. Users can save their own.

### 3.4 Physical versus simulation parameters

Physical parameters (radius, gravity, obliquity) feed note 10's mapping, which derives simulation constants. The registry marks derived values; overriding one is an expert edit that is recorded and shown.

### 3.5 Documentation

`docs/PARAMETERS.md` is generated: for each parameter, its meaning, unit, range, Earth value, and (from the note 8 sweeps) its measured effect at 0, 0.5, 1, 1.5 and 2 on the T1 metrics.

## 4. Upstream references (algorithm level)

- **MARBL** `src/marbl_settings_mod.F90` and `defaults/settings_*.yaml`: a parameter registry with datatype, units, long name, subcategory, per-configuration defaults and optional enumerated `valid_values`, set in four ordered categories (`settings_latest.yaml:9–39`). It has no numeric ranges and no generated documentation, and each parameter is declared twice (a Fortran `add_var` call plus default, and a YAML entry), which §3.1's single declaration avoids. A model for the metadata, not the mechanism.
- **orogen** `js/config.js` (slider definitions); **Azgaar** options UI: the simple-level reference.
- **MESSAGEix**/ixmp scenario parameters: scenario management.

## 5. Validation

- Lint: no unregistered tunable literals in `packages/**` stage code.
- Every registered parameter appears in `docs/PARAMETERS.md` with a sweep result once Phase 8 runs.
- Preset round trip: save, load, compare.

## 6. Open questions

1. How should macro mappings handle conflicts when the user edits both a macro and its underlying values?

## 7. Size estimate

| Part | LOC |
|---|---|
| Registry, validation, lint rule | ~800 |
| Panel UI (generated) | ~1,500 |
| Presets and macros | ~600 |
| Doc generator | ~400 |

## 8. User controls and edit points

The parameter panel itself: search, grouping by domain, level switch, reset to default, reset to Earth, compare two presets, and a "what does this do" link to the generated documentation.

## 9. Earth-recovery test

T1: the "Earth" preset must pass the T1 suites (note 15). The documentation's sweep results quantify how far each parameter moves the world away from Earth.
