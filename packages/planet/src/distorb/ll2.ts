// Provenance: ported from upstream/VPLanet src/distorb.c at dd55da7 (MIT); see PROVENANCE.md.
// DistOrb's LL2 model: the Laplace-Lagrange secular solution of the planets' eccentricity and inclination vectors as a sum of
// eigenmodes (SolveEigenVal :2891, ScaleEigenVec :2951, fndABmatrix :2348, fndGRCorrMatrix :2396, fndLaplaceCoeff :3278,
// fndDerivLaplaceCoeff :3314, fndDistOrbLL2Hecc ... :6692). Planets are 0-based here; VPLanet's body 0 is the star.
// Not ported: the invariable-plane rotation (inv_plane, default off) and the eqtide-coupled eigenvalue recalculation.
import { dmath } from '@mapmaker/core';
import { AUM, DAYSEC, KGAUSS, LIGHTSPEED, MSUN } from '../poise/constants.js';
import { luDecompose, luSolve } from '../poise/lu.js';
import { balanceMatrix, eigenVector, hessEigen, hessReduce } from './eigen.js';

/** Laplace coefficient b_s^(j)(alpha) by the series of Murray & Dermott (6.68), as VPLanet does. */
export function laplaceCoeff(alpha: number, j: number, s: number): number {
  let fac = 1.0;
  let sum = 1.0;
  let term = 1.0;
  let n = 1;
  if (j === 1) fac = s * alpha;
  else for (let k = 1; k <= j; k++) fac *= ((s + k - 1.0) / k) * alpha;
  while (term >= 1.0e-15 * sum) {
    term = 1.0;
    for (let k = 1; k <= n; k++) term *= (((s + k - 1.0) * (s + j + k - 1.0)) / (k * (j + k))) * alpha * alpha;
    sum += term;
    n++;
  }
  return 2.0 * fac * sum;
}

/** n-th derivative of a Laplace coefficient with respect to alpha (recursive scheme of VPLanet). */
export function derivLaplaceCoeff(nth: number, alpha: number, j: number, s: number): number {
  if (nth === 1) {
    return s * (laplaceCoeff(alpha, Math.abs(j - 1), s + 1.0) - 2 * alpha * laplaceCoeff(alpha, j, s + 1.0) + laplaceCoeff(alpha, j + 1, s + 1.0));
  }
  if (nth === 2) {
    return s * (derivLaplaceCoeff(1, alpha, Math.abs(j - 1), s + 1.0) - 2 * alpha * derivLaplaceCoeff(1, alpha, j, s + 1.0) +
      derivLaplaceCoeff(1, alpha, j + 1, s + 1.0) - 2 * laplaceCoeff(alpha, j, s + 1.0));
  }
  return s * (derivLaplaceCoeff(nth - 1, alpha, Math.abs(j - 1), s + 1.0) - 2 * alpha * derivLaplaceCoeff(nth - 1, alpha, j, s + 1.0) +
    derivLaplaceCoeff(nth - 1, alpha, j + 1, s + 1.0) - 2 * (nth - 1) * derivLaplaceCoeff(nth - 2, alpha, j, s + 1.0));
}

/** A planet's osculating elements and mass; SI mass and semi-major axis, radians. `inc` is the inclination. */
export interface Ll2Planet {
  mass: number; // kg
  semi: number; // m
  ecc: number;
  inc: number;
  longP: number;
  longA: number;
}

export interface Ll2System {
  n: number; // planets
  eigenValEcc: Float64Array; // rad/yr
  eigenValInc: Float64Array;
  eigenVecEcc: Float64Array; // [planet * n + mode], scaled to the initial conditions
  eigenVecInc: Float64Array;
  phaseEcc: Float64Array;
  phaseInc: Float64Array;
}

function meanMotion(starMass: number, p: Ll2Planet): number {
  const a = p.semi / AUM;
  return KGAUSS * Math.sqrt((starMass + p.mass) / MSUN / (a * a * a));
}

/** Component of the A or B matrix, rad/yr (fndABmatrix). */
function abMatrix(star: number, pl: Ll2Planet[], j: number, jb: number, kb: number): number {
  const pj = pl[jb]!;
  const pk = pl[kb]!;
  let alpha: number;
  let abar: number;
  if (pj.semi > pk.semi) {
    alpha = pk.semi / pj.semi;
    abar = 1.0;
  } else if (pj.semi < pk.semi) {
    alpha = pj.semi / pk.semi;
    abar = alpha;
  } else throw new Error('ll2: two planets share a semi-major axis');
  const n = meanMotion(star, pj);
  const b = laplaceCoeff(alpha, j, 1.5);
  return (n / 4.0) * (pk.mass / (star + pj.mass)) * alpha * abar * b * 365.25;
}

/** Post-Newtonian apsidal precession added to A's diagonal, rad/yr (fndGRCorrMatrix). */
function grCorr(star: number, p: Ll2Planet, hecc: number, kecc: number): number {
  const n = meanMotion(star, p);
  const a = p.semi / AUM;
  const c = (LIGHTSPEED / AUM) * DAYSEC;
  return ((3 * n * n * n * a * a) / (c * c * (1.0 - hecc * hecc - kecc * kecc))) * 365.25;
}

