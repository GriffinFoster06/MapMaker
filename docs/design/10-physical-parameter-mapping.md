# Design note 10: Physical → simulation parameter mapping

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 6 |
| Depends on | The VPLanet subset (insolation, EBM; §2), orogen `climate-config.js` and `terrain-config.js`, note 14 (climate solved at L0), note 11 (seasons) |
| Used by | Whole-world mode (deriving everything from planet parameters), note 8 |

## 1. Problem

Whole-world mode must derive everything from planet parameters. orogen's climate is driven by about 100 constants tuned to Earth (`CLIMATE_DEFAULTS`), several of them in degrees of latitude or in hPa:
- subtropical highs at 31.3°;
- subpolar lows at 54.6°;
- ITCZ clamp 20.3°;
- the tropical plateau temperature;
- lapse rates.

orogen also hard-codes R = 6371 km (F3). The VPLanet subset gives physically derived forcing: insolation by latitude and day, and an energy-balance temperature profile with an ice line. This note is the glue (matrix gap 11): a pure function from `planet.*` to the orogen constants, with documented physics, an exact identity at Earth, and explicit validity bounds.

## 2. Canonical inputs and outputs

**Inputs (`planet.*`)**
- stellar mass, luminosity and age;
- semi-major axis, eccentricity, obliquity, longitude of perihelion;
- rotation period;
- planet mass and radius, from which surface gravity g follows;
- surface pressure p_s;
- greenhouse factor (CO₂ or an OLR offset);
- ocean fraction.

