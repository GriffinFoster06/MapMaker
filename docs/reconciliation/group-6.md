# Reconciliation, group 6: orogen-evolution (with the tectonic candidates), for Phases 6, 6b and 11

2026-10-27. Documentation only: no code, `upstream/` checkout (except the sanctioned clone of `orogen-evolution`, `scripts/restore-upstream.sh`), `packages/gen-orogen/vendor/` file or dependency was changed. GPlates, tectonics.js and ASPECT were reconciled in group 1 and are compared here only against `orogen-evolution`.

**Scope:** `orogen-evolution` at `47edc28` (GPL-3.0, unmodified `LICENSE`; 2026-10-19), against `upstream/orogen` (`cc2662b`), our port and the Phase 6 / 6b plans (notes 10, 11, 13). Per-component picks on quality and fit, as decision P5 requires.

**Method:** two Sonnet subagents (climate; tectonics) read the source. The coordinator re-read the key facts below (line counts, hard-coded constants, `Math.random` greps, the byte comparison with `orogen`, the torque balance, the step clock, the Köppen rules). The tectonics report's speed estimate ("13 to 18 s for 300 Myr at 40K") is derived from figures quoted in the upstream docs and was not measured; it is recorded as such.

## What orogen-evolution is

| Part | Finding | Evidence |
|---|---|---|
| V1 modules (`js/`) | **Identical to `orogen`** for `climate-config`, `climate-util`, `wind`, `temperature`, `precipitation`, `heuristic-precip`, `koppen`, `ocean`, `ocean-land`, `elevation`, `plates`, `coarse-plates`, `super-plates`, `plate-physics`, `terrain-*`, `rng`, `simplex-noise`, `sphere-mesh`, `color-map`. Changed: `generate`, `main`, `import-main`, `planet-mesh`, `planet-worker`, `edit-mode`, `scene`, `planet-code`, `state`. New: `climate-new`, `climate-layers`, `build-error`, `support-check` | `cmp` over `js/*.js` |
| `v2/js/` | A second engine: `tectonics` (60 files, 8,752 lines), `climate` (15 files, 4,021), `terrain` (17, 4,042), `finish` (10, 2,728), `evolution` (9, 3,035), `app` (20, 3,186), `view`, `core`, `climate-lab`. 19 `v2/tools/check-*.mjs` scripts with about 340 `check(` calls; no Vitest | `wc`, `ls` |
| Determinism | No `Math.random`, `Date` or wall-clock in `tectonics/`, `terrain/`, `finish/` or `climate/` results (`Math.random` only in UI files; `performance.now` only in timing). Nine seeded `makeRng` streams (`js/rng.js:3-6`, Park-Miller, exactly portable). Direct `Math.sin/cos/acos/atan2/exp` throughout, so every port goes through `dmath` | `grep`; `tectonics/world.js:23-31` |

## Climate (Phase 6)

