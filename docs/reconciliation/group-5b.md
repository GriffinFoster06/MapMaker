# Reconciliation, group 5b: Godot, orogen, Azgaar editors and options UI, MESSAGEix (Phase 5b)

2026-10-19. Documentation only: no code, `upstream/` or `packages/gen-orogen/vendor/` file was changed, and no dependency was touched. Prerequisite of Phase 5b (`docs/ARCHITECTURE.md` §7), run with prompt 1 of `docs/reconciliation/README.md`.

**Scope:** the claims that drive Phase 5b (edit log, undo and redo, pins and soft constraints, editing tools, the registry-generated parameter panel with presets, re-simulation UX): which file is the pick, whether it exists, what it does, whether it can run through `dmath` or is only a reference, units, licence.

**Edited:** `docs/design/16-user-editing.md` (§4), `17-parameter-registry.md` (§1, §3.1 sources), `19-asset-library-and-drawing-tools.md` (§4 Godot line), `21-interior-and-volcanism.md` (§3.6), `audit/Godot.md`, `audit/orogen.md`, `audit/MESSAGEix.md`, `audit/Azgaars-Fantasy-Map-Generator.md` (new §3.29), `audit/CAPABILITY_MATRIX.md` (two rows), `docs/reconciliation/README.md` (status table).

**Method:** as in groups 1 to 3 and 6a. One Sonnet subagent per repo, then the coordinator re-read the key facts in the source (Godot `undo_redo.cpp:95` and the four file line counts; orogen `elevation.js:2408-2420`, the stage banners and orchestrator, `generate.js:18`, `terrain-config.js` constant count, `planet-mesh.js:427`, the vendor-versus-upstream `diff`; Azgaar `hotkeys.ts:50-51`, `heightmap-editor.ts` history limit and file sizes, `pins.ts`; MESSAGEix `message.py:256-259`, `common.py:78`, `scenario_data.py` size and unit list). First-report errors found: the orogen report said `index.html` has 15 range inputs; it has 16 (15 are generation sliders read by `readSliders`, the sixteenth, `sMapCenterLon`, is a view setting). The Godot report left one capability-matrix claim (no repo has STL export) unverified; it is outside this phase and stays unchecked. The MESSAGEix report could not explain "JSPF" in the audit; it is recorded as unexplained speculation.

| Repo | Commit | Licence (as found) | To record |
|---|---|---|---|
| Godot | `e7cfa29` | MIT, `LICENSE.txt` (matches the manifest) | Nothing is extracted. |
| orogen | `cc2662b` | GPL-3.0, `LICENSE` (674 lines, "Version 3, 29 June 2007"; per-file "or later" wording not checked). The vendored `js/` equals upstream `js/` except for 9 UI files not vendored | Already in `PROVENANCE.md`. |
| Azgaar | `3d94b80` | MIT, `LICENSE:3` (code only; assets as in group 6a) | Nothing is extracted. |
| MESSAGEix | `d8578a8` | Apache-2.0, `LICENSE:1-3` and `message_ix/model/includes/copyright.gms` | Nothing is extracted; no `PROVENANCE.md` row. |

## Godot

| # | Claim | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| G1 | "`editor/` undo-redo manager (`core/object/undo_redo.*`): an action-log pattern" | note 16 §4 | **Changed**: two layers | core `undo_redo.{h,cpp}` (151 + 562 lines); editor layer `editor_undo_redo_manager.{h,cpp}` (153 + 595) with a `HashMap<int, History>` of undo and redo stacks | Ref |
| G2 | it could back a replayable edit log | note 16 | **Dropped**: it is an in-memory closure stack | do and undo ops are `Callable`s or `Object*` plus `Variant` (`undo_redo.h:109-112`), dispatched through `ObjectDB`; no serialisation | Ref |
| G3 | (none) merge behaviour | — | **New**: merging depends on wall-clock time | `create_action` merges when the name matches and `last_tick + 800 > ticks` (`undo_redo.cpp:95`), ticks from `OS::get_ticks_msec` | Ref; **do not copy** (breaks replay determinism) |
| G4 | "canvas tools" | note 19 §4 | **Changed**: a 2D scene-node editor, not a brush tool | `editor/scene/canvas_item_editor_plugin.*` | Ref |
| G5 | "plugin and GDExtension patterns" | note 37 | **Confirmed** | `editor/plugins/editor_plugin.{h,cpp}` (virtuals `_forward_canvas_gui_input`, `_handles`, `_edit`, `_get_state`), `core/extension/gdextension_interface.json` | Ref |
| G6 | "module and plugin patterns for agents" | note 35 | **Changed**: nothing in Godot concerns agents | C++ SCons modules | Ref, weak |
| G7 | "`platform/web/`: WASM threading constraints" | note 38 | **Confirmed**; the audit's "likely not by default" is wrong | `threads` defaults true (`SConstruct:187`); `-pthread` in `platform/web/detect.py:256-262` | Ref |

