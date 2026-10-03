# Design note 4: Soils

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 9 |
| Depends on | Lithology (stage 3 or note 13), erosion rate and sediment (stage 4), climate (stage 5), Köppen and biome (stage 8), hydrology (stage 7) |
| Used by | Note 9 carrying capacity, stage 10 goods, note 5 (laterite, bauxite) |

## 1. Problem

The requirement includes soils. No upstream repo generates soil type and fertility in a browser-ready form (matrix gap 4). LPJmL and CTSM *consume* soil maps, and use them for water and carbon. Soils matter downstream for agriculture, carrying capacity, goods and settlement siting, so they must be plausible and calibrated, not decorative.

## 2. Canonical inputs and outputs

**Inputs (per L1 cell):**
- `lithology` (parent material class);
- slope from `elevation`;
- `erosionRate` (m/Myr) and `sediment` (m);
- `temp.*` and `precip.*` (seasonal); PET derived from them;
- `koppen`, `biome`;
- `drainageArea` and `lake` (waterlogging);
- `iceCover`, and glaciation history where available (orogen's glacial erosion flag);
- `crustAge_Myr` (surface age proxy, when note 13 is active);
- proximity to volcanic arcs or hotspots (`structures`).

**Outputs**
- **`soilType`:** the 12 USDA soil orders (Gelisols, Histosols, Spodosols, Andisols, Oxisols, Vertisols, Aridisols, Ultisols, Mollisols, Alfisols, Inceptisols, Entisols).
- **`soilDepth`** (m).
- **`soilFertility`** (0..1).
- **`soilTexture`** (enum: sand, loam, clay, plus three intermediate classes).
- **`soilDrainage`** (enum).
- **`soilAWC`** (available water capacity, mm), for note 9 and later agriculture.
- Static layers, with `timeVarying: false` unless history climate change is enabled later.

## 3. Approach and algorithm choice

### 3.1 State factors

Soils follow Jenny's (1941) state-factor model, S = f(climate, organisms, relief, parent material, time). Each factor maps directly to an existing layer:
- climate → `temp`, `precip`, PET;
- organisms → `biome`;
- relief → slope and drainage position;
- parent material → `lithology` and `sediment`;
- time → surface age.

### 3.2 Depth from a production–erosion balance

The soil production function (Heimsath et al. 1997) is dh/dt = P₀·exp(−h/h₀) − E. Its steady state is h* = h₀·ln(P₀/E) when P₀ > E, and 0 otherwise (bare rock).
- E comes from the `erosionRate` layer.
- P₀ scales with temperature and moisture (chemical weathering; Arrhenius-type in T, linear in runoff).
- On depositional cells (sediment > 0), depth = min(sediment, h_max).

This ties soil depth to the physics already computed, rather than to noise.

### 3.3 Order classification

The classifier is a **rule-based decision list** following the USDA key order, which is itself a priority order:
1. Gelisols: permafrost (mean annual T < −2 °C plus ice).
2. Histosols: waterlogged lowlands with high precipitation and low slope.
3. Spodosols: cool, humid, coniferous, on sandy parent material.
4. Andisols: volcanic parent material, from arcs, hotspots and LIPs.
5. Oxisols: hot and humid (Af/Am) on old, stable surfaces with low erosion.
6. Vertisols: clay-rich parent (basalt, shale) under a strongly seasonal climate (Aw, BSh).
7. Aridisols: aridity index < 0.2.
8. Ultisols: warm, humid, old, leached.
9. Mollisols: grassland biomes, semi-humid.
10. Alfisols: temperate deciduous, moderate leaching.
11. Inceptisols: young or steep surfaces.
12. Entisols: very young (fresh sediment, dunes, steep and high erosion).

Each rule is a smooth score with thresholds as parameters, and the highest-priority rule above its threshold wins. The thresholds are tuned in Phase 8 against Earth data (§5).

### 3.4 Fertility and properties

- **Fertility** = base fertility of the order × depth factor × pH proxy (the leaching index P/PET pushes soils acidic) × organic-matter proxy (from NPP, as in note 9) × waterlogging penalty.
- **Texture** comes from a parent-material lookup, modified by weathering (clay increases with time and warmth).
- **AWC** comes from texture through standard pedotransfer tables (Saxton & Rawls 2006). CTSM and LPJmL use the same texture → hydraulic-property idea.

### 3.5 Resolution

Soils are per L1 cell, computed from layers that are already anchored (note 14). The `soilType` mode after restriction agrees between preview and final wherever the inputs do. Soils are not structural, so they are not separately anchored.

## 4. Upstream references (algorithm level)

- **LPJmL** `src/soil/` (soil water, texture classes, hydraulic parameters): an algorithm reference. AGPL-3.0, so no code.
- **CTSM** soil hydrology and texture → hydraulic parameters (Clapp & Hornberger 1978 style): reference only.
- **Literature:**
  - Jenny, *Factors of Soil Formation* (1941);
  - Heimsath et al. (1997), *Nature* 388;
  - USDA *Keys to Soil Taxonomy* (13th ed., 2022), public domain US government work;
  - Saxton & Rawls (2006), *SSSAJ* 70.

## 5. Validation

- **Earth plausibility.** Run the soil stage on Earth: orogen's Earth heightmap input, Kottek climate, and a generic lithology. Compare against a global USDA soil-order map, downloaded at tuning time with its license checked (Q8). Report the area share per order and area-weighted agreement. The target is set at Checkpoint 9; Earth's real lithology is unknown to us, so exact agreement is not expected.
- **Association tests:**
  - Gelisols only where mean annual T < 0 °C;
  - Aridisols only in B climates;
  - Andisols within N km of arcs and hotspots;
  - Oxisols only in A climates;
  - Histosols only on low slopes.
- **Depth:** zero on cells where E > P₀; deeper on old, stable surfaces.
- **Determinism and resolution:** after restriction, soil orders at 200k vs 1M agree on ≥ 85% of land area (an informational metric).

## 6. Open questions

1. ~~**Taxonomy.**~~ **Resolved at Checkpoint 2:** USDA soil orders (D10).
2. **Change during history** (erosion from farming, salinisation): defer to after Phase 13?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Factors and inputs | ~300 |
| Depth model | ~200 |
| Order key | ~500 |
| Properties | ~300 |
| Earth comparison harness | ~400 |
| Tests | ~500 |
| **Total** | **~2,200** |
