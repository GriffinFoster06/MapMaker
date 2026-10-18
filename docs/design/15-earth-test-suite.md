# Design note 15: Earth test suite (T1–T4) and gating

| | |
|---|---|
| Status | Draft (2026-10-13 overhaul) |
| Built in | Phase 8 (T1, T2 harness and first suites); every later phase adds its domain's tests; Phase 18 (T3, T4 end to end) |
| Depends on | The tuning harness (`tools/tuning/`), the Q7 A/B gate (Phase 4b), note 8 sweeps, note 17 parameter registry |
| Used by | Every phase's checkpoint (Q17); calibration (Phase 8); the parameter documentation |

## 1. Problem

The product goal is realism deep enough that Earth's starting conditions give back Earth, or something close to it (`docs/REQUIREMENTS.md`, Earth tests). Tectonics, climate, life and history are chaotic, so "give back Earth" cannot mean the same coastlines or the same empires. It has to be broken into testable claims, each with data, a metric, a tolerance and a place in CI, and it has to grow with the project: each new system adds its own tests, and no later change may silently make the world less Earth-like.

## 2. Canonical inputs and outputs

**Inputs**
- **Earth datasets**, downloaded at tuning time and logged in `PROVENANCE.md` (Q8): ETOPO elevation; Kottek or Beck Köppen–Geiger; a temperature and precipitation climatology (WorldClim or CRU); plate boundaries and sizes (Bird 2003, PB2002); seafloor age (Müller et al. 2008/2016); HydroLAKES and HydroRIVERS; ice extent (RGI, Antarctic and Greenland datasets); ocean climatologies (World Ocean Atlas SST and salinity); vegetation and NPP (MODIS land cover, MOD17); soils (USDA order map or SoilGrids); species richness (IUCN range-based richness maps); historical population (HYDE); city sizes (historical urbanisation datasets); Glottolog language families; the Seshat or Taagepera polity datasets.
- **Earth configurations** of the pipeline: Earth physical parameters (note 10); Earth elevation, plates and ice as *pinned edits* (note 16) for T2; a Pangaea-like starting state for T3.

**Outputs**
- `tools/earth-tests/` suites, one per domain, each producing a JSON report `{ suite, layer: T1|T2|T3|T4, metrics: { name, value, target, tolerance, direction } }`.
- `tools/earth-tests/baseline.json`: the committed values, per seed and tier, as for `tools/tuning/ab-baseline.json`.
- A rendered report (`docs/earth-tests/REPORT.md`) regenerated at each checkpoint.

## 3. Approach and algorithm choice

### 3.1 The four layers

| Layer | Question | Mode | Typical metric |
|---|---|---|---|
| **T1, statistical Earth** | Does an Earth-parameter world look statistically like Earth? | Whole-world generation with Earth parameters, several seeds | Distribution distances (KS, Wasserstein) between the world's statistics and Earth's |
| **T2, physics given Earth** | Given Earth's real upstream state, does each system produce Earth's real downstream state? | Earth elevation (and plates, ice) pinned through the edit log; the system under test runs | Area-weighted agreement, correlation and RMSE against observed maps |
| **T3, deep-time Earth** | Does deep-time evolution from a Pangaea-like start produce Earth-like present-day statistics? | Plate evolution, paleoclimate and evolution on the geologic axis | Statistics as T1, plus time series (supercontinent cycle, ice ages, diversity curves) |
| **T4, civilization sanity** | Given Earth's geography, does the human layer behave like human history? | Prehistory and history on Earth's geography | Distributions (Zipf, state sizes and lifetimes, densities) and timing (agriculture onset) |

T2 is the strongest test, because it isolates one system: every input is real, so any mismatch is that system's fault. T1 tests the whole chain, including the generators. T3 and T4 test long-run dynamics, where only statistics can be compared.

### 3.2 Per-domain test catalogue

Each design note's section 9 states its tests; this note collects them and owns the harness. The initial catalogue:

