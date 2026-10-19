// Distortion of a projection at a point (ARCHITECTURE §3.7, "Distortion" and "Evaluation at and near the poles").
// Original shell code after the standard theory of the Tissot indicatrix (Snyder, "Map Projections: A Working Manual",
// USGS PP 1395, 1987, §4). Computed from the projection only; never applied to data.
//
// J' is the Jacobian of the raw projection (unit sphere) with respect to arc length, in the geographic tangent frame
// at the point: column 1 along local east, column 2 along local north. Then, with a ≥ b its singular values,
//   areal scale = a·b,  maximum angular deformation ω = 2·asin((a − b)/(a + b)),  k = |J'·east|,  h = |J'·north|.
// The east/north frame is built from the point's longitude, so it is a valid orthonormal tangent frame even at a
// geographic pole (where it is the frame along the meridian λ): rule 1 of §3.7 needs no cos φ term. J' comes from
// central differences of the raw projection after the view's rotation, with the perturbed longitude unwrapped against
// the point's, so the antimeridian of the raw frame is no seam. Values are rotation-invariant except h and k, which
// stay tied to geographic meridians and parallels. The stencil is the five-point one, error O(δ⁴), and latitudes of
// perturbed points come from atan2(z, √(x² + y²)), which stays accurate next to a pole where asin(z) does not.
//
// At a raw pole (|φ_raw| = 90°) of a line or cusp projection, the projection is not differentiable; values are the
// limit along the raw meridian (§3.7 rule 2): closed forms where the registry declares them (an equal-area projection's
// areal scale is 1; equirectangular h = 1, k = ∞), otherwise a one-sided extrapolation from 90° − δ, 90° − δ/2 and
// 90° − δ/4 (δ = 1e-3 rad, rule 3). A divergent limit is +Infinity with `singular` set; NaN is never returned.
// Deviation from rule 3 as written: the extrapolation estimates its order from the three samples (Richardson with
// unknown exponent, i.e. Aitken's Δ² process: exact for L + C·δ^p, any p), and "divergent" means the estimated p is
// negative (successive differences grow). The fixed-ratio test of rule 3 ("grows by more than 2× per halving") misses
// slow divergences such as Mollweide's k ∝ δ^(−1/3) at its cusp, and integer-order Richardson mis-extrapolates its
// fractional powers; both were measured (k = 19.46 reported instead of ∞).
import { dmath } from '@mapmaker/core';
import type { ProjectionView } from './view';

export interface DistortionValues {
  outside: false;
  /** Areal scale a·b. */
  areal: number;
  /** Maximum angular deformation ω, degrees. */
  omega: number;
  /** Meridian scale h and parallel scale k. */
  h: number;
  k: number;
  /** Singular values of J', a ≥ b (limits at a singular pole: a = ∞; b as described at poleValues). */
  a: number;
  b: number;
  /** A reported value is the +Infinity of a divergent limit. */
  singular: boolean;
  /** The value is a limit at a raw pole of a line or cusp projection. */
  poleLimit: boolean;
}

export type Distortion = DistortionValues | { outside: true };

const RAD = Math.PI / 180;
/** Central-difference step δ (radians of arc); near a line or cusp pole, at most 5e-4 of the distance to it. */
export const DIFF_STEP = 1e-5;
/** Points closer than this to a raw pole of a line or cusp projection are evaluated as the pole (radians). */
export const POLE_EPS = 1e-7;
/** Relative size below which successive pole samples count as settled (extrapolate). */
export const SETTLED = 1e-8;
/** Richardson base step δ (rule 3). */
export const RICHARDSON_STEP = 1e-3;

/** Distortion of `view` at a geographic point (degrees). */
export function distortion(view: ProjectionView, lon: number, lat: number): Distortion {
  if (!view.inDomain(lon, lat)) return { outside: true };
  const [rlon, rlat] = view.toRaw([lon, lat]);
  const toPole = (90 - Math.abs(rlat)) * RAD;
  const cls = view.spec.poleClass;
  if ((cls === 'line' || cls === 'cusp') && toPole < POLE_EPS) return poleValues(view, rlon, rlat < 0 ? -1 : 1);
  // Near a line or cusp pole, keep the stencil on this side of it.
  const step = (cls === 'line' || cls === 'cusp') ? Math.min(DIFF_STEP, toPole * 5e-4) : DIFF_STEP;
  return fromJacobian(jacobian(view, lon, lat, rlon, step), false);
}

