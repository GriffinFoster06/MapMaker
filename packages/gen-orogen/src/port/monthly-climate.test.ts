import { describe, expect, it } from 'vitest';
import { classifyKoppenMonthly, synthesizeMonthlyClimate } from './monthly-climate';

// Normalised temperatures as the Köppen stage reads them: (T + 45) / 90. A cell at +25 C in NH summer and -5 C in NH winter.
const norm = (c: number): number => (c + 45) / 90;
const argmax = (a: ArrayLike<number>, n: number, r: number): number => {
  let best = 0;
  for (let m = 1; m < 12; m++) if (a[r + m * n]! > a[r + best * n]!) best = m;
  return best;
};

describe('monthly climate from the solstice solves (note 11, first stage)', () => {
  const n = 2; // cell 0 land, cell 1 sea, identical solves
  const T = synthesizeMonthlyClimate([norm(25), norm(25)], [norm(-5), norm(-5)], [0.3, 0.3], [0.1, 0.1], [1, 0]);
  it('the warmest month follows the solstice by about one month on land and two at sea', () => {
    expect(argmax(T.T, n, 0)).toBe(6); // NH summer solstice index 5.13 + 1 month lag
    expect(argmax(T.T, n, 1)).toBe(7); // + 2 months
  });
  it('stays between the two solve values and reaches them near the extremes', () => {
    for (let m = 0; m < 12; m++) {
      expect(T.T[m * n]!).toBeLessThanOrEqual(25 + 1e-4);
      expect(T.T[m * n]!).toBeGreaterThanOrEqual(-5 - 1e-4);
    }
    expect(Math.max(...Array.from({ length: 12 }, (_, m) => T.T[m * n]!))).toBeGreaterThan(24.5);
    expect(Math.min(...Array.from({ length: 12 }, (_, m) => T.T[m * n]!))).toBeLessThan(-4.5);
  });
  it('precipitation is non-negative and its monthly extremes exceed the half-year means', () => {
    let hi = 0;
    for (let m = 0; m < 12; m++) {
      const p = T.P[m * n]!;
      expect(p).toBeGreaterThanOrEqual(0);
      hi = Math.max(hi, p);
    }
    expect(hi).toBeGreaterThan((0.3 * 838.5683) / 6);
  });
  it('classifies land and leaves the sea as 0', () => {
    const r = classifyKoppenMonthly([100, -100], [norm(25), norm(25)], [norm(15), norm(15)], [0.4, 0.4], [0.3, 0.3]);
    expect(r.koppen[1]).toBe(0);
    expect(r.koppen[0]).toBeGreaterThanOrEqual(1);
    expect(r.koppen[0]).toBeLessThanOrEqual(30);
  });
});
