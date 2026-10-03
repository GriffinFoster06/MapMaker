# Design note 5: Mineral and ore resources

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 9 |
| Depends on | Tectonics and lithology (stages 2, 3, 2e), erosion and exhumation (stage 4), climate and soils (stage 5, note 4), lakes (note 12), note 14 (keyed draws on L0) |
| Used by | Stage 10 goods, note 9 (settlement siting), note 1 (economics and war goals) |

## 1. Problem

The requirement includes resources. Azgaar assigns about 60 goods by biome and height. Nothing ties minerals to geology (matrix gap 5). Real ore deposits are where they are because of tectonic setting, rock type, depth of erosion and climate. A plausible world needs copper in arcs, gold in orogens, iron in old cratons, salt in arid basins, and coal and oil in sedimentary basins.

## 2. Canonical inputs and outputs

**Inputs**
- `boundaryType`, `stress`, `plate`, `crustType`;
- `crustAge_Myr`, `lithology`, `orogenyAge_Myr` (note 13 when active, otherwise stage 3 tags);
- `structures` (arcs, hotspots, LIPs);
- `erosionRate` and cumulative exhumation (erosion integrated over the slow pass, or the fast-pass proxy);
- `sediment`;
- climate, soils (`soilType`), `lake` (salt lakes, note 12), `discharge`.

**Outputs**
- `mineral.<class>`: Float32 prospectivity (0..1) per L1 cell, one layer per deposit class.
- **`deposits` entity table:** class, unit-vector position, size class, tonnage, grade, depth to top, the L0 cell id it was keyed from, and `discoveredTick` (−1 until the history simulation discovers it).

**Deposit classes**

| Class | Tectonic and geologic setting |
|---|---|
| Porphyry Cu–Mo–Au | Magmatic arcs (convergent, overriding plate); preserved at moderate exhumation (1–4 km) |
| Epithermal Au–Ag | Arcs; shallow, so lost if exhumation > ~1 km |
| VMS Cu–Zn–Pb | Mid-ocean ridges and back-arc basins; found in ophiolites and accreted terranes on land |
| Orogenic gold | Collisional belts and greenstones; exhumation 2–10 km |
| Magmatic Ni–Cu–PGE, Cr | LIPs and mafic intrusions; old cratons |
| Banded iron formations | Archaean–Palaeoproterozoic cratons (crust age > 1.8 Ga) |
| Sediment-hosted Pb–Zn (MVT, SEDEX) | Carbonate platforms and foreland basins; rifts |
| Placer Au, Sn, diamonds | Downstream of source deposits; drainage area and slope break |
| Laterite Ni, bauxite | Humid tropical climates on old stable surfaces (Oxisols and Ultisols over the right parent rock) |
| Kimberlite diamonds | Old cratons (> 2.5 Ga), well inside plates |
| Evaporites (salt, potash) | Closed basins in arid climates (note 12 saline lakes and playas), rifts |
| Coal | Foreland and intracratonic basins with thick sediment and humid (palaeo)climate |
| Oil and gas | Sedimentary basins with thick sediment: passive margins, rifts, forelands |
| Uranium, REE (carbonatite) | Rifts, alkaline intrusions, old cratons |

## 3. Approach and algorithm choice

### 3.1 Prospectivity per class: the mineral-systems approach

Each class is modelled as a **mineral system** (Wyborn et al. 1994): source, pathway, trap and preservation. Each factor is a fuzzy membership in [0, 1], computed from canonical layers. Prospectivity is the fuzzy-AND (product) of the factors, as in GIS prospectivity mapping (Bonham-Carter 1994). Example, porphyry copper:
- **Source:** arc proximity (distance to a convergent overriding margin, 100–400 km).
- **Pathway:** stress (structural focusing).
- **Trap:** arc magmatism age, active or < 50 Myr.
- **Preservation:** exhumation within 1–4 km (a Gaussian window).

The **preservation window** is what makes erosion matter: the same arc produces exposed porphyries where it was exhumed and preserved epithermal deposits where it was not.

### 3.2 Discrete deposits, resolution-independent

Deposits are **sampled once on L0**, as a Poisson point process with intensity λ_class·prospectivity_L0(c)·area(c):
- the count per L0 cell is a keyed draw, `hash('minerals', class, refCellId, 0)`;
- each deposit's sub-cell position, size and grade come from `hash(..., k)`.

The deposit list is therefore **identical for every N** (note 14, invariant I2), so a preview shows the same mines as the final run. At L1, the deposit's cell is located with the spatial index, and the per-cell `mineral.*` field is reported at L1 resolution for display.

### 3.3 Size and grade

Tonnage and grade are drawn from **grade–tonnage models** per class: log-normal distributions with published medians and spreads (Cox & Singer 1986, USGS public domain). A size class (minor, significant, giant) is derived from them. Giant deposits are rare by construction, because the log-normal tail does that.

### 3.4 Placers and secondary deposits

Placers come from **routing source deposits downstream**:
- intensity rises where `discharge` is high and stream slope drops below a threshold, at a range front;
- the placer's grade decays with transport distance.

Laterite and bauxite read `soilType` and climate from note 4.

### 3.5 Hydrocarbons and coal

These depend on `sediment` thickness above a threshold, basin type (from `lithology`: rift, passive margin, foreland) and burial depth (a maturation window). Coal additionally needs a humid climate. When note 13 is active it uses palaeoclimate from the geologic keyframes; otherwise present climate stands in as a proxy, and the proxy is documented.

## 4. Upstream references (algorithm level)

No upstream repo models ore genesis (matrix gap 5). References:
- Wyborn, Heinrich & Jaques (1994), the mineral-systems concept;
- Bonham-Carter, *Geographic Information Systems for Geoscientists* (1994), fuzzy prospectivity;
- Cox & Singer (1986), USGS Bulletin 1693, *Mineral Deposit Models*: grade–tonnage, public domain;
- Groves et al. (2005), *Economic Geology* 100, tectonic settings of deposits through time;
- Kesler & Simon, *Mineral Resources, Economics and the Environment* (2nd ed., 2015).

## 5. Validation

- **Associations:** every porphyry is within 400 km of an arc, present or fossil; banded iron formations only on crust older than 1.8 Ga (when note 13 is active); evaporites only in B climates or rifts; placers downstream of a source.
- **Preservation:** sweeping exhumation shifts arcs from epithermal-dominated to porphyry-dominated.
- **Resolution independence:** the deposit table is bit-identical at every N.
- **Earth plausibility:** deposit density per class per 10⁶ km² is within an order of magnitude of USGS global compilations (downloaded at tuning time, Q8).
- **Determinism:** hash test.

## 6. Open questions

1. ~~**Gameplay visibility.**~~ **Resolved at Checkpoint 2:** all deposits are stored, with a `discoveredTick` column that the history simulation (note 1) fills by technology and settlement proximity (D10).
2. **Class list:** is the 14-class list right, or do you want a smaller, gameplay-oriented set mapped onto Azgaar goods?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Factor library and per-class systems | ~900 |
| Point-process sampling | ~300 |
| Grade–tonnage tables | ~200 |
| Placers and secondary deposits | ~300 |
| Hydrocarbons and coal | ~200 |
| Tests and Earth harness | ~600 |
| **Total** | **~2,500** |
