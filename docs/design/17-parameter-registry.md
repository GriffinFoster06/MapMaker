# Design note 17: Parameter registry, presets and expertise levels

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 5b (registry and panel); Phase 8 (scales and documentation, with note 8); every phase registers its parameters |
| Depends on | Note 8 (the 1.0 = Earth convention and sweeps), note 10 (physical parameter mapping) |
| Used by | The parameter panel, presets, the save format (`params.json`), the Earth tests (note 15), modules (note 35) |

## 1. Problem

"Every parameter exposed" means hundreds of values across every domain. Without structure the user drowns, values drift out of sync with the code, and nothing says what a value does. orogen has 15 generation sliders (`index.html:168-258`; `readSliders` returns N plus 14) and about 446 exported tuning constants (97 in `CLIMATE_DEFAULTS`, 349 `export const` in `terrain-config.js`); Azgaar has dozens of options; the full scope has an order of magnitude more.

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
- **orogen** `js/climate-config.js` and `js/terrain-config.js` (defaults and constants; there is no `js/config.js`). The sliders themselves are DOM inputs read by `readSliders` in `js/generate.js:18` (`docs/reconciliation/review.md` M2); **Azgaar** `components/options-schema.ts` (a zod schema with range types, 286 lines), `components/options-model.ts` (defaults, `localStorage` persistence) and `components/options/tabs/*` (a hand-written tabbed UI): the closest Azgaar analogue to a registry, reference only. It has no simple, advanced or expert levels, no units or documentation metadata and no generated panel. orogen re-runs at three scopes (full rebuild: N, P, jitter, roughness, continents, size variety, land coverage; sculpting only: warp, smoothing and the three erosions, ridge; climate only: temperature and precipitation offsets; `js/generate.js:910, 950`), a model for the registry's re-run scope tags.
- **MESSAGEix** `message_ix/common.py:78` `Item` (name, type, coords, dims), `message_ix/message.py:256-259` (`par`, `_set`, `equ`, `var` declarations: 110 parameters, 46 sets) and `message_ix/util/scenario_data.py:199,237` (`ParameterInfo`, `PARAMETERS`): index-set structure only. Units are a flat 24-string list (`scenario_data.py:1755`) with a `???` default (`core.py` `add_par`); there are no ranges, per-parameter defaults, scopes, presets or validation beyond `message.py:24-62`. Versioning lives in the external `ixmp` package (not vendored). Python and GAMS; reference only.

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
