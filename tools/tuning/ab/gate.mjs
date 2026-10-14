// Q7 A/B regression gate (ARCHITECTURE Q7, design note 14 §3.9; Phase 4b M7). Original shell code. Usage:
//   tsx tools/tuning/ab/gate.mjs --current <run.json> [--baseline tools/tuning/ab-baseline.structured.json]
// Compares every (seed, final, preview) entry of a run written by run.mjs with the same entry of the baseline. It
// fails on regression beyond a metric's tolerance only. An improvement is reported, and the baseline should be
// updated in the same commit so that the gate keeps tracking the best result. The structured pipeline runs in dmath
// fdlibm only, so its outputs are bit-identical across platforms and the tolerances are near zero; they absorb only the
// harness's own Math.* use (great-circle distances, KS statistics).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Direction and tolerance per Q7 metric: +1 higher is better, −1 lower is better. */
export const METRICS = {
  landIoU: { dir: 1, tol: 1e-6 },
  landIoU1deg: { dir: 1, tol: 1e-6 },
  coastP95PreviewCells: { dir: -1, tol: 1e-6 },
  coastP95Km: { dir: -1, tol: 1e-3 },
  koppenAgreement: { dir: 1, tol: 1e-6 },
  precipCorrelationLand: { dir: 1, tol: 1e-6 },
  mountainIoU: { dir: 1, tol: 1e-6 },
  hypsometryKS: { dir: -1, tol: 1e-6 },
  basinsMatchedAt50: { dir: 1, tol: 0 },
  basinMeanIoU: { dir: 1, tol: 1e-6 },
  hypsometryKSNative: { dir: -1, tol: 1e-6 },
  koppenAgreement1deg: { dir: 1, tol: 1e-6 },
  riverMouthMeanKm: { dir: -1, tol: 1e-3 },
  riverMouthMedianKm: { dir: -1, tol: 1e-3 },
};

/** Returns { regressions, improvements, missing } comparing two baseline-shaped objects. */
export function gate(current, baseline) {
  const regressions = [], improvements = [], missing = [];
  for (const [seed, cur] of Object.entries(current.seeds)) {
    for (const [final, previews] of Object.entries(cur.vsFinal)) {
      for (const [preview, m] of Object.entries(previews)) {
        const b = baseline.seeds?.[seed]?.vsFinal?.[final]?.[preview];
        const where = `seed ${seed}, ${preview} vs ${final}`;
        if (!b) { missing.push(where); continue; }
        for (const [k, { dir, tol }] of Object.entries(METRICS)) {
          const d = dir * (m[k] - b[k]);
          if (d < -tol) regressions.push(`${where}: ${k} ${b[k]} -> ${m[k]}`);
          else if (d > tol) improvements.push(`${where}: ${k} ${b[k]} -> ${m[k]}`);
        }
      }
    }
  }
  return { regressions, improvements, missing };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
  const current = JSON.parse(fs.readFileSync(arg('current'), 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(arg('baseline', path.join(HERE, '..', 'ab-baseline.structured.json')), 'utf8'));
  const { regressions, improvements, missing } = gate(current, baseline);
  for (const s of improvements) console.log(`improved   ${s}`);
  for (const s of missing) console.log(`no baseline ${s}`);
  for (const s of regressions) console.log(`REGRESSION ${s}`);
  if (improvements.length) console.log('Improvements found: update tools/tuning/ab-baseline.structured.json in this commit.');
  if (regressions.length || missing.length) process.exit(1);
  console.log(`Q7 gate passed (${Object.keys(current.seeds).length} seeds).`);
}
