// Realism regression gate (Checkpoint 4b decision 6): the structured pipeline must not make the world flatter or
// less river-like. Original shell code. Usage:
//   tsx tools/tuning/realism/gate.mjs --current <realism.json> [--baseline tools/tuning/realism/baseline.json]
// <realism.json> is written by realism.mjs (at least the structured pipeline, same N and seeds as the baseline).
// The baseline holds both pipelines at 2.56M: `structured` is the recorded Phase 4b result, `parity` is stock orogen.
// Per seed, the current structured world fails if
//   - any land hypsometry percentile from p50 up, or any slope percentile, drops below its structured baseline
//     (the pipeline is fdlibm-only, so the tolerances absorb only the harness's own Math.* use);
//   - hypsometry p95 or slope p50 falls below stock orogen's (never flatter than stock);
//   - the land fraction moves more than 0.02 from stock's;
//   - Hack's exponent leaves [0.5, 0.65] (Earth ≈ 0.5–0.6);
//   - channel length per land area (drainage ≥ 10³ and ≥ 10⁴ km²) moves more than 20 % from stock's.
// A rise in relief is reported, not failed; if intended, update baseline.json in the same commit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BOUNDS = {
  elevTolM: 1,
  slopeTol: 1e-3,
  landFracVsStock: 0.02,
  hack: [0.5, 0.65],
  riverVsStock: 0.2,
};
const ELEV_KEYS = ['p50', 'p75', 'p95', 'p99'];
const SLOPE_KEYS = ['p50', 'p90', 'p99'];

/** Returns { failures, notes, missing } for a realism run against the baseline. */
export function realismGate(current, baseline) {
  const failures = [], notes = [], missing = [];
  for (const [seed, b] of Object.entries(baseline.seeds)) {
    const c = current.seeds?.[seed]?.structured;
    if (!c || current.N !== baseline.N) { missing.push(`seed ${seed} (N ${baseline.N})`); continue; }
    const base = b.structured, stock = b.parity, at = `seed ${seed}`;
    for (const k of ELEV_KEYS) {
      const d = c.hypsometryM[k] - base.hypsometryM[k];
      if (d < -BOUNDS.elevTolM) failures.push(`${at}: hypsometry ${k} ${base.hypsometryM[k]} -> ${c.hypsometryM[k]} m`);
      else if (d > BOUNDS.elevTolM) notes.push(`${at}: hypsometry ${k} ${base.hypsometryM[k]} -> ${c.hypsometryM[k]} m`);
    }
    for (const k of SLOPE_KEYS) {
      const d = c.slopeMPerKm[k] - base.slopeMPerKm[k];
      if (d < -BOUNDS.slopeTol) failures.push(`${at}: slope ${k} ${base.slopeMPerKm[k]} -> ${c.slopeMPerKm[k]} m/km`);
      else if (d > BOUNDS.slopeTol) notes.push(`${at}: slope ${k} ${base.slopeMPerKm[k]} -> ${c.slopeMPerKm[k]} m/km`);
    }
    if (c.hypsometryM.p95 < stock.hypsometryM.p95) failures.push(`${at}: hypsometry p95 ${c.hypsometryM.p95} m below stock ${stock.hypsometryM.p95} m`);
    if (c.slopeMPerKm.p50 < stock.slopeMPerKm.p50) failures.push(`${at}: slope p50 ${c.slopeMPerKm.p50} below stock ${stock.slopeMPerKm.p50}`);
    if (Math.abs(c.landFrac - stock.landFrac) > BOUNDS.landFracVsStock) failures.push(`${at}: land fraction ${c.landFrac} vs stock ${stock.landFrac}`);
    if (c.hackExponent < BOUNDS.hack[0] || c.hackExponent > BOUNDS.hack[1]) failures.push(`${at}: Hack exponent ${c.hackExponent} outside [${BOUNDS.hack}]`);
    for (const k of ['a1e3', 'a1e4']) {
      const r = c.riverKmPer1000Km2[k] / stock.riverKmPer1000Km2[k];
      if (Math.abs(r - 1) > BOUNDS.riverVsStock) failures.push(`${at}: river density ${k} ${c.riverKmPer1000Km2[k]} vs stock ${stock.riverKmPer1000Km2[k]}`);
    }
  }
  return { failures, notes, missing };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
  const current = JSON.parse(fs.readFileSync(arg('current'), 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(arg('baseline', path.join(HERE, 'baseline.json')), 'utf8'));
  const { failures, notes, missing } = realismGate(current, baseline);
  for (const s of notes) console.log(`changed    ${s}`);
  for (const s of missing) console.log(`missing    ${s}`);
  for (const s of failures) console.log(`FAIL       ${s}`);
  if (notes.length) console.log('Relief rose: if intended, update tools/tuning/realism/baseline.json in this commit.');
  if (failures.length || missing.length) process.exit(1);
  console.log(`Realism gate passed (${Object.keys(baseline.seeds).length} seeds).`);
}
