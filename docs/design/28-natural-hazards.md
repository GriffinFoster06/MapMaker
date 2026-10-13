# Design note 28: Natural hazards and disasters

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 9e (hazard layers and statistics); Phase 13 consumes them as events |
| Depends on | Tectonics and stress (stage 2, note 13), volcanism (note 21), impacts (note 20), weather statistics (note 24), hydrology (note 12), ocean and coasts (note 23), slopes |
| Used by | History (disasters as events with consequences), settlement siting, the encyclopedia and chronicle, evolution (extinction events), map overlays |

## 1. Problem

Earthquakes, eruptions, tsunamis, floods, landslides, droughts, cyclones and impacts shape where people live and how history turns: Pompeii, Lisbon 1755, the Bronze Age collapse. The world needs hazard layers (where and how often) and a way to sample actual events on the history and geologic axes with physical consequences.

## 2. Canonical inputs and outputs

**Inputs:** plate boundaries and stress, fault types, volcano table, slopes and lithology, precipitation variability and storm statistics, river discharge distributions, coastal geometry, impact rate.

**Outputs**
- `hazard.<type>.rate` and magnitude distributions per cell (earthquake: Gutenberg–Richter a and b; eruption: VEI-frequency; flood: return-period discharge; landslide susceptibility; cyclone landfall rate; tsunami run-up exposure; drought return period).
- `hazardEvents` table on the history and geologic axes: time, location, magnitude, affected cells, consequences (elevation changes, river avulsion, ash fall, sea surge), and causes.

## 3. Approach and algorithm choice

- **Earthquakes:** seismicity rates along boundaries by type and convergence rate, with Gutenberg–Richter statistics (b ≈ 1) and a maximum magnitude from fault length; intraplate background.
- **Eruptions:** per volcano, VEI-frequency from type (note 21); ash fall footprints from wind (note 24).
- **Tsunamis:** from large subduction earthquakes and landslides; run-up exposure from coastal bathymetry (note 23).
- **Floods and droughts:** from discharge and precipitation variability statistics (notes 12, 24); river avulsion on low-gradient fans and deltas.
- **Landslides:** susceptibility from slope, lithology, precipitation intensity and seismicity.
- **Cyclones:** landfall rates from note 24's tracks.
- **Impacts:** from note 20's rate; local and (for large impacts) global effects, including extinctions (note 27) and climate shocks (note 24).
- **Sampling:** events are drawn by counter-based draws keyed on (hazard, cell, tick) so they are deterministic and independent of scheduling; consequences are applied as time-varying changes (§3.4).

## 4. Upstream references (algorithm level)

- **Delft3D** `src/engines_gpl/wave/` and D-Flow FM: wave, surge and tsunami propagation formulas, by reference.
- **orogen** `elevation.js` stress field: the input for seismicity along boundaries.
- **Literature:** Gutenberg & Richter (1944); Newhall & Self (1982) VEI; GEM global earthquake model (rates by tectonic setting); Synolakis (1987) run-up; Collins et al. (2005) impact effects.

## 5. Validation

- Synthetic catalogues reproduce the input statistics.
- Event consequences are applied conservatively (mass and water conserved).

## 6. Open questions

1. How strongly should hazards affect history by default (catastrophes can dominate small polities)?

## 7. Size estimate

| Part | LOC |
|---|---|
| Hazard layers per type | ~2,000 |
| Event sampling and consequences | ~1,500 |
| Tests | ~800 |

## 8. User controls and edit points

- Parameters: rate scale per hazard type, maximum magnitudes, impact rate.
- Edits: schedule a specific disaster (seed: an eruption, an earthquake, a flood) at a time and place; forbid hazards in a region.
- Switch: hazards `simulate | manual | off`.

## 9. Earth-recovery test

T1/T2: with Earth's tectonics, the seismicity map correlates with observed earthquake density and follows Gutenberg–Richter with b ≈ 1; volcano and eruption statistics match the Global Volcanism Program by setting; flood and cyclone exposure maps agree with observed hotspots at coarse scale.
