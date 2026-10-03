// Spike 1b — Azgaar features → lakes → rivers on orogen's spherical mesh.
// Usage: node run.mjs [N] [seed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runOrogen } from '../lib/orogen.mjs';
import { buildFacade } from './facade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = +(process.argv[2] ?? 200000), seed = +(process.argv[3] ?? 12345), STEPS = +(process.argv[4] ?? 250);
globalThis.window = globalThis;
// Azgaar's utils barrel touches the DOM at import time (utils/index.ts prompt init); stub just enough.
globalThis.document = { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {} }) };
globalThis.TIME = false; globalThis.DEBUG = {}; globalThis.WARN = false; globalThis.INFO = false; globalThis.ERROR = true;
const { Voronoi } = await import(pathToFileURL(path.join(HERE, '..', '_data', 'azgaar-hydro.mjs')).href);

const r = runOrogen({ N, seed });
const t0 = performance.now();
const fac = buildFacade(Voronoi, r);
options.generation.resolveDepressionsSteps = STEPS;
const tFacade = performance.now() - t0;
const t1 = performance.now();
Features.markupPack();
const tMarkup = performance.now() - t1;
const t2 = performance.now();
Rivers.generate();
const tRivers = performance.now() - t2;

const { cells, features, rivers } = pack;
const nR = r.numRegions, xyz = r.r_xyz;
const lat = (i) => Math.asin(xyz[3 * i + 1]) * 180 / Math.PI, lon = (i) => Math.atan2(xyz[3 * i], xyz[3 * i + 2]) * 180 / Math.PI;
const isNb = (a, b) => cells.c[a].includes(b);

// Pass criterion 1: every river terminates in ocean or a lake.
// Azgaar's river.cells ends with the water cell it pours into (or -1 for "off the map edge").
const term = { ocean: 0, lake: 0, tributary: 0, offMap: 0, deadEndOnLand: 0 };
const badTerm = [];
const riversAt = new Map();   // cell -> rivers whose path contains it (excluding their own last cell)
for (const rv of rivers) for (let k = 0; k < rv.cells.length - 1; k++) { const c = rv.cells[k]; if (c >= 0) { if (!riversAt.has(c)) riversAt.set(c, new Set()); riversAt.get(c).add(rv.i); } }
for (const rv of rivers) {
  const last = rv.cells[rv.cells.length - 1];
  if (last === -1) { term.offMap++; badTerm.push(rv.i); continue; }
  if (cells.h[last] >= 20) {
    // A tributary ends on its confluence cell, which belongs to another (parent) river.
    if ([...(riversAt.get(last) || [])].some((o) => o !== rv.i)) { term.tributary++; continue; }
    term.deadEndOnLand++; badTerm.push(rv.i); continue;
  }
  const f = features[cells.f[last]];
  term[f.type === 'lake' ? 'lake' : 'ocean']++;
}
// Path continuity (each step to a mesh neighbour) and antimeridian crossings.
let gaps = 0, amCross = 0, amRivers = 0;
const gapKinds = {};
for (const rv of rivers) {
  const cs = rv.cells.filter((c) => c >= 0);
  let crossed = false;
  for (let k = 1; k < cs.length; k++) {
    if (!isNb(cs[k - 1], cs[k])) {
      gaps++;
      const a = cs[k - 1], b = cs[k];
      const kind = `${cells.h[a] < 20 ? (features[cells.f[a]].type) : 'land'}->${cells.h[b] < 20 ? (features[cells.f[b]].type) : 'land'}${a === b ? ' (repeat)' : ''}`;
      gapKinds[kind] = (gapKinds[kind] || 0) + 1;
    }
    if (Math.abs(lon(cs[k]) - lon(cs[k - 1])) > 180) { amCross++; crossed = true; }
  }
  if (crossed) amRivers++;
}
// Pass criterion 3: discharge (cells.fl) non-decreasing downstream along each river's land cells.
let decreases = 0, riversWithDecrease = 0, maxFl = 0, satCells = 0;
for (let i = 0; i < nR; i++) { maxFl = Math.max(maxFl, cells.fl[i]); if (cells.fl[i] === 65535) satCells++; }
for (const rv of rivers) {
  const cs = rv.cells.filter((c) => c >= 0 && cells.h[c] >= 20);
  let bad = false;
  for (let k = 1; k < cs.length; k++) if (cells.fl[cs[k]] < cells.fl[cs[k - 1]]) { decreases++; bad = true; }
  if (bad) riversWithDecrease++;
}
// Pass criterion 2: artifacts near poles, antimeridian, and orogen's seam cell (0°N 0°E).
// Compare river-cell density (fraction of land cells on a river) in each zone vs the global value.
const seam = nR - 1;
const zone = (i) => {
  const la = lat(i), lo = lon(i);
  if (Math.abs(la) > 75) return 'polar';
  if (Math.abs(Math.abs(lo) - 180) < 5) return 'antimeridian';
  if (Math.abs(la) < 5 && Math.abs(lo) < 5) return 'seam';
  return 'other';
};
const z = {};
for (let i = 0; i < nR; i++) {
  if (cells.h[i] < 20) continue;
  const k = zone(i); z[k] ??= { land: 0, river: 0, lakeAdj: 0 };
  z[k].land++; if (cells.r[i]) z[k].river++;
}
for (const k in z) z[k].riverFrac = +(z[k].river / z[k].land).toFixed(4);
const lakes = features.filter((f) => f && f.type === 'lake');
const lakeZones = {};
for (const f of lakes) { const k = zone(f.firstCell); lakeZones[k] = (lakeZones[k] || 0) + 1; }
const oceans = features.filter((f) => f && f.type === 'ocean');
// Planar-geometry artefact: lake/island outlines whose vertex ring spans the antimeridian
// (equirectangular x jumps), so Azgaar's polygon area/clip for them is wrong.
const GW = options.map.graph.width;
let featSpanAM = 0;
for (const f of features) {
  if (!f || f.type === 'ocean' || !f.vertices?.length) continue;
  for (let k = 1; k < f.vertices.length; k++) if (Math.abs(pack.vertices.p[f.vertices[k]][0] - pack.vertices.p[f.vertices[k - 1]][0]) > GW / 2) { featSpanAM++; break; }
}

const out = {
  N, seed, numRegions: nR, resolveDepressionsSteps: STEPS,
  timingMs: { facade: Math.round(tFacade), markupPack: Math.round(tMarkup), riversGenerate: Math.round(tRivers) },
  features: { oceans: oceans.length, oceanCells: oceans.map((f) => f.cells), lakes: lakes.length, islands: features.filter((f) => f && f.type === 'island').length },
  rivers: rivers.length,
  criterion1_termination: { ...term, pass: term.deadEndOnLand === 0 && term.offMap === 0, badRiverIds: badTerm.slice(0, 10) },
  criterion2_artifacts: { riverCellFractionByZone: z, lakesByZone: lakeZones, featuresSpanningAntimeridian: featSpanAM, pathGaps: gaps, pathGapKinds: gapKinds, antimeridianCrossings: amCross, riversCrossingAntimeridian: amRivers, seamCellIsRiver: !!cells.r[seam], seamCellH: cells.h[seam] },
  criterion3_discharge: { downstreamDecreases: decreases, riversWithDecrease, totalRivers: rivers.length, maxCellFlux: maxFl, cellsAtUint16Max: satCells, maxRiverDischarge: Math.max(...rivers.map((x) => x.discharge)) },
};
fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'results', `hydro-N${N}-s${seed}-steps${STEPS}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
