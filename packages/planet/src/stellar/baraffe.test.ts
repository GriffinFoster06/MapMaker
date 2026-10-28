import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, LSUN, MSUN } from '../poise/constants.js';
import { baraffeStar, habitableZone } from './baraffe.js';

const golden = JSON.parse(readFileSync(new URL('../../golden/stellar-baraffe.json', import.meta.url), 'utf8')) as Record<string, number[][]>;
const RSUN = 6.957e8;
const REARTH = 6.3781e6; // VPLanet prints "-Radius" in Earth radii

describe('Baraffe (2015) stellar tracks (native VPLanet stellar module)', () => {
  for (const mass of ['0.1', '0.5', '1.0']) {
    it(`reproduces luminosity, radius, temperature and radius of gyration for ${mass} Msun to 0 to 10 Gyr`, () => {
      let n = 0;
      for (const row of golden[mass]!) {
        if (row[0]! % 5e8 !== 0) continue; // the last row is the step that halted at the end of the grid
        // VPLanet evaluates the explicit stellar variables at the start of each step (decision A2): one 1e7 yr step before the printed time.
        const s = baraffeStar(Number(mass) * MSUN, Math.max(0, row[0]! - 1e7));
        expect(Math.abs(s.luminosity / LSUN - row[1]!)).toBeLessThan(6e-9 + 2e-6 * row[1]!); // printed to 8 decimals
        expect(Math.abs(((s.radius / RSUN) * (RSUN / REARTH)) / row[2]! - 1)).toBeLessThan(1e-6);
        expect(Math.abs(s.temperature / row[3]! - 1)).toBeLessThan(1e-7);
        expect(Math.abs(s.radGyra - row[4]!)).toBeLessThan(1e-7);
        n++;
      }
      expect(n).toBeGreaterThan(10);
    });
  }

  it('is NaN outside the grid (mass above 1.41 Msun, below 0.0698 Msun)', () => {
    expect(Number.isNaN(baraffeStar(2 * MSUN, 1e9).luminosity)).toBe(true);
    expect(Number.isNaN(baraffeStar(0.05 * MSUN, 1e9).radius)).toBe(true);
  });

  it('puts the habitable zone of the present Sun near 0.95 to 1.7 AU (Kopparapu 2013)', () => {
    const sun = baraffeStar(MSUN, 4.6e9);
    const hz = habitableZone(sun.luminosity, 5772);
    const au = hz.map((x) => x / AUM);
    expect(au[1]!).toBeGreaterThan(0.93); // runaway greenhouse
    expect(au[1]!).toBeLessThan(1.05);
    expect(au[4]!).toBeGreaterThan(1.6); // maximum greenhouse region
    expect(au[4]!).toBeLessThan(1.9);
  });
});
