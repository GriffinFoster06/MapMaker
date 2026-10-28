// Provenance: ported from upstream/VPLanet src/distorb.c at dd55da7 (MIT); see PROVENANCE.md.
// Port of DistOrb's dense eigen routines on flat row-major n x n matrices: BalanceMatrix (:2660), HessReduce (:2622),
// HessEigen (:2422, the Numerical Recipes hqr algorithm), and the inverse-iteration eigenvectors of FindEigenVecEcc (:2811).
import { dmath } from '@mapmaker/core';
import { EPS } from '../poise/constants.js';
import { luDecompose, luSolve } from '../poise/lu.js';

const fiSign = (x: number): number => (Math.abs(x) > EPS ? Math.trunc(x / Math.abs(x)) : 0);
const f32 = Math.fround;

/** Row/column scaling so row and column norms are comparable (in place). */
export function balanceMatrix(a: Float64Array, n: number): void {
  let end = false;
  while (!end) {
    for (let i = 0; i < n; i++) {
      let rown = 0.0;
      let coln = 0.0;
      for (let j = 0; j < n; j++) {
        rown += a[i * n + j]! * a[i * n + j]!;
        coln += a[j * n + i]! * a[j * n + i]!;
      }
      rown = dmath.pow(rown, 0.5);
      coln = dmath.pow(coln, 0.5);
      const factor = Math.sqrt(rown / coln);
      for (let j = 0; j < n; j++) {
        a[i * n + j] = a[i * n + j]! / factor;
        a[j * n + i] = a[j * n + i]! * factor;
      }
      if (factor * coln * factor * coln + (rown / factor) * rown / factor > 0.95 * (coln * coln + rown * rown)) end = true;
    }
  }
}

function rowSwap(m: Float64Array, n: number, i: number, j: number): void {
  for (let k = 0; k < n; k++) {
    const d = m[i * n + k]!;
    m[i * n + k] = m[j * n + k]!;
    m[j * n + k] = d;
  }
}
function colSwap(m: Float64Array, n: number, i: number, j: number): void {
  for (let k = 0; k < n; k++) {
    const d = m[k * n + i]!;
    m[k * n + i] = m[k * n + j]!;
    m[k * n + j] = d;
  }
}

/** Reduce to upper Hessenberg form by elimination with pivoting (in place). */
export function hessReduce(a: Float64Array, n: number): void {
  for (let r = 0; r < n; r++) {
    let max = 0;
    let rmax = r + 1;
    for (let rp = r + 1; rp < n; rp++) {
      if (Math.abs(a[rp * n + r]!) > max) {
        max = Math.abs(a[rp * n + r]!);
        rmax = rp;
      }
    }
    if (max) {
      rowSwap(a, n, rmax, r + 1);
      colSwap(a, n, rmax, r + 1);
      for (let i = r + 2; i < n; i++) {
        const f = a[i * n + r]! / a[(r + 1) * n + r]!;
        for (let j = 0; j < n; j++) a[i * n + j] = a[i * n + j]! - f * a[(r + 1) * n + j]!;
        for (let j = 0; j < n; j++) a[j * n + (r + 1)] = a[j * n + (r + 1)]! + f * a[j * n + i]!;
      }
    }
  }
}

