# Earth targets from independent data (decision P6)

Built 2026-10-22. Before this, every Earth target came from `packages/gen-orogen/vendor/assets/earth.png` (orogen's 8-bit Earth heightmap) through the app's heightmap import, which adds detail noise and soil creep. The targets here come from independent public-domain data, put on the **same mesh** as a generated world and measured by the **same functions** (`tools/tuning/earthlike/metrics.mjs`), so a world and Earth are compared like for like.

## Data

| Source | Version | Licence | Use |
|---|---|---|---|
| NOAA NCEI ETOPO 2022, 60″ surface elevation (GeoTIFF) | v1, 2022 | public domain | land elevation per cell (hypsometry, slopes, drainage) |
| Natural Earth 10m land + minor islands (GeoJSON) | 5.1.2 | public domain | land mask (land fraction, landmasses, coast shape) |
| Kottek et al. 2006 Köppen–Geiger, 0.5° | June 2006 (already in the repo) | citation requested | Köppen class per land cell |
| Global mean surface air temperature | 14 to 15 °C (e.g. Jones et al. 1999: 14.0 °C, 1961–1990) | literature | target 14.5 °C for the model's annual mean |

Downloads: `tools/tuning/earthlike/fetch-earth.sh` (SHA-256 checked, files in the git-ignored `tools/tuning/earthlike/data/`; hashes and dates in `PROVENANCE.md`). Only the derived statistics are committed: `tools/tuning/earthlike/targets/earth-real-N50000.json`, `earth-real-N200000.json`, `earth-real-fullres.json`. Rebuild: `scripts/node24.sh npx tsx tools/tuning/earthlike/earth-real.mjs`.

## Method (like for like)

- **Grid.** ETOPO and the Natural Earth mask (rasterised at 1′, even-odd fill at pixel centres) are aggregated to a 5′ grid: land share of each pixel, mean elevation of its land and of its ocean minutes (`earth-data.mjs`).
- **Mesh.** The orogen mesh stage at the world's N (jitter 0.75), for five mesh seeds (1234, 1, 2, 3, 4); targets are the mean over the five, and the file stores their sd (the noise of the target itself).
- **Per cell.** Each 5′ pixel goes to its nearest cell (the cell's Voronoi region), weighted by area. A cell is land if at least half of its area is land; its elevation is the area mean of ETOPO over its land (land below sea level stays land at 1 m); ocean cells take the mean of their ocean. Köppen: the Kottek class at the cell centre (nearest 0.5° cell with data within one cell).
- **Metrics.** `worldMetrics` exactly as for a world: rasterisation at 0.25°, landmasses after the 80 km erosion (Panama is cut, Suez usually not), shares, box fill, straight coast, realism statistics (slopes, priority-flood drainage, Hack's law).
- **Cell mean, not point sample.** A world's cell carries one value for its whole area, so Earth's cell is the area mean. For comparison, a point sample (the 5′ pixel at the cell centre) gives slopes 15 to 20% higher (`slopeCentreSample` in the targets); the conclusion below does not depend on the choice.

## Earth on the mesh against the earth.png targets

N = 50k (mean of five meshes; sd in brackets where it matters):

| statistic | earth.png (before) | independent data (now) | difference |
|---|---|---|---|
| land fraction | 0.3142 | **0.2861** (0.0003) | −0.028: earth.png counts shelves and coastal water as land |
| land hypsometry 5 / 10 / 20 / 30 % (m) | 104 / 226 / 279 / 327 | **55 / 95 / 166 / 254** | lowlands lower: the import lifts low land |
| 40 / 50 / 60 / 70 % (m) | 386 / 457 / 558 / 748 | 343 / 448 / 603 / 869 | close |
| 80 / 90 / 95 / 99 % (m) | 1090 / 1946 / 3025 / 4705 | 1222 / 2062 / 2984 / 4562 | close |
| slope p50 / p90 / p99 (m/km) | 1.21 / 16.6 / 41.1 | **1.20 / 5.6 / 15.7** (0.01 / 0.05 / 0.4) | p90 and p99 about 3× lower: the import's detail noise made Earth rugged |
| slope, point sample | – | 1.41 / 6.7 / 17.2 | |
| landmasses ≥ 10⁶ km² (after erosion) | 6 | 6 (0) | same |
| largest landmass share / top 3 | 0.556 / 0.822 | 0.571 / 0.838 | close |
| box fill | 0.386 | 0.376 | close |
| straight-coast share | 0.143 | **0.174** (0.011) | +0.03 |
| Köppen A / B / C / D / E (global, land) | .211 / .266 / .151 / .217 / .156 | .200 / .278 / .145 / .227 / .150 | small (same Kottek grid, now on the mesh's land) |
| land share by latitude band 0–30 / 30–60 / 60–90° | .448 / .347 / .205 | .447 / .351 / .201 | same |
| Hack exponent; river km per 1000 km² (10³, 10⁴ km² basins) | 0.578; 9.5, 6.9 | 0.556; 9.6, 7.1 | close |

N = 200k: land fraction 0.2871 (earth.png 0.3141); slope 1.52 / 7.3 / 20.6 (earth.png 1.38 / 18.1 / 71.1); landmasses 6.4 ± 0.55 and largest share 0.49 ± 0.12 over the five meshes, against 6 and 0.56: at 200k the 80 km erosion splits Africa from Eurasia at Suez on two of the five meshes, so these two statistics are bimodal at that resolution (noted; the search ranks at 50k, where they are stable).

## Full-resolution reference (5′ grid, no mesh; report only)

| | value |
|---|---|
| land fraction (Natural Earth, area share) | 0.2877 (146.7 M km²; Earth's 148.9 M km² includes the Caspian and other inland water) |
| landmasses ≥ 10⁶ km², Afro-Eurasia split at Suez, Americas at Panama | **7**: Eurasia 50.2, Africa 29.3, North America 20.2, South America 17.7, Antarctica 12.1, Australia 7.6, Greenland 2.1 M km²; largest share 0.351, top 3 0.697 |
| the same with Afro-Eurasia joined (Americas split) | 6: Afro-Eurasia 79.5 M km²; largest share 0.556, top 3 0.821 |
| as the polygons are (both isthmuses joined) | 5; largest share 0.556 |
| box fill (split / joined) | 0.428 / 0.387 |
| straight-coast share at 5′ | 0.310 (resolution-dependent; not comparable with the 0.25° value on the mesh) |

The mesh rule (80 km erosion on a 0.25° raster) gives Afro-Eurasia joined at 50k, so the scored targets are the "joined" variant: 6 landmasses and a largest share of 0.57.

## What is not in the data

Precipitation in real units (the model's precipitation is normalised until Phase 8 fits its mm/yr mapping), observed river networks (river statistics are our own drainage on ETOPO and are reported, not scored), plate statistics, seafloor age, bathymetry statistics.
