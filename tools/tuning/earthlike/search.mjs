// Search for Earth-like defaults against the independent targets (decision P6). Original code, in sweep.mjs's style:
// one JSONL line per (stage, N, configuration, seed) world, a rerun skips finished lines, shards run in parallel.
//
//   tsx tools/tuning/earthlike/search.mjs run --stage broad  [--n 1500] [--shard k --of m]
//   tsx tools/tuning/earthlike/search.mjs plan --round r      (then) run --stage refine --round r [--shard k --of m]
//   tsx tools/tuning/earthlike/search.mjs run --stage confirm [--N 50000|200000] [--shard k --of m]
//   tsx tools/tuning/earthlike/search.mjs report
//
// Only the sliders with an Earth-measurable target are searched (SEARCH); the generator-specific sliders and the
// precipitation offset (no real-unit precipitation yet) stay at orogen's defaults. Rows store raw metrics; objectives
// are computed in the report from targets/earth-real-N<N>.json, so weights and tolerances can change without regenerating.
// Stages: broad = Latin hypercube over SEARCH plus the defaults, common seeds; refine = coordinate search from the best
// 10 (round r evaluates the one-step neighbours of the current best 10 that are not yet run); confirm = the best 3 and
// the defaults on held-out seeds never used before, at N = 50k (40 seeds) and 200k (20 seeds).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { worldMetrics } from './metrics.mjs';
import { SCORED, TERMS_REAL, distancesReal, objectiveReal, variants } from './objective-real.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.EARTHLIKE_OUT ?? path.join(HERE, '..', 'results', 'earthlike-real');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

/** Searched sliders: range of the search and step (the settings panel's step). */
export const SEARCH = {
  landCoverage: { min: 0.15, max: 0.5, step: 0.01 },
  numContinents: { min: 1, max: 10, step: 1 },
  smoothing: { min: 0, max: 1, step: 0.05 },
  temperatureOffset: { min: -10, max: 5, step: 1 },
};
/** orogen's defaults of the searched sliders (main before P6). */
export const DEFAULTS = { landCoverage: 0.3, numContinents: 4, smoothing: 0.1, temperatureOffset: 0 };
export const SEEDS = { broad: [201, 202, 203, 204, 205, 206, 207, 208], confirm50k: Array.from({ length: 40 }, (_, i) => 9101 + i), confirm200k: Array.from({ length: 20 }, (_, i) => 9201 + i) };

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const snap = (k, v) => { const s = SEARCH[k]; const x = s.min + Math.round((v - s.min) / s.step) * s.step; return Math.round(Math.min(s.max, Math.max(s.min, x)) * 1e6) / 1e6; };
export function lhs(n, seed = 20261022) {
  const rnd = mulberry32(seed), keys = Object.keys(SEARCH);
  const cols = keys.map(() => { const p = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; });
  return Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map((k, d) => [k, snap(k, SEARCH[k].min + ((cols[d][i] + rnd()) / n) * (SEARCH[k].max - SEARCH[k].min))])));
}
export const cfgId = (p) => Object.keys(SEARCH).map((k) => `${k}=${p[k]}`).join(',');

// --- storage and scoring ---
export function readRows() {
  if (!fs.existsSync(OUT)) return [];
  const rows = [];
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.jsonl')) for (const l of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n')) if (l) rows.push(JSON.parse(l));
  return rows;
}
const targets = new Map();
export const targetsAt = (N) => { if (!targets.has(N)) targets.set(N, JSON.parse(fs.readFileSync(path.join(HERE, 'targets', `earth-real-N${N}.json`), 'utf8'))); return targets.get(N); };
export const score = (r, opts) => objectiveReal(distancesReal(r.metrics, targetsAt(r.N)), opts);

/** Configurations of rows (same N): mean objective over seeds, per seed objective (for paired comparisons), per-term means. */
export function byConfig(rows, opts) {
  const g = new Map();
  for (const r of rows) { const k = cfgId(r.params); (g.get(k) ?? g.set(k, { cfg: k, params: r.params, seeds: new Map() }).get(k)).seeds.set(r.seed, score(r, opts)); }
  return [...g.values()].map((c) => {
    const s = [...c.seeds.values()], n = s.length, m = s.reduce((a, x) => a + x.objective, 0) / n;
    const sd = Math.sqrt(s.reduce((a, x) => a + (x.objective - m) ** 2, 0) / Math.max(1, n - 1));
    const terms = Object.fromEntries(Object.keys(TERMS_REAL).map((k) => [k, s.reduce((a, x) => a + x.terms[k], 0) / n]));
    return { cfg: c.cfg, params: c.params, n, objective: m, se: sd / Math.sqrt(n), terms, perSeed: c.seeds };
  });
}

