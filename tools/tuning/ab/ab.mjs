// Provenance: MapMaker spikes/1c/ab.mjs (Phase 1 spike code, original to this project), ported to run on the shell's
// orogen pipeline and extended with the Checkpoint 2 metrics (ARCHITECTURE Q7, design note 14 §3.9). The ten Q7 metrics:
//   land IoU, coast p95, Köppen agreement, precipitation r, mountain IoU, hypsometry KS, top-10 basin match (spike 1c),
//   plus hypsometry KS on native preview land cells, Köppen agreement on the 1° grid, river-mouth distance (new).
//
// Same seed at several N. Every run is resampled onto a reference mesh (area-weighted restriction) and onto a 1° grid
// (inverse sampling) and compared with the highest-N run ("final").
//   refMode 'L0'    reference = orogen's coarse mesh (N_COARSE, seed+137), as note 14 §3.9 defines the gate.
//   refMode 'spike' reference = the first run's own mesh, as spike 1c did (used to reproduce the spike's numbers).
import { OrogenLcg, SphereMesh } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages, getScratch } from '@mapmaker/gen-orogen';
import { elevToHeightKm } from '../../../packages/gen-orogen/vendor/js/color-map.js';
import { COARSE_JITTER, N_COARSE } from '../../../packages/gen-orogen/vendor/js/terrain-config.js';
import { adjacency, dualArea, makeLocator, gridIndex, pointSet, basins, R_KM } from './sphere.mjs';

export const GW = 360, GH = 180, NK = 31, TOPB = 10, MOUNTAIN_M = 1500;

/** Run the shell's orogen pipeline and keep only what the metrics need. */
export async function summarizeRun({ N, seed, ref, onLog }) {
  const t0 = performance.now();
  const world = createOrogenWorld({ N, seed });
  await runPipeline(world, orogenStages, { strict: false });
  const ms = performance.now() - t0;
  const s = getScratch(world);
  const mesh = world.meshes.get('global').mesh;
  const nR = mesh.numRegions, xyz = s.r_xyz;
  const adj = { off: s.mesh.adjOffset, list: s.mesh.adjList };
  const area = dualArea(mesh.triangles, xyz, nR);
  const E = world.layers.get('global', 'orogen.elevRaw');
  const elevM = new Float32Array(nR);
  for (let r = 0; r < nR; r++) elevM[r] = elevToHeightKm(E[r]) * 1000;
  const ps = world.layers.get('global', 'precip.summer'), pw = world.layers.get('global', 'precip.winter');
  const precip = new Float32Array(nR);
  for (let r = 0; r < nR; r++) precip[r] = (ps[r] + pw[r]) / 2;
  const koppen = world.layers.get('global', 'koppen');
  return finishRun({ N, nR, ms, xyz: new Float32Array(xyz), adj: { off: new Int32Array(adj.off), list: new Int32Array(adj.list) }, area, E: new Float32Array(E), elevM, precip, koppen: new Uint8Array(koppen), ref, onLog, seed });
}

