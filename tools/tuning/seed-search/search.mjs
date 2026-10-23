// Default-seed search: which seed in 1..1,000,000 has continents and coastlines statistically closest to real Earth, at
// the default parameters. Original code. One JSONL line per seed and stage; a rerun skips finished seeds; shards are
// separate processes (run them one batch at a time). See README.md.
//
//   tsx tools/tuning/seed-search/search.mjs a --shard k --of m --until <epoch ms>     stage A: layout of the 20k reference world
//   tsx tools/tuning/seed-search/search.mjs b --shard k --of m [--top 500] [--ref 200] stage B: full pipeline, N = 50k
//   tsx tools/tuning/seed-search/search.mjs c --shard k --of m [--top 10]             stage C: N = 200k
//   tsx tools/tuning/seed-search/search.mjs report                                    -> results/report.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { referenceLayout } from './layout.mjs';
import { LAYOUT_TERMS, earthTargets, layoutMetrics, layoutObjective } from './score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SEEDSEARCH_OUT ?? path.join(HERE, '..', 'results', 'seed-search');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

export const SEED_MAX = 1_000_000;
export const SAMPLE_SEED = 20261022;   // fixed sampling seed (recorded in the report)
export const CURRENT_DEFAULT = 12345;  // the default seed before this search
/** Robustness: the layout objective may move at most this much under the four threshold variants of score.mjs. */
export const ROBUST_TOL = 0.15;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** A fixed random order of 1..SEED_MAX (Fisher-Yates, seeded). Any prefix is a uniform random sample. */
export function sampleOrder() {
  const a = Uint32Array.from({ length: SEED_MAX }, (_, i) => i + 1), rnd = mulberry32(SAMPLE_SEED);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

export function readRows(stage) {
  const rows = [];
  if (!fs.existsSync(OUT)) return rows;
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`${stage}-`) && f.endsWith('.jsonl')) for (const l of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n')) if (l) rows.push(JSON.parse(l));
  return rows;
}
const targets = new Map();
const E = (N) => { if (!targets.has(N)) targets.set(N, earthTargets(N)); return targets.get(N); };
const write = (stage, shard, of, row) => { fs.mkdirSync(OUT, { recursive: true }); fs.appendFileSync(path.join(OUT, `${stage}-shard${shard}of${of}.jsonl`), JSON.stringify(row) + '\n'); };

/** Robustness of a stage-B/C row: the largest move of the layout objective under the threshold variants. */
export function robustness(m, N) {
  const base = layoutObjective(m, E(N)).objective;
  let worst = 0, countChanged = false;
  for (const s of Object.values(m.sens ?? {})) { worst = Math.max(worst, Math.abs(layoutObjective({ ...m, ...s }, E(N)).objective - base)); if (s.continents !== m.continents) countChanged = true; }
  return { worst, countChanged, ok: !m.skipped && worst <= ROBUST_TOL && !countChanged };
}

async function stageA() {
  const shard = Number(arg('shard', '0')), of = Number(arg('of', '1')), until = Number(arg('until', '0')) || Infinity;
  const done = new Set(readRows('A').map((r) => r.seed)), order = sampleOrder();
  const target = E(20000);
  let n = 0;
  for (let i = shard; i < order.length && Date.now() < until; i += of) {
    const seed = order[i];
    if (done.has(seed)) continue;
    const t0 = performance.now();
    const { mesh, elevRaw } = referenceLayout(seed);
    const t1 = performance.now();
    const m = layoutMetrics(mesh, elevRaw), o = layoutObjective(m, target);
    write('A', shard, of, { seed, i, msLayout: Math.round(t1 - t0), msScore: Math.round(performance.now() - t1), ...m, objective: o.objective, terms: o.terms });
    n++;
  }
  console.log(`stage A shard ${shard}/${of}: ${n} seeds scored`);
}

async function worldRow(stage, seed, N) {
  const t0 = performance.now();
  const w = createOrogenWorld({ N, seed });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const mesh = w.meshes.get('global').mesh, raw = w.layers.get('global', 'detail.elevRaw');
  const m = layoutMetrics(mesh, raw, { robust: true }), o = layoutObjective(m, E(N));
  return { stage, N, seed, ...m, objective: o.objective, terms: o.terms, robust: robustness(m, N), ms: Math.round(performance.now() - t0) };
}

/** Seeds of stage B: the best `top` of stage A, the default seed, and `ref` random sample seeds (the median-seed reference). */
export function stageBSeeds(top, ref) {
  const A = readRows('A').filter((r) => !r.skipped).sort((a, b) => a.objective - b.objective || a.seed - b.seed);
  const best = A.slice(0, top).map((r) => r.seed);
  const order = sampleOrder(), inA = new Set(readRows('A').map((r) => r.seed));
  const refs = []; for (let i = 0; i < order.length && refs.length < ref; i++) if (inA.has(order[i]) && !best.includes(order[i])) refs.push(order[i]);
  return { best, refs, seeds: [...new Set([...best, CURRENT_DEFAULT, ...refs])] };
}

async function stageB() {
  const shard = Number(arg('shard', '0')), of = Number(arg('of', '1'));
  const { seeds } = stageBSeeds(Number(arg('top', '500')), Number(arg('ref', '200')));
  const done = new Set(readRows('B').map((r) => r.seed));
  const mine = seeds.filter((s, i) => i % of === shard && !done.has(s));
  console.log(`stage B shard ${shard}/${of}: ${mine.length} of ${seeds.length} to run`);
  for (const seed of mine) write('B', shard, of, await worldRow('B', seed, 50000));
}

/** Stage C seeds: the best `top` robust stage-B finalists (from the stage-A top list only), and the default seed. */
export function stageCSeeds(top) {
  const { best } = stageBSeeds(Number(arg('top', '500')), 0);
  const B = new Map(readRows('B').map((r) => [r.seed, r]));
  const ranked = best.map((s) => B.get(s)).filter((r) => r && r.robust.ok).sort((a, b) => a.objective - b.objective || a.seed - b.seed);
  return { ranked, seeds: [...new Set([...ranked.slice(0, top).map((r) => r.seed), CURRENT_DEFAULT])] };
}

async function stageC() {
  const shard = Number(arg('shard', '0')), of = Number(arg('of', '1'));
  const { seeds } = stageCSeeds(Number(arg('top', '10')));
  const done = new Set(readRows('C').map((r) => r.seed));
  const mine = seeds.filter((s, i) => i % of === shard && !done.has(s));
  console.log(`stage C shard ${shard}/${of}: ${mine.length} of ${seeds.length} to run`);
  for (const seed of mine) write('C', shard, of, await worldRow('C', seed, 200000));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cmd = process.argv[2];
  if (cmd === 'a') await stageA(); else if (cmd === 'b') await stageB(); else if (cmd === 'c') await stageC();
  else if (cmd === 'report') console.error('run report.mjs directly');
  else console.error('usage: search.mjs a|b|c [--shard k --of m ...] | report');
}
