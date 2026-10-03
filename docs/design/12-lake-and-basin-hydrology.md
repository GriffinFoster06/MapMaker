# Design note 12: Lake and basin hydrology

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 7 |
| Depends on | Flow routing (stage 4, Braun–Willett receivers and stack), climate (stage 5, note 11), note 14 (major basins at L0), Azgaar `lakes.ts` and `features-generator.ts` via the facade |
| Used by | Rivers (stage 7), note 4 (Histosols), note 5 (evaporites), note 9 (water access), note 6 (lakes in patches) |

## 1. Problem

The requirement covers rivers, lakes and watersheds. The audits rate real lake and basin hydrology as weak everywhere (matrix gap 12):
- orogen fills pits;
- Azgaar detects lakes in depressions and closes them with a Penman-style evaporation proxy (`lakes.ts`: `getLakeEvaporation`, the `closed` flag);
- Badlands has no explicit lakes.

A plausible world needs:
- lakes whose level comes from a **water balance**;
- **endorheic basins** that never reach the sea (about 18–20% of Earth's land drains internally);
- **salt lakes and playas** in arid closed basins;
- discharge that accounts for lake evaporation.

## 2. Canonical inputs and outputs

**Inputs**
- `elevation` (unfilled), and `receiver` / `stackOrder` from the shared flow network;
- precipitation and temperature (annual, and seasonal harmonics from note 11);
- PET (from temperature, Hargreaves- or Penman-style);
- `basin.major` and divide bands from L0 (note 14).

**Outputs**
- **`lake`** (Int32 id or −1) and **`lakeDepth`** (m) layers;
- updated **`discharge`** (m³/s) and **`basin`**, plus a new **`basinOutlet`** (enum: ocean, lake, endorheic sink);
- the **`lakes` table:**
  - type: freshwater (open), brackish, saline (closed), playa (ephemeral);
  - surface elevation, area, volume, mean depth;
  - inflow, evaporation, outflow;
  - outlet cell (−1 if closed);
  - salinity class;
  - the depression-hierarchy node;
- the **`basins` table:** outlet type, area, terminal lake id, endorheic flag.

## 3. Approach and algorithm choice

### 3.1 Runoff

Land-cell runoff is Q = P − ET, with actual ET from the **Budyko curve** in Fu's form: ET/P = 1 + φ − (1 + φ^w)^{1/w}, where φ = PET/P and w ≈ 2.6 is calibrated (Fu 1981; Zhang et al. 2004). This is the standard first-order water balance, and it needs only the annual P and PET already available.

### 3.2 Depression hierarchy and fill–spill–merge

1. Build the **depression hierarchy** from the unfilled DEM: every pit, the spill elevation where it overflows, and how depressions merge as they fill (Barnes, Callaghan & Wickert 2020, Part 2).
2. Route runoff down the receiver graph into depressions.
3. Process the hierarchy leaves-up, using **fill–spill–merge** (Barnes et al. 2020, Part 3). For each depression:
   - compute the water-balance equilibrium level h*, where inflow Q_in (direct runoff, plus upstream rivers, plus overflow from child depressions) = E_lake·A(h*);
   - E_lake is open-water evaporation (Penman–Monteith-style from temperature and wind, with Azgaar's proxy kept for parity of the human layer);
   - A(h) is the lake area at level h, from the depression's hypsometry.
4. Then:
   - **If h* ≥ spill level:** the lake is full. Excess Q_in − E·A(h_spill) spills to the next depression, or onward to a river. The lake is open and fresh.
   - **Otherwise:** the lake stands at h* and is **closed**. The basin is endorheic down to this sink. Salinity follows the closed-basin rule (§3.3).
   - **If h* gives an area below one cell:** a **playa** (salt flat), with evaporite lithology for note 5.
5. Merged depressions are handled by the hierarchy: two child lakes that spill into each other become one lake at their merge level when inflow allows.

Fill–spill–merge is O(n log n), with a priority queue on the hierarchy. It runs on L1, and on patches with inflow boundary conditions (note 6).

### 3.3 Salinity

- Closed lakes are **saline**.
- Lakes with outflow below 10% of inflow are **brackish**.
- Otherwise lakes are **fresh**.
- Playas carry evaporites.

This is a classification, not a solute transport model.

### 3.4 Discharge after lakes

River discharge downstream of a lake is the lake's outflow, not its inflow. Evaporative losses therefore reduce the flow of rivers that cross arid lake chains (as on the Nile and the Okavango). Rivers ending in closed lakes become endorheic river systems.

### 3.5 Consistency with structure (note 14)

- **Major endorheic basins and their sinks are decided at L0**, from the same water balance run on e_ref. At L1, the detail pass keeps them: the divide-band constraint stops a major closed basin from being captured by a river to the sea.
- Lakes larger than one L0 cell keep their L0 level within tolerance.
- Smaller lakes are detail.

### 3.6 Seasons

With the note 11 harmonics, an optional **seasonal level range** is computed for closed lakes and playas: wet-season area against dry-season area. Ephemeral lakes are flagged. The annual mean defines the canonical `lake` layer.

### 3.7 Integration with Azgaar

Azgaar's `lakes.ts` and `features-generator.ts` run through the facade on *our* lake layer for feature markup, names and types, so Azgaar's naming and grouping still works. Its depression detection is not used. The facade passes our lake cells as Azgaar `lake` features with `closed` set from our outlet field.

## 4. Upstream references (algorithm level)

- **Azgaar** `lakes.ts` (`getLakeEvaporation`, the `closed` flag), `features-generator.ts`: feature markup through the facade. MIT.
- **LPJmL** `src/lpj/drain.c` (lake and reservoir water balance in routing): an algorithm reference; AGPL-3.0, so no code.
- **Literature:**
  - Barnes, Callaghan & Wickert (2020), *Earth Surf. Dynam.* 8, "Computing water flow through complex landscapes", Parts 2 (depression hierarchies) and 3 (fill–spill–merge);
  - Budyko (1974); Fu (1981); Zhang et al. (2004), *WRR* 40;
  - Braun & Willett (2013), *Geomorphology* 180.
- **WRF-Hydro:** excluded.

## 5. Validation

- **Analytic:** a single bowl with a known A(h) gives a lake level matching the closed-form h* to 1e-6. A two-bowl chain spills and merges at the right inflow thresholds.
- **Mass balance:** global Σ runoff = Σ lake evaporation + ocean outflow, within 1e-6 relative. Per-lake inflow = evaporation + outflow.
- **Earth plausibility:** run on an Earth DEM with climatology (downloaded at tuning time). Check that:
  - the Caspian, the Great Basin, Lake Eyre, the Aral basin and the Dead Sea come out endorheic or closed;
  - the Great Lakes and Lake Victoria come out open;
  - the endorheic land fraction is within 15–25%.
- **Resolution:** major endorheic basins and their sinks are identical between preview and final (note 14 basin metric).
- **Determinism:** hash test.

## 6. Open questions

1. **Groundwater:** should it be represented at all (a baseflow term), or is surface water enough for map purposes? I propose surface water only, with a documented limitation.
2. **Glacial lakes and ice-dammed lakes:** out of scope for now?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Runoff (Budyko) | ~150 |
| Depression hierarchy | ~600 |
| Fill–spill–merge | ~600 |
| Classification and seasons | ~250 |
| Facade integration | ~200 |
| Tests (analytic, mass balance, Earth) | ~700 |
| **Total** | **~2,500** |
