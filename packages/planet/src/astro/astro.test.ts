import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUM, DAYSEC, DEGRAD, MSUN } from '../poise/constants.js';
import { ll2Solve, type Ll2Planet } from '../distorb/ll2.js';
import { computeAstro, leapRules, moonTorqueMultiplier, tideAtLatitude, type AstroInput } from './astro.js';
import { orbitalKeyframes } from './cycles.js';

const earthSky: AstroInput = {
  star: { massSolar: 1, ageGyr: 4.6, luminosity_W: 3.846e26, teff_K: 5772, radius_m: 6.957e8 },
  planet: { semiMajorAxis_AU: 1.00000011, eccentricity: 0.0167, obliquity_deg: 23.44, rotationPeriod_s: 86164.0905, longPerihelion_deg: 102.94719, mass_kg: 5.972e24, radius_m: 6.371e6 },
  moons: [{ name: 'Moon', mass_kg: 7.342e22, radius_m: 1.7374e6, semiMajorAxis_m: 3.844e8, inclination_deg: 5.145 }],
};

describe('stage 0a: the sky of Earth (T1/T2 of design note 20 §9)', () => {
  const r = computeAstro(earthSky);

  it('has the year, month and day lengths of Earth', () => {
    expect(Math.abs(r.calendar.year_s / DAYSEC - 365.2564)).toBeLessThan(0.02);
    const moon = r.calendar.moons[0]!;
    expect(Math.abs(moon.siderealMonth_days - 27.32)).toBeLessThan(0.06);
    expect(Math.abs(moon.synodicMonth_days - 29.53)).toBeLessThan(0.1);
    expect(Math.abs(moon.monthsPerYear - 12.37)).toBeLessThan(0.05);
  });

  it('gives the equilibrium tides: Moon 0.27 m, Sun 0.12 m at the equator, cos^2 with latitude', () => {
    expect(Math.abs(r.calendar.moons[0]!.tideAmplitude_m - 0.267)).toBeLessThan(0.01);
    expect(Math.abs(r.tide.starAmplitude_m - 0.123)).toBeLessThan(0.005);
    expect(Math.abs(r.tide.springEquator_m - 0.39)).toBeLessThan(0.015);
    expect(tideAtLatitude(1, 60 * DEGRAD)).toBeCloseTo(0.25, 12);
  });

  it('has about 2.4 solar eclipses a year, the habitable-zone position and no tidal locking', () => {
    expect(Math.abs(r.calendar.moons[0]!.solarEclipsesPerYear - 2.38)).toBeLessThan(0.4);
    expect(r.habitability.zone).toBe('habitable zone');
    expect(r.habitability.tidallyLocked).toBe(false);
    expect(r.habitability.lockTime_yr).toBeGreaterThan(1e10);
    expect(r.validity).toBe('ok');
  });

  it('generates the Gregorian-like leap rule from the fractional part (1 leap day in 4 years)', () => {
    expect(leapRules(365.2564).some((x) => x.leapDays === 1 && x.years === 4)).toBe(true);
  });

  it('passes the star luminosity and orbit to the climate mapping unchanged', () => {
    expect(r.planetInput.luminosity_W).toBe(3.846e26);
    expect(r.planetInput.obliquity_deg).toBe(23.44);
  });
});

