// Q7 A/B baseline runner. Usage:
//   NODE_OPTIONS=--max-old-space-size=24000 tsx tools/tuning/ab/run.mjs [--seeds 1,777,12345] [--previews 50000,200000]
//                                                                        [--finals 1000000,2560000] [--out ab-baseline.json]
// Runs stock orogen's pipeline through the shell, compares each preview with each final on the L0 reference mesh, and writes
// the compact baseline (the ten Q7 metrics). Full per-run results go to tools/tuning/results/ab/ (gitignored).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runAb } from './ab.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const list = (s) => s.split(',').map(Number);
const seeds = list(arg('seeds', '1,777,12345'));
const previews = list(arg('previews', '50000,200000'));
const finals = list(arg('finals', '1000000,2560000'));
const outFile = path.resolve(HERE, '..', arg('out', 'ab-baseline.json'));

/** The ten Q7 metrics of one preview-vs-final comparison. */
export function q7(c) {
  return {
    landIoU: c.landIoU.ref20k,
    landIoU1deg: c.landIoU.grid1deg,
    coastP95PreviewCells: c.coastline.p95PreviewCells,
    coastP95Km: c.coastline.p95Km,
    koppenAgreement: c.koppenAgreement.ref20k,
    precipCorrelationLand: c.precipCorrelation.land,
    mountainIoU: c.mountains.iou,
    hypsometryKS: c.hypsometryKS.land,
    basinsMatchedAt50: c.majorBasins.matchedAt50,
    basinMeanIoU: c.majorBasins.meanIoU,
    // Checkpoint 2 additions
    hypsometryKSNative: c.hypsometryKS.landNative,
    koppenAgreement1deg: c.koppenAgreement.grid1deg,
    riverMouthMeanKm: c.majorBasins.mouthDistanceKm.mean,
    riverMouthMedianKm: c.majorBasins.mouthDistanceKm.median,
  };
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE }).toString().trim();
const baseline = {
  _note: 'Q7 baseline of stock orogen run through the shell (Phase 4a). Reference = L0 (orogen coarse mesh, seed+137). No gate yet: Phase 4b defines regression against this file.',
  commit, previews, finals, refMode: 'L0', seeds: {},
};
fs.mkdirSync(path.join(HERE, '..', 'results', 'ab'), { recursive: true });
for (const seed of seeds) {
  const Ns = [...previews, ...finals].sort((a, b) => a - b);
  const r = await runAb({ seed, Ns, refMode: 'L0', finals, onLog: (m) => console.error(m) });
  fs.writeFileSync(path.join(HERE, '..', 'results', 'ab', `ab-s${seed}.json`), JSON.stringify(r, null, 1));
  baseline.seeds[seed] = { runs: r.runs, vsFinal: {} };
  for (const f of finals) {
    baseline.seeds[seed].vsFinal[f] = {};
    for (const c of r.vsFinal[f]) if (previews.includes(c.preview)) baseline.seeds[seed].vsFinal[f][c.preview] = q7(c);
  }
}
fs.writeFileSync(outFile, JSON.stringify(baseline, null, 1) + '\n');
console.error(`wrote ${outFile}`);
