// Checks of single defaults against Earth (decision P6). Original code. Three commands:
//
//   tsx tools/tuning/earthlike/defaults-check.mjs held '<params json>' [--N 50000]
//     The 20 held-out seeds of the sweep (9001 to 9020) with the given sliders over the defaults: land fraction, area-
//     weighted mean annual temperature (global, land, ocean; (summer + winter) / 2 on the -45..+45 °C scale) and the
//     sweep's metrics and objective per world. Writes tools/tuning/results/earthlike/check-<params>-N<N>.json.
//   tsx tools/tuning/earthlike/defaults-check.mjs earth [--N 50000]
//     The same temperatures for the Earth example: earth.png through the app's import, the structured climate (L0 solve,
//     downscaled), temperature offset 0.
//   tsx tools/tuning/earthlike/defaults-check.mjs regress <slider> [--N 50000]
//     Least squares of the objective, slope and hypsometry scores of the stored search rows (re-scored) on all sliders
//     and the seeds; prints the slider's effect per slider step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MultiLevel, buildReferenceMesh } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, deriveSyntheticPlates, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import * as port from '../../../packages/gen-orogen/src/port/index.ts';
import { runClimateDetail } from '../../../packages/gen-orogen/src/structured/detail.ts';
import { buildEarthContext } from '../climate/lib/earth-context.mjs';
import { earthTargets } from './earth.mjs';
import { SEEDS } from './sweep.mjs';
import { objective, termDistances, worldMetrics } from './metrics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.EARTHLIKE_OUT ?? path.join(HERE, '..', 'results', 'earthlike');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('N', '50000'));

/** Area-weighted mean annual temperature (°C) over all cells, land (raw > 0) and ocean. */
function temperatures(area, raw, summer, winter) {
  let A = 0, AL = 0, T = 0, TL = 0;
  for (let r = 0; r < area.length; r++) {
    const a = area[r], t = ((summer[r] + winter[r]) / 2) * 90 - 45;
    A += a; T += a * t;
    if (raw[r] > 0) { AL += a; TL += a * t; }
  }
  return { landFrac: AL / A, meanT: T / A, landT: TL / AL, oceanT: (T - TL) / (A - AL) };
}

