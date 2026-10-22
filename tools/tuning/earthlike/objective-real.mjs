// Objective against the independent Earth targets (decision P6). Original code. Terms reuse metrics.mjs's distances;
// mean temperature is added because the model's temperature is in °C. `verified` terms have targets measured from
// independent data on the same mesh (Natural Earth, ETOPO 2022, Kottek et al.) or, for mean temperature, the
// literature value; river statistics are derived by our own drainage on the DEM (no observed river data in the repo),
// so they are reported but not scored.
import { CAP, termDistances } from './metrics.mjs';

export const TERMS_REAL = {
  landFrac:   { w: 2,   tol: 0.04, verified: true,  source: 'Natural Earth 10m land on the mesh' },
  hypsometry: { w: 2,   tol: 400,  verified: true,  source: 'ETOPO 2022 cell means, land' },
  slope:      { w: 1,   tol: 0.4,  verified: true,  source: 'ETOPO 2022 cell means, land' },
  continents: { w: 1.5, tol: 1,    verified: true,  source: 'Natural Earth on the mesh, 80 km erosion' },
  koppen:     { w: 2,   tol: 0.15, verified: true,  source: 'Kottek et al. at the cell centres' },
  shape:      { w: 1.5, tol: 1,    verified: true,  source: 'Natural Earth on the mesh' },
  meanT:      { w: 1,   tol: 1,    verified: true,  source: 'literature, 14 to 15 °C (Jones et al. 1999)' },
  rivers:     { w: 1,   tol: 0.35, verified: false, source: 'own drainage on ETOPO cell means' },
};
export const SCORED = Object.keys(TERMS_REAL).filter((k) => TERMS_REAL[k].verified);
/** Terms whose target is not computed from data in the repo or whose definition is ours: dropped in a robustness variant. */
export const LESS_CERTAIN = ['meanT', 'shape'];

/** Raw distances per term (metrics.mjs termDistances plus |mean T − Earth|). */
export function distancesReal(m, E) {
  const d = termDistances(m, E);
  d.meanT = Number.isFinite(m.meanT) ? Math.abs(m.meanT - E.meanT) : CAP * TERMS_REAL.meanT.tol;
  if (!(m.landFrac >= 0.02)) d.meanT = CAP * TERMS_REAL.meanT.tol;
  return d;
}

/** Objective over `terms` with optional weight and tolerance factors per term: { objective, terms (normalised) }. */
export function objectiveReal(d, { terms = SCORED, wf = {}, tf = {} } = {}) {
  let s = 0, w = 0; const t = {};
  for (const k of Object.keys(TERMS_REAL)) {
    const { w: wk, tol } = TERMS_REAL[k];
    t[k] = Math.min(CAP, d[k] / (tol * (tf[k] ?? 1)));
    if (terms.includes(k)) { s += wk * (wf[k] ?? 1) * t[k]; w += wk * (wf[k] ?? 1); }
  }
  return { objective: s / w, terms: t };
}

/** The robustness variants of step 5: each scored term's weight and tolerance ×0.5 and ×2, all tolerances ×0.5 and ×2, less-certain terms removed. */
export function variants() {
  const out = [{ id: 'base' }];
  for (const k of SCORED) for (const f of [0.5, 2]) { out.push({ id: `w.${k}x${f}`, wf: { [k]: f } }); out.push({ id: `tol.${k}x${f}`, tf: { [k]: f } }); }
  for (const f of [0.5, 2]) out.push({ id: `tol.allx${f}`, tf: Object.fromEntries(SCORED.map((k) => [k, f])) });
  out.push({ id: 'drop.lessCertain', terms: SCORED.filter((k) => !LESS_CERTAIN.includes(k)) });
  return out;
}