**Outputs**
- `planet.radius_m`, threaded through every stage that used 6371 (F3);
- `planet.forcing.*` from the VPLanet subset: insolation [lat][day], the annual EBM temperature profile, the ice line;
- **`climateConstants`**: a full `CLIMATE` object (orogen's shape) for this planet;
- **`terrainConstants`** overrides that depend on gravity (§3.3);
- **`mappingReport`**: for each constant, its value, its Earth value, the rule that produced it, and a validity flag (`ok` | `extrapolated` | `unsupported`).

## 3. Approach and algorithm choice

### 3.1 Classify every constant

Each orogen constant is tagged as one of:
- **(a) physically scalable**, with a mapping rule;
- **(b) stylistic or empirical**, kept at the Earth value;
- **(c) fitted to forcing**, by least squares against the VPLanet subset's output.

The tag table lives beside the code and is reviewed at Checkpoint 6. A constant with no tag fails CI.

### 3.2 Mapping rules (initial set)

| Physics | Rule | Drives |
|---|---|---|
| **Radius** | Replace `6371` with `planet.radius_m`. Constants in km (advection reach, continentality range) are physical lengths and are kept; they are *not* scaled with R. | F3 sites in `temperature.js`, `precipitation.js`, `ocean.js`, `elevation.js`, `heuristic-precip.js` |
| **Rotation rate Ω** | The Hadley-cell edge scales as φ_H ∝ (gHΔθ / (Ω²R²θ₀))^½ (Held & Hou 1980), with Earth normalisation. Subtropical-high latitude = Earth value × φ_H/φ_H,⊕. The subpolar-low latitude shifts with it, keeping Earth's Ferrel-cell width ratio. Coriolis deflection uses the planet's f = 2Ω sin φ. | `WIND_SUBTROP_HIGH_LAT_DEG`, `WIND_SUBPOLAR_LOW_LAT_DEG`, `PRECIP_SUBTROP_CENTER_*`, `HEUR_ZONAL_*_DEG`, `WIND_GEOSTROPHIC_MAX_ANGLE_DEG` |
| **Obliquity, eccentricity** | The seasonal ITCZ excursion follows the subsolar-latitude amplitude, damped by thermal inertia (note 11). The seasonal temperature swing scales with the EBM's seasonal amplitude by latitude. | `WIND_ITCZ_CLAMP_DEG`, `WIND_SUBTROP_SEASONAL_SHIFT_DEG`, `TEMP_SWING_SCALE`, swing table |
| **Insolation, greenhouse, albedo** (the EBM) | Fit orogen's parametric temperature curve (`TEMP_PEAK_C`, `TEMP_POLEWARD_RANGE_C`, `TEMP_POLEWARD_EXP`, `TEMP_TROPICAL_PLATEAU_DEG`) to the EBM's annual zonal-mean profile by least squares. **Fitting the curve, rather than adding an offset, lets the equator-to-pole contrast change.** | Type (c) temperature constants |
| **Gravity g** | Dry adiabatic lapse Γ_d = g/c_p, so the dry extra lapse is scaled by g/g⊕. Mountain height scales with g⊕/g, as a terrain override on peak compression (isostatic and strength limits). | `TEMP_DRY_LAPSE_EXTRA_C_PER_KM`, `applyFinalShaping` constants |
| **Surface pressure, atmosphere** | EBM heat-diffusion coefficient D scaled as in Williams & Kasting (1997): D ∝ (p/p⊕)(c_p/c_p⊕)(m⊕/m)²(Ω⊕/Ω)². POISE implements this family (`iOLRModel` WK97; `dDiffusion`). Pressure-band depths in hPa are scaled by p_s/p⊕. | EBM D; `WIND_*_HPA` |
| **Ocean fraction** | Sets orogen's `landCoverage` (1 − ocean fraction), together with plate parameters. | `landCoverage` |

Year length and day length come from orbital and rotation periods. They drive the calendar (§3.4), not climate constants. orogen has no diurnal cycle.

### 3.3 Order and identity

1. `planet` → the VPLanet subset (insolation, EBM).
2. Mapping rules give the type (a) constants.
3. Least-squares fits give the type (c) constants.
4. Type (b) constants are copied.
5. Validity flags are set.

**Identity at Earth.** With Earth inputs, every constant must equal `CLIMATE_DEFAULTS` *exactly*. The rules are written as Earth value × (ratio of the physical quantity to Earth's), so ratio = 1 gives the default bit-for-bit. Fitted constants use the Earth default whenever the EBM fit at Earth inputs is within tolerance of it. That keeps the Phase 4a parity test and the tuning baselines valid.

### 3.4 Validity bounds

orogen's circulation has three banded cells. The Held–Hou scaling is meaningful only for moderate Ω, so the mapping flags:
- **`extrapolated`** outside 0.5–2 × Ω⊕, 0–40° obliquity and 0.5–2 × p⊕;
- **`unsupported`** outside 0.25–4 × Ω⊕ (one or many cells), obliquity > 54° (poles get more annual sunlight than the equator, which orogen's curve cannot represent), or tidal locking.

**Unsupported worlds still generate.** They are marked "climate outside model validity" in the UI and in `mappingReport`. This is the honest boundary of Q10's "orogen heuristics, forced by VPLanet". Tidally locked planets are recorded as a known gap in ARCHITECTURE.md, to revisit after Phase 8.

### 3.5 Where it runs

The climate solve is at L0 (note 14), so the mapping is applied once per world. The constants are recorded in the save (`planet.json`, with `mappingReport`), so resume never re-derives them under a different app version.

## 4. Upstream references (algorithm level)

- **VPLanet** `src/poise.c` (EBM: `fvAnnualInsolation`, `fvDailyInsolation`, OLR models WK97/HM16/SMS09, diffusion and the `bMEPDiff` option), `src/distorb.c` and `src/distrot.c`: a TS re-implementation of the subset. MIT.
- **orogen** `js/climate-config.js` (`CLIMATE_DEFAULTS`), `js/terrain-config.js`.
- **Literature:**
  - Held & Hou (1980), *J. Atmos. Sci.* 37;
  - Williams & Kasting (1997), *Icarus* 129;
  - Kaspi & Showman (2015), *ApJ* 804 (rotation-rate dependence, for qualitative checks);
  - North, Cahalan & Coakley (1981), *Rev. Geophys.* 19 (EBMs).

## 5. Validation

- **Identity:** Earth inputs give `CLIMATE_DEFAULTS` exactly. The Phase 4a parity test runs through the mapping.
- **Golden data:** the TS insolation and EBM match native VPLanet `examples/EarthClimate` output to tolerance (Phase 6).
- **Monotonicity and sign:** faster rotation moves the subtropical highs equatorward; higher obliquity raises seasonal amplitude at high latitude; higher g raises the dry lapse rate; a stronger greenhouse raises mean temperature.
- **Qualitative comparison:** subtropical-high latitude against rotation rate compared with Kaspi & Showman (2015) idealised GCM trends, within the `ok` range.
- **Report completeness:** every constant has a tag and a rule (CI).
- **Q7 baseline:** any change to the mapping that alters climate output re-records the Q7 A/B baseline in the same commit (ARCHITECTURE.md, Phase 6).

## 6. Open questions

1. ~~**Tidally locked and high-obliquity worlds.**~~ **Resolved at Checkpoint 2:** both generate but are marked unsupported (D10). Tidally locked planets are on the architecture's known-gaps list, to revisit after Phase 8.
2. **Gravity:** should it also scale erosion and the hypsometry of the elevation stage beyond peak compression? That needs Phase 8 sweeps to judge.

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Rule table | ~600 |
| Fits | ~300 |
| Radius plumbing in the vendored copy (patch list) | ~100 |
| Report and UI flags | ~200 |
| Tests (identity, golden, monotonicity) | ~600 |
| **Total** | **~1,800**, excluding the VPLanet subset itself |
