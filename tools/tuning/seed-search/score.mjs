// Layout score of a seed (default-seed search). Original code. Only terms that depend on the continent layout and whose
// Earth target is verified (docs/earth-tests/EARTH_TARGETS.md): land fraction, landmass count / largest share / top-3
// share, box fill and straight-coast share. Not scored: Köppen, rivers, hypsometry, slope, mean temperature (the seed
// does not decide them or they are not independent of the generator). Same distances, tolerances and weights as
// tools/tuning/earthlike/objective-real.mjs and metrics.mjs termDistances, restricted to these terms.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAP } from '../earthlike/metrics.mjs';
import { TERMS_REAL } from '../earthlike/objective-real.mjs';
import { coastStraightness, landmasses, rasterise } from '../earthlike/shape.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LAYOUT_TERMS = ['landFrac', 'continents', 'shape'];
export const earthTargets = (N) => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'earthlike', 'targets', `earth-real-N${N}.json`), 'utf8'));

const r4 = (x) => Math.round(x * 1e4) / 1e4;

/** Layout metrics of a land mask: `raw` > 0 is land. `robust` adds the threshold-sensitivity measurements (stage B). */
export function layoutMetrics(mesh, raw, { robust = false } = {}) {
  const n = mesh.numRegions, area = mesh.cellArea_sr;
  const isLand = Uint8Array.from(raw, (e) => (e > 0 ? 1 : 0));
  let landA = 0; for (let r = 0; r < n; r++) if (isLand[r]) landA += area[r];
  const m = { landFrac: r4(landA / (4 * Math.PI)) };
  if (!(m.landFrac >= 0.1 && m.landFrac <= 0.5)) return { ...m, skipped: true };
  const ras = rasterise(mesh, isLand);
  const stats = (erode, big) => {
    const lm = landmasses(ras, 2e5, erode).sort((a, b) => b.areaKm2 - a.areaKm2);
    const tot = lm.reduce((s, x) => s + x.areaKm2, 0) || 1;
    return {
      continents: lm.filter((x) => x.areaKm2 >= big).length, top1: lm.length ? lm[0].areaKm2 / tot : 0, top3: lm.slice(0, 3).reduce((s, x) => s + x.areaKm2, 0) / tot,
      boxFill: lm.reduce((s, x) => s + x.boxFill * x.areaKm2, 0) / tot, areas: lm.slice(0, 9).map((x) => Math.round(x.areaKm2 / 1e4) / 1e2),  // Mkm2
    };
  };
  const b = stats(3, 1e6);  // the rule the targets use: 80 km erosion, landmasses of at least 1e6 km2
  Object.assign(m, { continents: b.continents, top1: r4(b.top1), top3: r4(b.top3), boxFill: r4(b.boxFill), areasMkm2: b.areas });
  const cs = coastStraightness(ras);
  m.straight = r4(cs.straight);
  if (robust) {
    // The same measurements with the two arbitrary choices moved: erosion 2 and 4 passes (40 to 120 km isthmuses) and the
    // size threshold 0.8e6 and 1.25e6 km2. A seed whose count or shares depend on them rests on a landmass at the edge.
    m.sens = {};
    for (const [id, e, big] of [['e2', 2, 1e6], ['e4', 4, 1e6], ['a08', 3, 0.8e6], ['a125', 3, 1.25e6]]) {
      const s = stats(e, big); m.sens[id] = { continents: s.continents, top1: r4(s.top1), top3: r4(s.top3), boxFill: r4(s.boxFill) };
    }
  }
  return m;
}

/** Per-term raw distances from the Earth target E (same formulas as metrics.mjs termDistances). */
export function layoutDistances(m, E) {
  if (m.skipped || !(m.landFrac >= 0.02)) return Object.fromEntries(LAYOUT_TERMS.map((k) => [k, CAP * TERMS_REAL[k].tol]));
  return {
    landFrac: Math.abs(m.landFrac - E.landFrac),
    continents: (Math.abs(Math.log2((m.continents + 0.5) / (E.continents + 0.5))) + Math.abs(m.top1 - E.top1) / 0.15 + Math.abs(m.top3 - E.top3) / 0.15) / 3,
    shape: (Math.abs(m.boxFill - E.boxFill) / 0.1 + Math.abs(m.straight - E.straight) / 0.06) / 2,
  };
}

/** Weighted mean of the capped normalised distances over the layout terms (lower is better; 1 = every term one tolerance away). */
export function layoutObjective(m, E) {
  const d = layoutDistances(m, E);
  let s = 0, w = 0; const terms = {};
  for (const k of LAYOUT_TERMS) { const { w: wk, tol } = TERMS_REAL[k]; terms[k] = Math.min(CAP, d[k] / tol); s += wk * terms[k]; w += wk; }
  return { objective: s / w, terms };
}
