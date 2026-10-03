// Spike 1c — fidelity A/B: is low-N orogen a faithful preview of high-N orogen?
// Same seed at several N. Every run is resampled onto a common reference
// (the N=20k mesh by area-weighted restriction, and a 1° grid by inverse
// sampling) and compared to the highest-N run ("final").
// Usage: node --max-old-space-size=24000 ab.mjs <seed> [N...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { runOrogen, orogenModule } from '../lib/orogen.mjs';
import { adjacency, dualArea, makeLocator, gridIndex, pointSet, basins, R_KM } from '../lib/sphere.mjs';
const { elevToHeightKm } = await orogenModule('color-map.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const seed = +(process.argv[2] ?? 12345);
const Ns = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [20000, 50000, 200000, 1000000, 2560000];
const GW = 360, GH = 180, NK = 31, TOPB = 10, MOUNTAIN_M = 1500;

let ref = null;          // { nR, xyz, adj, area }
const runs = [];

for (const N of Ns) {
  const t0 = performance.now();
  const res = runOrogen({ N, seed });
  const ms = performance.now() - t0;
  const nR = res.numRegions, xyz = res.r_xyz;
  const adj = adjacency(res.triangles, res.halfedges, nR);
  const area = dualArea(res.triangles, xyz, nR);
  const E = res.r_elevation;
  const elevM = new Float32Array(nR);
  for (let r = 0; r < nR; r++) elevM[r] = elevToHeightKm(E[r]) * 1000;
  const precip = new Float32Array(nR);
  for (let r = 0; r < nR; r++) precip[r] = (res.r_precip_summer[r] + res.r_precip_winter[r]) / 2;
  const koppen = res.debugLayers.koppen;

  if (!ref) ref = { nR, xyz: new Float32Array(xyz), adj, area };

  // Restriction onto the reference mesh (area-weighted).
  const loc = makeLocator(ref.xyz, ref.adj, ref.nR);
  const W = new Float64Array(ref.nR), sE = new Float64Array(ref.nR), sL = new Float64Array(ref.nR), sP = new Float64Array(ref.nR);
  const kAcc = new Float64Array(ref.nR * NK);
  const bas = basins(E, adj, nR);
  const bArea = new Map();
  for (let r = 0; r < nR; r++) if (bas[r] >= 0) bArea.set(bas[r], (bArea.get(bas[r]) || 0) + area[r]);
  const topB = [...bArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOPB).map((e) => e[0]);
  const topIdx = new Map(topB.map((b, i) => [b, i]));
  const bAcc = new Float64Array(ref.nR * (TOPB + 1));
  for (let r = 0; r < nR; r++) {
    const c = loc(xyz[3 * r], xyz[3 * r + 1], xyz[3 * r + 2]), a = area[r];
    W[c] += a; sE[c] += a * elevM[r]; sL[c] += a * (E[r] > 0); sP[c] += a * precip[r];
    kAcc[c * NK + koppen[r]] += a;
    const bi = bas[r] >= 0 && topIdx.has(bas[r]) ? topIdx.get(bas[r]) : TOPB;
    bAcc[c * (TOPB + 1) + bi] += a;
  }
  const rElev = new Float32Array(ref.nR), rLand = new Float32Array(ref.nR), rPrec = new Float32Array(ref.nR);
  const rKop = new Uint8Array(ref.nR), rBas = new Int8Array(ref.nR);
  for (let c = 0; c < ref.nR; c++) {
    const w = W[c] || 1; rElev[c] = sE[c] / w; rLand[c] = sL[c] / w; rPrec[c] = sP[c] / w;
    let bk = 0; for (let k = 1; k < NK; k++) if (kAcc[c * NK + k] > kAcc[c * NK + bk]) bk = k; rKop[c] = bk;
    let bb = 0; for (let b = 1; b <= TOPB; b++) if (bAcc[c * (TOPB + 1) + b] > bAcc[c * (TOPB + 1) + bb]) bb = b; rBas[c] = bb === TOPB ? -1 : bb;
  }

  // 1° grid by inverse sampling (nearest cell).
  const gi = gridIndex(xyz, adj, nR, GW, GH);
  const gLand = new Uint8Array(GW * GH), gKop = new Uint8Array(GW * GH), gElev = new Float32Array(GW * GH);
  for (let p = 0; p < GW * GH; p++) { gLand[p] = E[gi[p]] > 0; gKop[p] = koppen[gi[p]]; gElev[p] = elevM[gi[p]]; }

  // Coastline points: land cells with an ocean neighbour.
  const coast = [];
  for (let r = 0; r < nR; r++) {
    if (E[r] <= 0) continue;
    for (let i = adj.off[r]; i < adj.off[r + 1]; i++) if (E[adj.list[i]] <= 0) { coast.push(xyz[3 * r], xyz[3 * r + 1], xyz[3 * r + 2]); break; }
  }

  runs.push({
    N, nR, ms: Math.round(ms), cellKm: Math.sqrt(4 * Math.PI / nR) * R_KM,
    elevM, area, rElev, rLand, rPrec, rKop, rBas, gLand, gKop, gElev, coast: new Float32Array(coast),
    landFrac: area.reduce((s, a, r) => s + (E[r] > 0 ? a : 0), 0) / (4 * Math.PI),
  });
  console.error(`seed ${seed} N=${N} done in ${Math.round(ms)} ms (${coast.length / 3} coast cells)`);
}

// ── metrics ───────────────────────────────────────────────────────────────
const cosw = Float64Array.from({ length: GW * GH }, (_, p) => Math.cos(Math.PI / 2 - (Math.floor(p / GW) + 0.5) * Math.PI / GH));

function landIoU(a, b) {
  let i = 0, u = 0;
  for (let p = 0; p < GW * GH; p++) { if (a.gLand[p] && b.gLand[p]) i += cosw[p]; if (a.gLand[p] || b.gLand[p]) u += cosw[p]; }
  let ri = 0, ru = 0;
  for (let c = 0; c < ref.nR; c++) { const la = a.rLand[c] > 0.5, lb = b.rLand[c] > 0.5; if (la && lb) ri += ref.area[c]; if (la || lb) ru += ref.area[c]; }
  return { grid1deg: i / u, ref20k: ri / ru };
}

function hausdorff(a, b) {
  const A = pointSet(a.coast), B = pointSet(b.coast), d = [];
  let ab = 0, ba = 0;
  for (let p = 0; p < b.coast.length; p += 3) { const x = A.nearest(b.coast[p], b.coast[p + 1], b.coast[p + 2]); d.push(x); ba = Math.max(ba, x); }
  for (let p = 0; p < a.coast.length; p += 3) { const x = B.nearest(a.coast[p], a.coast[p + 1], a.coast[p + 2]); d.push(x); ab = Math.max(ab, x); }
  d.sort((x, y) => x - y);
  const km = (x) => x * R_KM;
  return { hausdorffKm: km(Math.max(ab, ba)), p95Km: km(d[Math.floor(0.95 * d.length)]), p50Km: km(d[d.length >> 1]),
    hausdorffPreviewCells: km(Math.max(ab, ba)) / a.cellKm, p95PreviewCells: km(d[Math.floor(0.95 * d.length)]) / a.cellKm };
}

function weightedKS(xa, wa, xb, wb, filt = () => true) {
  const ea = [], eb = [];
  for (let i = 0; i < xa.length; i++) if (filt(xa[i])) ea.push([xa[i], wa[i]]);
  for (let i = 0; i < xb.length; i++) if (filt(xb[i])) eb.push([xb[i], wb[i]]);
  ea.sort((p, q) => p[0] - q[0]); eb.sort((p, q) => p[0] - q[0]);
  const Ta = ea.reduce((s, p) => s + p[1], 0), Tb = eb.reduce((s, p) => s + p[1], 0);
  let i = 0, j = 0, Fa = 0, Fb = 0, D = 0;
  while (i < ea.length || j < eb.length) {
    const v = Math.min(i < ea.length ? ea[i][0] : Infinity, j < eb.length ? eb[j][0] : Infinity);
    while (i < ea.length && ea[i][0] === v) Fa += ea[i++][1] / Ta;
    while (j < eb.length && eb[j][0] === v) Fb += eb[j++][1] / Tb;
    D = Math.max(D, Math.abs(Fa - Fb));
  }
  return D;
}

function rmse(a, b) {
  let s = 0, w = 0, sl = 0, wl = 0;
  for (let c = 0; c < ref.nR; c++) {
    const d2 = (a.rElev[c] - b.rElev[c]) ** 2, A = ref.area[c];
    s += A * d2; w += A;
    if (a.rLand[c] > 0.5 || b.rLand[c] > 0.5) { sl += A * d2; wl += A; }
  }
  return { allM: Math.sqrt(s / w), landM: Math.sqrt(sl / wl) };
}

function components(mask) {
  const comp = new Int32Array(ref.nR).fill(-1), sizes = [];
  for (let c = 0; c < ref.nR; c++) {
    if (!mask[c] || comp[c] >= 0) continue;
    const id = sizes.length; let sz = 0; const st = [c]; comp[c] = id;
    while (st.length) { const x = st.pop(); sz += ref.area[x]; for (let i = ref.adj.off[x]; i < ref.adj.off[x + 1]; i++) { const n = ref.adj.list[i]; if (mask[n] && comp[n] < 0) { comp[n] = id; st.push(n); } } }
    sizes.push(sz);
  }
  return { comp, sizes };
}

function mountains(a, b) {
  const ma = Uint8Array.from(a.rElev, (e) => e >= MOUNTAIN_M), mb = Uint8Array.from(b.rElev, (e) => e >= MOUNTAIN_M);
  let i = 0, u = 0;
  for (let c = 0; c < ref.nR; c++) { if (ma[c] && mb[c]) i += ref.area[c]; if (ma[c] || mb[c]) u += ref.area[c]; }
  // "major belt": connected ≥1500 m component covering ≥ 0.05% of the sphere (~255k km²)
  const MAJOR = 0.0005 * 4 * Math.PI;
  const belts = (m, other) => {
    const { comp, sizes } = components(m); const out = [];
    sizes.forEach((sz, id) => {
      if (sz < MAJOR) return;
      let ov = 0; for (let c = 0; c < ref.nR; c++) if (comp[c] === id && other[c]) ov += ref.area[c];
      out.push({ areaKm2: Math.round(sz * R_KM * R_KM), overlapFrac: +(ov / sz).toFixed(3) });
    });
    return out;
  };
  const fb = belts(mb, ma), pb = belts(ma, mb);
  return { iou: i / u, finalMajorBelts: fb.length, missingInPreview: fb.filter((x) => x.overlapFrac < 0.25).length,
    previewMajorBelts: pb.length, newInPreview: pb.filter((x) => x.overlapFrac < 0.25).length, finalBelts: fb };
}

function koppenAgree(a, b) {
  let s = 0, w = 0;
  for (let c = 0; c < ref.nR; c++) if (a.rLand[c] > 0.5 && b.rLand[c] > 0.5) { w += ref.area[c]; if (a.rKop[c] === b.rKop[c]) s += ref.area[c]; }
  let gs = 0, gw = 0;
  for (let p = 0; p < GW * GH; p++) if (a.gLand[p] && b.gLand[p]) { gw += cosw[p]; if (a.gKop[p] === b.gKop[p]) gs += cosw[p]; }
  return { ref20k: s / w, grid1deg: gs / gw };
}

function precipCorr(a, b) {
  const corr = (filt) => {
    let W = 0, ma = 0, mb = 0;
    for (let c = 0; c < ref.nR; c++) if (filt(c)) { W += ref.area[c]; ma += ref.area[c] * a.rPrec[c]; mb += ref.area[c] * b.rPrec[c]; }
    ma /= W; mb /= W; let sab = 0, saa = 0, sbb = 0;
    for (let c = 0; c < ref.nR; c++) if (filt(c)) { const A = ref.area[c], x = a.rPrec[c] - ma, y = b.rPrec[c] - mb; sab += A * x * y; saa += A * x * x; sbb += A * y * y; }
    return sab / Math.sqrt(saa * sbb);
  };
  return { all: corr(() => true), land: corr((c) => a.rLand[c] > 0.5 && b.rLand[c] > 0.5) };
}

function basinAgree(a, b) {
  // For each of the final run's top-10 basins (on the ref mesh), best IoU with any preview top-10 basin.
  const out = [];
  for (let k = 0; k < TOPB; k++) {
    let best = 0;
    for (let j = 0; j < TOPB; j++) {
      let i = 0, u = 0;
      for (let c = 0; c < ref.nR; c++) { const x = b.rBas[c] === k, y = a.rBas[c] === j; if (x && y) i += ref.area[c]; if (x || y) u += ref.area[c]; }
      if (u > 0) best = Math.max(best, i / u);
    }
    out.push(+best.toFixed(3));
  }
  return { perBasinBestIoU: out, meanIoU: out.reduce((s, x) => s + x, 0) / out.length, matchedAt50: out.filter((x) => x >= 0.5).length };
}

const final = runs[runs.length - 1];
const compare = (a, b) => ({
  preview: a.N, final: b.N,
  landIoU: landIoU(a, b),
  coastline: hausdorff(a, b),
  hypsometryKS: { all: weightedKS(a.elevM, a.area, b.elevM, b.area), land: weightedKS(a.elevM, a.area, b.elevM, b.area, (x) => x > 0) },
  elevRmseLowpass20k: rmse(a, b),
  mountains: mountains(a, b),
  koppenAgreement: koppenAgree(a, b),
  precipCorrelation: precipCorr(a, b),
  majorBasins: basinAgree(a, b),
});
const results = {
  seed, Ns, refN: ref.nR, mountainThresholdM: MOUNTAIN_M,
  runs: runs.map((r) => ({ N: r.N, numRegions: r.nR, ms: r.ms, cellKm: +r.cellKm.toFixed(1), landFrac: +r.landFrac.toFixed(4), coastCells: r.coast.length / 3 })),
  vsFinal: runs.slice(0, -1).map((r) => compare(r, final)),
  consecutive: runs.slice(1).map((r, i) => compare(runs[i], r)),
};
fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'results', `ab-s${seed}.json`), JSON.stringify(results, null, 1));

