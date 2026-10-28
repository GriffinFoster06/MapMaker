import { describe, expect, it } from 'vitest';
import { KOPPEN_CLASSES } from './koppen';
import { classifyCellMonthly, classifyFieldMonthly } from './koppen-monthly';
import { interpolateMonths, interpolationMatrix, synthesizeCell } from './seasons';

const code = (T: number[], P: number[]): string => KOPPEN_CLASSES[classifyCellMonthly(T, P)]!.code;
// Monthly values start at the northern winter-solstice month (January on Earth).
const cos12 = (mean: number, amp: number): number[] => Array.from({ length: 12 }, (_, m) => mean - amp * Math.cos((2 * Math.PI * (m - 0.5)) / 12));

describe('monthly Köppen (Beck et al. rules)', () => {
  it('classifies canonical climates', () => {
    expect(code(Array(12).fill(27), Array(12).fill(200))).toBe('Af'); // Singapore-like
    expect(code(cos12(22, 8), Array(12).fill(2))).toBe('BWh'); // Cairo-like
    expect(code(cos12(11, 6), Array(12).fill(55))).toBe('Cfb'); // London-like
    expect(code(cos12(5, 13), Array(12).fill(55))).toBe('Dfb'); // Moscow-like (Thot 18, five months above 10 C)
    expect(code(cos12(16, 8), [90, 70, 60, 40, 20, 5, 1, 3, 25, 60, 80, 95])).toBe('Csa'); // Mediterranean
    expect(code(cos12(-12, 14), Array(12).fill(20))).toBe('ET'); // Thot below 10 C but above 0
    expect(code(Array(12).fill(-30), Array(12).fill(10))).toBe('EF');
    expect(code(cos12(27, 3), [2, 1, 3, 20, 120, 400, 700, 600, 350, 120, 20, 5])).toBe('Aw'); // dry winter savanna
  });
  it('swapping the hemisphere (a six-month shift) does not change the class', () => {
    const T = cos12(11, 6), P = [80, 60, 50, 45, 40, 40, 38, 42, 50, 65, 75, 85];
    const shift = (a: number[]): number[] => [...a.slice(6), ...a.slice(0, 6)];
    expect(code(shift(T), shift(P))).toBe(code(T, P));
  });
  it('every sampled climate maps to a valid land class and the field classifier masks sea', () => {
    for (let mean = -35; mean <= 32; mean += 3) for (let amp = 0; amp <= 20; amp += 5) for (const wet of [3, 20, 60, 150, 300]) {
      const id = classifyCellMonthly(cos12(mean, amp), Array.from({ length: 12 }, (_, m) => wet * (1 + 0.8 * Math.sin(m))));
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(30);
    }
    const n = 3, T = new Float32Array(12 * n), P = new Float32Array(12 * n);
    for (let m = 0; m < 12; m++) for (let c = 0; c < n; c++) { T[c + m * n] = 27; P[c + m * n] = 200; }
    const out = classifyFieldMonthly(T, P, n, [1, 0, 1]);
    expect(Array.from(out)).toEqual([1, 0, 1]);
  });
});

describe('anchor-to-month interpolation (note 11 §3.2)', () => {
  it('passes exactly through the anchors', () => {
    const a = [3, -1, 7, 2, 5, 0];
    const out = new Float64Array(12);
    interpolateMonths(a, 0, out);
    for (let k = 0; k < 6; k++) expect(out[2 * k]!).toBeCloseTo(a[k]!, 12);
  });
  it('reproduces a pure annual harmonic exactly from four anchors, with a phase', () => {
    const phase = 1.5, f = (m: number): number => 10 + 6 * Math.cos((2 * Math.PI * (m - 4)) / 12);
    const anchors = [0, 1, 2, 3].map((k) => f(phase + 3 * k));
    const out = new Float64Array(12);
    interpolateMonths(anchors, phase, out);
    for (let m = 0; m < 12; m++) expect(out[m]!).toBeCloseTo(f(m), 10);
  });
  it('keeps a constant constant and has rows that sum to one', () => {
    const M = interpolationMatrix(6, 0.7);
    for (let m = 0; m < 12; m++) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += M[m * 6 + k]!;
      expect(s).toBeCloseTo(1, 12);
    }
  });
  it('precipitation stays non-negative and dry seasons stay dry through the transform', () => {
    const T12 = new Float64Array(12), P12 = new Float64Array(12);
    synthesizeCell([20, 22, 25, 22, 20, 18], [0, 0, 400, 800, 400, 0], { transform: 'sqrt' }, T12, P12);
    for (const p of P12) expect(p).toBeGreaterThanOrEqual(0);
    expect(P12[0]!).toBeCloseTo(0, 9);
  });
});