/** Mean temperatures, area-weighted, °C (temperature layers are 0..1 over −45..+45 °C). */
function temperatures(area, raw, summer, winter) {
  let A = 0, AL = 0, T = 0, TL = 0;
  for (let r = 0; r < area.length; r++) { const a = area[r], t = ((summer[r] + winter[r]) / 2) * 90 - 45; A += a; T += a * t; if (raw[r] > 0) { AL += a; TL += a * t; } }
  return { meanT: T / A, landT: TL / Math.max(AL, 1e-12) };
}

async function worldRow(stage, params, seed, N) {
  const t0 = performance.now();
  const w = createOrogenWorld({ N, seed, ...params });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const mesh = w.meshes.get('global').mesh, raw = w.layers.get('global', 'detail.elevRaw');
  const metrics = { ...worldMetrics(mesh, raw, w.layers.get('global', 'koppen')), ...temperatures(mesh.cellArea_sr, raw, w.layers.get('global', 'temp.summer'), w.layers.get('global', 'temp.winter')) };
  return { stage, N, cfg: cfgId(params), seed, params, metrics, ms: Math.round(performance.now() - t0) };
}

const neighbours = (p) => {
  const out = [];
  for (const [k, s] of Object.entries(SEARCH)) for (const d of [-1, 1]) { const v = snap(k, p[k] + d * s.step); if (v !== p[k]) out.push({ ...p, [k]: v }); }
  return out;
};

/** Candidates of refine round r: neighbours of the best 10 configurations evaluated on the broad seeds so far. */
function refineCandidates(all) {
  const seen = byConfig(all.filter((r) => r.N === 50000 && (r.stage === 'broad' || r.stage === 'refine')));
  const best = seen.filter((c) => c.n === SEEDS.broad.length).sort((a, b) => a.objective - b.objective).slice(0, 10);
  const have = new Set(seen.map((c) => c.cfg)), out = new Map();
  for (const c of best) for (const p of neighbours(c.params)) if (!have.has(cfgId(p))) out.set(cfgId(p), p);
  return { best, candidates: [...out.values()] };
}

/** Finalists: the best 3 on the broad seeds (broad and refine), plus the defaults. */
export function finalists(all) {
  const seen = byConfig(all.filter((r) => r.N === 50000 && (r.stage === 'broad' || r.stage === 'refine'))).filter((c) => c.n === SEEDS.broad.length).sort((a, b) => a.objective - b.objective);
  return [...seen.slice(0, 3).map((c) => c.params), DEFAULTS];
}

/** Writes the candidate list of refine round r once, so that every shard runs the same list. */
function plan() {
  const r = Number(arg('round')), { best, candidates } = refineCandidates(readRows());
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `refine-r${r}.plan.json`), JSON.stringify(candidates));
  console.log(`refine round ${r}: best ${best[0]?.cfg} ${best[0]?.objective.toFixed(4)}; ${candidates.length} candidates`);
}

