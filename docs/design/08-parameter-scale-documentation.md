# Design note 8: Parameter-scale documentation

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 8 (with calibration) |
| Depends on | The tuning harness (orogen `tuning/climate/`, moved to `tools/tuning/` in Phase 4a), note 10 (physical parameters) |

## 1. Problem

The requirement:
- calibrate every generation parameter against real Earth data;
- anchor parameter scales so that 1.0 means Earthlike;
- **know and document** the effect of values such as 0 and 1.5.

No repo does this (matrix gap 9). orogen's constants are tuned against Earth Köppen, but they are raw numbers (`CLIMATE_DEFAULTS`, `terrain-config.js`) with no documented scale. Spike 1a also found orogen's README objective formula out of date, which shows the documentation has to be **generated from code**, not written by hand.

## 2. Canonical inputs and outputs

**Inputs**
- the **parameter registry**: every exposed parameter, declared in code;
- the tuning harness and Earth datasets (Kottek Köppen, ETOPO hypsometry, a T and P climatology; downloaded at tuning time, Q8);
- the fixed sweep seed set.

**Outputs**
- **`docs/PARAMETERS.md`**, generated, with one section per parameter (§3.3).
- **`docs/parameters/*.png`**, sweep images.
- **`tools/tuning/sweeps/<param>.json`**, raw sweep results, used for CI regression.

## 3. Approach and algorithm choice

### 3.1 The 1.0 convention

Every exposed parameter is one of two kinds:
- **Dimensionless multipliers** around an Earth-calibrated base. Value v scales one or more internal constants by v, or through a declared monotone map (for example log-scaling for rates). **1.0 reproduces the calibrated Earth defaults exactly.** A parity test asserts that all-1.0 output equals the calibrated build.
- **Physical quantities** in SI units (radius, obliquity, rotation period, stellar luminosity, and so on), each documented with its Earth value. These map to internal constants through note 10.

**0 must mean something.** It means "process off" (for example erosion strength 0 gives no erosion) or "absent" (for example ocean-current strength 0 gives a still ocean). If 0 is invalid (a radius), the registry declares a minimum, and the documentation says what happens at that minimum.

**Registry entry:**
- `id`, `label`, `kind`;
- `earthValue` (1.0, or the SI value);
- the range [min, max] and a soft range;
- the internal constants it drives, with the mapping;
- the calibration source (which dataset anchors 1.0);
- stage dependencies (for invalidation);
- `since` (app version).

### 3.2 Sweep methodology

- **One at a time, on the five-point scale.** For each parameter, run v ∈ {0, 0.5, 1, 1.5, 2} × 5 seeds. If 0 or 2 is outside the parameter's valid range, the declared min or max is used instead and the document says so. Runs are at a fixed tier (200k), with every other parameter at 1.0.
- **Summary statistics.** Each run records a fixed panel:
  - land fraction and hypsometry percentiles (5/50/95);
  - mean and percentile temperature;
  - global and land precipitation;
  - area per Köppen major group (A/B/C/D/E);
  - ice cover;
  - river count, and the area and discharge of the largest basin;
  - mountain area (≥ 1,500 m);
  - Earth-objective score (when sweeping Earth-anchored parameters).
- **Climate-model changes.** Any change to the climate model in Phase 8 (re-tuned constants, the precipitation unit mapping) re-records the Q7 A/B baseline in the same commit (ARCHITECTURE.md, Phase 8).
- **Effect.** Report the mean ± sd across seeds for each value, with a small-multiples plot, and a sensitivity summary (elasticity at 1.0: d log stat / d log v).
- **Interactions.** A Morris elementary-effects screening (Morris 1991), with r = 20 trajectories over all parameters, flags parameters whose effect depends strongly on others. Those pairs get a 3 × 3 joint sweep in the documentation.
- **Determinism.** Sweeps are defined by a manifest (parameter, values, seeds, tier, app version), so any entry can be regenerated exactly.

### 3.3 `docs/PARAMETERS.md` format

Each parameter's section has:
- a header with id, label, kind, unit, Earth value, range and calibration source;
- **"What it does"**: a sentence, plus the internal constants it drives;
- **an effects table** with one row per sweep value and columns from the statistics panel;
- **"At 0" and "At 1.5" sentences**, written by hand at Checkpoint 8 and then checked by CI against the numbers (§5);
- an image strip (globe or equirectangular, one per value, same seed);
- interactions, if flagged by Morris screening;
- caveats (for example "outside 0.5–2.0, Köppen calibration is extrapolated").

### 3.4 CI

- Every registry parameter must have an entry in `PARAMETERS.md` (a lint step).
- The **nightly** job re-runs the sweeps. If a statistic drifts beyond a tolerance from the committed JSON, CI fails, so documentation stays truthful as code changes. A changed result regenerates the document in the same commit.

## 4. Upstream references (algorithm level)

- **orogen** `tuning/climate/` (`optimize.mjs`, `score.mjs`, `koppen-distance.mjs`, `ground-truth.mjs`): the harness that sweeps extend.
- **VPLanet** `examples/EarthClimate`: Earth anchors for the physical parameters.
- Morris (1991), *Technometrics* 33, elementary-effects screening; Saltelli et al., *Global Sensitivity Analysis: The Primer* (2008).

## 5. Validation

- **Identity:** all parameters at 1.0 give a bit-identical world to the calibrated defaults.
- **Monotonicity:** for parameters declared monotone (for example a higher precipitation multiplier never lowers global precipitation), the sweep checks it.
- **Truthfulness:** each hand-written "At 0" and "At 1.5" sentence is paired with a machine-checkable claim, for example `{stat: 'landPrecip', at: 1.5, relToEarth: '>1.2'}`, and CI verifies the claim.
- **Coverage:** CI fails if a parameter is exposed in the UI but not documented.

## 6. Open questions

1. ~~**Compute budget.**~~ **Resolved at Checkpoint 2:** nightly sweeps, about 40 parameters × 5 values × 5 seeds × about 5 s ≈ 1.4 h at 200k (D10).
2. ~~**Sweep values.**~~ **Resolved at Checkpoint 2:** Phase 8 uses the five-point scale {0, 0.5, 1, 1.5, 2}, which includes the {0, 1, 1.5} the requirements name.

No open questions remain.

## 7. Size estimate

| Part | LOC |
|---|---|
| Registry | ~400 |
| Sweep runner | ~500 |
| Morris screening | ~300 |
| Statistics panel | ~400 |
| Document and image generator | ~500 |
| CI lint and claims checker | ~300 |
| **Total** | **~2,400**, plus Phase 8 calibration compute |
