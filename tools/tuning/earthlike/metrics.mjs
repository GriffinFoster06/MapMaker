// Earth-likeness metrics and distance (decision P2, queue item Q3). Original code. Every metric is computed from
// data in the repo: the Earth heightmap (packages/gen-orogen/vendor/assets/earth.png, imported at the same N and
// mesh as a simulated world) and the Kottek et al. Köppen grid (tools/tuning/climate/data, fetched by
// fetch-kottek.sh). A simulated world and Earth go through the same functions, so resolution effects cancel.
import { elevToHeightKm } from '../../../packages/gen-orogen/vendor/js/color-map.js';
import { KOPPEN_CLASSES } from '../../../packages/gen-orogen/vendor/js/koppen.js';
import { realismStats } from '../realism/realism.mjs';
import { landmasses, rasterise, coastStraightness } from './shape.mjs';

export const GROUPS = ['A', 'B', 'C', 'D', 'E'];
export const BANDS = [[0, 30], [30, 60], [60, 90]];
const GROUP_OF = Uint8Array.from(KOPPEN_CLASSES, (c) => GROUPS.indexOf(c.code[0]));
const QS = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
const NCLASS = KOPPEN_CLASSES.length;

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const latOf = (mesh, r) => Math.asin(Math.max(-1, Math.min(1, mesh.points[3 * r + 2]))) * 180 / Math.PI;

/** Area-weighted quantiles of `vals` (weights `w`). */
function wQuantiles(vals, w, qs) {
  const idx = Uint32Array.from({ length: vals.length }, (_, i) => i).sort((a, b) => vals[a] - vals[b]);
  let tot = 0; for (let i = 0; i < w.length; i++) tot += w[i];
  const out = []; let acc = 0, k = 0;
  for (const i of idx) { acc += w[i]; while (k < qs.length && acc >= qs[k] * tot) out.push(vals[i]), k++; }
  while (out.length < qs.length) out.push(vals[idx[idx.length - 1]]);
  return out;
}

/**
 * Metrics of one world: mesh (SphereMesh), raw elevation (orogen raw units, land > 0) and Köppen class per cell
 * (null for Earth, whose shares come from the Kottek grid instead).
 */
export function worldMetrics(mesh, raw, koppen) {
  const n = mesh.numRegions, area = mesh.cellArea_sr;
  const isLand = Uint8Array.from(raw, (e) => (e > 0 ? 1 : 0));
  const m = {};
  let landA = 0; for (let r = 0; r < n; r++) if (isLand[r]) landA += area[r];
  m.landFrac = r4(landA / (4 * Math.PI));
  // Hypsometry of land (m).
  const land = []; for (let r = 0; r < n; r++) if (isLand[r]) land.push(r);
  m.hypsoM = wQuantiles(Float64Array.from(land, (r) => elevToHeightKm(raw[r]) * 1000), Float64Array.from(land, (r) => area[r]), QS).map(Math.round);
  // Slope, rivers, Hack: the realism gate's statistics.
  const rs = realismStats(mesh, raw);
  m.slope = [rs.slopeMPerKm.p50, rs.slopeMPerKm.p90, rs.slopeMPerKm.p99];
  m.hack = rs.hackExponent; m.river3 = rs.riverKmPer1000Km2.a1e3; m.river4 = rs.riverKmPer1000Km2.a1e4;
  // Landmasses and shape.
  const ras = rasterise(mesh, isLand);
  const lm = landmasses(ras, 2e5, 3).sort((a, b) => b.areaKm2 - a.areaKm2);
  const tot = lm.reduce((s, x) => s + x.areaKm2, 0) || 1;
  m.continents = lm.filter((x) => x.areaKm2 >= 1e6).length;
  m.top1 = r4(lm.length ? lm[0].areaKm2 / tot : 0);
  m.top3 = r4(lm.slice(0, 3).reduce((s, x) => s + x.areaKm2, 0) / tot);
  m.boxFill = r4(lm.reduce((s, x) => s + x.boxFill * x.areaKm2, 0) / tot);  // eroded landmasses (3 passes, about 80 km)
  const cs = coastStraightness(ras);
  m.straight = r4(cs.straight); m.axisStraight = r4(cs.axisStraight);
  // Köppen shares by area: [band][group] over land (band 3 = all), and class shares overall.
  if (koppen) {
    const g = BANDS.map(() => new Float64Array(5)), all = new Float64Array(5), cls = new Float64Array(NCLASS);
    for (const r of land) {
      const k = koppen[r], a = area[r], gi = GROUP_OF[k];
      if (gi < 0) continue;
      const lat = Math.abs(latOf(mesh, r)), b = lat < 30 ? 0 : lat < 60 ? 1 : 2;
      g[b][gi] += a; all[gi] += a; cls[k] += a;
    }
    const norm = (v) => { const s = v.reduce((x, y) => x + y, 0) || 1; return Array.from(v, (x) => r4(x / s)); };
    m.koppen = { bands: g.map(norm), bandArea: g.map((v) => r4(v.reduce((x, y) => x + y, 0) / (landA || 1))), all: norm(all), classes: norm(cls) };
  }
  return m;
}

