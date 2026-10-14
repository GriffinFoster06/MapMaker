# Checkpoint 4b: preview restructure behind the A/B gate (D5, design note 14)

Date: 2026-10-14. Branch `claude/bold-dijkstra-k0fgj1`, draft PR GriffinFoster06/MapMaker#4. Phase 4b stops here and waits for review (ARCHITECTURE §7).

## Verdict

- **The structured pipeline is now the app's default.**
  - Every structural decision is made once, on the fixed 20k reference mesh L0.
  - Each fidelity N adds detail and is anchored back to that reference.
  - Stock orogen stays available as the `parity` variant, and its 4a parity tests still pass.
- **Q7: all seven original metrics meet their targets at the 200k preview tier, for every seed and against both finals.** Against stock orogen (Phase 4a baseline), every metric improves, most by a wide margin. For example, mountain IoU goes from 0.33 to 0.93 and the river-mouth median from 810 km to 79 km (200k vs 1M).
- **Two targets are still missed:**
  - The **50k preview against the 2.56M final** has coast p95 of 2.02 preview cells (mean), with one seed at 2.29.
  - **Native-cell hypsometry KS** is worse than stock in three of four comparisons. The cause is that detail below the reference scale is not yet the same at different N (invariant I3 does not hold; see Invariants).
- **D7 climate gate passes:** 0.663 vs 0.678 at 40k and 0.664 vs 0.668 at 160k (allowed: 0.02 below). The 80k climate mesh L0′ is not needed.
- **D8: the fallback was not taken.** One tuning round of the two allowed was used.
- **Not flattened.** At 2.56M the structured world is higher and at least as steep as stock on all three seeds, with Hack's exponent unchanged (0.58–0.61) and slightly denser rivers (see Realism).
- **Faster than stock at large N.** 2.56M takes 89 s in Node against stock's 232–242 s; 1M takes 31 s against 71–74 s. Climate is solved once on L0 and downscaled.

## What was built