| Domain | T1 | T2 | T3/T4 |
|---|---|---|---|
| Tectonics (13, 21) | plate-size distribution, boundary-type shares | — | seafloor-age distribution, crust ages, hotspot count |
| Terrain and erosion (4, 7) | hypsometry, slope distribution, relief spectrum | Hack's law and concavity on real DEM basins | — |
| Climate (5, 10, 11, 24) | Köppen shares by area and latitude | Köppen agreement, temperature and precipitation RMSE, seasonal phase | ice ages under orbital forcing |
| Ocean and ice (22, 23) | — | SST and current pattern; ice extent | LGM sea-level drop |
| Hydrology (12) | lake counts and size distribution | major endorheic basins, river mouths | — |
| Soils, minerals (4, 5) | order shares | order agreement; deposit-class settings | — |
| Vegetation and fauna (25, 26, 27) | biome areas; richness gradient | biome agreement, NPP; richness map correlation | diversification curves |
| Civilization (1, 2, 9, 30–34) | — | — | Zipf, densities, agriculture timing, state sizes and lifetimes, language-family counts |

### 3.3 Running and gating

- **CI gate (Q17).** A test, once committed, fails CI if its metric is worse than the baseline for the same seed and tier by more than its stored tolerance, exactly as the Q7 A/B gate does. An improvement updates the baseline in the same commit, with the reason in the commit message (`AGENTS.md`: baselines are never refreshed just to pass).
- **Tiers.** Fast suites run at a preview tier in every CI run; full suites run nightly (`.github/workflows/nightly.yml`). Note 14's preview faithfulness (Q7) is what makes preview-tier Earth tests predictive of the final tier.
- **Targets versus gates.** Each metric has a *target* (the realism goal, for example Köppen agreement ≥ 80%) and a *gate* (no regression). Targets drive work at checkpoints; gates protect it.
- **Seeds.** T1 and T3 run on a fixed seed set (at least 5 seeds) and report the mean and spread; a single lucky seed never counts.

### 3.4 Consequences for ARCHITECTURE.md

Decision Q17; §7.0 assigns tests to phases.

## 4. Upstream references (algorithm level)

- **orogen** `tuning/climate/` (`evaluate.mjs`, `lib/ground-truth.mjs`): the existing Köppen objective, already run headless (Phase 4a).
- **PISM** `src/verification/` and **MOM6** `.testing/`: verification patterns for ice and ocean. MOM6's are invariance tests (grid symmetry, processor layout, restart equivalence, build optimisation, dimensional rescaling; `.testing/README.rst:221–242`) on small configurations. They match MapMaker's resume and determinism tests, and have no analytic or observational targets.
- **LPJmL**, **CTSM**: their benchmarking practices (biome and NPP comparisons). CTSM's checkout has no benchmarking code, so for CTSM this is a literature reference.
- **Literature:** Kottek et al. (2006); Beck et al. (2018); Bird (2003); Müller et al. (2008); Hack (1957); Messager et al. (2016) HydroLAKES; Klein Goldewijk et al. (2017) HYDE; Turchin et al. (Seshat); Taagepera (1978–97).

## 5. Validation

- The harness itself is tested: a synthetic world built *from* Earth data must score perfectly on T2 metrics (identity check), and a deliberately broken stage must fail its gate.
- Each suite documents its data version and checksum; a changed dataset is a deliberate baseline update.

## 6. Open questions

1. Which datasets need registration or have non-open licences (some species-range and polity datasets)? Licences no longer block use (Q12), but downloads must still be scripted and reproducible.
2. Tolerances for T4 are inherently loose; are order-of-magnitude bands enough, or should T4 use distribution tests only?

## 7. Size estimate

| Part | LOC |
|---|---|
| Harness, dataset fetchers, report | ~1,500 |
| Per-domain suites (grows with phases) | ~300–800 each |
| CI wiring | ~200 |

## 8. User controls and edit points

- The Earth tests are developer tooling, but the user sees them too: an "Earth check" panel can run the T1 statistics on any world and show how Earth-like it is, metric by metric. This turns realism into something the user can inspect for their own worlds.
- The "Earth" preset (note 17) is, by definition, the parameter set that passes T1.

## 9. Earth-recovery test

This note *is* the Earth-recovery test. Its own acceptance: at Phase 18, every domain built so far has at least one T1 or T2 metric at or above its target, and every T3 and T4 metric is within its stated band.
