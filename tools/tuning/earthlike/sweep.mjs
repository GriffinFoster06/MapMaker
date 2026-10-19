// Earth-likeness sweep (decision P2, queue item Q3): Latin-hypercube search over the 14 settings sliders against the
// Earth distance in metrics.mjs. Original code. Resumable and chunked: every (configuration, seed) world is one JSONL
// line; a rerun skips lines already present; run several shards in parallel with --shard k --of m.
//
//   tsx tools/tuning/earthlike/sweep.mjs run --stage pilot|search|refine|validate|oat|large [--n 30] [--shard 0 --of 1] [--N 50000]
//   tsx tools/tuning/earthlike/sweep.mjs report [--N 50000]
//
// Stages (seed sets are disjoint): pilot = --n LHS configurations of its own design (timing and a first look; not used for selection); search = --n LHS configurations x 5 seeds;
// refine = the best 10 of the search (by mean objective) x 20 more seeds; validate = best, defaults and the next 2 on held-out
// seeds; oat = one-at-a-time sensitivity around the best; large = best and defaults at N = 200k on held-out seeds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { SETTINGS } from '../../../apps/web/src/settings.ts';
import { earthTargets } from './earth.mjs';
import { objective, termDistances, worldMetrics, TERMS } from './metrics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.EARTHLIKE_OUT ?? path.join(HERE, '..', 'results', 'earthlike');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const cmd = process.argv[2];
const N = Number(arg('N', '50000'));
export const SEEDS = { search: [11, 12, 13, 14, 15], refine: Array.from({ length: 20 }, (_, i) => 101 + i), held: Array.from({ length: 20 }, (_, i) => 9001 + i) };

// --- Latin hypercube (seeded; no Math.random) ---
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const snap = (s, v) => { const x = s.min + Math.round((v - s.min) / s.step) * s.step; return Math.round(Math.min(s.max, Math.max(s.min, x)) * 1e6) / 1e6; };
export function lhs(n, seed = 20261019) {
  const rnd = mulberry32(seed), cols = SETTINGS.map(() => { const p = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; });
  return Array.from({ length: n }, (_, i) => Object.fromEntries(SETTINGS.map((s, d) => [s.key, snap(s, s.min + ((cols[d][i] + rnd()) / n) * (s.max - s.min))])));
}
const DEFAULTS = Object.fromEntries(SETTINGS.map((s) => [s.key, s.def]));

// --- storage ---
const readAll = (stagePrefix = '') => {
  if (!fs.existsSync(OUT)) return [];
  const rows = [];
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.jsonl') && f.startsWith(stagePrefix)) for (const l of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n')) if (l) rows.push(rescore(JSON.parse(l)));
  return rows;
};
// Rows store raw metrics, so the objective can be recomputed (weights, tolerances, fixes) without regenerating worlds.
const targetCache = new Map();
const rescore = (r) => {
  if (!targetCache.has(r.N)) targetCache.set(r.N, JSON.parse(fs.readFileSync(path.join(HERE, 'targets', `earth-N${r.N}.json`), 'utf8')));
  const o = objective(termDistances(r.metrics, targetCache.get(r.N)));
  return { ...r, objective: o.objective, terms: o.terms };
};
const keyOf = (r) => `${r.stage}|${r.N}|${r.cfg}|${r.seed}`;

async function worldRow(stage, cfg, params, seed, E, n = N) {
  const t0 = performance.now();
  const w = createOrogenWorld({ N: n, seed, ...params });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const m = worldMetrics(w.meshes.get('global').mesh, w.layers.get('global', 'detail.elevRaw'), w.layers.get('global', 'koppen'));
  const d = termDistances(m, E), o = objective(d);
  return { stage, N: n, cfg, seed, params, objective: o.objective, terms: o.terms, metrics: m, ms: Math.round(performance.now() - t0) };
}

// --- report helpers ---
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
export function byConfig(rows) {
  const g = new Map();
  for (const r of rows) { const k = r.cfg; (g.get(k) ?? g.set(k, { cfg: k, params: r.params, rows: [] }).get(k)).rows.push(r); }
  return [...g.values()].map((c) => ({ cfg: c.cfg, params: c.params, n: c.rows.length, objective: mean(c.rows.map((r) => r.objective)), se: sd(c.rows.map((r) => r.objective)) / Math.sqrt(c.rows.length), terms: Object.fromEntries(Object.keys(TERMS).map((t) => [t, mean(c.rows.map((r) => r.terms[t]))])) }));
}

