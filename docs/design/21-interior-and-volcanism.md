# Design note 21: Interior: mantle plumes, volcanism, magnetic field and isostasy

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 6c |
| Depends on | Note 13 (plate evolution, geologic axis), note 14 (reference-level structure), note 20 (age, radiogenic heating inputs) |
| Used by | Stage 3 (hotspot edifices, volcanic arcs), note 13 (plume-driven rifting), note 5 (minerals), note 28 (eruptions, earthquakes), note 24 (volcanic CO₂ and aerosols), note 27 (extinctions from large igneous provinces) |

## 1. Problem

orogen places hotspots and arcs heuristically; plate evolution (note 13) moves plates by heuristic forces. Neither knows where heat comes from. A realistic world needs plumes whose positions persist and leave hotspot tracks, volcanism tied to setting and history, a heat-flow field consistent with crust age, isostasy that holds continents up and lets basins sink, and a magnetic field (with reversals) that the history can record in seafloor stripes and that makes the planet habitable.

## 2. Canonical inputs and outputs

**Inputs:** planet mass, radius, age, core fraction, radiogenic budget (parameters); plate configuration and history (note 13); crust thickness and age.

**Outputs**
- `plumes` table: position (unit vector, fixed or slowly drifting in the mantle frame), buoyancy flux, start and end time (geo axis).
- `volcanoes` table: edifice position, type (shield, strato, caldera, fissure, LIP), activity history; `eruptions` on the geo and history axes.
- `interior.heatFlow` (mW/m²), `interior.lithosphereThickness`, `interior.dynamicTopography`.
- Magnetic field: dipole strength over time and reversal times (geo axis); `crust.magneticPolarity` stripes on oceanic crust.
- Isostatic and flexural corrections to elevation (feeding stage 3 and note 22's ice loading).

## 3. Approach and algorithm choice

### 3.1 Thermal evolution

A parameterised thermal history (VPLanet ThermInt and RadHeat): mantle and core temperatures, heat flow and inner-core growth over the planet's age, from mass, radius and radiogenic budget. This sets the vigour of plate tectonics (feeding note 13's rate parameters) and the magnetic field's existence and strength.

### 3.2 Plumes

Plume count from the mantle heat budget and a buoyancy-flux distribution (Sleep 1990, Davies 1988). Positions are reference-keyed counter draws on L0 (note 14), preferentially at the margins of large low-shear-velocity provinces when the plate history defines them. A plume under a moving plate yields a hotspot track: an age-progressive chain of edifices along the plate's motion from note 13. Plume heads produce large igneous provinces at their onset and can trigger rifting (fed to note 13's event schedule).

### 3.3 Volcanism by setting

Arcs at subduction zones (spacing and distance from trench by slab dip), rift and ridge volcanism, intraplate hotspots, and back-arc volcanism, each with type and eruption-frequency distributions by setting (Smithsonian Global Volcanism Program statistics).

### 3.4 Isostasy and flexure

Airy isostasy for crustal thickness and density, plus elastic-plate flexure (effective elastic thickness from lithosphere age) for loads: volcanoes, ice sheets (note 22), sediment and mountains. Solved on L0 with a spectral or iterative method on the sphere.

### 3.5 Magnetic field

Dipole strength from core heat flow (ThermInt's dynamo criterion); reversals as a stochastic process with Earth-like statistics (a Poisson process with a rate parameter, with superchrons). Ridge-generated crust records the polarity at formation, producing stripes.

## 4. Upstream references (algorithm level)

- **VPLanet** `src/thermint.c` (ThermInt) and `src/radheat.c` (RadHeat): port the parameterised thermal evolution, validated against `examples/EarthInterior` and `examples/MagneticField`.
- **ASPECT** `source/material_model/` and `source/postprocess/dynamic_topography.cc`: parameter values and formulations for rheology and dynamic topography; full mantle convection stays out of scope.
- **orogen** `elevation.js` hotspot and island-arc stages: the existing heuristic, kept for parity mode.
- **tectonics.js** `Lithosphere.js`: Airy isostasy on the sphere, a small reference.
- **Literature:** Sleep (1990); Courtillot et al. (2003) plume types; Watts, *Isostasy and Flexure of the Lithosphere*; Stein & Stein (1992) heat flow versus age; Cande & Kent (1995) reversal timescale.

## 5. Validation

- ThermInt port against native VPLanet outputs.
- Heat flow versus seafloor age follows the Stein & Stein curve.
- Hotspot tracks are age-progressive along plate motion.

## 6. Open questions

1. Should plume positions be fixed in a mantle reference frame (simplest) or drift (more realistic, harder to make preview-stable)?

## 7. Size estimate

| Part | LOC |
|---|---|
| ThermInt/RadHeat port | ~1,500 |
| Plumes and hotspot tracks | ~1,000 |
| Volcanism by setting | ~800 |
| Isostasy and flexure on the sphere | ~1,200 |
| Magnetic field and stripes | ~400 |
| Tests | ~1,200 |

## 8. User controls and edit points

- Parameters: radiogenic budget, plume count scale, volcanism rate by setting, elastic thickness scale, reversal rate.
- Edits: place or remove a plume (seed), mark a volcano and set its eruption history, pin the field strength.
- Switch: interior `simulate | off` (off falls back to orogen's heuristics).

## 9. Earth-recovery test

T1: number of active hotspots (about 40–50), heat-flow versus age curve, volcano counts by setting. T3: hotspot tracks and LIP timing statistics over the run, and a reversal record with Earth-like statistics.
