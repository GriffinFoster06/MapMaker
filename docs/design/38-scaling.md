# Design note 38: Scaling the whole simulation

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 14a (kernels, done) and 14b (measurement, tiers, jobs, level of detail); principles apply from Phase 5b on |
| Depends on | Benchmarks from Phases 4a, 7 and 13; the stage runner and worker pool (§6) |
| Used by | Every system; the desktop decision (§6.5) |

## 1. Problem

The original plan was sized for terrain, climate and a 5,000-year aggregate history. The full scope (Q13) adds deep-time plate evolution, paleoclimate, evolution over hundreds of Myr, dynamic oceans, vegetation, fauna, epidemics, persons, town plans and fantasy modules. Run naively at full resolution, this would not fit a browser tab or a human's patience. Realism must not be cut to fit; instead the work must be organised so that each system runs at the resolution its Earth test needs, only where needed, and in the background when long.

## 2. Canonical inputs and outputs

**Inputs:** per-system cost models (measured), the user's fidelity choices, device capabilities (cores, memory, WebGPU).

**Outputs:** a run plan (which tier each system runs at, which jobs run in the background), progress and ETA, and checkpoints.

## 3. Approach and algorithm choice

### 3.1 Tiers per system

Every system declares tiers: `off`, `statistical` (lookup or parameterised), `coarse` (L0 or long steps), `fine` (L1 or patches, short steps). Each tier states its cost model and its Earth-test scores. The fidelity slider and presets choose tiers; the preview uses coarse tiers that are faithful by the note 14 construction.

### 3.2 Level of detail in space and time

- **Space:** structural decisions on L0; detail on L1; patches only where viewed (note 6); town plans only on demand (note 34).
- **Time:** era schedules on the history axis (§3.4), Δt in Myr on the geologic axis, with keyframes; prehistory at coarse ticks.
- **Agents:** aggregates by default; individuals only for notable persons (note 33) and notable species (note 26).

### 3.3 Background jobs

Long runs (plate evolution, paleoclimate, evolution, long histories, slow erosion) are resumable jobs in the engine worker with checkpoints and IndexedDB autosave (§6.4). The app stays interactive on the latest completed keyframe and updates as jobs progress. Jobs can be paused, reprioritised and resumed after reload.

### 3.4 Kernels

Profile first, then move hot loops to WASM (SIMD and threads where cross-origin isolation allows) with the same determinism rules (fdlibm-equivalent math, no non-deterministic reductions). WebGPU for rendering and non-authoritative previews; authoritative GPU kernels only with fixed-point arithmetic and a cross-GPU bit-equality test (§6.3).

### 3.5 Memory

Lazy layers, compressed keyframes, chunked tables, per-level paging. Budgets per tier are re-measured for the full scope in Phase 14b, which then decides on the Electron wrapper (§6.5) by the existing rule.

### 3.6 Incremental re-simulation

Edits (note 16) re-run only invalidated stages; local stages re-run only on changed cells; global stages re-run at coarse tier immediately and fine tier in the background.

## 4. Upstream references (algorithm level)

- **FLAMEGPU2**: agent data layouts for massive agent counts (concepts for struct-of-arrays and messaging).
- **Godot** `platform/web/`: WASM threading and export constraints in browsers.
- **CesiumJS**: level-of-detail and tiling for globe rendering.
- **PISM**, **MOM6**: their verification and performance-test practice (MOM6: `.testing/` invariance tests, timing tests in `config_src/drivers/timing_tests` and optional profiling; `.testing/README.rst:31–35`, `:77`, `:221–242`).

## 5. Validation

- Benchmarks per system and tier, per browser, recorded in `docs/benchmarks/` (as Phase 4a starts doing).
- Tier changes never change the outputs of tiers that did not change (hash tests).

## 6. Open questions

1. What wall-clock budget is acceptable for a full "deep" world (300 Myr plates, evolution, 10,000 years of history)? Proposed: hours in the background are acceptable for the deepest preset, minutes for the default.

## 7. Size estimate

| Part | LOC |
|---|---|
| Tier framework and run planner | ~1,500 |
| Job manager, checkpoints, UI | ~1,500 |
| Kernels (per hot loop) | ~300–1,000 each |
| Benchmarks | ~800 |

## 8. User controls and edit points

The fidelity slider (per system in expert mode), presets by speed ("quick sketch", "standard", "deep world"), job controls (pause, resume, priority), and a device-budget setting.

## 9. Earth-recovery test

Each tier records its Earth-test scores, so the user can see what a faster tier costs in realism. The default tier must pass the T1 targets.
