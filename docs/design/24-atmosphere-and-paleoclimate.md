# Design note 24: Atmosphere dynamics, weather and paleoclimate

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 8b |
| Depends on | Notes 10, 11 (forcing and seasons), 20 (orbital forcing), 22 (ice), 23 (ocean); the Earth harness (note 15) |
| Used by | Every climate consumer; hazards (cyclones, droughts, note 28); vegetation (note 25); history (harvest variability, note 1 §3.1 environment phase) |

## 1. Problem

The climate is orogen's heuristic model forced by a VPLanet subset (Q10), tuned against Earth Köppen. It produces a mean seasonal climate, not weather: no storm tracks, cyclones, monsoon variability, droughts or blocking. It also cannot run over deep time with changing CO₂ and continents. Q10 deferred a dynamical atmosphere "if calibration plateaus"; Q13 now plans it regardless, as an optional variant that must not make the Earth climate worse.

## 2. Canonical inputs and outputs

**Inputs:** forcing tables (insolation, note 20), surface (elevation, albedo, ice, vegetation), SST and ocean heat transport (note 23), atmospheric composition (CO₂, O₂, aerosols from volcanism note 21), rotation rate and radius.

**Outputs**
- Refined `wind.*`, `precip.*`, `temp.*`, `pressure.*` harmonics.
- `atm.stormTrack` (cyclone density), `atm.tropicalCyclone` (genesis and track density), `atm.variability` (interannual standard deviation of temperature and precipitation), `atm.monsoonIndex`.
- On the geologic axis: global mean temperature, CO₂ and ice-volume series, and keyframed climate states (paleoclimate).

## 3. Approach and algorithm choice

### 3.1 Dynamical circulation variant (stage 5a)

A simplified GCM on the reference mesh: a two-level primitive-equation or shallow-water model with Newtonian relaxation to a radiative-equilibrium temperature from the forcing (Held–Suarez style), moist physics by a simple convective and large-scale condensation scheme, and orography. It runs to a statistical equilibrium for each of the 12 seasonal phases; its time-mean fields replace the heuristic means, and its variance gives storm tracks and variability. It is the parity-safe kind of change: the heuristic model stays as the default fast tier and parity mode.

### 3.2 Weather statistics without full weather

For worldbuilding, statistics matter more than a day-by-day forecast. The model outputs statistics (storm-track density, cyclone genesis, precipitation variability, drought return periods), which hazards and history consume as distributions sampled with counter-based draws.

### 3.3 Paleoclimate over deep time

An energy-balance model (VPLanet POISE, already the source for note 10) with ice-albedo feedback and a carbon-cycle box model (silicate weathering as a thermostat, volcanic outgassing from note 21) runs on the geologic axis, forced by orbital cycles and continent configuration. It produces greenhouse and icehouse states and ice-age cycles; selected keyframes are downscaled through the full climate model.

### 3.4 D7-style gate

Any change to the climate model re-records the Q7 baseline and must not lower the Earth harness objective by more than the D7 tolerance (0.02), as for the reference-solve downscaling.

## 4. Upstream references (algorithm level)

- **VPLanet** `src/poise.c` (EBM, ice sheets, seasonal mode), for paleoclimate.
- **CESM** (CAM physics, documentation only; the checkout is empty per the matrix): formulations for moist physics.
- **orogen** `wind.js`, `temperature.js`, `precipitation.js`: the heuristic default.
- **Candidate to audit:** GISS ModelE / ROCKE-3D (exoplanet climate GCM with published code), ExoCAM.
- **Literature:** Held & Suarez (1994); Frierson et al. (2006) gray-radiation moist GCM; Walker, Hays & Kasting (1981) carbon-silicate cycle; Berger (1978).

## 5. Validation

- Held–Suarez benchmark statistics.
- Earth harness objective not worse than the heuristic model's.

## 6. Open questions

1. Is a 2-level model enough to place storm tracks and monsoons, or is a 5–10 level model needed (with WASM kernels)?

## 7. Size estimate

| Part | LOC |
|---|---|
| Dynamical core on the sphere | ~3,000 |
| Moist physics and radiation | ~1,500 |
| Statistics extraction | ~800 |
| Paleoclimate EBM and carbon cycle | ~1,500 |
| Tests | ~1,500 |

## 8. User controls and edit points

- Parameters: CO₂, solar constant scale, aerosol optical depth, convective parameters, variability scale.
- Edits: soft edits on climate (wetter, colder, stormier in a region); force a climate event on the history axis (a drought, a volcanic winter).
- Switch: `heuristic | dynamical`; paleoclimate on or off.

## 9. Earth-recovery test

T2: with Earth's surface and SST, storm-track and tropical-cyclone climatologies match observed ones in position and season, and monsoon regions match. T3: with Earth's orbital forcing over the last 1 Myr, ice ages appear with 100 kyr and 41 kyr periodicities (note 22 supplies the ice).