| # | Claim in our plan | Verdict | Evidence | Feasibility |
|---|---|---|---|---|
| C1 | Note 10 maps `planet.*` onto orogen's constants; "v2 climate" does not exist in the plan | **New alternative, partial.** v2's climate takes only `tiltDeg`, `greenhouseWm2` and `precipScale` (`climate.js:18`). Rotation (`OMEGA_ROT=7.292e-5`), `R_PLANET=6.371e6`, `G_ACC`, `TROPOPAUSE_M` are constants (`circulation.js:32-35`); `R_PLANET` is also in `ocean.js:35`, `rain.js:40`, `solver.js:13`, `temperature.js:32`; year length `3.156e7 s` (`temperature.js:28`). It is Earth-calibrated: `TEMP_OLR_A/B` are Earth fits (`config.js:11-12`) | read | The mapping in note 10 stays new work; v2 does not supply it |
| C2 | VPLanet `poise.c` insolation is needed | **Confirmed, not replaced.** v2 `insolation.js:11-21` is the circular-orbit closed form (`declination = asin(sin(tilt)·sin(L))`, L linear in time): no eccentricity, no perihelion | read | `poise.c` port proceeds (M1) |
| C3 | EBM | **Different method.** v2 solves the annual mean and first two harmonics as a complex Helmholtz problem (`temperature.js:349-351,439`, heat capacities `config.js:23-24`, Stefan sea ice `:223`). POISE time-steps. Neither replaces the other; v2's is a cheaper steady-periodic solve | read | POISE port stays the golden-tested core; v2's form is an alternative for later (8b) |
| C4 | Note 11: M = 12 solved phases, harmonic fit H = 2, thermal lag by ocean/land τ | **v2 has a working design to follow.** It solves K = 6 anchors (`core.js:27`) and rebuilds 12 months by trigonometric interpolation, a fixed 12 × K matrix (`seasons.js:30-66`); precipitation is interpolated in sqrt space (`:17-21`). The lag is implicit in the complex solve | read | Note 11's lag and harmonic approach are kept; the interpolation matrix and the precipitation transform are taken as references (**pick: port `seasons.js` formulas**, through `dmath`) |
| C5 | Köppen from monthly values by Kottek et al. (2006) | **Changed.** v2 `koppen.js` follows **Beck et al. (2018, 2023)** (Peel thresholds, 0 °C C/D boundary, As merged into Aw; 30 classes plus ocean; warmer half-year chosen per cell, so it works in either hemisphere). Pure JS, no `Math.*` | `koppen.js:1-3,54-98` | **Pick: Beck rules, ported from `koppen.js`.** Beck is the current standard and the reference Earth map is Beck's; `docs/earth-tests/EARTH_TARGETS.md` already uses Kottek, so score both until the Earth targets are rebuilt (decision P7) |
| C6 | v2 beats V1 on Earth | **Earth only.** Köppen agreement with Beck on land 48.1 to 50.6% against V1's 38% (`plans/CLIMATE_REBUILD_REPORT.md`:11, 59-70); no run on Mars-like, tidally locked or eccentric planets (grep for Mars, tidal, eccentric, perihel in the climate tree and plans finds nothing). The four test planets (`test-planets.js`) all have Earth rotation and tilt | read | Useful as a benchmark and as test planets; not evidence for non-Earth worlds |
| C7 | Mesh | **Fixed 1° lat/lon grid** (360 × 180, `grid.js:12-14`), terrain sampled from it (`core.js:141-150`); the sphere mesh is a resampling target, not the solve domain | read | Conflicts with sphere-canonical (§3): a port would have to run on our mesh or resample under an explicit rule |
| C8 | Regime guards | **Absent.** Only axis validation (`core.js:155`); Held-Hou delta floored at 0.02 (`circulation.js:133`); no guard for slow rotation, high tilt or eccentricity | read | Note 10's validity flags remain new work |
| C9 | Cost | About 100 `Math.*` transcendental calls (rain 22, temperature 18, ocean 16, circulation 14, solver 7) and Float32 storage; 0.8 to 1.0 s in Chrome per the report | grep | `dmath` port changes bits; any adoption is a re-baseline |

**Climate picks (per component, decision P5):**

1. **Phase 6 keeps the plan's engine:** note 10 maps onto the orogen constants (vendored values in `CLIMATE_DEFAULTS`, identity at Earth), forced by the POISE port. Adopting v2's climate wholesale would change the engine, the grid, the parity configuration and every climate baseline, and its only evidence is Earth. Not adopted in Phase 6.
2. **Note 11 borrows from v2:** the anchor-to-month interpolation matrix and precipitation transform (`seasons.js`) and the Beck Köppen rules (`koppen.js`), each logged in `PROVENANCE.md` when ported.
3. **v2 as a benchmark:** Köppen agreement 48.1 to 50.6% on land is the figure to compare against at Phase 6's Earth gate (the plan's 0.678 objective is a different metric), and its four test planets become qualitative tests.
4. **Later, not now:** whether v2's circulation, ocean and rain stages replace orogen's at Phase 8 / 8b is flagged below.

## Tectonics (Phase 6b; the direct comparison with `plate-physics.js`)

