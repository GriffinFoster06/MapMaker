// Original code (design note 11 §3.5; Kepler's laws, Berger 1978). The calendar of a planet from its orbit: months of
// equal time (equal mean anomaly), so an eccentric orbit gets unequal seasons; the solar longitude and declination at
// each month boundary. Angles in radians. Transcendentals go through dmath.
//
// Longitude convention: `longPeri` is the longitude of pericentre in SOLAR longitude, the longitude of the star seen from
// the planet at pericentre (Earth: 282.94 degrees, perihelion in early January). VPLanet's `dLongP` is the heliocentric
// longitude of the planet at pericentre (Earth: 102.94719 degrees); POISE adds pi (poise.c:5607). `solarLongPeri` converts.
import { dmath } from '@mapmaker/core';
import { PI } from './poise/constants.js';
import { eccFromTrueAnomaly, keplerEccentricAnomaly } from './poise/insolation.js';

const TAU = 2 * PI;
/** Solar-longitude pericentre from VPLanet's heliocentric `dLongP` (Earth: 102.947 degrees becomes 282.947). */
export const solarLongPeri = (heliocentricLongP: number): number => heliocentricLongP + PI;

const wrap = (x: number): number => {
  const r = x % TAU;
  return r < 0 ? r + TAU : r;
};

/** Fraction of the year (0 to 1) after pericentre at which the planet reaches true anomaly `nu`. */
export function yearFractionAtTrueAnomaly(nu: number, ecc: number): number {
  const E = eccFromTrueAnomaly(wrap(nu), ecc);
  return wrap(E - ecc * dmath.sin(E)) / TAU;
}

/** True solar longitude (from the vernal equinox) at a given year fraction after pericentre. */
export function solarLongitudeAtYearFraction(f: number, ecc: number, longPeri: number): number {
  const M = wrap(f * TAU);
  const E = keplerEccentricAnomaly(M, ecc);
  const nu = 2 * dmath.atan2(dmath.sqrt(1 + ecc) * dmath.sin(E / 2), dmath.sqrt(1 - ecc) * dmath.cos(E / 2));
  return wrap(nu + longPeri);
}

/** Solar declination for a solar longitude and obliquity. */
export const declination = (lambda: number, obliquity: number): number => dmath.asin(dmath.sin(obliquity) * dmath.sin(lambda));

/**
 * Lengths, as fractions of the year, of the four astronomical seasons: from the vernal equinox (solar longitude 0) to
 * the summer solstice (pi/2), to the autumnal equinox, to the winter solstice, and back. `longPeri` is the longitude of
 * pericentre measured from the vernal equinox direction.
 */
export function seasonLengths(ecc: number, longPeri: number): [number, number, number, number] {
  const t = [0, PI / 2, PI, (3 * PI) / 2].map((lambda) => yearFractionAtTrueAnomaly(lambda - longPeri, ecc));
  const len = (a: number, b: number): number => (b - a + 1) % 1 || 1;
  return [len(t[0]!, t[1]!), len(t[1]!, t[2]!), len(t[2]!, t[3]!), len(t[3]!, t[0]!)];
}

export interface CalendarMonth {
  /** Year fraction at the start of the month, measured from the northern winter solstice. */
  start: number;
  /** Solar longitude and declination at the middle of the month. */
  solarLongitude: number;
  declination: number;
}

/**
 * Twelve months of equal time starting at the northern winter solstice (solar longitude 3 pi / 2), with the
 * mid-month solar longitude and declination. Month 0 is the month of the northern winter solstice, as in the
 * seasonal climate layers.
 */
export function monthTable(ecc: number, longPeri: number, obliquity: number, months = 12): CalendarMonth[] {
  const f0 = yearFractionAtTrueAnomaly((3 * PI) / 2 - longPeri, ecc);
  const out: CalendarMonth[] = [];
  for (let m = 0; m < months; m++) {
    const mid = solarLongitudeAtYearFraction(f0 + (m + 0.5) / months, ecc, longPeri);
    out.push({ start: m / months, solarLongitude: mid, declination: declination(mid, obliquity) });
  }
  return out;
}
