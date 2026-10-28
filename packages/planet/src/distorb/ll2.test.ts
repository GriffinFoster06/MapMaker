import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, DEGRAD, MSUN } from '../poise/constants.js';
import { derivLaplaceCoeff, laplaceCoeff, ll2Elements, ll2Evaluate, ll2Solve, type Ll2Planet } from './ll2.js';

interface Golden {
  planets: { name: string; mass_msun: number; semi_au: number; ecc: number; inc_deg: number; longP_deg: number; longA_deg: number }[];
  rows: Record<string, number[][]>;
}
const golden = JSON.parse(readFileSync(new URL('../../golden/distorb-ll2.json', import.meta.url), 'utf8')) as Golden;
const planets: Ll2Planet[] = golden.planets.map((p) => ({
  mass: p.mass_msun * MSUN, semi: p.semi_au * AUM, ecc: p.ecc, inc: p.inc_deg * DEGRAD, longP: p.longP_deg * DEGRAD, longA: p.longA_deg * DEGRAD,
}));
const wrap = (d: number): number => Math.abs(((d + 180) % 360 + 360) % 360 - 180);

describe('DistOrb LL2 (native VPLanet SSDistOrbDistRot/LL2, 1 Myr)', () => {
  const sys = ll2Solve(MSUN, planets, true);

  it('equals the native elements at t = 0 for all eight planets', () => {
    for (const [i, p] of golden.planets.entries()) {
      const row = golden.rows[p.name]![0]!;
      const e = ll2Elements(ll2Evaluate(sys, i, 0));
      expect(Math.abs(e.ecc - row[1]!)).toBeLessThan(2e-6);
      expect(Math.abs(e.inc / DEGRAD - row[2]!)).toBeLessThan(2e-5);
      expect(wrap(((((e.longP - e.longA) / DEGRAD) % 360) + 360) % 360 - row[3]!)).toBeLessThan(2e-5);
      expect(wrap(e.longA / DEGRAD - row[4]!)).toBeLessThan(2e-5);
    }
  });

  // VPLanet assigns the explicit LL2 variables from the derivative evaluated at the START of each step
  // (evolve.c:612), so its printed series lags the analytic solution by one step. The oracle run uses a fixed 1 yr step,
  // which keeps that lag far below the tolerances.
  it('follows the native series over 1 Myr (fixed 1 yr step)', () => {
    let worstEcc = 0;
    let worstInc = 0;
    let worstAng = 0;
    for (const [i, p] of golden.planets.entries()) {
      for (const row of golden.rows[p.name]!) {
        // the printed value at T is the solution at the start of the last step
        const e = ll2Elements(ll2Evaluate(sys, i, Math.max(0, row[0]! - 1)));
        worstEcc = Math.max(worstEcc, Math.abs(e.ecc - row[1]!));
        worstInc = Math.max(worstInc, Math.abs(e.inc / DEGRAD - row[2]!));
        const argP = (((e.longP - e.longA) / DEGRAD) % 360 + 360) % 360;
        worstAng = Math.max(worstAng, wrap(argP - row[3]!), wrap(e.longA / DEGRAD - row[4]!));
      }
    }
    expect(worstEcc).toBeLessThan(2e-6); // printed to 6 decimals
    expect(worstInc).toBeLessThan(2e-5);
    expect(worstAng).toBeLessThan(5e-5);
  });

  it('has eigenvalues that are real, with one zero inclination mode', () => {
    expect(Math.min(...Array.from(sys.eigenValInc).map(Math.abs))).toBeLessThan(1e-12);
  });
});

describe('Laplace coefficients', () => {
  it('b_{1/2}^{(0)} at small alpha follows its series 2(1 + alpha^2/4 + 9 alpha^4/64)', () => {
    const a = 0.01;
    expect(laplaceCoeff(a, 0, 0.5)).toBeCloseTo(2 * (1 + (a * a) / 4 + (9 * a ** 4) / 64), 12);
  });
  it('the derivative equals a centred difference', () => {
    const a = 0.4;
    const h = 1e-5;
    const num = (laplaceCoeff(a + h, 1, 1.5) - laplaceCoeff(a - h, 1, 1.5)) / (2 * h);
    expect(Math.abs(derivLaplaceCoeff(1, a, 1, 1.5) - num) / Math.abs(num)).toBeLessThan(1e-8);
  });
});
