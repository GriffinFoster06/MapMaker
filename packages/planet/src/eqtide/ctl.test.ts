import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, DEGRAD, MSUN } from '../poise/constants.js';
import { evolveCtl, eqRotRate, meanMotion, type CtlState } from './ctl.js';

const golden = JSON.parse(readFileSync(new URL('../../golden/eqtide-ctl.json', import.meta.url), 'utf8')) as { d: number[][]; star: number[][] };
const DAY = 86400;
// examples/TideLock/CTL: Gl 581 d (5.6 Earth masses, 1.5 Earth radii, tau 638 s, k2 0.3) around Gl 581 (0.31 Msun, tau 1 s, k2 0.5).
const init: CtlState = {
  semi: 0.21847 * AUM,
  ecc: 0.38,
  central: { mass: 0.31 * MSUN, radius: 0.00131 * AUM, radGyra: 0.5, k2: 0.5, tau: 1, rotRate: (2 * Math.PI) / (94.2 * DAY), obliquity: 0 },
  orbiter: { mass: 5.6 * 5.972186e24, radius: 1.5 * 6.3781e6, radGyra: 0.5, k2: 0.3, tau: 638, rotRate: (2 * Math.PI) / DAY, obliquity: 23.5 * DEGRAD },
  lockedCentral: false,
  lockedOrbiter: false,
};

describe('EqTide CTL (native VPLanet TideLock/CTL, 1 Gyr)', () => {
  const got = evolveCtl(init, 1e9, 1e7, { eta: 0.001, maxLockDiff: 0.01, minEcc: 1e-10 });

  it('starts from the input state', () => {
    expect(got[0]!.rotPeriodOrbiter).toBeCloseTo(1, 12);
  });

  it('locks the planet near the pseudo-synchronous rate the native run reaches (34.7 d)', () => {
    for (const [i, row] of golden.d.entries()) {
      if (i === 0 || row[0]! < 1.4e8) continue;
      const g = got[i]!;
      expect(g.lockedOrbiter).toBe(true);
      expect(Math.abs(g.rotPeriodOrbiter - row[3]!) / row[3]!).toBeLessThan(2e-4);
    }
  });

  it('follows the spin-up, obliquity decay, semi-major axis and eccentricity of the native run', () => {
    for (const [i, row] of golden.d.entries()) {
      const g = got[i]!;
      expect(Math.abs(g.semi / AUM - row[1]!)).toBeLessThan(2e-6);
      expect(Math.abs(g.ecc - row[2]!)).toBeLessThan(2e-5);
      if (row[0]! <= 1e8) {
        expect(Math.abs(g.rotPeriodOrbiter - row[3]!) / row[3]!).toBeLessThan(5e-3);
        expect(Math.abs(g.obliquityOrbiter / DEGRAD - row[4]!)).toBeLessThan(0.1);
      }
    }
  });

  it('leaves the star spinning at its initial period (tau 1 s)', () => {
    expect(Math.abs(got[got.length - 1]!.rotPeriodCentral - golden.star[golden.star.length - 1]![1]!)).toBeLessThan(1e-3);
  });

  it('has an equilibrium rate of n at e = 0 and zero obliquity', () => {
    expect(eqRotRate(0, 0, 2.5)).toBeCloseTo(2.5, 12);
    expect(meanMotion(init)).toBeGreaterThan(0);
  });
});
