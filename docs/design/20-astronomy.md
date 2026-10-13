# Design note 20: Astronomy: star systems, moons, tides and orbital cycles

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 6a |
| Depends on | Note 10 (physical → simulation mapping), note 11 (continuous seasons), the geologic axis (note 13) |
| Used by | Climate forcing (stage 5), paleoclimate (note 24), ice (note 22), tides (note 23), calendars (§3.4), night-sky views, history (eclipses and calendars as cultural events) |

## 1. Problem

The planet's sky drives everything below it: insolation by latitude and season, day length, tides, calendars, and over deep time the orbital cycles that pace ice ages. The current plan has a one-star, Earth-like forcing (note 10). The full scope needs any plausible star (or binary), any orbit, any number of moons, and their evolution over the geologic axis, with physics validated against VPLanet.

## 2. Canonical inputs and outputs

**Inputs (parameters):** star mass (or spectral type), age, metallicity; optional companion star and binary orbit; planet semi-major axis, eccentricity, obliquity, rotation period, argument of perihelion; moons (mass, radius, semi-major axis, inclination); planet mass and radius; geologic-axis duration.

**Outputs**
- `bodies` table (§3.10): star(s), planet, moons with orbital elements, and, on the geologic axis, their histories.
- `astro.insolation`: top-of-atmosphere insolation by latitude and day of year (the forcing table note 10 already defines), and its time series over the geologic axis.
- `astro.tide.*`: tidal amplitude by ocean cell (constituents from the moons and star), for note 23.
- Calendar: day, month (per major moon) and year lengths; season dates; eclipse frequency.
- Habitability flags: habitable-zone position, tidal-locking timescale, flare activity (for "climate outside model validity", D10).

## 3. Approach and algorithm choice

### 3.1 Star

Stellar luminosity and radius from mass and age with the Baraffe et al. (2015) tracks VPLanet's `stellar.c` uses, or main-sequence scaling relations as a fast path. Binary stars: circumbinary (P-type) orbits get a time-varying insolation from both stars; S-type orbits treat the companion as a perturbation.

### 3.2 Orbit and rotation

- Present-day insolation by latitude and day from the orbital elements (Berger 1978 formulas), as note 10.
- **Orbital cycles over deep time:** secular evolution of eccentricity and inclination with VPLanet's DistOrb (Laplace–Lagrange secular theory for multi-planet systems, with optional companion planets as perturbers), and obliquity and precession with DistRot. For Earth, these reproduce the Milankovitch cycles (Laskar et al. 2004 as a check).
- Rotation slowdown by tides (EqTide constant-time-lag or constant-phase-lag models) over deep time: the day lengthens, the moon recedes.

### 3.3 Moons and tides

- Equilibrium tide amplitude from each moon and the star; the dynamical response of the ocean is note 23's job.
- Tidal locking timescale for the planet and moons; a locked planet triggers the known-gap regime (D10).

### 3.4 Calendars and sky

Calendars derive from day, month and year lengths, with leap rules generated from the fractional parts (a realistic intercalation scheme per culture comes from note 32). Eclipse frequency from the moons' sizes and inclinations. A night-sky view (star field, moons' phases) is a view, seeded deterministically.

### 3.5 Impacts

An impact-rate parameter (Earth-like flux by default) produces impact events on the geologic axis (crater placement, size–frequency distribution), handed to note 28 for effects.

## 4. Upstream references (algorithm level)

- **VPLanet** `src/distorb.c` (DistOrb, secular orbital evolution), `src/distrot.c` (DistRot, obliquity and precession), `src/eqtide.c` (EqTide), `src/stellar.c` (Stellar), `src/poise.c` (insolation): port the needed parts to TypeScript, validated against native runs of `examples/CassiniStates`, `examples/BinaryTides` and `examples/EarthClimate`.
- **Literature:** Berger (1978); Laskar et al. (2004); Baraffe et al. (2015); Kopparapu et al. (2013) habitable zones; Murray & Dermott, *Solar System Dynamics*.

## 5. Validation

- Golden tests against native VPLanet outputs for each ported module.
- Earth's present insolation table matches Berger's formulas to rounding.
- Earth's orbital-element series over the last 1 Myr matches Laskar et al. (2004) within tolerance.

## 6. Open questions

1. Full N-body integration for unusual systems (resonances) is out of scope; is secular theory enough for every preset?

## 7. Size estimate

| Part | LOC |
|---|---|
| Stellar and binary insolation | ~800 |
| DistOrb/DistRot port (secular) | ~2,500 |
| Tides and rotation evolution | ~1,000 |
| Calendar, sky, impacts | ~800 |
| Tests and goldens | ~1,200 |

## 8. User controls and edit points

- Parameters: every input above, with presets (Sun-like, K dwarf, M dwarf, binary; Earth–Moon, two moons, no moon).
- Edits: set a calendar by hand; pin orbital elements at a time on the geologic axis; schedule an impact (a seed edit).
- Switch: deep-time orbital evolution on or off.

## 9. Earth-recovery test

T1/T2: Earth's present insolation, day and month lengths and tidal amplitudes are reproduced; T3: the orbital-element series and the resulting insolation at 65°N match Laskar et al. (2004) over the last few Myr, so note 24's ice-age test has the right forcing.