/** Solve the LL2 problem for a star of `starMass` (kg) and planets ordered as given. */
export function ll2Solve(starMass: number, planets: Ll2Planet[], grCorrection = true): Ll2System {
  const n = planets.length;
  const A = new Float64Array(n * n);
  const B = new Float64Array(n * n);
  const h0 = planets.map((p) => p.ecc * dmath.sin(p.longP));
  const k0 = planets.map((p) => p.ecc * dmath.cos(p.longP));
  const sinc = planets.map((p) => dmath.sin(0.5 * p.inc));
  const build = (): void => {
    A.fill(0);
    B.fill(0);
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        if (j !== k) {
          A[j * n + j] = A[j * n + j]! + abMatrix(starMass, planets, 1, j, k);
          A[j * n + k] = -abMatrix(starMass, planets, 2, j, k);
          B[j * n + j] = B[j * n + j]! - abMatrix(starMass, planets, 1, j, k);
          B[j * n + k] = abMatrix(starMass, planets, 1, j, k);
        }
      }
      if (grCorrection) A[j * n + j] = A[j * n + j]! + grCorr(starMass, planets[j]!, h0[j]!, k0[j]!);
    }
  };

  // Pass 0: balance, reduce to Hessenberg form and find the eigenvalues. Later passes rebuild the matrices and find vectors.
  build();
  const Aeig = Float64Array.from(A);
  const Beig = Float64Array.from(B);
  balanceMatrix(Aeig, n);
  hessReduce(Aeig, n);
  balanceMatrix(Beig, n);
  hessReduce(Beig, n);
  const valEcc = hessEigen(Aeig, n).real;
  const valInc = hessEigen(Beig, n).real;
  const vecEcc = new Float64Array(n * n);
  const vecInc = new Float64Array(n * n);
  for (let m = 0; m < n; m++) {
    const ve = eigenVector(A, n, valEcc[m]!);
    const vi = eigenVector(B, n, valInc[m]!);
    for (let j = 0; j < n; j++) {
      vecEcc[j * n + m] = ve[j]!;
      vecInc[j * n + m] = vi[j]!;
    }
  }

  // Scale the eigenvectors to the initial conditions (ScaleEigenVec).
  const p0 = planets.map((p, i) => sinc[i]! * dmath.sin(p.longA));
  const q0 = planets.map((p, i) => sinc[i]! * dmath.cos(p.longA));
  const solveFor = (vec: Float64Array, a: number[], b: number[]): { x: Float64Array; y: Float64Array } => {
    const lu = luDecompose(vec, n);
    const x = Float64Array.from(a);
    const y = Float64Array.from(b);
    luSolve(lu, x);
    luSolve(lu, y);
    return { x, y };
  };
  const e = solveFor(vecEcc, h0, k0);
  const inc = solveFor(vecInc, p0, q0);
  const phaseEcc = new Float64Array(n);
  const phaseInc = new Float64Array(n);
  for (let m = 0; m < n; m++) {
    const S = Math.sqrt(e.x[m]! * e.x[m]! + e.y[m]! * e.y[m]!);
    const T = Math.sqrt(inc.x[m]! * inc.x[m]! + inc.y[m]! * inc.y[m]!);
    for (let j = 0; j < n; j++) {
      vecEcc[j * n + m] = vecEcc[j * n + m]! * S;
      vecInc[j * n + m] = vecInc[j * n + m]! * T;
    }
    phaseEcc[m] = dmath.atan2(e.x[m]!, e.y[m]!);
    phaseInc[m] = dmath.atan2(inc.x[m]!, inc.y[m]!);
  }
  return { n, eigenValEcc: valEcc, eigenValInc: valInc, eigenVecEcc: vecEcc, eigenVecInc: vecInc, phaseEcc, phaseInc };
}

export interface Ll2State {
  h: number; // e sin(longP)
  k: number; // e cos(longP)
  p: number; // sin(inc/2) sin(longA)
  q: number; // sin(inc/2) cos(longA)
  dhdt: number; // per year
  dkdt: number;
  dpdt: number;
  dqdt: number;
}

/** The orbital vectors of planet `i` (0-based) at `tYears` after the epoch, with their time derivatives (per year). */
export function ll2Evaluate(sys: Ll2System, i: number, tYears: number): Ll2State {
  const n = sys.n;
  const s: Ll2State = { h: 0, k: 0, p: 0, q: 0, dhdt: 0, dkdt: 0, dpdt: 0, dqdt: 0 };
  for (let m = 0; m < n; m++) {
    const ve = sys.eigenVecEcc[i * n + m]!;
    const vi = sys.eigenVecInc[i * n + m]!;
    const ae = sys.eigenValEcc[m]! * tYears + sys.phaseEcc[m]!;
    const ai = sys.eigenValInc[m]! * tYears + sys.phaseInc[m]!;
    s.h += ve * dmath.sin(ae);
    s.k += ve * dmath.cos(ae);
    s.p += vi * dmath.sin(ai);
    s.q += vi * dmath.cos(ai);
    s.dhdt += ve * sys.eigenValEcc[m]! * dmath.cos(ae);
    s.dkdt -= ve * sys.eigenValEcc[m]! * dmath.sin(ae);
    s.dpdt += vi * sys.eigenValInc[m]! * dmath.cos(ai);
    s.dqdt -= vi * sys.eigenValInc[m]! * dmath.sin(ai);
  }
  return s;
}

/** Eccentricity, inclination (rad), longitude of pericentre and of the ascending node (rad). */
export function ll2Elements(st: Ll2State): { ecc: number; inc: number; longP: number; longA: number } {
  return {
    ecc: Math.sqrt(st.h * st.h + st.k * st.k),
    inc: 2.0 * dmath.asin(Math.sqrt(st.p * st.p + st.q * st.q)),
    longP: dmath.atan2(st.h, st.k),
    longA: dmath.atan2(st.p, st.q),
  };
}
