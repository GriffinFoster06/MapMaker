import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, DEGRAD, PI } from './constants.js';
import { annualInsolation, eccFromTrueAnomaly, keplerEccentricAnomaly, latGrid } from './insolation.js';

interface Golden {
  inputs: { luminosity_W: number; semiMajorAxis_AU: number; ecc: number; obliquity_deg: number; longP_deg: number; nDays: number; nLats: number };
  latitude_deg: number[];
  annualInsolation: number[];
  days: number[];
  dailyInsolation: number[][];
}
const golden = JSON.parse(readFileSync(new URL('../../golden/earthclimate-insolation.json', import.meta.url), 'utf8')) as Golden;
const g = golden.inputs;
const lats = latGrid(g.nLats);
const orbit = {
  luminosity_W: g.luminosity_W, semiMajorAxis_m: g.semiMajorAxis_AU * AUM, ecc: g.ecc,
  obliquity: g.obliquity_deg * DEGRAD, longP: g.longP_deg * DEGRAD, nDays: g.nDays,
};

describe('POISE insolation against native VPLanet (examples/EarthClimate, t = 0)', () => {
  const r = annualInsolation(lats, orbit);

  it('latitude grid is uniform in sin(latitude)', () => {
    for (let i = 0; i < g.nLats; i++) expect(Math.abs(lats[i]! / DEGRAD - golden.latitude_deg[i]!)).toBeLessThan(1e-5);
  });

  it('daily insolation matches on nine days at every latitude', () => {
    let worst = 0;
    golden.days.forEach((day, k) => {
      for (let i = 0; i < g.nLats; i++) worst = Math.max(worst, Math.abs(r.daily[day * g.nLats + i]! - golden.dailyInsolation[k]![i]!));
    });
    expect(worst).toBeLessThan(1e-5);
  });

  it('annual-mean insolation matches at every latitude', () => {
    let worst = 0;
    for (let i = 0; i < g.nLats; i++) worst = Math.max(worst, Math.abs(r.annual[i]! - golden.annualInsolation[i]!));
    expect(worst).toBeLessThan(1e-5);
  });

  it('is deterministic and repeatable', () => {
    const again = annualInsolation(lats, orbit);
    expect(Array.from(again.daily)).toEqual(Array.from(r.daily));
  });
});

describe('orbit helpers', () => {
  it('Kepler solver satisfies M = E - e sin E', () => {
    for (const e of [0, 0.0167, 0.3, 0.7, 0.9]) {
      for (let m = 0.1; m < 2 * PI; m += 0.37) {
        const E = keplerEccentricAnomaly(m, e);
        expect(Math.abs(E - e * Math.sin(E) - m)).toBeLessThan(1e-13);
      }
    }
  });
  it('eccentric from true anomaly inverts at e = 0', () => {
    expect(eccFromTrueAnomaly(1.0, 0)).toBeCloseTo(1.0, 14);
    expect(eccFromTrueAnomaly(4.0, 0)).toBeCloseTo(4.0, 14);
  });
});

describe('Earth sanity', () => {
  it('global mean of the annual insolation is S/4 for a circular orbit', () => {
    const r = annualInsolation(lats, { ...orbit, ecc: 0 });
    const S = orbit.luminosity_W / (4 * PI * orbit.semiMajorAxis_m ** 2);
    const mean = r.annual.reduce((a, b) => a + b, 0) / g.nLats;
    expect(Math.abs(mean / (S / 4) - 1)).toBeLessThan(2e-3);
  });
  it('zero obliquity gives no seasonal cycle on a circular orbit', () => {
    const r = annualInsolation(lats, { ...orbit, ecc: 0, obliquity: 0 });
    for (let i = 0; i < g.nLats; i++) expect(Math.abs(r.peak[i]! - r.annual[i]!)).toBeLessThan(1e-9 * r.annual[i]! + 1e-9);
  });
});