describe('stage 0a: other skies', () => {
  it('a Baraffe K dwarf gets a luminosity, a smaller habitable zone, and locking at close range', () => {
    const k: AstroInput = { ...earthSky, star: { massSolar: 0.7, ageGyr: 5 }, moons: [] };
    const near = computeAstro({ ...k, planet: { ...k.planet, semiMajorAxis_AU: 0.1 } });
    expect(near.planetInput.luminosity_W).toBeGreaterThan(5e25);
    expect(near.planetInput.luminosity_W).toBeLessThan(1.6e26);
    expect(near.habitability.zone).toBe('too hot');
    expect(near.habitability.tidallyLocked).toBe(true);
    expect(near.validity).toBe('unsupported');
    const hz = computeAstro(k);
    expect(hz.habitability.limits_AU[1]!).toBeLessThan(computeAstro(earthSky).habitability.limits_AU[1]!);
  });

  it('refuses a star outside the grid unless a luminosity is given', () => {
    const big = computeAstro({ ...earthSky, star: { massSolar: 2, ageGyr: 1 } });
    expect(big.validity).toBe('unsupported');
    expect(big.notes[0]).toMatch(/Baraffe/);
  });

  it('a circumbinary planet inside the critical radius is unstable, outside it is fine', () => {
    const binary: AstroInput = {
      star: { massSolar: 0.69, ageGyr: 5 }, companion: { star: { massSolar: 0.2, ageGyr: 5 }, semiMajorAxis_AU: 0.22, eccentricity: 0.16 },
      planet: { semiMajorAxis_AU: 0.5, eccentricity: 0.01, obliquity_deg: 10, rotationPeriod_s: 86400, longPerihelion_deg: 0, mass_kg: 5.972e24, radius_m: 6.371e6 }, moons: [],
    };
    expect(computeAstro(binary).validity).toBe('unsupported'); // critical radius is about 0.65 AU
    const far = computeAstro({ ...binary, planet: { ...binary.planet, semiMajorAxis_AU: 0.9 } });
    expect(far.notes.filter((n) => /critical/.test(n)).length).toBe(0);
    expect(far.bodies.map((b) => b.kind)).toEqual(['star', 'star', 'planet']);
    expect(far.planetInput.luminosity_W).toBeGreaterThan(5e25);
  });
});

describe('orbital cycles on the geologic axis (T3: Earth with its Moon)', () => {
  const golden = JSON.parse(readFileSync(new URL('../../golden/distorb-ll2.json', import.meta.url), 'utf8')) as {
    planets: { name: string; mass_msun: number; semi_au: number; ecc: number; inc_deg: number; longP_deg: number; longA_deg: number }[];
  };
  const planets: Ll2Planet[] = golden.planets.map((p) => ({ mass: p.mass_msun * MSUN, semi: p.semi_au * AUM, ecc: p.ecc, inc: p.inc_deg * DEGRAD, longP: p.longP_deg * DEGRAD, longA: p.longA_deg * DEGRAD }));
  const iE = golden.planets.findIndex((p) => p.name === 'earth');

  it('keeps obliquity within 21.5 to 25 degrees with a 41 kyr cycle, and precesses in about 26 kyr', () => {
    const mult = moonTorqueMultiplier(earthSky);
    expect(Math.abs(mult - 3.18)).toBeLessThan(0.05);
    const frames = orbitalKeyframes(
      MSUN, planets, iE,
      { starMass: MSUN, planet: planets[iE]!, rotPeriod: 86400, dynEllip: 3.28e-3, obliquity: 23.44 * DEGRAD, precA: 0, grCorr: true, torqueMultiplier: mult },
      1_000_000, 500,
    );
    const obl = frames.map((f) => f.obliquity_deg);
    expect(Math.min(...obl)).toBeGreaterThan(21.5);
    expect(Math.max(...obl)).toBeLessThan(25);
    const mean = obl.reduce((s, x) => s + x, 0) / obl.length;
    let crossings = 0;
    for (let i = 1; i < obl.length; i++) if (obl[i - 1]! < mean && obl[i]! >= mean) crossings++;
    const period = 1_000_000 / crossings;
    expect(period).toBeGreaterThan(36_000);
    expect(period).toBeLessThan(47_000);
    // precession: unwrap the angle over the first 20 kyr
    let total = 0;
    for (let i = 1; i <= 40; i++) {
      let d = frames[i]!.precessionAngle_deg - frames[i - 1]!.precessionAngle_deg;
      if (d < -180) d += 360;
      if (d > 180) d -= 360;
      total += d;
    }
    const precPeriod = (360 / total) * 20_000;
    expect(precPeriod).toBeGreaterThan(23_000);
    expect(precPeriod).toBeLessThan(29_000);
    // eccentricity stays in the secular range of the real Earth
    expect(Math.max(...frames.map((f) => f.eccentricity))).toBeLessThan(0.07);
  });

  void ll2Solve;
});
