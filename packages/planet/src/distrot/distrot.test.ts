import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, DEGRAD, MSUN } from '../poise/constants.js';
import { ll2Solve, type Ll2Planet } from '../distorb/ll2.js';
import { evolveObliquity, type RotParams } from './distrot.js';

interface Golden {
  planets: { name: string; mass_msun: number; semi_au: number; ecc: number; inc_deg: number; longP_deg: number; longA_deg: number }[];
  rows: Record<string, number[][]>;
}
const golden = JSON.parse(readFileSync(new URL('../../golden/distorb-ll2.json', import.meta.url), 'utf8')) as Golden;
const planets: Ll2Planet[] = golden.planets.map((p) => ({
  mass: p.mass_msun * MSUN, semi: p.semi_au * AUM, ecc: p.ecc, inc: p.inc_deg * DEGRAD, longP: p.longP_deg * DEGRAD, longA: p.longA_deg * DEGRAD,
}));
const sys = ll2Solve(MSUN, planets, true);
const iEarth = golden.planets.findIndex((p) => p.name === 'earth');
// examples/SSDistOrbDistRot/LL2/earth.in: dRotPeriod -1 (one day), dObliquity 23.44, dDynEllip 3.28e-3, dPrecA 0, bGRCorr 1.
const earth: RotParams = { starMass: MSUN, planet: planets[iEarth]!, rotPeriod: 86400, dynEllip: 3.28e-3, obliquity: 23.44 * DEGRAD, precA: 0, grCorr: true };
const rows = golden.rows.earth!;

describe('DistRot LL2 (native Earth obliquity and precession angle)', () => {
  it('matches the native run step for step over 200 kyr (1 yr step, forcing frozen per step as in VPLanet)', () => {
    const got = evolveObliquity(sys, iEarth, earth, 200000, { dt: 1, sampleEvery: 1000, frozenForcing: true });
    let worstObl = 0;
    let worstPa = 0;
    for (const row of rows) {
      if (row[0]! > 200000) continue;
      const g = got[Math.round(row[0]! / 1000)]!;
      worstObl = Math.max(worstObl, Math.abs(g.obliquity / DEGRAD - row[5]!));
      const dpa = Math.abs(g.precA / DEGRAD - row[6]!);
      worstPa = Math.max(worstPa, Math.min(dpa, 360 - dpa));
    }
    expect(worstObl).toBeLessThan(2e-5);
    expect(worstPa).toBeLessThan(2e-4);
  });

  it('an accurate RK4 with 10 yr steps tracks the native series over 1 Myr within the native step error', () => {
    const got = evolveObliquity(sys, iEarth, earth, 1000000, { dt: 10, sampleEvery: 1000 });
    let worstObl = 0;
    for (const row of rows) {
      const g = got[Math.round(row[0]! / 1000)];
      if (g && row[0]! % 20000 === 0) worstObl = Math.max(worstObl, Math.abs(g.obliquity / DEGRAD - row[5]!));
    }
    expect(worstObl).toBeLessThan(0.05);
    // The example's Earth has no Moon-enhanced precession (dynEllip 3.28e-3), so its obliquity swings widely;
    // the extremes agree with the native series (15.01 to 34.08 degrees at every 1000 yr).
    const obl = got.map((x) => x.obliquity / DEGRAD);
    const nativeObl = rows.map((x) => x[5]!);
    expect(Math.abs(Math.min(...obl) - 15.011)).toBeLessThan(0.05);
    expect(Math.abs(Math.max(...obl) - 34.081)).toBeLessThan(0.1);
    expect(Math.max(...nativeObl)).toBeGreaterThan(33.5);
  });
});
