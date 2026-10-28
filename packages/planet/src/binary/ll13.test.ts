import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, DEGRAD, MSUN, YEARSEC } from '../poise/constants.js';
import { CircumbinaryOrbit } from './ll13.js';

const golden = JSON.parse(readFileSync(new URL('../../golden/circumbinary-ll13.json', import.meta.url), 'utf8')) as { rows: number[][] };
// examples/CircumbinaryOrbit (Kepler-16 b).
const orbit = new CircumbinaryOrbit({
  m0: 0.686935 * MSUN,
  m1: 0.20232 * MSUN,
  binarySemi: 0.22405 * AUM,
  binaryEcc: 0.16048,
  binaryLongP: 263.49 * DEGRAD,
  binaryPhiAB: 129.84 * DEGRAD,
  planetMass: 104.77 * 5.972186e24,
  semi: 0.7016 * AUM,
  freeEcc: 0.03,
  freeInc: 0.3083 * DEGRAD,
  m0Cbp: 358.85 * DEGRAD,
  psi: 270 * DEGRAD,
  zeta: 90 * DEGRAD,
});
const wrap = (d: number): number => Math.abs(((d + 180) % 360 + 360) % 360 - 180);

describe('Leung & Lee (2013) circumbinary orbit (native VPLanet CircumbinaryOrbit, Kepler-16 b)', () => {
  it('has the guiding-centre, epicyclic and vertical frequencies of the native run', () => {
    const row = golden.rows[0]!;
    const yr = (f: number): number => f * YEARSEC; // rad/s -> rad/yr
    expect(Math.abs(yr(orbit.freq.n0) / row[4]! - 1)).toBeLessThan(1e-6);
    expect(Math.abs(yr(orbit.freq.kappa0) / row[5]! - 1)).toBeLessThan(1e-6);
    expect(Math.abs(yr(orbit.freq.nu0) / row[6]! - 1)).toBeLessThan(1e-6);
  });

  // The native output at T shows the solution two fixed steps (2e-4 yr) earlier: PropsAux runs after the age update and the
  // output is written before the next PropsAux (decision A2).
  it('reproduces R, Z and Phi over two years', () => {
    let wR = 0;
    let wZ = 0;
    let wP = 0;
    for (const row of golden.rows) {
      const t = Math.max(0, row[0]! - 2e-4) * YEARSEC;
      const p = orbit.position(t);
      wR = Math.max(wR, Math.abs(p.R / AUM - row[1]!));
      wZ = Math.max(wZ, Math.abs(p.Z / AUM - row[2]!));
      wP = Math.max(wP, wrap(p.phi / DEGRAD - row[3]!));
    }
    expect(wR).toBeLessThan(1e-6); // printed to 6 decimals
    expect(wZ).toBeLessThan(1e-6);
    expect(wP).toBeLessThan(2e-5);
  });
});
