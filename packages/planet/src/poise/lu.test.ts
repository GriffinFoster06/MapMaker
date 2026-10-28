import { describe, expect, it } from 'vitest';
import { luDecompose, luInverse, luSolve } from './lu.js';

describe('LU decomposition (VPLanet LUDecomp / LUSolve)', () => {
  it('solves a pivot-requiring system', () => {
    const a = Float64Array.from([0, 2, 1, 1, 1, 1, 4, 3, 2]);
    const b = Float64Array.from([5, 4, 12]); // x = (1, 2, 1)... check by multiplication below
    const x = Float64Array.from(b);
    luSolve(luDecompose(a, 3), x);
    for (let i = 0; i < 3; i++) {
      let s = 0;
      for (let j = 0; j < 3; j++) s += a[i * 3 + j]! * x[j]!;
      expect(Math.abs(s - b[i]!)).toBeLessThan(1e-12);
    }
  });
  it('inverse times matrix is the identity (tridiagonal 40 x 40)', () => {
    const n = 40;
    const a = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      a[i * n + i] = -2.5 - i * 0.01;
      if (i > 0) a[i * n + i - 1] = 1.0;
      if (i < n - 1) a[i * n + i + 1] = 1.1;
    }
    const inv = luInverse(luDecompose(a, n));
    let worst = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += a[i * n + k]! * inv[k * n + j]!;
        worst = Math.max(worst, Math.abs(s - (i === j ? 1 : 0)));
      }
    expect(worst).toBeLessThan(1e-12);
  });
  it('rejects a zero row', () => {
    expect(() => luDecompose(Float64Array.from([1, 2, 0, 0]), 2)).toThrow(/Singular/);
  });
  it('does not modify its input', () => {
    const a = Float64Array.from([4, 3, 6, 3]);
    const copy = Float64Array.from(a);
    luDecompose(a, 2);
    expect(Array.from(a)).toEqual(Array.from(copy));
  });
});
