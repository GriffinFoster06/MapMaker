import { describe, expect, it } from 'vitest';
import { SIGMA } from './constants.js';
import { olr, olrSlope, type OlrModel } from './olr.js';

describe('OLR models', () => {
  it('Williams & Kasting 1997 at modern Earth: about 235 W/m^2 at 15 C and 330 ppm', () => {
    expect(olr('wk97', 15, 3.3e-4)).toBeGreaterThan(225);
    expect(olr('wk97', 15, 3.3e-4)).toBeLessThan(245);
  });
  it('saturates at 300 W/m^2 (runaway greenhouse) and has a tiny slope there', () => {
    const saturated: number[] = [];
    for (let t = 80; t <= 130; t += 1) if (olr('wk97', t, 3.3e-4) === 300) saturated.push(t);
    expect(saturated.length).toBeGreaterThan(0);
    for (const t of saturated) expect(olrSlope('wk97', t, 3.3e-4)).toBe(0.001);
  });
  it('cold limit is a blackbody', () => {
    const T = -100 + 273.15;
    expect(olr('wk97', -100, 3.3e-4)).toBeCloseTo(SIGMA * T ** 4, 10);
  });
  for (const m of ['wk97', 'hm16', 'sms09'] as OlrModel[]) {
    it(`${m}: slope matches a centred difference of the OLR`, () => {
      for (const t of [-20, 0, 15, 30]) {
        const h = 1e-3;
        const fd = (olr(m, t + h, 3.3e-4) - olr(m, t - h, 3.3e-4)) / (2 * h);
        expect(Math.abs(olrSlope(m, t, 3.3e-4) - fd) / Math.abs(fd)).toBeLessThan(2e-3);
      }
    });
    it(`${m}: OLR rises with temperature`, () => {
      expect(olr(m, 20, 3.3e-4)).toBeGreaterThan(olr(m, 0, 3.3e-4));
    });
  }
  it('more CO2 lowers the OLR (wk97)', () => {
    expect(olr('wk97', 15, 3.3e-3)).toBeLessThan(olr('wk97', 15, 3.3e-4));
  });
});