/** J' as [xe, ye, xn, yn]: the raw projection's derivatives along local east and north per radian of arc. */
export function jacobian(view: ProjectionView, lon: number, lat: number, rlon: number, step = DIFF_STEP): [number, number, number, number] {
  const l = lon * RAD, f = lat * RAD;
  const cl = dmath.cos(l), sl = dmath.sin(l), cf = dmath.cos(f), sf = dmath.sin(f);
  const p = [cf * cl, cf * sl, sf], e = [-sl, cl, 0], n = [-sf * cl, -sf * sl, cf];
  const raw = view.raw, scale = view.spec.rawScale ?? 1;
  const at = (s: number, t: number): [number, number] => {
    const x = p[0]! + s * e[0]! + t * n[0]!, y = p[1]! + s * e[1]! + t * n[1]!, z = p[2]! + s * e[2]! + t * n[2]!;
    const g: [number, number] = [dmath.atan2(y, x) / RAD, dmath.atan2(z, Math.sqrt(x * x + y * y)) / RAD];
    const [ql, qf] = view.toRaw(g);
    let d = ql - rlon;
    d -= 360 * Math.round(d / 360);
    return raw((rlon + d) * RAD, qf * RAD);
  };
  // Five-point stencil: f'(0) ≈ (8(f(δ) − f(−δ)) − (f(2δ) − f(−2δ))) / 12δ.
  const d5 = (g: (u: number) => [number, number]): [number, number] => {
    const [a1, b1] = g(step), [a0, b0] = g(-step), [a3, b3] = g(2 * step), [a2, b2] = g(-2 * step);
    const inv = scale / (12 * step);
    return [(8 * (a1 - a0) - (a3 - a2)) * inv, (8 * (b1 - b0) - (b3 - b2)) * inv];
  };
  const [xe, ye] = d5((u) => at(u, 0)), [xn, yn] = d5((u) => at(0, u));
  return [xe, ye, xn, yn];
}

function fromJacobian([xe, ye, xn, yn]: [number, number, number, number], poleLimit: boolean): DistortionValues {
  const k = dmath.hypot(xe, ye), h = dmath.hypot(xn, yn);
  const areal = Math.abs(xe * yn - xn * ye);
  // Singular values of [[xe, xn], [ye, yn]] in closed form: with Q = |conformal part| and R = |anticonformal part|,
  // a = Q + R and b = |Q − R|, so a − b = 2·min(Q, R) is computed without cancellation (conformal maps give R ≈ 0).
  const Q = 0.5 * dmath.hypot(xe + yn, ye - xn), R = 0.5 * dmath.hypot(xe - yn, ye + xn);
  const a = Q + R, b = Math.abs(Q - R);
  return { outside: false, areal, omega: omegaOf(a, b), h, k, a, b, singular: false, poleLimit };
}

/** ω in degrees; a − b is clamped at 0, since rounding can leave a hair below b when they are equal. */
const omegaOf = (a: number, b: number) => (a + b > 0 ? (2 * dmath.asin(Math.min(1, Math.max(0, a - b) / (a + b)))) / RAD : 0);

/** Limits at a raw pole of a line or cusp projection, along the raw meridian `rlon` (degrees); `sign` ±1. */
function poleValues(view: ProjectionView, rlon: number, sign: number): DistortionValues {
  const decl = view.spec.poleLimit ?? {};
  const samples = [1, 0.5, 0.25].map((f) => {
    const g = view.toRaw.invert([rlon, sign * (90 - (RICHARDSON_STEP * f) / RAD)]);
    const [gl, gf] = g;
    return fromJacobian(jacobian(view, gl, gf, rlon, Math.min(DIFF_STEP, RICHARDSON_STEP * f * 5e-4)), true);
  });
  const limit = (q: (d: DistortionValues) => number): number => extrapolate(...(samples.map(q) as [number, number, number]));
  const h = decl.h ?? limit((d) => d.h);
  const k = decl.k ?? limit((d) => d.k);
  const areal = view.spec.equalArea ? 1 : limit((d) => d.areal);
  let a: number, b: number, omega: number;
  if (Number.isFinite(h) && Number.isFinite(k) && Number.isFinite(areal)) {
    // a, b and ω from their own samples: ω computed from extrapolated h, k and areal amplifies their last digits
    // where a ≈ b (measured: 0.04° at the sinusoidal pole, where the limit is 0).
    a = limit((d) => d.a);
    b = Math.min(a, limit((d) => d.b));
    omega = Math.min(180, limit((d) => d.omega));
  } else {
    // a → ∞. b → areal/a → 0 when the areal scale stays finite, otherwise to the finite one of h and k (both ∞: ∞).
    // ω → 180° whenever a scale diverges (§3.7: k → ∞ with h finite).
    a = Infinity;
    b = Number.isFinite(areal) ? 0 : Math.min(h, k);
    omega = 180;
  }
  const singular = !Number.isFinite(h) || !Number.isFinite(k) || !Number.isFinite(areal);
  return { outside: false, areal, omega, h, k, a, b, singular, poleLimit: true };
}

/**
 * Limit at δ → 0 of samples f(δ), f(δ/2), f(δ/4) under f = L + C·δ^p: Aitken's Δ², L = f3 − d2²/(d2 − d1), with
 * d1 = f2 − f1 and d2 = f3 − f2, whose ratio d1/d2 = 2^p. Returns +Infinity when p < 0 (differences of one sign that
 * grow), the last sample when the sequence has settled or oscillates, and never a negative value (all inputs are
 * scales).
 */
export function extrapolate(f1: number, f2: number, f3: number): number {
  const d1 = f2 - f1, d2 = f3 - f2;
  // Settled: both differences at the noise level of the five-point derivatives (≈ 1e-10 relative, measured).
  const tol = SETTLED * Math.max(Math.abs(f1), Math.abs(f2), Math.abs(f3), 1e-300);
  if (Math.abs(d1) <= tol && Math.abs(d2) <= tol) return Math.max(0, f3);
  if (d1 * d2 <= 0) return Math.max(0, f3);
  if (Math.abs(d2) > Math.abs(d1)) return d2 > 0 ? Infinity : 0;
  return Math.max(0, f3 - (d2 * d2) / (d2 - d1));
}
