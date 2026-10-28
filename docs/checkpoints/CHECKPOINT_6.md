# Checkpoint 6: planet physics

Branch `phase-6` (draft PR #26 to `main`). Milestones M0 to M5, 2026-10-27. ARCHITECTURE §7 (Phase 6), design notes 10 and 11.

## 1. What was built

- **M0, reconciliation** (`docs/reconciliation/group-6.md`, P7): `orogen-evolution` compared per component. Phase 6 keeps orogen's climate engine; the Beck Köppen rules and the anchor-to-month interpolation come from v2.
- **M1a, `packages/planet/src/poise/`** (P8): VPLanet insolation (checked against native VPLanet to 1e-5 W/m²), annual EBM, WK97/HM16/SMS09 OLR, LU.
- **M2, parameter mapping** (P9): `packages/planet/src/mapping/` (97-key tag table, `assessPlanet`, `mapPlanet`, validity), planet radius threaded through the ports (`radiusKmOf`), planet inputs in `orogen.planet`, `climateConstants` and `mapping` in `planet.json`. Earth inputs give the default world bit for bit.
- **M3, continuous seasons** (P10): `calendar.ts`, `port/seasons.ts`, `port/koppen-monthly.ts`, `port/monthly-climate.ts`, `tools/tuning/climate/evaluate-monthly.mjs`. The Earth gate **failed** (`docs/earth-tests/MONTHLY_KOPPEN.md`), so the proxy classifier stays the default and no baseline was re-recorded.
- **M4, Planet panel** (P11): nine inputs, three presets, validity badge, URL state, levels (`apps/web/src/planet-panel.ts`, `e2e/planet.spec.ts`).
- **M5, Earth option** (P12): `orogen.earth` loads real elevation from a derived 5-arc-minute grid (`packages/gen-orogen/assets/earth-5m.i16.gz`, SHA-256 in `PROVENANCE.md`); plates, climate, Köppen and drainage still follow from the seed.

## 2. Checks run (at the M5 commit, macOS arm64)

- `lint`, `typecheck`, `provenance:check` pass. `npm test`: 615 passed, 1 skipped.
- `build` passes. `e2e`: 46 passed (Chromium, Firefox). `desktop:smoke`: 3 passed.
- Nine-world comparison against `main` (200k, 1M, 2.56M × seeds 1, 777, 12345): 9 worlds, 684 hashes compared, 0 differences (the default structured world is bit-identical to `main`).
- **Not run:** benchmarks and the Q7 baseline (nothing re-recorded: the structured default is unchanged).
- **Remote CI:** see the PR.

## 3. Deviations and known gaps

1. **M1b (POISE seasonal EBM) not ported.** Notes 10 and 11 do not need it.
2. **The annual EBM has no native golden.** Native VPLanet annual-only mode segfaults in three configurations (P8); it is verified by physics checks and a cross-check against the native seasonal model.
3. **P8 changes from the C source:** the Kepler loop iterates to convergence; the SMS09 slope is the exact derivative.
4. **Monthly Köppen gate failed** (P10): the continuous-season classifier is shipped and tested but not the default.
5. **No twelve-phase solve** (P10) and **no 12-month slider** (P11).
6. **Earth option has no app toggle** (P12): the page must hand the decompressed grid to the engine worker before `create`. It is available through the API, tests and `orogen.earth`. The generated elevation at N is still computed, then replaced.
7. Elevations above 6 km are capped in orogen's raw units (every elevation is); the `elevation` layer in the Earth option keeps true metres.

## 4. Decisions

P7 to P12 in `docs/DECISIONS_LOG.md`.
