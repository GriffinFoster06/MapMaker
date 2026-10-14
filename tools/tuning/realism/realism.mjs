// Realism statistics of a generated world (Phase 4b M10): restructuring must not flatten the world. Original shell code.
// Usage: NODE_OPTIONS=--max-old-space-size=13000 tsx tools/tuning/realism/realism.mjs [--N 2560000] [--seeds 1,777,12345]
//          [--pipelines parity,structured] [--out <file>]   (default out: tools/tuning/results/realism-<N>.json)
// The nightly gate (gate.mjs) runs only the structured pipeline and compares it with the committed baseline.json.
// For stock orogen (parity) and the structured pipeline at the same N and seed, on land cells:
//   hypsometry   elevation percentiles (m) and land fraction;
//   slope        percentiles of the mean absolute gradient to neighbours (m/km);
//   Hack's law   exponent h of L ∝ A^h, fitted on log-binned (drainage area, longest upstream length) of every land cell;
//   rivers       channel length per land area (km per 1000 km²) for drainage areas ≥ 1000 km² and ≥ 10 000 km².
// Drainage uses the same priority flood (packages/core hydro) on each world's raw elevation, so both are routed alike.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priorityFlood } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { elevToHeightKm } from '../../../packages/gen-orogen/vendor/js/color-map.js';

const R_KM = 6371;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

export function realismStats(mesh, raw) {
  const n = mesh.numRegions, p = mesh.points, area = mesh.cellArea_sr;
  const h = Float64Array.from(raw, (e) => elevToHeightKm(e) * 1000);
  const land = [];
  for (let r = 0; r < n; r++) if (raw[r] > 0) land.push(r);
  const elev = Float64Array.from(land, (r) => h[r]).sort();
  const slopes = new Float64Array(land.length);
  land.forEach((r, j) => {
    let s = 0, c = 0;
    for (let k = mesh.adjOffset[r]; k < mesh.adjOffset[r + 1]; k++) {
      const q = mesh.adjList[k];
      const dx = p[3 * r] - p[3 * q], dy = p[3 * r + 1] - p[3 * q + 1], dz = p[3 * r + 2] - p[3 * q + 2];
      s += Math.abs(h[r] - h[q]) / (Math.sqrt(dx * dx + dy * dy + dz * dz) * R_KM); c++;
    }
    slopes[j] = c ? s / c : 0;
  });
  slopes.sort();
  const areaKm2 = Float64Array.from(area, (a) => a * R_KM * R_KM);
  const d = priorityFlood(raw, mesh.adjOffset, mesh.adjList, areaKm2);
  // Longest upstream path length (km), in reverse flood order (children before parents).
  const len = new Float64Array(n);
  for (let j = d.order.length - 1; j >= 0; j--) {
    const r = d.order[j], q = d.receiver[r];
    if (q < 0) continue;
    const dx = p[3 * r] - p[3 * q], dy = p[3 * r + 1] - p[3 * q + 1], dz = p[3 * r + 2] - p[3 * q + 2];
    len[q] = Math.max(len[q], len[r] + Math.sqrt(dx * dx + dy * dy + dz * dz) * R_KM);
  }
  // Hack's law on log bins of drainage area (cells with A ≥ 10 cell areas, so a path exists).
  const cell = 4 * Math.PI * R_KM * R_KM / n;
  const bins = new Map();
  for (const r of land) {
    const A = d.drainageArea[r];
    if (A < 10 * cell || len[r] <= 0) continue;
    const b = Math.floor(Math.log10(A) * 8);
    const e = bins.get(b) ?? { x: 0, y: 0, c: 0 };
    e.x += Math.log10(A); e.y += Math.log10(len[r]); e.c++;
    bins.set(b, e);
  }
  const pts = [...bins.values()].filter((e) => e.c >= 5).map((e) => [e.x / e.c, e.y / e.c]);
  const mx = pts.reduce((s, q) => s + q[0], 0) / pts.length, my = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  const hack = pts.reduce((s, q) => s + (q[0] - mx) * (q[1] - my), 0) / pts.reduce((s, q) => s + (q[0] - mx) ** 2, 0);
  let landArea = 0, ch3 = 0, ch4 = 0;
  for (const r of land) {
    landArea += areaKm2[r];
    const q = d.receiver[r];
    if (q < 0) continue;
    const dx = p[3 * r] - p[3 * q], dy = p[3 * r + 1] - p[3 * q + 1], dz = p[3 * r + 2] - p[3 * q + 2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) * R_KM;
    if (d.drainageArea[r] >= 1e3) ch3 += l;
    if (d.drainageArea[r] >= 1e4) ch4 += l;
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return {
    landFrac: r3(land.length / n),
    hypsometryM: Object.fromEntries([0.05, 0.25, 0.5, 0.75, 0.95, 0.99].map((q) => [`p${q * 100}`, Math.round(pct(elev, q))])),
    slopeMPerKm: Object.fromEntries([0.5, 0.9, 0.99].map((q) => [`p${q * 100}`, r3(pct(slopes, q))])),
    hackExponent: r3(hack),
    riverKmPer1000Km2: { a1e3: r3(1000 * ch3 / landArea), a1e4: r3(1000 * ch4 / landArea) },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const N = Number(arg('N', '2560000'));
  const seeds = arg('seeds', '1,777,12345').split(',').map(Number);
  const pipelines = arg('pipelines', 'parity,structured').split(',');
  const out = { N, seeds: {} };
  for (const seed of seeds) {
    out.seeds[seed] = {};
    for (const pipeline of pipelines) {
      const t0 = performance.now();
      const w = createOrogenWorld({ N, seed });
      await runPipeline(w, [...orogenStages, ...structuredStages], { variant: pipeline === 'structured' ? STRUCTURED : 'parity', strict: false });
      const ms = Math.round(performance.now() - t0);
      const raw = w.layers.get('global', pipeline === 'structured' ? 'detail.elevRaw' : 'orogen.elevRaw');
      out.seeds[seed][pipeline] = { ms, ...realismStats(w.meshes.get('global').mesh, raw) };
      console.error(`seed ${seed} ${pipeline} N=${N}: ${ms} ms`, JSON.stringify(out.seeds[seed][pipeline]));
    }
  }
  const file = arg('out', path.join(HERE, '..', 'results', `realism-${N}.json`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.error(`wrote ${file}`);
}