async function run() {
  const stage = arg('stage'), shard = Number(arg('shard', '0')), of = Number(arg('of', '1'));
  const all = readRows(), done = new Set(all.map((r) => `${r.stage}|${r.N}|${r.cfg}|${r.seed}`));
  const tasks = [];
  const add = (params, seeds, N) => { for (const seed of seeds) tasks.push({ params, seed, N }); };
  let file;
  if (stage === 'broad') { const n = Number(arg('n', '1500')); [DEFAULTS, ...lhs(n)].forEach((p) => add(p, SEEDS.broad, 50000)); file = 'broad'; }
  else if (stage === 'refine') { const r = Number(arg('round')); JSON.parse(fs.readFileSync(path.join(OUT, `refine-r${r}.plan.json`), 'utf8')).forEach((p) => add(p, SEEDS.broad, 50000)); file = `refine-r${r}`; }
  else if (stage === 'confirm') { const N = Number(arg('N', '50000')); finalists(all).forEach((p) => add(p, N === 50000 ? SEEDS.confirm50k : SEEDS.confirm200k, N)); file = `confirm-N${N}`; }
  else throw new Error(`unknown stage ${stage}`);
  const st = stage === 'confirm' ? 'confirm' : stage;
  const mine = tasks.filter((t, i) => i % of === shard && !done.has(`${st}|${t.N}|${cfgId(t.params)}|${t.seed}`));
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${file}-shard${shard}of${of}.jsonl`);
  console.log(`${stage}: ${tasks.length} worlds, shard ${shard}/${of}: ${mine.length} to run`);
  for (const t of mine) fs.appendFileSync(out, JSON.stringify(await worldRow(st, t.params, t.seed, t.N)) + '\n');
}

// --- report ---
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sdv = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };

/** Least squares with intercept; returns coefficients and their standard errors. */
function ols(X, y) {
  const p = X[0].length, A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
  X.forEach((x, i) => { for (let a = 0; a < p; a++) { b[a] += x[a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += x[a] * x[c]; } });
  const inv = Array.from({ length: p }, (_, i) => Float64Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));
  for (let c = 0; c < p; c++) {
    let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]]; [inv[c], inv[m]] = [inv[m], inv[c]];
    const d = A[c][c]; for (let j = 0; j < p; j++) { A[c][j] /= d; inv[c][j] /= d; }
    for (let r = 0; r < p; r++) if (r !== c && A[r][c]) { const f = A[r][c]; for (let j = 0; j < p; j++) { A[r][j] -= f * A[c][j]; inv[r][j] -= f * inv[c][j]; } }
  }
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * b[j], 0));
  const rss = X.reduce((s, x, i) => s + (y[i] - x.reduce((t, v, j) => t + v * beta[j], 0)) ** 2, 0), s2 = rss / Math.max(1, X.length - p);
  return { beta, se: beta.map((_, j) => Math.sqrt(s2 * inv[j][j])) };
}

/** Paired difference (a − b) of two configurations over their common seeds: mean and standard error. */
export function paired(a, b) {
  const d = [...a.perSeed.keys()].filter((s) => b.perSeed.has(s)).map((s) => a.perSeed.get(s).objective - b.perSeed.get(s).objective);
  return { n: d.length, mean: mean(d), se: sdv(d) / Math.sqrt(d.length) };
}

function report() {
  const all = readRows(), out = {};
  const broad = all.filter((r) => r.stage === 'broad' && r.N === 50000);
  // Step 3: noise per term (standard error over the broad seeds, mean over configurations) and the sliders' effect
  // (least squares of each term on the searched sliders, linear and squared, over every broad world; seed dummies).
  const keys = Object.keys(SEARCH), seeds = SEEDS.broad.slice(1);
  const rowsScored = broad.filter((r) => r.metrics.landFrac >= 0.02).map((r) => ({ r, s: score(r) }));
  out.terms = {};
  for (const k of Object.keys(TERMS_REAL)) {
    const perCfg = new Map();
    for (const { r, s } of rowsScored) (perCfg.get(r.cfg) ?? perCfg.set(r.cfg, []).get(r.cfg)).push(s.terms[k]);
    const ses = [...perCfg.values()].filter((v) => v.length > 1).map((v) => sdv(v) / Math.sqrt(v.length));
    const cm = [...perCfg.values()].map(mean);
    const X = rowsScored.map(({ r }) => [1, ...keys.flatMap((q) => { const z = (r.params[q] - SEARCH[q].min) / (SEARCH[q].max - SEARCH[q].min); return [z, z * z]; }), ...seeds.map((sd) => (r.seed === sd ? 1 : 0))]);
    const fit = ols(X, rowsScored.map(({ s }) => s.terms[k]));
    const effects = Object.fromEntries(keys.map((q, i) => { const b1 = fit.beta[1 + 2 * i], b2 = fit.beta[2 + 2 * i]; const e1 = fit.se[1 + 2 * i], e2 = fit.se[2 + 2 * i]; return [q, { linear: b1, linearT: b1 / e1, square: b2, squareT: b2 / e2, rangeEffect: Math.abs(b1 + b2) }]; }));
    out.terms[k] = { verified: TERMS_REAL[k].verified, scored: SCORED.includes(k), noiseSE: mean(ses), spreadOfConfigMeans: sdv(cm), movedBySliders: keys.some((q) => Math.abs(effects[q].linearT) > 4 || Math.abs(effects[q].squareT) > 4), effects };
  }
  // Ranking on the broad seeds (broad and refine), then the confirmation with every variant.
  const seen = byConfig(all.filter((r) => r.N === 50000 && (r.stage === 'broad' || r.stage === 'refine'))).filter((c) => c.n === SEEDS.broad.length).sort((a, b) => a.objective - b.objective);
  out.broadTop = seen.slice(0, 15).map((c) => ({ cfg: c.cfg, objective: c.objective, se: c.se, terms: c.terms }));
  out.broadDefaults = seen.find((c) => c.cfg === cfgId(DEFAULTS));
  if (out.broadDefaults) { out.broadDefaults = { ...out.broadDefaults, perSeed: undefined }; out.broadDefaultsRank = seen.findIndex((c) => c.cfg === cfgId(DEFAULTS)) + 1; }
  out.searched = { broad: broad.length, refine: all.filter((r) => r.stage === 'refine').length, configs: seen.length };
  for (const N of [50000, 200000]) {
    const rows = all.filter((r) => r.stage === 'confirm' && r.N === N);
    if (!rows.length) continue;
    const res = {};
    for (const v of variants()) {
      const cs = byConfig(rows, v), d = cs.find((c) => c.cfg === cfgId(DEFAULTS));
      res[v.id] = cs.map((c) => ({ cfg: c.cfg, n: c.n, objective: c.objective, se: c.se, vsDefaults: d && c !== d ? paired(c, d) : null, ...(v.id === 'base' ? { terms: c.terms } : {}) })).sort((a, b) => a.objective - b.objective);
    }
    out[`confirm${N}`] = res;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, (k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v), 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cmd = process.argv[2];
  if (cmd === 'run') await run(); else if (cmd === 'plan') plan(); else if (cmd === 'report') report(); else console.error('usage: search.mjs run --stage broad|refine|confirm ... | plan --round r | report');
}
