// Earth's targets from independent data (decision P6), like for like with the generated worlds. Original code.
// Earth is put on the SAME mesh as a world (the orogen mesh stage at N, jitter 0.75, for several mesh seeds) and goes
// through the same metric functions (metrics.mjs worldMetrics: rasterisation, 80 km landmass erosion, realism
// statistics). Per cell, from the 5 arc-minute grid of earth-data.mjs (pixels assigned to their nearest cell, i.e. the
// cell's Voronoi region, weighted by area): land if at least half of the cell's area is Natural Earth land; elevation the
// area mean of ETOPO 2022 over the cell's land (land cells) or ocean (ocean cells); Köppen class the Kottek et al. class
// at the cell centre (nearest 0.5° cell with data within one cell, else none). Full-resolution reference values
// (5 arc-minute grid, no mesh) are computed beside them for the report only.
//
//   tsx tools/tuning/earthlike/earth-real.mjs [--N 50000,200000] [--meshSeeds 1234,1,2,3,4]
// writes targets/earth-real-N<N>.json (mean and sd over mesh seeds) and targets/earth-real-fullres.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '@mapmaker/engine';
import { STAGE, createOrogenWorld, getScratch, orogenStages } from '@mapmaker/gen-orogen';
import { GRID_H, GRID_W, NO_DATA, loadGroundTruth } from '../climate/lib/ground-truth.mjs';
import { earthGrid5m } from './earth-data.mjs';
import { worldMetrics } from './metrics.mjs';
import { coastStraightness, landmasses } from './shape.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TARGETS = path.join(HERE, 'targets');
/** Global mean surface air temperature, °C (about 14 to 15 °C; e.g. Jones et al. 1999, 14.0 °C for 1961–1990). */
export const EARTH_MEAN_T = { value: 14.5, low: 14, high: 15 };

/** Inverse of elevToHeightKm (color-map.ts): metres to orogen raw elevation. */
export function metresToRaw(m) {
  const km = m / 1000;
  if (km <= 0) return km / 10;
  if (km >= 6) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const t = (lo + hi) / 2, t2 = t * t; if (6 * t2 * t2 * (5 - 4 * t) < km) lo = t; else hi = t; }
  return (lo + hi) / 2;
}

/**
 * Earth on `mesh` (SphereMesh, canonical frame): raw elevation and Köppen class per cell. `sample: 'centre'` (report
 * only) takes a land cell's elevation from the 5' pixel at its centre instead of the cell's area mean.
 */
export function earthOnMesh(mesh, g = earthGrid5m(), kottek = loadGroundTruth(), { sample = 'mean' } = {}) {
  const n = mesh.numRegions, p = mesh.points, adjO = mesh.adjOffset, adj = mesh.adjList;
  const A = new Float64Array(n), AL = new Float64Array(n), SL = new Float64Array(n), AO = new Float64Array(n), SO = new Float64Array(n);
  const dot = (c, x, y, z) => p[3 * c] * x + p[3 * c + 1] * y + p[3 * c + 2] * z;
  let cur = 0;
  for (let j = 0; j < g.H; j++) {
    const lat = (90 - (j + 0.5) / 12) * Math.PI / 180, cl = Math.cos(lat), sl = Math.sin(lat), w = cl;
    for (let i = 0; i < g.W; i++) {
      const lon = (-180 + (i + 0.5) / 12) * Math.PI / 180, x = cl * Math.cos(lon), y = cl * Math.sin(lon), z = sl;
      let best = dot(cur, x, y, z);
      for (;;) {
        let nb = -1;
        for (let k = adjO[cur]; k < adjO[cur + 1]; k++) { const d = dot(adj[k], x, y, z); if (d > best) { best = d; nb = adj[k]; } }
        if (nb < 0) break;
        cur = nb;
      }
      const q = j * g.W + i, f = g.land[q];
      A[cur] += w;
      if (f > 0) { AL[cur] += w * f; SL[cur] += w * f * g.elevLand[q]; }
      if (f < 1) { AO[cur] += w * (1 - f); SO[cur] += w * (1 - f) * g.elevOcean[q]; }
    }
  }
  const raw = new Float32Array(n), koppen = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    if (AL[r] >= 0.5 * A[r]) {
      const la = Math.asin(Math.max(-1, Math.min(1, p[3 * r + 2]))) * 180 / Math.PI, lo = Math.atan2(p[3 * r + 1], p[3 * r]) * 180 / Math.PI;
      const row = Math.max(0, Math.min(GRID_H - 1, Math.round((la + 89.75) / 0.5))), col = ((Math.round((lo + 179.75) / 0.5) % GRID_W) + GRID_W) % GRID_W;
      let k = kottek[row * GRID_W + col];
      for (let d = 0; k === NO_DATA && d < 9; d++) { const rr = row + ((d / 3) | 0) - 1, cc = (col + (d % 3) - 1 + GRID_W) % GRID_W; if (rr >= 0 && rr < GRID_H) k = kottek[rr * GRID_W + cc]; }
      koppen[r] = k === NO_DATA ? 0 : k;
      const q = Math.min(g.H - 1, Math.floor((90 - la) * 12)) * g.W + Math.min(g.W - 1, Math.floor((lo + 180) * 12));
      const m = sample === 'centre' && g.land[q] > 0 ? g.elevLand[q] : SL[r] / AL[r];
      raw[r] = Math.max(metresToRaw(m), metresToRaw(1)); // land below sea level (Caspian depression, Dead Sea) is still land
    } else {
      raw[r] = Math.min(metresToRaw(SO[r] / AO[r]), metresToRaw(-1));
    }
  }
  return { raw, koppen };
}

