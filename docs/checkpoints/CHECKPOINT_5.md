# Checkpoint 5: projection and distortion layer

Branch `phase-5` (PR #8 to `main`). Milestones M0 to M5, 2026-10-18/19. ARCHITECTURE §3.7 and §7 (Phase 5).

## 1. What was built

- **M0, browser memory at 2.56M** (`docs/checkpoints/PHASE5_M0_MEMORY.md`). Reductions R1 to R7, each its own commit, every output bit-identical (nine worlds). The detail pass allocates 2.65 GB instead of 7.43 GB (−64%). The WebKit engine worker peaks at 5,219 MB instead of 6,718 MB; stock orogen peaks at 4,383 MB.
- **M1, projection package** (`packages/projection`). It has a registry of 16 d3 projections (`registry.ts`), with raw-pole classes and `rawScale`.
  - `ProjectionView` (`view.ts`) adds the domain check, zoom and pan.
  - `distortion.ts` gives areal scale, ω, h and k, with pole limits at ±90°.
- **M2, exact path.**
  - The d3-dmath build alias (`alias/`) gives d3 determinism.
  - `sampler.ts` is the CPU inverse sampler (`MeshSampler`).
  - `png.ts` exports 16-bit heightmaps (greyscale by default, transparent-outside optional).
  - Probe keys `fd.projection.*` were added.
- **M3, vector path** (`vector.ts`, `svg.ts`, `overlay.ts`):
  - graticule;
  - coastlines along land/sea cell edges;
  - Tissot indicatrices (geodesic circles plus axes);
  - distortion overlays;
  - SVG and overlay-PNG exports through the exact path.
- **M4, GPU path.**
  - `gpu/glsl.ts` holds GLSL inverses for the 10 projections of decision 5-5, with float32 Cephes libm.
  - Data lookup uses a triangle-id cube map plus a bounded walk (`gpu/lookup.ts`, `gpu/uniforms.ts`).
  - The three.js host and the CPU fallback at half resolution are in `apps/web/src/flat/`.
- **M5, app** (`apps/web/src/flat/map-ui.ts`, `index.html`):
  - globe/flat switch;
  - projection select (GPU for the 10, CPU for the other 6);
  - λ/φ/γ rotation, wheel zoom from 1× to 16× about the cursor, and drag to pan;
  - overlays: graticule, coastlines, Tissot and a distortion heatmap;
  - **Export heightmap**: 16-bit PNG through the exact path in the worker, with absolute/land/custom mapping, a transparent option and a width setting;
  - **Export SVG**.

## 2. Checks run (at the M5 commit, macOS arm64)

- `lint`, `typecheck` and `provenance:check` pass. `npm test` gives 338 passed and 1 skipped (the upstream-required test).
- `e2e` gives 24 passed in Chromium, Firefox and WebKit (8 tests each), and `map.spec` passed again in all three after the final heatmap change. The tests include:
  - `gpu.spec`: GLSL inverse against d3 invert, and lookup against `MeshSampler`;
  - `map.spec`: the UI test, plus the exported heightmap's sha256 matched against Node.
- The M4 run (no core, engine or generator change since) gave:
  - nine-world hash comparison: 0 differences;
  - Node probe: 0 strict mismatches.
- **Not run:** benchmarks and the Q7 baseline (no generator change).
- **Remote CI:** see the PR. It runs Ubuntu, macOS and Windows determinism, the A/B gate and smoke.

## 3. Decisions

- [5-1](../DECISIONS_LOG.md) M0 rulings, with R8 deferred.
- 5-2 to 5-4: d3 determinism, heightmap scales, outside pixels.
- 5-5: the GPU set.
- 5-6 and 5-7: Aitken's extrapolation and `rawScale`.
- 5-8: 0.05 px export resampling.
- 5-9 to 5-14:
  - Cephes GLSL;
  - stable rearrangements;
  - measured tolerances;
  - lookup data;
  - colours;
  - the CPU fallback and the 1–16× zoom.
- 5-15: M5 UI.

## 4. Deviations and proposed plan text

- **§3.7 rule 3.** The fixed "2× per halving" divergence test was replaced by Aitken's Δ² (decision 5-6). It is already corrected in §3.7.
- **Distortion is numerical.** It uses five-point differences, with closed forms only at singular points and declared pole limits. Closed forms were used as test oracles for 9 projections.
- **No conic projections.** The registry holds 16 world projections; d3's conics need standard parallels, which no UI sets yet. Proposal: add them with parallels in Phase 5c (regional maps).
- **GPU precision.** Float32 is invisible at every zoom the app allows (≤ 0.0066 px at 1×, ≤ 0.0012 px at 16×; decision 5-11). No higher-precision path was needed after replacing the GPU's built-in transcendentals (decision 5-9).
- **Exports are whole-map.** They use zoom 1 and the current projection and rotation. Exporting a zoomed window is not offered.

## 5. Known gaps and prerequisites

- **R8 (Phase 7).** Skip orogen's own stage 1 to 3 fields where the detail pass replaces them. It touches `packages/gen-orogen/src/port/elevation.ts`, so it needs its own approval and parity tests (decision 5-1).
- **WebKit memory.** It is still above stock at 2.56M (5.2 GB against 4.4 GB). Electron (decision P4) avoids this.
- **The interactive distortion heatmap** is computed on the CPU at quarter resolution and is not progressive. A rotation drag redraws it per frame (superseded draws are dropped).
- **Phase 5b prerequisite:** reconciliation of Godot, orogen, Azgaar and MESSAGEix (`docs/reconciliation/README.md`, prompt 1).

## 6. Waiting on the user

- Review and merge PR #8.
- Confirm Phase 5 and extend **Authorized through** in `docs/RESUME.md`. The queue items Q1 to Q3, 5b and 5c start only after that.