// Panel image: one 720×360 equirectangular strip per N (nearest-cell inverse sampling at 0.5°).
{
  const PW = 720, PH = 360, png = new PNG({ width: PW, height: PH * runs.length });
  const col = (m) => {
    if (m <= 0) { const t = Math.min(1, -m / 6000); return [20 + 30 * (1 - t), 60 + 70 * (1 - t), 120 + 80 * (1 - t)]; }
    const t = Math.min(1, m / 5000);
    return t < 0.3 ? [70 + 200 * t, 140 + 100 * t, 60] : [150 + 100 * t, 150 - 60 * t + 60 * t * t, 90 + 150 * t * t];
  };
  runs.forEach((r, k) => {
    for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
      const p = Math.floor(j / 2) * GW + Math.floor(i / 2);
      const [cr, cg, cb] = col(r.gElev[p]);
      const o = ((k * PH + j) * PW + i) * 4;
      png.data[o] = cr; png.data[o + 1] = cg; png.data[o + 2] = cb; png.data[o + 3] = 255;
    }
  });
  fs.mkdirSync(path.join(HERE, '..', '..', 'docs', 'spikes', 'img'), { recursive: true });
  fs.writeFileSync(path.join(HERE, '..', '..', 'docs', 'spikes', 'img', `1c-elev-s${seed}.png`), PNG.sync.write(png));
}
const brief = JSON.parse(JSON.stringify(results));
for (const v of brief.vsFinal) delete v.mountains.finalBelts;
console.log(JSON.stringify({ runs: brief.runs, vsFinal: brief.vsFinal }, null, 1));