Audit corrections: first-party size is 1,807 `.cpp` and 1,944 `.h` files, 1,624,746 lines, not ~808k; the Delaunay and convex-hull files are 157 + 2,340 lines, not ~500; FastNoiseLite is `thirdparty/misc/FastNoiseLite.h`; the undo-redo row in §3.8 now points at note 16.

## orogen

| # | Claim | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| O1 | no `js/config.js`; sliders read by `readSliders` (`js/generate.js:18`) | note 17 | **Confirmed** | 15 keys: N plus 14 | n/a |
| O2 | "orogen has a handful of sliders" | note 17 §1 | **Changed** | 15 generation sliders (`index.html:168-258`), 97 `CLIMATE_DEFAULTS` keys, 349 `export const` in `terrain-config.js` (about 446 constants) | n/a |
| O3 | `applyDynamicTopography` at `elevation.js:2412`, `UPLIFT 0.035`, `SUBSIDENCE 0.025` (`terrain-config.js:522`) | note 21 §3.6 | **Confirmed** | `elevation.js:2412-2420` | dmath |
| O4 | "orogen stage 10" | note 21; audit §3.2 | **Changed** | banner `:2410` and the header list say 10, the orchestrator calls it stage 11 (`:2590`); there are 13 stages (`:2598`) | n/a |
| O5 | "converted to metres through the adapter" | note 21 §3.6 | **Changed** | the term is in raw elevation; `elevToHeightKm` is nonlinear (`color-map.js:7`: ocean ×10 km, land 6t⁴(5−4t)), so its metre effect depends on the local elevation. The field is piecewise-constant per plate (`planet-worker.js:292-303`) | dmath |
| O6 | hotspot and island-arc stages | note 21 | **Confirmed** | `applyIslandArcs :1742`, `applyVolcanicArcs :1863`, `applyHotspotsAndLIPs :1950`, `NUM_HOTSPOTS = 5` (`terrain-config.js:388`) | dmath |
| O7 | coordinates "x toward the prime meridian, z toward 90°E" | audit §4 | **Changed (wrong)** | `lon = atan2(x, z)` (`planet-mesh.js:427`): +z is (0°N, 0°E), +x is 90°E, +y north. ARCHITECTURE F1 was right | n/a |
| O8 | soil creep "~0.05, always on", Detail "stepped by 1,000", koppen "~150 LOC" | audit §3.3, §4 | **Changed** | fixed pass of 3 iterations at 0.1125 (`generate.js:810`); slider steps by 1, the region count is rounded to 1,000 (`detail-scale.js:9`); `koppen.js` is 320 lines | n/a |
| O9 | planet code as a recipe; interactive heightmap import | note 16 §4 | **Confirmed** | `planet-code.js` (22-char base, mixed radix, 16 slots); `handleImportHeightmap` `planet-worker.js:913` (already ported in `import-heightmap.ts`) | Ref |
| O10 | (none) orogen's only edit mechanism | note 16 | **New** | Ctrl-click toggles plate ocean/land, stored as `toggledIndices` (2 base36 chars each, `planet-code.js:22`, `edit-mode.js`): no edit log, pin or soft constraint | Ref |
| O11 | (none) re-run scopes | note 17 | **New** | full rebuild (N, P, jitter, roughness, continents, size variety, land coverage), sculpting only (warp, smoothing, three erosions, ridge: `editRecompute`, `generate.js:950`), climate only (temperature and precipitation offsets) | a model for registry re-run tags |

## Azgaar editors and options UI