function finishRun({ N, nR, ms, xyz, adj, area, E, elevM, precip, koppen, ref, onLog, seed }) {
  const r0 = ref.get(); // { nR, xyz, adj, area } or null for the first run in 'spike' mode
  const R = r0 ?? { nR, xyz, adj, area };
  if (!r0) ref.set(R);

  const loc = makeLocator(R.xyz, R.adj, R.nR);
  const W = new Float64Array(R.nR), sE = new Float64Array(R.nR), sL = new Float64Array(R.nR), sP = new Float64Array(R.nR);
  const kAcc = new Float64Array(R.nR * NK);
  const bas = basins(E, adj, nR);
  const bArea = new Map();
  for (let r = 0; r < nR; r++) if (bas[r] >= 0) bArea.set(bas[r], (bArea.get(bas[r]) || 0) + area[r]);
  const topB = [...bArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOPB).map((e) => e[0]);
  const topIdx = new Map(topB.map((b, i) => [b, i]));
  const topMouth = new Float32Array(3 * TOPB).fill(NaN);
  topB.forEach((cell, i) => { topMouth[3 * i] = xyz[3 * cell]; topMouth[3 * i + 1] = xyz[3 * cell + 1]; topMouth[3 * i + 2] = xyz[3 * cell + 2]; });
  const bAcc = new Float64Array(R.nR * (TOPB + 1));
  for (let r = 0; r < nR; r++) {
    const c = loc(xyz[3 * r], xyz[3 * r + 1], xyz[3 * r + 2]), a = area[r];
    W[c] += a; sE[c] += a * elevM[r]; sL[c] += a * (E[r] > 0); sP[c] += a * precip[r];
    kAcc[c * NK + koppen[r]] += a;
    const bi = bas[r] >= 0 && topIdx.has(bas[r]) ? topIdx.get(bas[r]) : TOPB;
    bAcc[c * (TOPB + 1) + bi] += a;
  }
  const rElev = new Float32Array(R.nR), rLand = new Float32Array(R.nR), rPrec = new Float32Array(R.nR);
  const rKop = new Uint8Array(R.nR), rBas = new Int8Array(R.nR);
  for (let c = 0; c < R.nR; c++) {
    const w = W[c] || 1; rElev[c] = sE[c] / w; rLand[c] = sL[c] / w; rPrec[c] = sP[c] / w;
    let bk = 0; for (let k = 1; k < NK; k++) if (kAcc[c * NK + k] > kAcc[c * NK + bk]) bk = k; rKop[c] = bk;
    let bb = 0; for (let b = 1; b <= TOPB; b++) if (bAcc[c * (TOPB + 1) + b] > bAcc[c * (TOPB + 1) + bb]) bb = b; rBas[c] = bb === TOPB ? -1 : bb;
  }

  const gi = gridIndex(xyz, adj, nR, GW, GH);
  const gLand = new Uint8Array(GW * GH), gKop = new Uint8Array(GW * GH), gElev = new Float32Array(GW * GH);
  for (let p = 0; p < GW * GH; p++) { gLand[p] = E[gi[p]] > 0; gKop[p] = koppen[gi[p]]; gElev[p] = elevM[gi[p]]; }

  const coast = [];
  for (let r = 0; r < nR; r++) {
    if (E[r] <= 0) continue;
    for (let i = adj.off[r]; i < adj.off[r + 1]; i++) if (E[adj.list[i]] <= 0) { coast.push(xyz[3 * r], xyz[3 * r + 1], xyz[3 * r + 2]); break; }
  }
  onLog?.(`seed ${seed} N=${N} done in ${Math.round(ms)} ms (${coast.length / 3} coast cells)`);
  return {
    N, nR, ms: Math.round(ms), cellKm: Math.sqrt(4 * Math.PI / nR) * R_KM,
    xyz, adj, elevM, area, rElev, rLand, rPrec, rKop, rBas, gLand, gKop, gElev, topMouth, nBasins: topB.length,
    coast: new Float32Array(coast),
    landFrac: area.reduce((s2, a, r) => s2 + (E[r] > 0 ? a : 0), 0) / (4 * Math.PI),
  };
}

/** The reference mesh. 'L0': orogen's coarse mesh for this seed. 'spike': set by the first run. */
export function makeRef(mode, seed) {
  let value = null;
  if (mode === 'L0') {
    const rng = new OrogenLcg('ab.ref', seed + 137);
    const m = SphereMesh.build({ N: N_COARSE, jitter: COARSE_JITTER, rng: () => rng.next(), precision: 'f32' });
    const xyz = m.orogenPoints();
    value = { nR: m.numRegions, xyz, adj: adjacency(m.triangles, m.halfedges, m.numRegions), area: dualArea(m.triangles, xyz, m.numRegions) };
  } else if (mode !== 'spike') throw new Error(`unknown refMode ${mode}`);
  return { get: () => value, set: (v) => { value = v; }, mode };
}

const cosw = Float64Array.from({ length: GW * GH }, (_, p) => Math.cos(Math.PI / 2 - (Math.floor(p / GW) + 0.5) * Math.PI / GH));

// ── metrics (spike 1c, parametrized by the reference mesh) ───────────────────

