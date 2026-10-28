# Monthly Köppen from the solstice solves (Phase 6 M3, design note 11)

2026-10-27. Question: does classifying Köppen from monthly values, synthesised from the two solstice solves the pipeline
already makes, beat the two-season proxy classifier on Earth? Gate (ARCHITECTURE §7 Phase 6, note 11 §5): the Earth Köppen
objective must beat the two-season baseline (0.678 at 40k).

**Method.** `tools/tuning/climate/evaluate-monthly.mjs` builds the same Earth context as `evaluate.mjs` (N = 40,000, seed
1234, `earth.png` elevation, Kottek et al. truth), runs the pipeline's climate stage, and scores two Köppen fields with the
same objective: the proxy (`orogen.koppen`) and `classifyKoppenMonthly` (`packages/gen-orogen/src/port/monthly-climate.ts`):
the NH-summer and NH-winter fields are the extremes (temperature) or half-year means (precipitation) at the solstices,
rebuilt into 12 months by trigonometric interpolation (`seasons.ts`, from orogen-evolution) with a thermal lag, then the
Beck et al. rules (`koppen-monthly.ts`). The proxy's `KOPPEN_*` constants were tuned on this very objective; the monthly
path's few parameters (lags, attenuation) are not tuned.

| classifier | land lag, sea lag (months) | precip attenuation (months) | objective | graded | exact | major group | group balance |
|---|---|---|---|---|---|---|---|
| **proxy (baseline)** | | | **0.6778** | 0.8244 | 0.3999 | 0.7213 | 0.9458 |
| monthly | 1, 2 | 6 | 0.6736 | 0.8176 | 0.3793 | 0.7152 | 0.9755 |
| monthly | 0, 0 (no lag) | 6 | 0.6737 | 0.8177 | 0.3790 | 0.7157 | 0.9755 |
| monthly | 0, 1 | 6 | 0.6737 | 0.8177 | 0.3790 | 0.7157 | 0.9755 |
| monthly | 2, 3 | 6 | 0.6720 | 0.8164 | 0.3767 | 0.7134 | 0.9777 |
| monthly | 1, 2 | 3 | 0.6612 | 0.8143 | 0.3881 | 0.7053 | 0.9431 |
| monthly | 1, 2 | 4.5 | 0.6686 | 0.8165 | 0.3855 | 0.7118 | 0.9642 |
| monthly | 1, 2 | 7 | 0.6678 | 0.8158 | 0.3734 | 0.7105 | 0.9421 |
| monthly | 1, 2 | 9 | 0.6376 | 0.7921 | 0.3287 | 0.6737 | 0.8504 |

**Result.** The gate is **not met**: the best monthly setting scores 0.6737, 0.004 below the proxy. The monthly classifier
balances the climate groups better (0.976 against 0.946) but classifies fewer cells exactly right. Two solstice anchors
carry only the annual harmonic (H = 1): there is no equinox sample, no semi-annual cycle (double rainy seasons) and no
monsoon timing, which is what note 11's twelve-phase solve was designed to add. The lag barely matters here because the
anchors are already the warmest and coldest months.

**Consequence (decision P10).** The pipeline keeps the proxy classifier, so no layer, hash, golden or Q7 baseline changes.
The monthly modules, the calendar and this evaluator are kept as tools. The real improvement needs the climate solved at
more than two phases, which means reworking the season handling in `wind`, `ocean`, `temperature` and `precipitation`
(about 150 references to the two named seasons) or adopting a monthly climate such as orogen-evolution's v2 (decision P7);
that is Phase 8 / 8b material and is flagged in the Checkpoint 6 report.