| # | Component | Best pick | Evidence | Port notes |
|---|---|---|---|---|
| T1 | `plate-physics.js` as the force balance (note 13, ARCH §7 Phase 6b) | **Changed.** `plate-physics.js` is a static pole-bias heuristic with no age or time loop and cannot become a per-step update. The real per-step balance is v2 `step/torque-balance.js` (164 lines; solves Dω = T, relaxed over `relaxMyr` 6) with `step/forces.js` (175; ridge push, slab pull with `√(age/ref)` factor `:64,113`, basal mantle traction). `plate-physics.js` is byte-identical in both repos | read; `cmp` | Port v2's two files; keep `plate-physics.js` only as a cross-check |
| T2 | Initial plates and cratons | **v2** `init/cratons.js`, `landmass.js`, `start-world.js` (up to 24 layout attempts) | read | `dmath` rewrite; seeded |
| T3 | Rigid kinematics | **v2 `core/rotation.js`** (61 lines; quaternion from axis-angle, `quatIntegrate`, Euler-pole export) with **GPlates** as the reference for composition and slerp | `rotation.js:7-10,45-61` | Few transcendentals |
| T4 | Ridge spreading and ocean age | **v2** `step/resolve.js` (gap growth, `crust.create(cell, OCEAN, time)`); sea depth `2.6 + 0.345·√age` (`measure.js:84`) | read | **Differs from note 13 §3.2**: age is stamped at the step, not interpolated within it; accurate only because the step is small (at most 1.5 cells per step). Our interpolation stays an improvement to add |
| T5 | Subduction, collision, rifting, supercontinent cycle, hotspots and LIPs, crust budget | **v2** `step/collision.js`, `orogeny.js`, `rifting.js`, `supercontinent.js` (243), `hotspots.js` (315), `ops/*` | read; `check-phase13.mjs` asserts reassembly and a 1,200 Myr cycle | No other source has these (GPlates and tectonics.js are references only; ASPECT is FEM). Land is bounded to ±20% over 1,200 Myr by test, so the budget alone does not hold it constant |
| T6 | Fast/slow pass split (note 13 §3.4: fast dynamic pass at L0, slow kinematic replay) | **No upstream counterpart.** v2 is one adaptive pass: `maxStepMyr` 4, `stepGridMyr` 2, `maxCellsPerStep` 1.5 on a fixed 40K mesh (`config.js:12-16`); resume is exact (`simulate.js:20-22`) | read | The split remains original work; v2's step clock and exact-resume discipline are references |
| T7 | Lagrangian tracers (note 13 §3.1) | **Changed.** v2 keeps a per-plate raster in the plate's own frame, gathered onto the world mesh each step (`gather.js:1-8`) | read | Choose at the 6b milestone; v2's is the tested design |
| T8 | Terrain and detail from the records (`terrain/`, `finish/`) | **v2 is a candidate** (`records.js`, `anchor.js`, `carve.js` stream power; detail moves with the crust, parallel output equals in-place). `finish/` is climate-coupled | read | Overlaps Phase 7 and 8; decide at those Prerequisites |
| T9 | Cost | About 12 to 18 s per 300 Myr at 40K cells, from the upstream docs (**quoted, not measured**) | docs | Measure at 6b |

## Flags for the phase plan (phase text not edited)

1. **Phase 6b, ARCH line 1021 and note 13 §3.2:** "port `plate-physics.js` formulas" should read "port v2 `torque-balance.js` and `forces.js`". Note 13 §3.1 (tracers) and §3.4 (fast/slow) need a reconciliation note when 6b starts.
2. **Phase 6, note 11 §3.3 and §5:** Köppen criteria Kottek → Beck (decision P7). The 0.678 objective stays until the Earth targets are rebuilt against Beck.
3. **Phase 8 / 8b:** whether v2's circulation, ocean and rain stages beat orogen's, with a mesh-native port, is open (see "Waiting on the user" in `docs/RESUME.md`; recommended answer: decide at Phase 8, with measurements on non-Earth test planets).
4. **Phase 11 (Orogen Import):** `import-main.js` differs from orogen's (153 changed lines); not reviewed here. Remains a Prerequisite of Phase 11.

## Licence

`LICENSE` is the unmodified GPL-3.0 text; the README states GPL v3.0 only. Same as `orogen`. Extractions are logged in `PROVENANCE.md` when made.