const mean = (rows, k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
const sd = (rows, k) => { const m = mean(rows, k); return Math.sqrt(rows.reduce((s, r) => s + (r[k] - m) ** 2, 0) / (rows.length - 1)); };

if (process.argv[2] === 'held') {
  const params = JSON.parse(process.argv[3] ?? '{}');
  const E = await earthTargets(N);
  const rows = [];
  for (const seed of SEEDS.held) {
    const w = createOrogenWorld({ N, seed, ...params });
    await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
    const mesh = w.meshes.get('global').mesh, raw = w.layers.get('global', 'detail.elevRaw');
    const t = temperatures(mesh.cellArea_sr, raw, w.layers.get('global', 'temp.summer'), w.layers.get('global', 'temp.winter'));
    const metrics = worldMetrics(mesh, raw, w.layers.get('global', 'koppen'));
    const o = objective(termDistances(metrics, E));
    rows.push({ seed, ...t, objective: o.objective, terms: o.terms, metrics });
    console.log(seed, t.landFrac.toFixed(4), t.meanT.toFixed(2), o.objective.toFixed(3));
  }
  const summary = { params, N, seeds: rows.length, landFrac: mean(rows, 'landFrac'), landFracSd: sd(rows, 'landFrac'), meanT: mean(rows, 'meanT'), landT: mean(rows, 'landT'), oceanT: mean(rows, 'oceanT'), objective: mean(rows, 'objective'), objectiveSe: sd(rows, 'objective') / Math.sqrt(rows.length) };
  console.log(JSON.stringify(summary));
  fs.mkdirSync(OUT, { recursive: true });
  const tag = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',') || 'defaults';
  fs.writeFileSync(path.join(OUT, `check-${tag}-N${N}.json`), JSON.stringify({ summary, rows }, null, 1));
} else if (process.argv[2] === 'earth') {
  const ctx = await buildEarthContext({ N, seed: 1234 });
  const L1 = ctx.world.meshes.get('global').mesh;
  const { mesh: L0 } = buildReferenceMesh(ctx.seed);
  const ml = new MultiLevel(L0, L1);
  const eRef = Float32Array.from(ml.fillChildless(ml.restrict(ctx.r_elevation)));
  const omesh0 = new port.VendorSphereMesh(L0.triangles, L0.halfedges, L0.numRegions);
  const xyz0 = L0.orogenPoints();
  const { r_plate, plateIsOcean } = deriveSyntheticPlates(L0.adjOffset, L0.adjList, eRef);
  const wind = port.computeWind(omesh0, xyz0, eRef, plateIsOcean, r_plate, new port.SimplexNoise(ctx.seed));
  const ocean = port.computeOceanCurrents(omesh0, xyz0, eRef, wind);
  const precip = port.computePrecipitation(omesh0, xyz0, eRef, wind, ocean, 0, 0.3);
  const temp = port.computeTemperature(omesh0, xyz0, eRef, wind, ocean, precip, 0);
  const c = runClimateDetail({ climate: { wind, ocean, precip, temp }, r_xyz: xyz0 }, { ml, r_xyz: ctx.r_xyz, omesh: ctx.mesh, elevRaw: ctx.r_elevation });
  console.log(JSON.stringify({ N, ...temperatures(L1.cellArea_sr, ctx.r_elevation, c.summer.temp, c.winter.temp) }));
} else if (process.argv[2] === 'regress') {
  // Stored search rows, re-scored: least squares of a score on all sliders plus seed dummies; the slider's coefficient
  // per one slider step, with its standard error. Worlds under 2% land (capped scores) are left out.
  const { SETTINGS } = await import('../../../apps/web/src/settings.ts');
  const key = process.argv[3], step = SETTINGS.find((s) => s.key === key).step, keys = SETTINGS.map((s) => s.key);
  const E = await earthTargets(N), rows = [];
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`search-N${N}`) && f.endsWith('.jsonl'))
    for (const l of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n')) if (l) {
      const r = JSON.parse(l); if (!(r.metrics.landFrac >= 0.02)) continue;
      const o = objective(termDistances(r.metrics, E));
      rows.push({ p: r.params, seed: r.seed, objective: o.objective, slope: o.terms.slope, hypsometry: o.terms.hypsometry, slopeP50: r.metrics.slope[0], slopeP90: r.metrics.slope[1], slopeP99: r.metrics.slope[2] });
    }
  const seeds = [...new Set(rows.map((r) => r.seed))].slice(1), X = rows.map((r) => [1, ...keys.map((k) => r.p[k]), ...seeds.map((s) => (r.seed === s ? 1 : 0))]);
  const p = X[0].length, XtX = Array.from({ length: p }, () => new Float64Array(p));
  for (const x of X) for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) XtX[a][b] += x[a] * x[b];
  const inv = Array.from({ length: p }, (_, i) => Float64Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));
  for (let c = 0; c < p; c++) { // Gauss-Jordan inverse with partial pivoting
    let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(XtX[r][c]) > Math.abs(XtX[m][c])) m = r;
    [XtX[c], XtX[m]] = [XtX[m], XtX[c]]; [inv[c], inv[m]] = [inv[m], inv[c]];
    const d = XtX[c][c]; for (let j = 0; j < p; j++) { XtX[c][j] /= d; inv[c][j] /= d; }
    for (let r = 0; r < p; r++) if (r !== c && XtX[r][c]) { const f = XtX[r][c]; for (let j = 0; j < p; j++) { XtX[r][j] -= f * XtX[c][j]; inv[r][j] -= f * inv[c][j]; } }
  }
  const j = 1 + keys.indexOf(key);
  console.log(`${rows.length} stored search rows (N = ${N}); per +${step} of ${key}:`);
  for (const y of ['objective', 'slope', 'hypsometry', 'slopeP50', 'slopeP90', 'slopeP99']) {
    const Xty = new Float64Array(p); rows.forEach((r, i) => { for (let a = 0; a < p; a++) Xty[a] += X[i][a] * r[y]; });
    const beta = inv.map((row) => row.reduce((s, v, b) => s + v * Xty[b], 0));
    const rss = rows.reduce((s, r, i) => s + (r[y] - X[i].reduce((t, v, b) => t + v * beta[b], 0)) ** 2, 0);
    console.log(`  ${y.padEnd(10)} ${(beta[j] * step).toFixed(4)} ± ${(Math.sqrt((rss / (rows.length - p)) * inv[j][j]) * step).toFixed(4)}`);
  }
} else {
  console.error('usage: defaults-check.mjs held \'<params json>\' | earth | regress <slider> [--N 50000]');
  process.exit(2);
}