/** All eigenvalues of an upper Hessenberg matrix (destroyed). Returns the real and imaginary parts. */
export function hessEigen(a: Float64Array, n: number): { real: Float64Array; imag: Float64Array } {
  const A = (i: number, j: number): number => a[i * n + j]!;
  const set = (i: number, j: number, v: number): void => { a[i * n + j] = v; };
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  let anorm = Math.abs(A(0, 0));
  for (let i = 1; i <= n - 1; i++) for (let j = i - 1; j <= n - 1; j++) anorm += Math.abs(A(i, j));

  let size = n - 1;
  let exshift = 0.0;
  let m = 0, smallsub = 0;
  let p = 0, q = 0, r = 0, s = 0, ulcorner = 0, lrcorner = 0, hhvector = 0, radic = 0;
  while (size >= 0) {
    let iterations = 0;
    do {
      for (smallsub = size; smallsub >= 1; smallsub--) {
        s = Math.abs(A(smallsub - 1, smallsub - 1)) + Math.abs(A(smallsub, smallsub));
        if (s === 0.0) s = anorm;
        const cond = Math.abs(A(smallsub, smallsub - 1)) + s;
        if (f32(cond) === f32(s)) break;
      }
      lrcorner = A(size, size);
      if (smallsub === size) {
        real[size] = lrcorner + exshift;
        imag[size--] = 0.0;
      } else {
        ulcorner = A(size - 1, size - 1);
        hhvector = A(size, size - 1) * A(size - 1, size);
        if (smallsub === size - 1) {
          p = 0.5 * (ulcorner - lrcorner);
          q = p * p + hhvector;
          radic = Math.sqrt(Math.abs(q));
          lrcorner += exshift;
          if (q >= 0.0) {
            radic = p + fiSign(p) * radic;
            real[size - 1] = real[size] = lrcorner + radic;
            if (radic) real[size] = lrcorner - hhvector / radic;
            imag[size - 1] = imag[size] = 0.0;
          } else {
            real[size - 1] = real[size] = lrcorner + p;
            imag[size] = radic;
            imag[size - 1] = -radic;
          }
          size -= 2;
        } else {
          if (iterations === 30) throw new Error('Too many iterations in hessEigen');
          if (iterations === 10 || iterations === 20) {
            exshift += lrcorner;
            for (let i = 0; i <= size; i++) set(i, i, A(i, i) - lrcorner);
            s = Math.abs(A(size, size - 1)) + Math.abs(A(size - 1, size - 2));
            ulcorner = lrcorner = 0.75 * s;
            hhvector = -0.4375 * s * s;
          }
          ++iterations;
          for (m = size - 2; m >= smallsub; m--) {
            radic = A(m, m);
            r = lrcorner - radic;
            s = ulcorner - radic;
            p = (r * s - hhvector) / A(m + 1, m) + A(m, m + 1);
            q = A(m + 1, m + 1) - radic - r - s;
            r = A(m + 2, m + 1);
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === smallsub) break;
            const u = Math.abs(A(m, m - 1)) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(A(m - 1, m - 1)) + Math.abs(radic) + Math.abs(A(m + 1, m + 1)));
            if (f32(u + v) === f32(v)) break;
          }
          for (let i = m + 2; i <= size; i++) {
            set(i, i - 2, 0.0);
            if (i !== m + 2) set(i, i - 3, 0.0);
          }
          for (let k = m; k <= size - 1; k++) {
            if (k !== m) {
              p = A(k, k - 1);
              q = A(k + 1, k - 1);
              r = 0.0;
              if (k !== size - 1) r = A(k + 2, k - 1);
              if ((lrcorner = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0.0) {
                p /= lrcorner;
                q /= lrcorner;
                r /= lrcorner;
              }
            }
            const value = Math.sqrt(p * p + q * q + r * r);
            s = fiSign(p) * value;
            if (s !== 0.0) {
              if (k === m) {
                if (smallsub !== m) set(k, k - 1, -A(k, k - 1));
              } else {
                set(k, k - 1, -s * lrcorner);
              }
              p += s;
              lrcorner = p / s;
              ulcorner = q / s;
              radic = r / s;
              q /= p;
              r /= p;
              for (let j = k; j <= size; j++) {
                p = A(k, j) + q * A(k + 1, j);
                if (k !== size - 1) {
                  p += r * A(k + 2, j);
                  set(k + 2, j, A(k + 2, j) - p * radic);
                }
                set(k + 1, j, A(k + 1, j) - p * ulcorner);
                set(k, j, A(k, j) - p * lrcorner);
              }
              const mmin = size < k + 3 ? size : k + 3;
              for (let i = smallsub; i <= mmin; i++) {
                p = lrcorner * A(i, k) + ulcorner * A(i, k + 1);
                if (k !== size - 1) {
                  p += radic * A(i, k + 2);
                  set(i, k + 2, A(i, k + 2) - p * r);
                }
                set(i, k + 1, A(i, k + 1) - p * q);
                set(i, k, A(i, k) - p);
              }
            }
          }
        }
      }
    } while (smallsub < size - 1);
  }
  return { real, imag };
}

/** Eigenvector of `a` for `eigenvalue` by five rounds of normalised inverse iteration (FindEigenVecEcc). `a` is not modified. */
export function eigenVector(a: Float64Array, n: number, eigenvalue: number): Float64Array {
  const shifted = Float64Array.from(a);
  const soln = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    shifted[j * n + j] = shifted[j * n + j]! - eigenvalue;
    soln[j] = 1.0 / Math.sqrt(n);
  }
  const lu = luDecompose(shifted, n);
  for (let it = 0; it < 5; it++) {
    luSolve(lu, soln);
    let mag = 0.0;
    for (let j = 0; j < n; j++) mag += soln[j]! * soln[j]!;
    for (let j = 0; j < n; j++) soln[j] = soln[j]! / Math.sqrt(mag);
  }
  return soln;
}
