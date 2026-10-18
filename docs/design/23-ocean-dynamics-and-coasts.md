# Design note 23: Ocean dynamics, tides and coasts

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 7c |
| Depends on | Winds and temperature (stage 5), bathymetry (stages 3–4), sea level and sea ice (note 22), tidal forcing (note 20) |
| Used by | Climate (SST, heat transport), precipitation, sea ice, marine life (note 26), fisheries and trade routes (history), coastal maps, hazards (storm surge, tsunamis, note 28) |

## 1. Problem

orogen's `ocean.js` builds a heuristic current field (gyres, circumpolar flow) that is good enough for colouring and climate tweaks but has no dynamics: no thermohaline circulation, no upwelling zones, no tides, no coastal processes. The realistic scope needs an ocean that responds to any continent layout (a closed seaway, an open circumpolar passage), and coasts with deltas, beaches, barrier islands and reefs.

## 2. Canonical inputs and outputs

**Inputs:** wind stress (from `wind.*`), surface heat and freshwater fluxes (temperature, precipitation, evaporation, river discharge, sea ice), bathymetry, tidal forcing, sediment supply from rivers.

**Outputs**
- `ocean.current.{surface,intermediate,deep}` (vector, m/s), `ocean.sst`, `ocean.salinity`, `ocean.upwelling`, `ocean.mixedLayerDepth`, `ocean.productivity` (with MARBL-style biogeochemistry, optional).
- `ocean.tide.range` and tidal-current strength, per coastal cell.
- Coast classification and landforms: `coast.type` (cliff, beach, barrier, delta, estuary, mangrove, reef, fjord), and elevation changes for deltas and barrier islands.

## 3. Approach and algorithm choice

### 3.1 Circulation

A layered model on the reference mesh: a barotropic (depth-averaged) wind-driven solve for gyres and boundary currents (Stommel–Munk dynamics, which places western boundary currents correctly for any basin shape), plus a two-layer baroclinic correction and a thermohaline proxy driven by surface density from temperature and salinity (a box-model overturning per basin, connected through gateways). MOM6's formulations (Coriolis, pressure gradients, the equation of state) are the source; the full primitive-equation model is not ported.

### 3.2 Coupling with climate

SST and ocean heat transport feed back into temperature and precipitation through the stage-6 coupling loop. orogen's heuristic current field remains the parity mode and the fast tier.

### 3.3 Tides

Equilibrium tides from note 20, amplified by basin and shelf resonance: a linear shallow-water solve for the main constituents on the reference mesh, then a coastal amplification factor from shelf width. Output: tidal range per coast.

### 3.4 Coasts

- Classification from tidal range, wave energy (from wind fetch), sediment supply (river discharge and erosion), slope and climate (mangroves and reefs need warm water).
- Landform growth: deltas where sediment supply beats wave and tidal reworking (the Galloway delta classification), barrier islands on low-slope, wave-dominated coasts, reefs in warm, clear, shallow water. Delft3D's sediment-transport formulas (van Rijn) inform the rates; Delft3D has no landform rules, so the classification and growth rules are new.

## 4. Upstream references (algorithm level)

- **MOM6** `src/core/MOM_barotropic.F90`, `MOM_CoriolisAdv.F90`, `MOM_PressureForce*.F90`, `src/equation_of_state/` (TEOS-10), `src/parameterizations/vertical/MOM_tidal_forcing.F90`: formulations and constants.
- **MARBL** `src/marbl_interior_tendency_mod.F90`, `marbl_pft_mod.F90`: optional ocean productivity for marine life and fisheries.
- **Delft3D** `src/utils_gpl/morphology/packages/morphology_kernel/src/`: closed-form sediment transport (`tranb7.f90` van Rijn 1984, `tram1.f90` 1993, `tram2.f90` 2004, `tranb5.f90` Bijker with waves, `trab11.f90`/`trab19.f90` wave–current forms), with gravity and densities as parameters; GPL-3.0-only. The inputs are per-cell depth, depth-averaged velocity, wave height and period, and grain sizes. `src/engines_gpl/wave/` only drives SWAN (`src/third_party_open/swan/`, a spectral wave model; reference only) and has no wave formulas of its own.
- **orogen** `js/ocean.js`: parity mode.
- **Literature:** Stommel (1948); Munk (1950); Galloway (1975) delta classification; Davis & Hayes (1984) coastal classification by tidal range.

## 5. Validation

- Idealised basins reproduce the Stommel and Munk analytic solutions.
- Closing or opening a gateway changes the overturning in the expected direction.

## 6. Open questions

1. Is a box-model thermohaline proxy enough, or is a 2.5-layer model needed to place deep-water formation sites well?

## 7. Size estimate

| Part | LOC |
|---|---|
| Barotropic and baroclinic solve on the sphere | ~2,500 |
| Thermohaline proxy and coupling | ~1,000 |
| Tides | ~800 |
| Coast classification and landforms | ~1,500 |
| Biogeochemistry (optional) | ~1,500 |
| Tests | ~1,500 |

## 8. User controls and edit points

- Parameters: wind-stress scale, mixing coefficients, overturning strength, tidal amplification, coastal sediment rates.
- Edits: pin a current (soft edit), mark a coast type, add a reef or delta (seed), close or open a strait (an elevation pin).
- Switch: ocean dynamics `simulate | heuristic (orogen) | manual`.

## 9. Earth-recovery test

T2: with Earth's bathymetry and winds, the major currents (Gulf Stream, Kuroshio, Antarctic Circumpolar Current, Humboldt and Benguela upwelling) are present in the right places, SST correlates with World Ocean Atlas climatology above a target, tidal-range distribution matches observed classes, and delta and reef locations agree with observed ones at coarse scale.