| # | Claim | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| E1 | "heightmap, burg, state, province, culture and religion editors; files located when Phase 5b starts" | note 16 §4 | **Confirmed**, now located | `src/controllers/*-editor.ts`: heightmap 2,211 lines, states 1,828, provinces 1,496, cultures 1,133, religions 1,001, burgs 883, regiments 613, biomes 522, zones 503, relief 488, route 477, markers 304 and more; `components/map-brush.ts` (189) | Ref |
| E2 | "its edits mutate state directly" | note 16 §4 | **Confirmed** | `biomes-editor.ts:315,326`; `heightmap-editor.ts:1459` writes `grid.cells.h` | Ref |
| E3 | brushes "raise, lower, smooth, flatten, terrace, noise" | note 16 §3.3 | **Changed**: those are our names | Azgaar: Raise, Elevate, Lower, Depress, Align, Smooth, Disrupt (`heightmap-editor.ts:957-987, 1358-1395`); no terrace, no flatten or noise tool by name | Ref |
| E4 | (none) template tools | — | **New** | Hill, Pit, Range, Trough, Strait, Mask, Invert, Add, Multiply, Smooth (`heightmap-editor.ts:101-111`) over `generators/heightmap-generator.ts` (630 lines) | generator: dmath |
| E5 | (none) undo | — | **New**: no general edit log or undo | only the heightmap editor (snapshots of `grid.cells.h`, `historyLimit = 100` at `:56`; Ctrl+Z/Y click `#undo`/`#redo`, `hotkeys.ts:50-51`), `wrap-tool.ts`, `paint-editor.ts` | Ref only |
| E6 | (name) "pins" | note 16 | **New**: a different concept | `components/pins.ts` (106 lines) locks an option value across regeneration (`fmg-locks`) | name collision |
| E7 | "Azgaar options UI: the simple-level reference" | note 17 §3.1 | **Changed**: no simple, advanced or expert levels, no generated panel | `components/options/tabs/*`, hand-written; `OptionBinding` in `options-tab.ts:20-40` | Ref |
| E8 | "Azgaar has dozens of options" | note 17 §1 | **Confirmed**, with the closest analogue | zod schema `options-schema.ts` (286 lines: range types, no units or documentation); defaults in `options-model.ts`; `localStorage["fmg-options"]` | Ref |
| E9 | (none) determinism | — | **New** | editors use the global `Math.random` (`heightmap-editor.ts:1395, 1465`); only `executeTemplate` seeds Alea (`:1725`): strokes are not replayable | needs an injected RNG |

## MESSAGEix

| # | Claim | Cited in | Verdict | Evidence | Feasibility |
|---|---|---|---|---|---|
| M1 | "MESSAGEix/ixmp scenario parameters: scenario management" | note 17 §3.1 | **Changed**: no file named; ixmp is not vendored | `message_ix/common.py:78` `Item`; `message.py:256-259` (110 parameters, 46 sets); `util/scenario_data.py:199, 237` (`ParameterInfo`, `PARAMETERS`, 128 entries) | Ref |
| M2 | (none) units and validation | — | **New**: units are a flat list, no ranges or defaults | `REQUIRED_UNITS` 24 strings (`scenario_data.py:1755-1780`, default `"???"`); structural checks only (`message.py:24-62`) | Ref |
| M3 | "scenario management: branching" | note 36 | **Confirmed** as a concept | `core.py:720` `clone`, `:895` `commit`; the version store is the external `ixmp` | Ref |
| M4 | size and count claims (`scenario_data.py` ~57K lines, `core.py` ~1K, `gams_io.py` ~450, `MESSAGE_master.gms` ~500, Westeros ~50 nodes, Sankey under `report/`) | audit | **Changed** | 1,780; 906; 362; 87 (core is `model_core.gms`, 2,383); baseline has a single node (`westeros_baseline.ipynb:217`); `tools/sankey.py` | n/a |

## Flags for the phase plan (not applied to phase text)

1. **The edit log, pins and soft constraints are original work.** Neither Godot (closure stack, no serialisation) nor Azgaar (no general log) is an extraction source; no `PROVENANCE.md` row is owed for either.
2. **Do not copy Godot's time-based merge.** Coalescing here keys on an explicit gesture id so that equal edit sequences give equal hashes.
3. **Tool vocabulary.** The plan's "raise, lower, smooth, flatten, terrace, noise" are our names (Azgaar's equivalents: Raise and Elevate, Lower and Depress, Smooth, Align, none, Disrupt). Azgaar's template steps (Hill, Pit, Range, Trough, Strait, Mask) are a candidate for a later "stamp" tool, not part of 5b. Decided in `docs/DECISIONS_LOG.md` (5b entries).
4. **The registry.** Only 14 sliders plus seed and tier are parameters today. orogen's 446 constants are module-level constants in the vendored files and the TypeScript ports, not overridable parameters; exposing them (the "expert" tier) needs each constant lifted into the registry, which is not 5b work. orogen's three re-run scopes become the registry's re-run scope tags. Planet-code slider quantisation means a free-float registry does not round-trip to orogen planet codes.
5. **Phase 6c wording.** `interior.dynamicTopography` is recorded in raw orogen units and has plate-sized steps (O4, O5): note 21 now says so.
6. **No decision is pending for the user.**
