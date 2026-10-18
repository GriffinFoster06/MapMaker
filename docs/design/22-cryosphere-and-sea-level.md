# Design note 22: Cryosphere and sea level

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 7b |
| Depends on | Climate (stage 5, notes 11, 24), elevation and erosion (stage 4), isostasy (note 21), astronomy forcing (note 20) |
| Used by | Erosion (glacial), sea level (coastlines on every map), climate (albedo feedback), hydrology (meltwater), life (refugia), history (ice-age migrations, land bridges) |

## 1. Problem

orogen has glacial erosion and an `iceCover` classification, but no ice that flows, grows and shrinks, and no sea level that responds. Ice ages reshape coastlines, open land bridges, carve fjords and lakes, and move peoples and species. A realistic world needs ice sheets and glaciers from climate, sea ice, permafrost, and sea level from ice volume and isostasy, on both the present-day snapshot and the geologic axis.

## 2. Canonical inputs and outputs

**Inputs:** temperature and precipitation (seasonal harmonics), elevation, bedrock, geothermal heat flux (note 21), insolation series (note 20).

**Outputs**
- `ice.thickness` (m), `ice.velocity` (vector, m/yr), `ice.basalTemp`, `ice.massBalance`.
- `iceSheets`, `glaciers` tables (extent, volume, flow lines).
- `ice.seaIce` (seasonal fraction), `ice.permafrost` (continuous, discontinuous, sporadic).
- Sea level: eustatic (from ice volume and ocean-basin volume), with glacial isostatic adjustment applied to elevation; time-varying on the geo and history axes.

## 3. Approach and algorithm choice

### 3.1 Surface mass balance

Positive-degree-day melt from the seasonal temperature harmonics (note 11) and accumulation from snowfall (precipitation below a temperature threshold), with an elevation feedback. A physically based option needs a surface energy balance. CTSM computes melt from its full energy balance and soil/snow phase change and only books the result in `GlacierSurfaceMassBalanceMod.F90` (`:209`, `:214`), so the reference is the CLM5 technical note (`doc/source/tech_note/Glacier/`, `Soil_Snow_Temperatures/`), not a standalone scheme. A physically based option would therefore be new code; the positive-degree-day scheme stays the default (ARCHITECTURE.md Phase 7b).

### 3.2 Ice flow

The shallow-ice approximation (SIA) on the sphere for ice sheets and valley glaciers, with Glen's flow law and a basal-sliding law where the bed is temperate; the shallow-shelf approximation (SSA) for ice shelves, as a later option. Solved on L0 for ice sheets, on L1 or patches for valley glaciers. PISM's SIA/SSA formulations and its verification tests are the source; its code (PETSc, a regular projected grid) is not ported, so the solver on the sphere mesh is new.

### 3.3 Coupling

Ice changes albedo and elevation (climate re-run within the stage-6 coupling loop), loads the lithosphere (flexure, note 21), erodes the bed (glacial erosion law, replacing orogen's heuristic when on), and releases meltwater to hydrology. The glacial-erosion law still needs a source: PISM has none (§4), and none is chosen yet (open question 2).

### 3.4 Sea level

Eustatic sea level from total land-ice volume (and, on the geologic axis, ocean-basin volume from mean seafloor age, note 13). Glacial isostatic adjustment via the flexure solver. The coastline is recomputed from `elevation − seaLevel`, so every map follows it.

### 3.5 Sea ice and permafrost

Sea-ice fraction from SST and air temperature (note 23); permafrost from mean annual ground temperature with snow insulation, which is new code: CTSM's `ActiveLayerMod.F90` (`alt_calc`, `:59–185`) only interpolates the 0 °C depth in its prognostic soil temperature profile, so it is a reference only if a layered soil thermal model is added.

## 4. Upstream references (algorithm level)

- **PISM** `src/stressbalance/` (SIA in `sia/SIAFD.cc`, Mahaffy staggered-grid diffusivity at `:158–188`; SSA in `ssa/SSAFD.cc`, Picard iteration with PETSc), `src/stressbalance/timestepping.cc:201` (diffusivity CFL step), `src/energy/` (enthalpy), `src/geometry/GeometryEvolution.cc` (mass transport), `src/verification/tests/exactTestsABCD.c` (exact solutions: B is Halfar at `:86`, C and D Bueler et al.), `src/earth/` (bed deformation, Lingle–Clark viscous half-space; a reference for §3.4 glacial isostatic adjustment): formulas and tests as references for a new SIA solver on the sphere; the closed-form tests A–D port as golden values. PISM has no glacial-erosion law (`src/earth/BedDef.hh:27` lists bed erosion as future work).
- **CTSM** `src/biogeophys/GlacierSurfaceMassBalanceMod.F90` (SMB bookkeeping), `SnowSnicarMod.F90` (snow albedo), `ActiveLayerMod.F90` (thaw depth from the soil temperature profile), and the CLM5 technical note in `doc/source/tech_note/`: formulation references.
- **orogen** `terrain-post.js` glacial erosion (parity and fast path).
- **VPLanet** `src/poise.c` ice-sheet module (a 1D latitudinal ice model, for fast paleo runs: `PoiseIceSheets` :7552, Glen's-law flow with n = 3 at :7662, bedrock depression; heights in m). It is integrated by `evolve.c`'s RK4 step.
- **Literature:** Cuffey & Paterson, *The Physics of Glaciers*; Huybrechts (1990s) ice-sheet modelling; Peltier ICE-6G (validation).

## 5. Validation

- PISM's exact-solution tests (Halfar, Bueler) reproduced on the sphere. They are planar, radially symmetric solutions (R0 = 750 km domes), so the sphere result must match within a curvature tolerance, not exactly.
- Mass conservation of ice plus ocean water.

## 6. Open questions

1. Is SSA (ice shelves, marine ice-sheet instability) worth its cost in the first version?
2. Which glacial-erosion law (§3.3)? PISM supplies none; the candidates named by the reconciliation are orogen's heuristic or a law from the literature (`docs/reconciliation/group-2.md` S6).

## 7. Size estimate

| Part | LOC |
|---|---|
| Mass balance (the positive-degree-day default; a physically based option is new code and is not sized here) | ~600 |
| SIA solver on the sphere | ~1,500 |
| SSA (optional) | ~1,500 |
| Sea level and GIA coupling | ~800 |
| Sea ice and permafrost | ~500 |
| Tests | ~1,200 |

## 8. User controls and edit points

- Parameters: melt factors, flow-law coefficient, sliding, sea-level offset.
- Edits: pin ice extent or thickness (paint an ice cap), set sea level directly (a pin that overrides the eustatic value), force a glacial or interglacial state.
- Switch: cryosphere `simulate | manual | off`.

## 9. Earth-recovery test

T2: with Earth's elevation and climate, the present ice extent (Greenland, Antarctica, mountain glaciers) and permafrost zones match observed maps. Under Last Glacial Maximum forcing (orbital elements from note 20, lower CO₂), ice sheets grow over North America and Scandinavia and sea level falls by about 120 m, within tolerance.
