import { describe, expect, it } from 'vitest';
import { DEGRAD } from './poise/constants.js';
import { declination, monthTable, solarLongPeri, seasonLengths, solarLongitudeAtYearFraction, yearFractionAtTrueAnomaly } from './calendar.js';

const EARTH_LONGPERI = solarLongPeri(102.94719 * DEGRAD);

describe('calendar from the orbit (note 11 §3.5)', () => {
  it('equal seasons on a circular orbit', () => {
    for (const s of seasonLengths(0, 1.2)) expect(s).toBeCloseTo(0.25, 12);
  });
  it('Earth: northern spring and summer last about 186.4 days, autumn and winter about 178.8', () => {
    const [sp, su, au, wi] = seasonLengths(0.0167, EARTH_LONGPERI);
    expect((sp + su) * 365.2422).toBeGreaterThan(185.5);
    expect((sp + su) * 365.2422).toBeLessThan(187.3);
    expect((au + wi) * 365.2422).toBeGreaterThan(177.9);
    expect(sp + su + au + wi).toBeCloseTo(1, 12);
    expect(su).toBeGreaterThan(sp); // summer is the longest season in the north (about 93.6 days against 92.8)
  });
  it('higher eccentricity gives more unequal seasons', () => {
    const spread = (e: number): number => { const s = seasonLengths(e, EARTH_LONGPERI); return Math.max(...s) - Math.min(...s); };
    expect(spread(0.3)).toBeGreaterThan(spread(0.1));
    expect(spread(0.1)).toBeGreaterThan(spread(0.0167));
  });
  it('moving pericentre by 180 degrees swaps the hemispheric asymmetry', () => {
    const a = seasonLengths(0.1, EARTH_LONGPERI);
    const b = seasonLengths(0.1, EARTH_LONGPERI + Math.PI);
    expect(a[0] + a[1]).toBeCloseTo(b[2] + b[3], 10);
    expect(a[2] + a[3]).toBeCloseTo(b[0] + b[1], 10);
  });
  it('zero obliquity has no declination, and the extremes equal the obliquity', () => {
    expect(declination(1.0, 0)).toBe(0);
    expect(declination(Math.PI / 2, 23.44 * DEGRAD)).toBeCloseTo(23.44 * DEGRAD, 12);
  });
  it('the month table starts at the northern winter solstice, spans a year and is deterministic', () => {
    const t = monthTable(0.0167, EARTH_LONGPERI, 23.44 * DEGRAD);
    expect(t.length).toBe(12);
    expect(t[0]!.declination).toBeLessThan(-20 * DEGRAD); // December solstice month
    expect(t[6]!.declination).toBeGreaterThan(20 * DEGRAD); // June solstice month
    expect(JSON.stringify(monthTable(0.0167, EARTH_LONGPERI, 23.44 * DEGRAD))).toBe(JSON.stringify(t));
  });
  it('year fraction and solar longitude are consistent', () => {
    const f = yearFractionAtTrueAnomaly(1.3 - 0.4, 0.2);
    expect(solarLongitudeAtYearFraction(f, 0.2, 0.4)).toBeCloseTo(1.3, 10);
  });
});