function landIoU(R, a, b) {
  let i = 0, u = 0;
  for (let p = 0; p < GW * GH; p++) { if (a.gLand[p] && b.gLand[p]) i += cosw[p]; if (a.gLand[p] || b.gLand[p]) u += cosw[p]; }
  let ri = 0, ru = 0;
  for (let c = 0; c < R.nR; c++) { const la = a.rLand[c] > 0.5, lb = b.rLand[c] > 0.5; if (la && lb) ri += R.area[c]; if (la || lb) ru += R.area[c]; }
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

export function weightedKS(xa, wa, xb, wb, filt = () => true) {
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

function rmse(R, a, b) {
  let s = 0, w = 0, sl = 0, wl = 0;
  for (let c = 0; c < R.nR; c++) {
    const d2 = (a.rElev[c] - b.rElev[c]) ** 2, A = R.area[c];
    s += A * d2; w += A;
    if (a.rLand[c] > 0.5 || b.rLand[c] > 0.5) { sl += A * d2; wl += A; }
  }
  return { allM: Math.sqrt(s / w), landM: Math.sqrt(sl / wl) };
}

function components(R, mask) {
  const comp = new Int32Array(R.nR).fill(-1), sizes = [];
  for (let c = 0; c < R.nR; c++) {
    if (!mask[c] || comp[c] >= 0) continue;
    const id = sizes.length; let sz = 0; const st = [c]; comp[c] = id;
    while (st.length) { const x = st.pop(); sz += R.area[x]; for (let i = R.adj.off[x]; i < R.adj.off[x + 1]; i++) { const n = R.adj.list[i]; if (mask[n] && comp[n] < 0) { comp[n] = id; st.push(n); } } }
    sizes.push(sz);
  }
  return { comp, sizes };
}

function mountains(R, a, b) {
  const ma = Uint8Array.from(a.rElev, (e) => e >= MOUNTAIN_M), mb = Uint8Array.from(b.rElev, (e) => e >= MOUNTAIN_M);
  let i = 0, u = 0;
  for (let c = 0; c < R.nR; c++) { if (ma[c] && mb[c]) i += R.area[c]; if (ma[c] || mb[c]) u += R.area[c]; }
  const MAJOR = 0.0005 * 4 * Math.PI;
  const belts = (m, other) => {
    const { comp, sizes } = components(R, m); const out = [];
    sizes.forEach((sz, id) => {
      if (sz < MAJOR) return;
      let ov = 0; for (let c = 0; c < R.nR; c++) if (comp[c] === id && other[c]) ov += R.area[c];
      out.push({ areaKm2: Math.round(sz * R_KM * R_KM), overlapFrac: +(ov / sz).toFixed(3) });
    });
    return out;
  };
  const fb = belts(mb, ma), pb = belts(ma, mb);
  return { iou: i / u, finalMajorBelts: fb.length, missingInPreview: fb.filter((x) => x.overlapFrac < 0.25).length,
    previewMajorBelts: pb.length, newInPreview: pb.filter((x) => x.overlapFrac < 0.25).length, finalBelts: fb };
}

function koppenAgree(R, a, b) {
  let s = 0, w = 0;
  for (let c = 0; c < R.nR; c++) if (a.rLand[c] > 0.5 && b.rLand[c] > 0.5) { w += R.area[c]; if (a.rKop[c] === b.rKop[c]) s += R.area[c]; }
  let gs = 0, gw = 0;
  for (let p = 0; p < GW * GH; p++) if (a.gLand[p] && b.gLand[p]) { gw += cosw[p]; if (a.gKop[p] === b.gKop[p]) gs += cosw[p]; }
  return { ref20k: s / w, grid1deg: gs / gw };
}

function precipCorr(R, a, b) {
  const corr = (filt) => {
    let W = 0, ma = 0, mb = 0;
    for (let c = 0; c < R.nR; c++) if (filt(c)) { W += R.area[c]; ma += R.area[c] * a.rPrec[c]; mb += R.area[c] * b.rPrec[c]; }
    ma /= W; mb /= W; let sab = 0, saa = 0, sbb = 0;
    for (let c = 0; c < R.nR; c++) if (filt(c)) { const A = R.area[c], x = a.rPrec[c] - ma, y = b.rPrec[c] - mb; sab += A * x * y; saa += A * x * x; sbb += A * y * y; }
    return sab / Math.sqrt(saa * sbb);
  };
  return { all: corr(() => true), land: corr((c) => a.rLand[c] > 0.5 && b.rLand[c] > 0.5) };
}

/** Top-10 basins: best IoU per final basin, and (Checkpoint 2) the great-circle distance between the matched river mouths. */
function basinAgree(R, a, b) {
  const out = [], mouthKm = [];
  for (let k = 0; k < b.nBasins; k++) {
    let best = 0, bestJ = -1;
    for (let j = 0; j < a.nBasins; j++) {
      let i = 0, u = 0;
      for (let c = 0; c < R.nR; c++) { const x = b.rBas[c] === k, y = a.rBas[c] === j; if (x && y) i += R.area[c]; if (x || y) u += R.area[c]; }
      if (u > 0 && i / u > best) { best = i / u; bestJ = j; }
    }
    out.push(+best.toFixed(3));
    if (bestJ >= 0) {
      const dot = b.topMouth[3 * k] * a.topMouth[3 * bestJ] + b.topMouth[3 * k + 1] * a.topMouth[3 * bestJ + 1] + b.topMouth[3 * k + 2] * a.topMouth[3 * bestJ + 2];
      mouthKm.push(Math.acos(Math.max(-1, Math.min(1, dot))) * R_KM);
    }
  }
  const sorted = [...mouthKm].sort((x, y) => x - y);
  return {
    perBasinBestIoU: out, meanIoU: out.reduce((s, x) => s + x, 0) / out.length, matchedAt50: out.filter((x) => x >= 0.5).length,
    mouthDistanceKm: { perBasin: mouthKm.map((x) => +x.toFixed(1)), mean: mouthKm.length ? mouthKm.reduce((s, x) => s + x, 0) / mouthKm.length : null, median: sorted.length ? sorted[sorted.length >> 1] : null, matched: mouthKm.length },
  };
}

/**
 * Hypsometry KS on the preview's native land cells (Checkpoint 2). The final is restricted (area-weighted) onto the
 * preview's own mesh, so both sides live on the same cells; stock orogen has no band set to low-pass to, so this restriction
 * is the "low-pass to the preview's resolution" of note 14 §3.9.
 */
function hypsometryNative(a, b) {
  const loc = makeLocator(a.xyz, a.adj, a.nR);
  const W = new Float64Array(a.nR), S = new Float64Array(a.nR);
  for (let r = 0; r < b.nR; r++) { const c = loc(b.xyz[3 * r], b.xyz[3 * r + 1], b.xyz[3 * r + 2]); W[c] += b.area[r]; S[c] += b.area[r] * b.elevM[r]; }
  const restricted = new Float32Array(a.nR);
  const weights = new Float64Array(a.nR);
  for (let c = 0; c < a.nR; c++) { restricted[c] = W[c] ? S[c] / W[c] : a.elevM[c]; weights[c] = W[c] ? a.area[c] : 0; }
  return weightedKS(a.elevM, a.area, restricted, weights, (x) => x > 0);
}

export function compare(R, a, b) {
  return {
    preview: a.N, final: b.N,
    landIoU: landIoU(R, a, b),
    coastline: hausdorff(a, b),
    hypsometryKS: { all: weightedKS(a.elevM, a.area, b.elevM, b.area), land: weightedKS(a.elevM, a.area, b.elevM, b.area, (x) => x > 0), landNative: hypsometryNative(a, b) },
    elevRmseLowpass20k: rmse(R, a, b),
    mountains: mountains(R, a, b),
    koppenAgreement: koppenAgree(R, a, b),
    precipCorrelation: precipCorr(R, a, b),
    majorBasins: basinAgree(R, a, b),
  };
}

/**
 * One seed: runs the shell pipeline at each N (previews first, the last N is the final) and compares every earlier run
 * with every later one that is listed in `finals`. Returns the spike-1c-shaped result plus the Checkpoint 2 metrics.
 */
export async function runAb({ seed, Ns, refMode = 'L0', finals = [Ns[Ns.length - 1]], onLog = () => {} }) {
  const refBox = makeRef(refMode, seed);
  const runs = [];
  for (const N of Ns) runs.push(await summarizeRun({ N, seed, ref: refBox, onLog }));
  const R = refBox.get();
  const results = {
    seed, Ns, refMode, refN: R.nR, mountainThresholdM: MOUNTAIN_M,
    runs: runs.map((r) => ({ N: r.N, numRegions: r.nR, ms: r.ms, cellKm: +r.cellKm.toFixed(1), landFrac: +r.landFrac.toFixed(4), coastCells: r.coast.length / 3 })),
    vsFinal: {},
    consecutive: runs.slice(1).map((r, i) => compare(R, runs[i], r)),
  };
  for (const fN of finals) {
    const final = runs.find((r) => r.N === fN);
    results.vsFinal[fN] = runs.filter((r) => r.N < fN).map((r) => compare(R, r, final));
  }
  return results;
}
