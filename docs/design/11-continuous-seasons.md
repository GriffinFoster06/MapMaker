# Design note 11: Continuous seasons

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 6 |
| Depends on | The VPLanet subset (insolation per day of year), note 10, note 14 (climate solved at L0, then downscaled) |
| Used by | Köppen (stage 8), note 9 (growing season), note 12 (seasonal lake levels), seasonal views |

## 1. Problem

orogen computes climate for two seasons, summer and winter, with a hemispheric ITCZ swing. Köppen is then classified from **proxies** for warmest month, coldest month and driest month (`KOPPEN_SHOULDER_FRAC`, `KOPPEN_DRIEST_FRAC_*`). Spike 1a measured that classifier at 38–40% exact class against Earth, and the Köppen rating dropped from 5 to 4 for this reason.

Real Köppen criteria are monthly. A planet with a different obliquity, eccentricity or year length needs a seasonal cycle derived from its orbit, not a fixed two-point swing (matrix gap 12, "continuous seasons").

## 2. Canonical inputs and outputs

**Inputs**
- `planet.forcing.insolation[lat][day]` and the subsolar latitude δ(t), both from the VPLanet subset;
- year length, perihelion and eccentricity;
- the note 10 constants;
- the land/sea mask and elevation (L0).

**Outputs (L0, then downscaled to L1)**
- For each climate field F (`temp`, `precip`, `wind`, `pressure`, `current`), a **harmonic representation**: F(x, t) = a₀ + Σ_{h=1..H} (a_h cos(2πht/Y) + b_h sin(2πht/Y)), with H = 2 by default. Stored layers are `temp.a0`, `temp.a1`, `temp.b1`, `temp.a2`, `temp.b2`, and the same for the others.
- **Derived layers** that downstream stages need: `temp.mean`, `temp.warmest`, `temp.coldest`, `precip.annual`, `precip.driest`, `precip.wettest`, `precip.summerShare`, `growingSeasonDays`. Monthly values are produced on demand for any day of the year.
- **Calendar:** month table and season names for the timeline (§3.4).

## 3. Approach and algorithm choice

### 3.1 Sampling phases

The year is sampled at M phases (default M = 12 months of equal *time*, in mean anomaly, so eccentric orbits get unequal season lengths naturally). At each phase t_m:

1. **Forcing.** Subsolar latitude δ(t_m) and the insolation row come from the VPLanet tables.
2. **Thermal lag.** orogen's seasonal coordinate s ∈ [−1, 1] (summer = +1) is replaced by a **lagged insolation anomaly**. A first-order lag, τ dS/dt = S_ins(t) − S, is applied separately to ocean (τ ≈ 2 months, scaled by mixed-layer depth) and land (τ ≈ 0.5 month). The ITCZ latitude and the pressure-band shifts at phase m use s_m = S(t_m)/max|S|, so the ITCZ lags the sun as it does on Earth.
3. **Run orogen's climate at L0** with the season-dependent constants set from s_m: wind, then ocean, temperature and precipitation. orogen's code already takes a season sign and swing amplitudes, so the change is parameterisation: a continuous s replaces the ±1 switch.

### 3.2 Harmonic fit

Fit a₀ and a_h, b_h (h ≤ H) per cell by least squares over the M samples. With M = 12 and H = 2, this captures the annual and semi-annual cycles. The semi-annual term gives the double rainy season near the equator. The residual is stored as diagnostic only, and checked against a tolerance.

Vector fields (wind, currents) are fitted per east and north component, after re-projection to each cell's tangent frame.

### 3.3 Köppen from real monthly values

Evaluating the harmonics at 12 months gives real warmest and coldest month temperatures, driest and wettest months, and summer and winter half-year precipitation. The **standard Köppen–Geiger criteria** (Kottek et al. 2006 definitions) are then applied directly. The proxy constants (`KOPPEN_SHOULDER_FRAC`, `KOPPEN_DRIEST_FRAC_*`) are retired outside parity mode.

### 3.4 Parity and cost

- **Parity:** with M = 2, phases at the solstices, and s = ±1, the pipeline reproduces orogen's summer and winter fields exactly, and the Köppen proxy classifier is selected. That is the Phase 4a parity configuration.
- **Cost:** M climate solves at L0. At 20k cells, orogen's climate is a fraction of the 0.57 s full-pipeline time measured in 1a, so M = 12 adds a few seconds. Downscaling to L1 (note 14 §3.6) is applied per harmonic coefficient, because it is linear in T. For precipitation, which is multiplicative, it is applied at 12 phases and re-fitted.

### 3.5 Calendar

The timeline calendar (§3.4) takes year length (in days of the planet's own rotation), month count (default 12, configurable) and season names from this note. History ticks therefore refer to the same seasons.

## 4. Upstream references (algorithm level)

- **VPLanet** `src/poise.c` (`fvDailyInsolation`, seasonal EBM mode) and `src/distorb.c` (orbital elements): TS subset.
- **orogen** `wind.js`, `temperature.js`, `precipitation.js`, `koppen.js`: the season sign and swing parameters, and the proxy classifier kept for parity.
- **Literature:**
  - Kottek et al. (2006), *Meteorol. Z.* 15, Köppen–Geiger criteria;
  - Hartmann, *Global Physical Climatology* (2nd ed., 2016), seasonal lag and mixed-layer inertia;
  - Berger (1978), daily insolation.

## 5. Validation

- **Parity:** M = 2 at the solstices reproduces orogen's two-season output bit-for-bit.
- **Earth Köppen objective:** monthly classification vs Kottek through the tuning harness must **beat** the two-season baseline (0.678 at 40k), with a target set at Checkpoint 6. This is the expected gain from real monthly criteria.
- **Seasonal cycle:** amplitude and phase of temperature and precipitation against an Earth monthly climatology (downloaded at tuning time, license checked, Q8). The phase lag of maximum temperature after the solstice should be about 1 month on land and about 2 months at sea.
- **Orbital sanity:** obliquity 0 gives no seasonal cycle beyond eccentricity; higher eccentricity gives unequal season lengths; swapping the perihelion longitude by 180° swaps the hemispheric asymmetry.
- **Harmonic residual:** RMS residual within tolerance; the harmonic fit is stable under M = 12 vs M = 24.
- **Q7 baseline:** switching from two seasons to harmonic seasons is a climate-model change, so it re-records the Q7 A/B baseline in the same commit (ARCHITECTURE.md, Phase 6).

## 6. Open questions

1. **H = 2 harmonics** (5 coefficients per field) keeps memory modest. Is H = 3 worth the cost for monsoon climates? Measure at Checkpoint 6.
2. **Snow and ice seasonality** (seasonal `iceCover`): include it here, or leave it to a later ice note?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Phase sampling and lag | ~300 |
| Continuous-s parameterisation of orogen climate (ported) | ~500 |
| Harmonic fit and evaluation | ~300 |
| Monthly Köppen | ~300 |
| Calendar | ~150 |
| Tests | ~600 |
| **Total** | **~2,150** |