/** The orogen mesh of a world at (N, seed): the mesh stage only. */
export async function worldMesh(N, seed) {
  const w = createOrogenWorld({ N, seed });
  await runPipeline(w, orogenStages, { only: [STAGE.mesh], strict: false });
  getScratch(w);
  return w.meshes.get('global').mesh;
}

/** Element-wise mean and sd of metric objects (numbers, arrays, nested objects). */
function meanSd(objs) {
  const rec = (vals) => {
    if (typeof vals[0] === 'number') { const m = vals.reduce((s, v) => s + v, 0) / vals.length; return [m, Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, vals.length - 1))]; }
    if (Array.isArray(vals[0])) { const r = vals[0].map((_, i) => rec(vals.map((v) => v[i]))); return [r.map((x) => x[0]), r.map((x) => x[1])]; }
    const keys = Object.keys(vals[0]), r = keys.map((k) => rec(vals.map((v) => v[k])));
    return [Object.fromEntries(keys.map((k, i) => [k, r[i][0]])), Object.fromEntries(keys.map((k, i) => [k, r[i][1]]))];
  };
  const [mean, sd] = rec(objs);
  return { mean, sd };
}

export async function earthRealTargets(N, meshSeeds = [1234, 1, 2, 3, 4]) {
  const g = earthGrid5m(), kottek = loadGroundTruth(), per = [];
  for (const seed of meshSeeds) {
    const mesh = await worldMesh(N, seed);
    const { raw, koppen } = earthOnMesh(mesh, g, kottek);
    const m = worldMetrics(mesh, raw, koppen);
    m.slopeCentreSample = worldMetrics(mesh, earthOnMesh(mesh, g, kottek, { sample: 'centre' }).raw, null).slope;
    per.push(m);
  }
  const { mean, sd } = meanSd(per);
  return { N, meshSeeds, ...mean, meanT: EARTH_MEAN_T.value, sd };
}

/** Reference values on the 5' grid itself (no mesh): land share, landmasses joined and split at Suez and Panama. */
export function earthFullRes(g = earthGrid5m()) {
  const R_KM = 6371, W = g.W, H = g.H;
  let tot = 0, land = 0;
  for (let j = 0; j < H; j++) { const w = Math.cos((90 - (j + 0.5) / 12) * Math.PI / 180); for (let i = 0; i < W; i++) { tot += w; land += w * g.land[j * W + i]; } }
  const grid = Uint8Array.from(g.land, (f) => (f >= 0.5 ? 1 : 0));
  const cut = (gr, lon, lat0, lat1) => { const i = Math.round((lon + 180) * 12 - 0.5); for (let j = Math.round((90 - lat1) * 12); j <= Math.round((90 - lat0) * 12); j++) for (let d = -1; d <= 1; d++) gr[j * W + i + d] = 0; };
  const summary = (gr, erode = 0) => {
    const lm = landmasses({ grid: gr, W, H }, 2e5, erode).sort((a, b) => b.areaKm2 - a.areaKm2), s = lm.reduce((x, y) => x + y.areaKm2, 0);
    return { landmassesOver1e6: lm.filter((x) => x.areaKm2 >= 1e6).length, areasMkm2: lm.filter((x) => x.areaKm2 >= 1e6).map((x) => Math.round(x.areaKm2 / 1e5) / 10), top1: lm[0].areaKm2 / s, top3: lm.slice(0, 3).reduce((x, y) => x + y.areaKm2, 0) / s, boxFill: lm.reduce((x, y) => x + y.boxFill * y.areaKm2, 0) / s };
  };
  const americasSplit = grid.slice(); cut(americasSplit, -79.7, 8.8, 9.6);
  const bothSplit = americasSplit.slice(); cut(bothSplit, 32.35, 29.8, 31.4);
  const cs = coastStraightness({ grid, W, H });
  return {
    grid: '5 arc-minute, land if Natural Earth covers at least half of the pixel',
    landFrac: land / tot, landAreaMkm2: (land / tot) * 4 * Math.PI * R_KM * R_KM / 1e6,
    afroEurasiaJoined: summary(americasSplit), afroEurasiaSplit: summary(bothSplit), asPolygons: summary(grid),
    straight: cs.straight, axisStraight: cs.axisStraight,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  fs.mkdirSync(TARGETS, { recursive: true });
  const full = earthFullRes();
  fs.writeFileSync(path.join(TARGETS, 'earth-real-fullres.json'), JSON.stringify(full, null, 1) + '\n');
  console.log(JSON.stringify(full));
  for (const N of arg('N', '50000,200000').split(',').map(Number)) {
    const t = await earthRealTargets(N, arg('meshSeeds', '1234,1,2,3,4').split(',').map(Number));
    fs.writeFileSync(path.join(TARGETS, `earth-real-N${N}.json`), JSON.stringify(t, null, 1) + '\n');
    console.log(N, JSON.stringify({ landFrac: t.landFrac, hypsoM: t.hypsoM, slope: t.slope, continents: t.continents, top1: t.top1, top3: t.top3, boxFill: t.boxFill, straight: t.straight, hack: t.hack, river3: t.river3, slopeCentreSample: t.slopeCentreSample }));
  }
}