| Milestone | Content | Commit(s) |
|---|---|---|
| M1 | `packages/core/src/multilevel/`: L0 (byte-identical to orogen's coarse mesh), R, P, C, additive and multiplicative anchoring, tangent-vector prolongation | `323bc89` |
| M2 | `packages/gen-orogen/src/port/`: TypeScript ports of 18 vendored modules (≈9.9k lines). They are bit-identical to the vendored JS in native mode; with the ports swapped in, the shell pipeline reproduces all 69 stock arrays at 20k (two seeds) and 200k. In fdlibm-only mode they still equal stock bit for bit in Node | `2bda0ac`–`f890abe` |
| M3 | `ref.pass`: orogen's own sequence run on L0 through the ports, plus priority-flood drainage with major basins (`packages/core/src/hydro/`) | `202e130` |
| M4 | `detail.pass`: elevation at N on orogen's terrain fields prolonged from L0, sub-reference detail, sign lock, anchoring; climate downscaling; Köppen at N; constrained drainage. The engine gained mesh-qualified reads | `70fd885`, `48a72ed` |
| M5 | App: structured is the default, stock is a debug option, preview-first at 50k; the worker host serves both pipelines | `54c663d` |
| M6 | Invariant tests; determinism probe v4 with 152 strict `structured.*` keys. The L0 keys are identical at 20k and 200k. All three browsers match Node | `a3d0d06` |
| M7 | `tools/tuning/ab/gate.mjs` and `ab-baseline.structured.json`; CI `ab-gate` (1M final) and nightly `ab-gate-full` (2.56M) | `784691a`, `30c4d9f` |
| M8 | D7 climate gate on the Earth example (`tools/tuning/climate/lib/structured.mjs`), recorded and tested | `8098976` |
| M9 | One tuning round (sign-lock margin), full three-seed A/B per round, D8 decision | `322f527`, `f605e09` |

## Q7 results

Three seeds (1, 777, 12345), each preview compared with each final on L0 (`tools/tuning/ab-baseline.structured.json`). Cells read as stock (Phase 4a) → structured; the structured values are means, with the worst seed in brackets.

| Metric (target) | 50k vs 1M | 200k vs 1M | 50k vs 2.56M | 200k vs 2.56M |
|---|---|---|---|---|
| Land IoU (≥ 0.95) | 0.865 → **0.962** (0.960) | 0.919 → **0.986** (0.986) | 0.860 → **0.962** (0.961) | 0.918 → **0.987** (0.984) |
| Coast p95, preview cells (≤ 2) | 3.86 → **1.66** (1.76) | 4.47 → **1.44** (1.48) | 5.10 → 2.02 (2.29) | 5.73 → **1.75** (1.82) |
| Köppen area agreement (≥ 0.90 from 200k) | 0.522 → 0.928 (0.921) | 0.616 → **0.963** (0.959) | 0.518 → 0.928 (0.920) | 0.605 → **0.964** (0.960) |
| Precipitation r, land (≥ 0.9) | 0.807 → **1.000** | 0.843 → **1.000** | 0.819 → **1.000** | 0.846 → **1.000** |
| Mountain IoU (≥ 0.6) | 0.275 → **0.851** (0.830) | 0.326 → **0.927** (0.914) | 0.246 → **0.840** (0.821) | 0.279 → **0.918** (0.904) |
| Hypsometry KS, land (≤ 0.05) | 0.123 → **0.022** (0.026) | 0.091 → **0.010** (0.013) | 0.201 → **0.027** (0.030) | 0.169 → **0.016** (0.017) |
| Top-10 basins matched (≥ 7) | 2.7 → **8.0** (6) | 4.3 → **9.0** (8) | 2.3 → **7.3** (6) | 3.7 → **8.7** (8) |
| Hypsometry KS, native cells (CP2) | 0.052 → 0.100 | 0.032 → 0.059 | 0.081 → 0.106 | 0.082 → **0.069** |
| Köppen agreement, 1° grid (CP2) | 0.505 → **0.884** | 0.589 → **0.937** | 0.505 → **0.884** | 0.580 → **0.941** |
| River-mouth distance, mean / median km (CP2) | 3080/2010 → **1050/253** | 1500/810 → **153/79** | 3220/2490 → **731/373** | 2270/2100 → **331/127** |

**Reading the table**
- **Restricted metrics:** precipitation r, hypsometry KS and mountain IoU are measured after restriction to L0. Under anchoring they are close to identities, as note 14 §3.9 predicted, and serve as correctness checks of the anchoring.
- **Informative metrics:** land IoU, coastline, Köppen, basins and the three Checkpoint 2 additions.
- **Basins at 50k:** the worst seed matches 6 of 10. The 50k tier is below the size at which the Köppen target starts, but the basin target has no such tier limit.

## Climate gate (D7)

Earth example, seed 1234 (`tools/tuning/climate/baseline.json` → `structured`). The climate is solved on L0 from Earth's elevation restricted to L0, then downscaled to N by the detail pass's own code.

| N | Stock objective | Structured objective | Gap (≤ 0.02) |
|---|---|---|---|
| 40k | 0.6778 | 0.6630 | 0.0148 ✓ |
| 160k | 0.6683 | 0.6636 | 0.0047 ✓ |

The 80k climate mesh L0′ was not needed. `tuning.test.ts` enforces both conditions wherever the Kottek data is present (nightly).

## D8 decision

**Not taken.** The full restructure plus one tuning round meets every Q7 target at the 200k tier. The remaining gaps are the 50k-vs-2.56M coast metric (2.02 against ≤ 2) and native-cell hypsometry.

- **Why the fallback would not help.** The reference-only preview (P of the reference pass, with no detail) would make native-cell hypsometry worse, not better: a preview without detail is smoother than the final restricted to it. It would also throw away the detail that the 50k preview gets right.
- **Tuning round 1.** The sign-lock margin went from 1 to 0.5, chosen on coastline shape. The coastline's fractal dimension between 200k and 1M is ≈ 1.24 at 0.5, within Earth's ≈ 1.2–1.3, against 1.31 at 1, 1.18 at 0.25 and 1.08 at 0, where every cell is locked and coasts snap to L0 cells.
- **Round 2 not used.** Neither remaining gap has a tuning parameter that moves it. The cause is structural (below).

## Invariants

- **I1 (anchoring): holds.** It is tested at 5k, 20k, 50k and 200k:
  - raw elevation within 1e-6;
  - temperature within 0.001 °C;
  - precipitation within 1e-5 relative;
  - typical measured error is ≈ 1e-12, limited by Float32 storage.

  It holds on L0 cells that have L1 children. One L0 cell has none even at 200k (the L0 Voronoi cells are irregular), and several hundred have none at 5k.
- **I2 (structure is N-independent): holds by construction.** The reference pass never reads N. The tests compare every `ref.*` layer and the plates table at 5k and 50k, and the probe v4 hashes are identical at 20k and 200k in Node and in all three browsers.
- **I3 (nested detail): does not hold.** Sub-reference detail at 200k and the 1M detail restricted to the 200k mesh correlate at r = 0.58 (seed 12345).
  - **Consistent parts:** most of orogen's terrain terms are consistent once their fields come from L0 (r 0.94–1.0 per term).
  - **Inconsistent parts:**
    - the phasor ridges aliased at preview spacing (r = 0.65);
    - fine noise octaves (r 0.78–0.90);
    - hotspot domes (r = 0.57);
    - sharp coast and margin steps, which no point sampling can reproduce;
    - erosion at N, which is hop-based.
  - **Band-limiting tried and reverted.** Band-limiting every noise octave, the phasor stripes and the plate wobble fixed the phasor term (r 0.65 → 0.97) but did not move the overall metrics, and made drainage metrics worse. It was reverted.
  - **Consequences:** this is why native-cell hypsometry KS regresses, and why the sub-reference lapse rate is off (deviation 3).

## Realism (2.56M, structured against stock)

`tools/tuning/realism/realism.mjs` (seeds 1, 777, 12345; output `tools/tuning/results/realism-2560000.json`, not committed). Land cells only; both worlds are routed by the same priority flood on their own raw elevation.

| Seed | Pipeline | Land | Hypsometry p25 / p50 / p75 / p95 / p99 (m) | Slope p50 / p90 / p99 (m/km) | Hack h | Rivers ≥10³ / ≥10⁴ km² (km per 1000 km²) |
|---|---|---|---|---|---|---|
| 1 | stock | 0.294 | 6 / 28 / 123 / 1177 / 2766 | 1.08 / 20.0 / 66.3 | 0.602 | 16.7 / 6.12 |
| 1 | structured | 0.289 | 18 / 67 / 372 / 2848 / 5900 | 2.09 / 31.0 / 95.2 | 0.594 | 18.4 / 6.34 |
| 777 | stock | 0.277 | 8 / 42 / 231 / 2353 / 5195 | 1.65 / 30.8 / 88.6 | 0.614 | 16.7 / 6.25 |
| 777 | structured | 0.266 | 13 / 52 / 278 / 2671 / 5854 | 1.79 / 29.3 / 95.8 | 0.578 | 18.2 / 6.36 |
| 12345 | stock | 0.280 | 6 / 29 / 120 / 1402 / 3841 | 0.98 / 20.8 / 68.1 | 0.606 | 16.8 / 6.24 |
| 12345 | structured | 0.280 | 17 / 69 / 333 / 2892 / 5868 | 1.98 / 30.8 / 94.2 | 0.603 | 18.4 / 6.47 |

- **Not flattened.** On every seed the structured world is as high or higher at every percentile and at least as steep, except slope p90 on seed 777 (29.3 against 30.8). Hack's exponent stays in 0.58–0.61 (Earth: ≈ 0.5–0.6), and river density is 4–10 % higher.
- **Land fraction** moves by at most 1.1 points (seed 777).
- **Variation across seeds is smaller.** Stock's p95 ranges 1177–2353 m; structured's 2671–2892 m. I have not isolated the cause. A plausible one is that structured takes its stage 1–3 fields from L0, where their resolution-dependent scalings were tuned, rather than recomputing them at 2.56M. That is unverified.
- **Proposed bounds** for a future realism regression gate (target review item 6), per seed at 2.56M: land fraction within ±0.02 of stock; hypsometry p95 and slope p50 not below stock's; Hack h in [0.5, 0.65].

## Performance

Whole pipeline in Node (A/B harness, this machine: Xeon @ 2.8 GHz, Node 24.21), seconds per seed:

| N | Stock (Phase 4a) | Structured |
|---|---|---|
| 50k | 3.0–3.6 | 3.5–4.0 |
| 200k | 11.5–12.2 | 7.4–8.0 |
| 1M | 71–74 | 31–32 |
| 2.56M | 232–242 | 89–94 |

- **Breakdown:** the reference pass on L0 takes ≈ 2.5 s, which dominates at 50k. Above 200k the structured pipeline is faster, because climate runs on L0 and is downscaled instead of being solved at N.
- **Browsers** (`BENCH_VARIANT=structured npm run bench`, the Phase 4a method on the same 4-core VM; Firefox headed under Xvfb; files `docs/benchmarks/phase4b-*-linux.json`). Total time from generate to painted globe, seconds, stock (Phase 4a) → structured:

  | Browser | 50k | 200k | 500k | 1M | 2.56M |
  |---|---|---|---|---|---|
  | Chromium | 4.0 → 5.1 | 14.5 → 11.0 | 39.0 → 21.9 | 79.9 → 39.2 | 258 → 110 |
  | Firefox | 4.2 → 5.1 | 14.3 → 11.0 | 39.1 → 23.7 | 90.8 → 46.6 | 329 → 134 |
  | WebKit | 4.0 → 4.5 | 14.7 → 8.7 | 45.7 → 18.7 | 107 → 39.3 | 374 → 120 |

  - The reference pass costs 1.8–2.4 s in every browser and at every tier. That is why 50k is 0.5–1.1 s slower than stock; from 200k up, structured is faster, by 2.2–3.1× at 2.56M.
  - **Working set** (mesh and layer arrays): 552 MB at 2.56M, against stock's 607 MB.
  - **Peak resident memory is higher.** At 2.56M, peak RSS is 1969 MB (stock 1813) in Chromium, 2645 MB (2304) in Firefox and 4625 MB (2899) in WebKit. WebKit's growth above its tier baseline is ≈ 3.1 GB against stock's ≈ 1.25 GB. The detail pass holds the reference state, the operator tables and orogen's scratch at N at the same time; the breakdown has not been measured. See Open issues.

## Deviations from note 14

1. **The correction operator C (§3.4).** The proposed iteration x ← x + P(δ − R(x)) diverges on the jittered L0 mesh (the residual grew from 1e3 to 4e6 in 30 steps at 50k), and CG and Tikhonov solves of (R∘P)y = δ amplify δ by 10 to 1e17. C now takes P iterations only while they reduce the residual, and carries the remainder with per-cell bumps that vanish on Voronoi edges. It is exact (≈ 1e-12), continuous and bounded.
2. **Anchoring in orogen's raw elevation units, not metres.** The elevation in metres is orogen's height map applied to the result. Anchoring in metres lost 4–5 points of land fraction, because the height map is linear at sea and quartic near the coast.
3. **No sub-reference lapse rate (§3.6).** Temperature at N is P(T_ref), anchored. The reference temperature already includes the lapse rate at the reference scale. Adding Γ·(P(h_ref) − h) dropped Köppen agreement at 200k vs 1M from 0.96 to 0.71, because of I3. It returns when sub-reference detail is consistent across N.
4. **No Smith–Barstad orographic precipitation (§3.6).** Precipitation is prolonged and anchored multiplicatively. With sub-reference relief inconsistent across N, an orographic term would add the same disagreement the lapse rate did.
5. **Detail = orogen at N on reference fields, high-passed (§3.4).** Instead of synthesising band-limited detail term by term:
   - orogen's elevation stages 4–13 run at N;
   - their stage 1–3 fields (stress, distances, terrain classes) are prolonged from L0, with hop distances rescaled by √(N/N_ref);
   - the phasor kernels chosen on L0 are reused;
   - the reference-scale part is then removed: D = F − C(R(F)).

   This is what made the Q7 numbers above possible. It is also why I3 fails.
6. **Keyed `structures` table not built (§2, §3.3).** On the fixed L0 mesh, stock orogen's RNG order is already N-independent. The phasor kernels, the one placement that depended on N's candidate list, are recorded on L0 and replayed at N through a hook. Hotspot positions never depended on N.
7. **Geodesic distance fields not built (§3.1).** On L0, hop counts are N-independent; at N, they come from L0 rescaled.
8. **Sign lock.** The lock margin is half the largest child detail, not the summed band amplitude (tuning round 1). A final exact, sign-safe correction leaves no locked cell on the wrong side of sea level.
9. **Size.** About 13.7k lines across the branch, against the note's ≈ 7k estimate. Of these, ≈ 9.9k are the module ports, which the note did not count, and ≈ 1.4k are the new structured pipeline and tools; the rest is tests.

## Review of the targets (for decision)

1. **Coast p95 ≤ 2 preview cells.** It is met at 200k, and at 50k against 1M; it is missed at 50k against 2.56M (2.02 mean). **Proposal:** apply it from the 200k tier, as Köppen already is, and track 50k as regression-only.
2. **Native-cell hypsometry KS.** Its target was to be set from the Phase 4a baseline. Stock's lower numbers come from detail inconsistency that structure masks: stock's preview and final disagree at the reference scale (mountain IoU 0.33), while their pixel distributions happen to match. **Proposal:** a target of ≤ 0.05 from 200k, currently missed (0.059 / 0.069), tracked as regression-only until I3 holds.
3. **River-mouth distance.** **Proposal:** a median of ≤ 2 preview-cell widths from 200k (101 km at 200k). It is currently 79 km against 1M and 127 km against 2.56M, so the 2.56M comparison misses.
4. **Köppen ≥ 90% from 200k:** met (0.96); keep.
5. **Basins ≥ 7 of 10:** met at 200k (worst seed 8). At 50k the worst seed has 6. **Proposal:** keep, from 200k.
6. **New:** realism bounds from M10 as a regression gate, so that restructuring cannot flatten the world unnoticed.

## Open issues and proposed follow-ups

- **I3 (consistent sub-reference detail).** Detail that is the same function of position at every N would:
  - make native-cell hypsometry consistent;
  - allow the sub-reference lapse rate and Smith–Barstad rain;
  - reconnect with Phase 7's slow erosion.

  The candidates are an explicit band-limited synthesis of orogen's sub-reference terms (domes, phasor, octaves), and erosion expressed in physical rather than hop units. **Proposal:** fold this into Phase 7 (erosion), which re-runs the A/B with the slow pass as final.
- **A_major = 2×10⁵ km².** It is used only by the constrained drainage; the harness's basin metric does not depend on it. It is untuned and unchanged.
- **Peak browser memory at 2.56M is higher than stock** (WebKit 4.6 GB against 2.9 GB peak RSS), although the working set is smaller. The cause is unmeasured; a breakdown of the detail pass's transient arrays comes first, and any reduction must leave the output bit-identical.
- **Previews below 20k** (orogen's slider goes down to 5k) cannot satisfy I1 on every L0 cell; several hundred are childless at 5k.

## Checks run

- **Repository checks:** lint, typecheck, `npm test`, build and `provenance:check` pass.
- **Climate tests:** the Kottek data present locally; `tools/tuning/climate` passes 5 of 5 (D7 included).
- **Node probe:** 0 strict mismatches. 22 report-only native-libm keys differ on this machine, as before.
- **Browser benchmark** (`npm run bench`, structured): all 15 tier runs pass in the three browsers.
- **`npm run e2e`** (Chromium, Firefox headed under Xvfb, WebKit): 15 of 15 pass.
- **Q7:** the full three-seed A/B was run twice, for round 0 and round 1; the gate passes against its baseline.
- **CI:** green on every completed run of the branch.
