// Original code (design note 10 §3.1, class c). Least-squares fit of orogen's base temperature curve
//   T(d) = PEAK - RANGE * (max(0, d - PLATEAU) / (90 - PLATEAU))^EXP,   d = |latitude| in degrees (annual mean: ITCZ at 0)
// (temperature.ts) to a zonal-mean profile, by a deterministic Nelder-Mead search with a fixed evaluation budget.
import { dmath } from '@mapmaker/core';

export interface TempCurve {
  peak: number;
  range: number;
  exp: number;
  plateau: number;
}

export function curveAt(c: TempCurve, dDeg: number): number {
  const t = Math.max(0, dDeg - c.plateau) / (90 - c.plateau);
  return c.peak - c.range * dmath.pow(t, c.exp);
}

const toVec = (c: TempCurve): number[] => [c.peak, c.range, c.exp, c.plateau];
const fromVec = (v: number[]): TempCurve => ({ peak: v[0]!, range: v[1]!, exp: v[2]!, plateau: v[3]! });

/** Fits the curve to `profileC` at `latDeg` (area weights cos(latitude)), starting from `start`. */
export function fitTempCurve(latDeg: ArrayLike<number>, profileC: ArrayLike<number>, start: TempCurve): TempCurve {
  const n = latDeg.length;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = dmath.cos((latDeg[i]! * Math.PI) / 180);
  const cost = (v: number[]): number => {
    const c = fromVec(v);
    // Keep the curve inside its meaningful range (a penalty, so the simplex stays well-defined).
    if (c.plateau < 0 || c.plateau > 60 || c.exp < 0.3 || c.exp > 4 || c.range < 1) return 1e12 + Math.abs(v[0]!) + Math.abs(v[1]!);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = curveAt(c, Math.abs(latDeg[i]!)) - profileC[i]!;
      s += w[i]! * d * d;
    }
    return s;
  };
  const x0 = toVec(start);
  const steps = [2, 4, 0.1, 2];
  const simplex: number[][] = [x0.slice()];
  for (let k = 0; k < 4; k++) {
    const v = x0.slice();
    v[k] = v[k]! + steps[k]!;
    simplex.push(v);
  }
  let f = simplex.map(cost);
  for (let iter = 0; iter < 600; iter++) {
    const order = f.map((_, i) => i).sort((p, q) => f[p]! - f[q]! || p - q);
    const s2 = order.map((i) => simplex[i]!);
    const f2 = order.map((i) => f[i]!);
    simplex.splice(0, simplex.length, ...s2);
    f = f2;
    if (Math.abs(f[4]! - f[0]!) < 1e-12) break;
    const cen = [0, 0, 0, 0].map((_, k) => (simplex[0]![k]! + simplex[1]![k]! + simplex[2]![k]! + simplex[3]![k]!) / 4);
    const pt = (t: number): number[] => cen.map((c, k) => c + t * (simplex[4]![k]! - c));
    const xr = pt(-1);
    const fr = cost(xr);
    if (fr < f[0]!) {
      const xe = pt(-2);
      const fe = cost(xe);
      if (fe < fr) {
        simplex[4] = xe;
        f[4] = fe;
      } else {
        simplex[4] = xr;
        f[4] = fr;
      }
    } else if (fr < f[3]!) {
      simplex[4] = xr;
      f[4] = fr;
    } else {
      const xc = fr < f[4]! ? pt(-0.5) : pt(0.5);
      const fc = cost(xc);
      if (fc < Math.min(fr, f[4]!)) {
        simplex[4] = xc;
        f[4] = fc;
      } else {
        for (let i = 1; i < 5; i++) {
          simplex[i] = simplex[i]!.map((x, k) => simplex[0]![k]! + 0.5 * (x - simplex[0]![k]!));
          f[i] = cost(simplex[i]!);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 5; i++) if (f[i]! < f[best]!) best = i;
  return fromVec(simplex[best]!);
}