/** Earth's Köppen shares from the Kottek grid (0.5°, cos-lat weights; no data = ocean). */
export function earthKoppen(grid, W, H, NO_DATA) {
  const g = BANDS.map(() => new Float64Array(5)), all = new Float64Array(5), cls = new Float64Array(NCLASS);
  let tot = 0;
  for (let j = 0; j < H; j++) {
    const lat = -89.75 + 0.5 * j, w = Math.cos(lat * Math.PI / 180), al = Math.abs(lat), b = al < 30 ? 0 : al < 60 ? 1 : 2;
    for (let i = 0; i < W; i++) {
      const k = grid[j * W + i]; if (k === NO_DATA) continue;
      const gi = GROUP_OF[k]; if (gi < 0) continue;
      g[b][gi] += w; all[gi] += w; cls[k] += w; tot += w;
    }
  }
  const norm = (v) => { const s = v.reduce((x, y) => x + y, 0) || 1; return Array.from(v, (x) => r4(x / s)); };
  return { bands: g.map(norm), bandArea: g.map((v) => r4(v.reduce((x, y) => x + y, 0) / tot)), all: norm(all), classes: norm(cls) };
}

// Terms: tolerance (one "unit" of distance), weight. Objective = weighted mean of min(d, CAP).
export const TERMS = {
  landFrac:   { w: 2,   tol: 0.04 },
  hypsometry: { w: 2,   tol: 400 },    // mean |Δ| of land elevation quantiles, m
  slope:      { w: 1,   tol: 0.4 },    // mean |ln ratio| of slope p50/p90/p99
  continents: { w: 1.5, tol: 1 },      // mean of |log2 count ratio|, |Δ top1|/0.15, |Δ top3|/0.15
  koppen:     { w: 2,   tol: 0.15 },   // mean of group TV (global, band-weighted) and class TV
  rivers:     { w: 1,   tol: 0.35 },   // mean of |ln ratio| of river density (two thresholds) and |Δ Hack|/0.1·0.35
  shape:      { w: 1.5, tol: 1 },      // mean of |Δ boxFill|/0.1 and |Δ straight|/0.06
};
export const CAP = 4;

const lr = (a, b) => Math.abs(Math.log((Math.abs(a) + 1e-3) / (Math.abs(b) + 1e-3)));
const tv = (a, b) => 0.5 * a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);

/** Per-term raw distances of a world's metrics from Earth's. */
export function termDistances(m, E) {
  const d = {};
  // A world with (almost) no land has undefined statistics (no rivers, slopes or continents); it is a failure, not a match.
  if (!(m.landFrac >= 0.02) || !m.koppen) { for (const [k, t] of Object.entries(TERMS)) d[k] = CAP * t.tol; return d; }
  d.landFrac = Math.abs(m.landFrac - E.landFrac);
  d.hypsometry = m.hypsoM.reduce((s, x, i) => s + Math.abs(x - E.hypsoM[i]), 0) / m.hypsoM.length;
  d.slope = m.slope.reduce((s, x, i) => s + lr(x, E.slope[i]), 0) / 3;
  d.continents = (Math.abs(Math.log2((m.continents + 0.5) / (E.continents + 0.5))) + Math.abs(m.top1 - E.top1) / 0.15 + Math.abs(m.top3 - E.top3) / 0.15) / 3;
  const k = m.koppen, ek = E.koppen;
  const bandTv = BANDS.reduce((s, _, b) => s + ek.bandArea[b] * tv(k.bands[b], ek.bands[b]), 0);
  d.koppen = (tv(k.all, ek.all) + bandTv + tv(k.classes, ek.classes)) / 3;
  d.rivers = (lr(m.river3, E.river3) + lr(m.river4, E.river4) + Math.abs(m.hack - E.hack) / 0.1 * 0.35) / 3;
  d.shape = (Math.abs(m.boxFill - E.boxFill) / 0.1 + Math.abs(m.straight - E.straight) / 0.06) / 2;
  for (const k of Object.keys(d)) if (!Number.isFinite(d[k])) d[k] = CAP * TERMS[k].tol;
  return d;
}

/** Normalised terms and the objective (lower is better; 1 means every term is one tolerance away). */
export function objective(d, terms = TERMS) {
  let s = 0, w = 0; const t = {};
  for (const [k, { w: wk, tol }] of Object.entries(terms)) { t[k] = Math.min(CAP, d[k] / tol); s += wk * t[k]; w += wk; }
  return { objective: s / w, terms: t };
}
