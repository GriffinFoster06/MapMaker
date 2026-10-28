# Checkpoint 6a: astronomy

Branch `phase-6a` (draft PR #28 to `main`). Milestones M1 to M6, 2026-10-27. ARCHITECTURE §7 (Phase 6a), design note 20.

## 1. What was built

- **M1, ODE integrator** (`packages/planet/src/evolve/rk4.ts`): VPLanet `evolve.c` RK4 step, adaptive time step and output-cadence rule on a generic state vector; reused by Phase 6c (ThermInt). 6 tests.
- **M2, DistOrb LL2 and DistRot** (`distorb/eigen.ts`, `distorb/ll2.ts`, `distrot/distrot.ts`; A1, A2): Hessenberg eigen solver, Laplace coefficients, the Laplace–Lagrange eigenmode solution for N planets, and the obliquity vector under stellar, planetary and post-Newtonian torques. Native `SSDistOrbDistRot/LL2`: all eight planets over 1 Myr to print precision; Earth obliquity and precession angle step for step over 200 kyr.
- **M3, EqTide CTL and Stellar** (`eqtide/ctl.ts`, `stellar/baraffe.ts` + `baraffe-grid.json`; A3): constant-time-lag tides with spin locking (native `TideLock/CTL`, 1 Gyr), Baraffe 2015 bicubic grid (native stellar module to print precision) and the Kopparapu habitable zone.
- **M4, circumbinary** (`binary/ll13.ts`, `binary/twostar.ts`; A4): Leung and Lee 2013 orbit (native `CircumbinaryOrbit`, Kepler-16 b, to print precision) and **original** latitude-resolved two-star daily insolation (single-star limit equals the analytic formula).
- **M5, stage 0a** (`astro/astro.ts`, `astro/cycles.ts`, `gen-orogen/src/params.ts`; A5): bodies table, calendar (months, leap rules, eclipses), equilibrium tides, habitability and locking, Holman–Wiegert stability, orbital keyframes with the Moon's torque. `orogen.astro` feeds the climate mapping (the Earth sky is its identity) and is recorded in `world.planet.astro`.
- **M6, Sky panel** (`apps/web/src/astro-panel.ts`, `e2e/sky.spec.ts`; A6): star and moon presets inside the Planet panel, readout, validity badge, `as_*` URL keys.
- **Earth recovery** (note 20 §9): year 365.26 d, sidereal month 27.32 d, synodic 29.53 d, Moon tide 0.27 m and Sun tide 0.12 m, 2.4 solar eclipses a year (T1/T2); with the Moon's torque the obliquity stays within 21.5 to 25 degrees with a 41 kyr cycle and precesses in 26 kyr (T3, `astro.test.ts`).

## 2. Checks run (at the M6 commit plus the JSON import attribute fix, macOS arm64)

- `lint`, `typecheck`, `provenance:check` pass. `npm test`: 662 passed, 1 skipped.
- `build` passes. `e2e`: 50 passed (Chromium, Firefox). `desktop:smoke`: 3 passed on the second run; the first run failed `capture.spec.ts` (hide/show/minimise window states) and passed on re-run with no change (flake, OPERATING_GUIDE §8).
- Nine-world comparison against `main` (200k, 1M, 2.56M × seeds 1, 777, 12345): 9 worlds, 684 hashes compared, 0 differences.
- Native oracle: VPLanet `dd55da7` built in a scratch copy with clang (`packages/planet/golden/README.md`); five goldens, each with the sha256 of its inputs.
- **Not run:** benchmarks and the Q7 baseline (nothing re-recorded: the default world is unchanged, A5).
- **Remote CI:** see the PR.

## 3. Deviations and known gaps

1. **RD4 not ported** (A1): the 26 closed-form Laplace families and disturbing-function derivatives (~3,000 lines of `distorb.c`). LL2 is the model VPLanet's Earth examples use and covers the Earth tests. Also not ported: the invariable-plane rotation (default off) and the eqtide-coupled eigenvalue recalculation.
2. **CPL tides not ported** (A3); only CTL. DB15 and the ocean/mantle/envelope tide variants are not ported.
3. **No main-sequence fast path** for stars (A3): the Baraffe grid is used everywhere (0.07 to 1.4 solar masses); other stars need a luminosity override or are reported unsupported. Ribas XUV, magnetic braking, flares, Proxima Cen and sine-wave models not ported.
4. **Oracle runs use a fixed small step** (A2, A4) because VPLanet's printed explicit variables lag by one or two steps; tests compare at the lagged time. Native Earth in the example has no Moon, so its obliquity swings 15 to 34 degrees; the port matches that, and the Moon's torque (`torqueMultiplier`) is an addition for the T3 test.
5. **Impacts (note 20 §3.5) and the night-sky view not built** (not in the §7 text); impacts belong to note 28's phase.
6. **Tide amplitude is by latitude, not a per-ocean-cell layer** (A5): the basin response is note 23 (Phase 7c). **The two-star insolation table and the orbital keyframes are library functions** (not yet read by the climate model or the generator): the climate takes the total luminosity, as VPLanet does; both are for Phase 8 / 8b.
7. **Circumbinary:** the osculating-element conversion, Holman and Roche-lobe halts and the exact-flux integral of `binary.c` not ported (A4).
8. The first native-oracle attempt with the default adaptive step differed from the analytic solution by one step; the final tests are at print precision (all in the five goldens).

## 4. Decisions

A1 to A6 in `docs/DECISIONS_LOG.md`.

## 5. Next phase's prerequisites

Phase 6b (forward plate evolution) has its reconciliation done (group 6, P7: `torque-balance.js` + `forces.js`, not `plate-physics.js`). Phase 6c reuses `evolve/rk4.ts`.

## 6. Waiting on the user

Nothing blocks the agent. The climate-engine question in `docs/RESUME.md` is unchanged.