async function run() {
  const stage = arg('stage'), shard = Number(arg('shard', '0')), of = Number(arg('of', '1')), n = Number(arg('n', '30'));
  const E = await earthTargets(N);
  const all = readAll();
  let tasks = [];
  const add = (stg, cfg, params, seeds, nn = N) => { for (const seed of seeds) tasks.push({ stage: stg, cfg, params, seed, N: nn }); };
  if (stage === 'pilot' || stage === 'search') lhs(n, stage === 'pilot' ? 7 : 20261019).forEach((p, i) => add(stage, `${stage === 'pilot' ? 'P' : 'L'}${i}`, p, SEEDS.search));
  else {
    const search = byConfig(all.filter((r) => r.stage === 'search' && r.N === N)).sort((a, b) => a.objective - b.objective);
    const refined = byConfig(all.filter((r) => (r.stage === 'search' || r.stage === 'refine') && r.N === N)).filter((c) => search.slice(0, 10).some((s) => s.cfg === c.cfg)).sort((a, b) => a.objective - b.objective);
    if (stage === 'refine') for (const c of search.slice(0, 10)) add('refine', c.cfg, c.params, SEEDS.refine);
    else if (stage === 'validate' || stage === 'large') {
      const best = refined.length ? refined : search;
      const sel = [{ cfg: 'default', params: DEFAULTS }, ...best.slice(0, 3)];
      for (const c of sel) add(stage, c.cfg, c.params, stage === 'validate' ? SEEDS.held : SEEDS.held.slice(0, 5), stage === 'large' ? 200000 : N);
    } else if (stage === 'oat') {
      const best = (refined.length ? refined : search)[0];
      for (const s of SETTINGS) for (const [tag, v] of [['lo', s.min + 0.25 * (s.max - s.min)], ['hi', s.min + 0.75 * (s.max - s.min)]]) add('oat', `${best.cfg}:${s.key}:${tag}`, { ...best.params, [s.key]: snap(s, v) }, SEEDS.search);
      add('oat', `${best.cfg}:base`, best.params, SEEDS.search);
    } else throw new Error(`unknown stage ${stage}`);
  }
  const done = new Set(all.map(keyOf));
  tasks = tasks.filter((t) => !done.has(keyOf(t)));
  const mine = tasks.filter((_, i) => i % of === shard);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${stage}-N${N}-shard${shard}of${of}.jsonl`);
  console.error(`${stage}: ${tasks.length} tasks pending, ${mine.length} in shard ${shard}/${of}`);
  const targets = new Map([[N, E]]);
  for (const t of mine) {
    if (!targets.has(t.N)) targets.set(t.N, await earthTargets(t.N));
    const row = await worldRow(t.stage, t.cfg, t.params, t.seed, targets.get(t.N), t.N);
    fs.appendFileSync(file, JSON.stringify(row) + '\n');
    console.error(`${t.stage} ${t.cfg} seed ${t.seed} N=${t.N}: objective ${row.objective.toFixed(3)} (${row.ms} ms)`);
  }
}

function report() {
  const all = readAll().filter((r) => r.N === N || r.stage === 'large');
  const out = {};
  const search = byConfig(all.filter((r) => r.stage === 'search')).sort((a, b) => a.objective - b.objective);
  out.times = { msPerWorld: Math.round(mean(all.map((r) => r.ms))), worlds: all.length };
  out.searchTop = search.slice(0, 10);
  out.searchCount = search.length;
  // Linear sensitivity of the objective on the normalised sliders over all search configurations.
  const X = search.map((c) => SETTINGS.map((s) => (c.params[s.key] - s.min) / (s.max - s.min)));
  const y = search.map((c) => c.objective);
  out.sensitivity = SETTINGS.map((s, d) => { const x = X.map((r) => r[d]), mx = mean(x), my = mean(y); const cov = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0); return { key: s.key, corr: cov / (Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0)) * Math.sqrt(y.reduce((a, v) => a + (v - my) ** 2, 0))) }; });
  for (const stg of ['refine', 'validate', 'large', 'oat']) out[stg] = byConfig(all.filter((r) => r.stage === stg)).sort((a, b) => a.objective - b.objective);
  const combined = byConfig(all.filter((r) => r.stage === 'search' || r.stage === 'refine')).filter((c) => c.n > 5).sort((a, b) => a.objective - b.objective);
  out.bestCombined = combined.slice(0, 5);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `report-N${N}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) { if (cmd === 'run') await run(); else if (cmd === 'report') report(); else console.error('usage: sweep.mjs run|report'); }
