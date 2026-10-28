import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, DEGRAD } from './constants.js';
import { solveAnnualEbm, type AnnualEbmInput } from './ebm-annual.js';
import { annualInsolation, latGrid } from './insolation.js';

const golden = JSON.parse(readFileSync(new URL('../../golden/earthclimate-insolation.json', import.meta.url), 'utf8')) as {
  inputs: { luminosity_W: number; semiMajorAxis_AU: number; ecc: number; obliquity_deg: number; longP_deg: number; nDays: number; nLats: number };
  seasonalModel: { tempC: number[]; albedo: number[] };
};
const g = golden.inputs;
const lats = latGrid(g.nLats);
const orbit = {
  luminosity_W: g.luminosity_W, semiMajorAxis_m: g.semiMajorAxis_AU * AUM, ecc: g.ecc,
  obliquity: g.obliquity_deg * DEGRAD, longP: g.longP_deg * DEGRAD, nDays: g.nDays,
};
const insol = annualInsolation(lats, orbit).annual;
// VPLanet's defaults (dDiffusion 0.44, A 203.3, B 2.09) with EarthClimate's surface albedo (the land/water mean).
const earth: AnnualEbmInput = { lats, annualInsol: insol, diffusion: 0.44, surfAlbedo: (0.363 + 0.263) / 2 };

describe('POISE annual EBM', () => {
  const r = solveAnnualEbm(earth);

  it('converges to a steady state with global energy balance', () => {
    expect(r.iterations).toBeGreaterThan(1);
    // Diffusion conserves energy, so absorbed = emitted once the relaxation has stopped.
    expect(Math.abs(r.fluxInGlobal - r.fluxOutGlobal)).toBeLessThan(1e-6);
  });

  it('gives an Earth-like climate: 13 to 16 C global mean, warm equator, cold pole, ice only near the poles', () => {
    expect(r.tGlobal).toBeGreaterThan(13);
    expect(r.tGlobal).toBeLessThan(16);
    const eq = r.temp[g.nLats / 2]!;
    expect(eq).toBeGreaterThan(24);
    expect(r.temp[0]!).toBeLessThan(-10);
    const icy = Array.from(r.albedo).map((a, i) => (a > 0.5 ? Math.abs(lats[i]! / DEGRAD) : null)).filter((x) => x !== null) as number[];
    expect(Math.min(...icy)).toBeGreaterThan(55);
  });

  it('is hemispherically near-symmetric (obliquity and orbit are symmetric to a few percent)', () => {
    for (let i = 0; i < g.nLats / 2; i++) expect(Math.abs(r.temp[i]! - r.temp[g.nLats - 1 - i]!)).toBeLessThan(2.5);
  });

  it('agrees loosely with the native seasonal model (land+water, ice sheets) on the zonal-mean temperature', () => {
    // Not a golden: the native run is a different model (two surfaces, ice sheets, seasonal cycle), and it was run with
    // dDiffusion 0.58, which the annual model matches best at 0.44 (RMS 1.6 C, maximum 2.4 C; at 0.58 the RMS is 4 C).
    // Recorded in docs/DECISIONS_LOG.md (P8); these bounds only guard against regressions.
    let sq = 0;
    let worst = 0;
    for (let i = 0; i < g.nLats; i++) {
      const d = r.temp[i]! - golden.seasonalModel.tempC[i]!;
      sq += d * d / g.nLats;
      worst = Math.max(worst, Math.abs(d));
    }
    expect(Math.sqrt(sq)).toBeLessThan(2.2);
    expect(worst).toBeLessThan(3.5);
  });

  it('is deterministic', () => {
    expect(Array.from(solveAnnualEbm(earth).temp)).toEqual(Array.from(r.temp));
  });
});

describe('POISE annual EBM physics', () => {
  it('with almost no diffusion, each latitude is in local radiative equilibrium', () => {
    const r = solveAnnualEbm({ ...earth, diffusion: 1e-9, surfAlbedo: 0.3, iceAlbedo: 0.3 });
    for (const i of [30, 75, 120]) {
      const expected = ((1 - 0.3) * insol[i]! - 203.3) / 2.09;
      expect(Math.abs(r.temp[i]! - expected)).toBeLessThan(0.05);
    }
  });
  it('more diffusion flattens the equator-to-pole contrast', () => {
    const lo = solveAnnualEbm({ ...earth, diffusion: 0.2 });
    const hi = solveAnnualEbm({ ...earth, diffusion: 1.5 });
    const contrast = (x: typeof lo) => x.temp[g.nLats / 2]! - x.temp[0]!;
    expect(contrast(hi)).toBeLessThan(contrast(lo));
  });
  it('a lower A (stronger greenhouse) warms the planet', () => {
    const base = solveAnnualEbm(earth);
    const warm = solveAnnualEbm({ ...earth, planckA: 193.3 });
    expect(warm.tGlobal).toBeGreaterThan(base.tGlobal + 3);
  });
  it('a brighter star warms the planet', () => {
    const bright = solveAnnualEbm({ ...earth, annualInsol: Float64Array.from(insol, (x) => x * 1.03) });
    expect(bright.tGlobal).toBeGreaterThan(solveAnnualEbm(earth).tGlobal + 1);
  });
  it('ice-albedo feedback: a fixed ice line at the equator gives a much colder planet', () => {
    const base = solveAnnualEbm(earth);
    const snowball = solveAnnualEbm({ ...earth, fixIceLat: 1e-6 });
    expect(snowball.tGlobal).toBeLessThan(base.tGlobal - 20);
  });
  it('OLR-model mode (calcAB, wk97) gives a habitable Earth-like state', () => {
    const r = solveAnnualEbm({ ...earth, calcAB: true, olrModel: 'wk97' });
    expect(r.tGlobal).toBeGreaterThan(5);
    expect(r.tGlobal).toBeLessThan(30);
  });
  it('maximum-entropy diffusion and the Hadley bump both converge', () => {
    expect(solveAnnualEbm({ ...earth, calcAB: true, mepDiff: true }).iterations).toBeGreaterThan(1);
    expect(solveAnnualEbm({ ...earth, hadley: true }).iterations).toBeGreaterThan(1);
  });
  it('meridional heat flows poleward in each hemisphere', () => {
    const r = solveAnnualEbm(earth);
    expect(r.flux[g.nLats / 2 + 25]!).toBeGreaterThan(0);
    expect(r.flux[g.nLats / 2 - 25]!).toBeLessThan(0);
  });
});
