// Provenance: ported from upstream/VPLanet src/poise.c and src/system.c at dd55da7 (MIT); see PROVENANCE.md and decision P8.
// Port of VPLanet POISE insolation (src/poise.c at dd55da7, MIT): fvDailyInsolation (:5530), fvAnnualInsolation
// (:5602), fdEccTrueAnomaly (:5509), the latitude grid InitializeLatGrid (:1954) and kepler_eqn (src/system.c:385).
// All transcendental functions go through dmath. Orbital elements are fixed inputs.
import { dmath } from '@mapmaker/core';
import { EPS, PI } from './constants.js';

/** Latitudes (radians) of `n` cells equally spaced in sin(latitude), south to north (poise.c:1954). */
export function latGrid(n: number): Float64Array {
  const out = new Float64Array(n);
  const dx = 2.0 / n;
  for (let i = 0; i < n; i++) out[i] = dmath.asin(-1.0 + dx / 2 + i * dx);
  return out;
}

// fiSign (body.c:32): 0 for |x| <= EPS, otherwise the sign.
const fiSign = (x: number): number => (Math.abs(x) > EPS ? Math.trunc(x / Math.abs(x)) : 0);

/** Kepler's equation by the third-order iteration of kepler_eqn (system.c:385). Returns the eccentric anomaly. */
export function keplerEccentricAnomaly(meanA: number, ecc: number): number {
  if (meanA === 0) return 0;
  let eccA = meanA + fiSign(dmath.sin(meanA)) * 0.85 * ecc;
  let di3 = 1.0;
  // VPLanet loops while di3 > 1e-15, so a negative step ends it: the first guess overshoots, and the C code stops
  // after one step (residual 2e-12 rad at e = 0.0167, 7e-4 rad at e = 0.7). Here it runs to convergence (|step|), which
  // changes Earth's insolation by far less than the golden tolerance (decision P8).
  for (let iter = 0; Math.abs(di3) > 1e-15 && iter < 50; iter++) {
    const fi = eccA - ecc * dmath.sin(eccA) - meanA;
    const fi1 = 1.0 - ecc * dmath.cos(eccA);
    const fi2 = ecc * dmath.sin(eccA);
    const fi3 = ecc * dmath.cos(eccA);
    const di1 = -fi / fi1;
    const di2 = -fi / (fi1 + 0.5 * di1 * fi2);
    di3 = -fi / (fi1 + 0.5 * di2 * fi2 + (1. / 6.) * di2 * di2 * fi3);
    eccA += di3;
  }
  return eccA;
}

/** Eccentric anomaly from true anomaly (poise.c:5509). */
export function eccFromTrueAnomaly(trueA: number, ecc: number): number {
  const cosE = (dmath.cos(trueA) + ecc) / (1.0 + ecc * dmath.cos(trueA));
  return trueA < PI ? dmath.acos(cosE) : 2 * PI - dmath.acos(cosE);
}

export interface OrbitInput {
  /** Stellar luminosity, W. */
  luminosity_W: number;
  /** Semi-major axis, m. */
  semiMajorAxis_m: number;
  /** Eccentricity. */
  ecc: number;
  /** Obliquity, radians. */
  obliquity: number;
  /** Longitude of pericentre relative to the vernal equinox direction, radians (VPLanet dLongP). */
  longP: number;
  /** Precession angle, radians (VPLanet dPrecA; 0 for a fixed orbit). */
  precA?: number;
  /** Days in the year (VPLanet iNDays = floor(year / day)). */
  nDays: number;
}

/**
 * Daily-mean insolation (W/m^2) at the given latitudes for true longitude `trueL` and planet-star distance
 * `astroDist` (units of the semi-major axis). Port of fvDailyInsolation (poise.c:5530). Returns the declination.
 */
export function dailyInsolation(
  lats: ArrayLike<number>, sconst: number, obliquity: number, trueL: number, astroDist: number, out: Float64Array,
): number {
  const sinDelta = dmath.sin(obliquity) * dmath.sin(trueL);
  const cosDelta = dmath.sqrt(1.0 - sinDelta * sinDelta);
  const tanDelta = sinDelta / cosDelta;
  const delta = dmath.asin(sinDelta);
  const d2 = astroDist * astroDist;
  for (let i = 0; i < lats.length; i++) {
    const lat = lats[i]!;
    if (delta > 0.0) {
      if (lat >= PI / 2 - delta) {
        out[i] = sconst * dmath.sin(lat) * sinDelta / d2; // no sunset
      } else if (-lat >= PI / 2 - delta && lat < 0.0) {
        out[i] = 0.0; // polar night
      } else {
        const ha = dmath.acos(-dmath.tan(lat) * tanDelta);
        out[i] = sconst * (ha * dmath.sin(lat) * sinDelta + dmath.cos(lat) * cosDelta * dmath.sin(ha)) / (PI * d2);
      }
    } else if (-lat >= PI / 2 + delta && lat < 0.0) {
      out[i] = sconst * dmath.sin(lat) * sinDelta / d2; // no sunset
    } else if (lat >= PI / 2 + delta) {
      out[i] = 0.0; // polar night
    } else {
      const ha = dmath.acos(-dmath.tan(lat) * tanDelta);
      out[i] = sconst * (ha * dmath.sin(lat) * sinDelta + dmath.cos(lat) * cosDelta * dmath.sin(ha)) / (PI * d2);
    }
  }
  return delta;
}

export interface InsolationResult {
  /** Daily insolation, W/m^2, day-major: daily[day * nLats + lat]. Day 0 is the northern winter solstice. */
  daily: Float64Array;
  /** Annual mean at each latitude. */
  annual: Float64Array;
  /** Peak daily value at each latitude. */
  peak: Float64Array;
  /** Solar declination for each day, radians. */
  declination: Float64Array;
  nDays: number;
  nLats: number;
}

/** Insolation over one year at every latitude. Port of fvAnnualInsolation (poise.c:5602). */
export function annualInsolation(lats: ArrayLike<number>, orbit: OrbitInput): InsolationResult {
  const nLats = lats.length;
  const nDays = orbit.nDays;
  const sconst = orbit.luminosity_W / (4. * PI * orbit.semiMajorAxis_m * orbit.semiMajorAxis_m);
  const ecc = orbit.ecc;
  // Pericentre relative to the direction of the planet at the spring equinox.
  const longP = orbit.longP + (orbit.precA ?? 0) + PI;

  let trueL = -PI / 2; // the year starts at the northern winter solstice
  let trueA = trueL - longP;
  while (trueA < 0.0) trueA += 2 * PI;
  let eccA = eccFromTrueAnomaly(trueA, ecc);
  let meanL = eccA - ecc * dmath.sin(eccA) + longP;

  const daily = new Float64Array(nDays * nLats);
  const annual = new Float64Array(nLats);
  const peak = new Float64Array(nLats);
  const declination = new Float64Array(nDays);
  const row = new Float64Array(nLats);

  for (let day = 0; day < nDays; day++) {
    if (day !== 0) {
      meanL += 2 * PI / nDays;
      eccA = keplerEccentricAnomaly(meanL - longP, ecc);
      while (eccA >= 2 * PI) eccA -= 2 * PI;
      while (eccA < 0.0) eccA += 2 * PI;
      const a = dmath.acos((dmath.cos(eccA) - ecc) / (1.0 - ecc * dmath.cos(eccA)));
      trueA = eccA > PI ? 2 * PI - a : a;
      trueL = trueA + longP;
    }
    while (trueL > 2 * PI) trueL -= 2 * PI;
    while (trueL < 0.0) trueL += 2 * PI;

    // Planet-star distance in units of the semi-major axis.
    const astroDist = (1.0 - ecc * ecc) / (1.0 + ecc * dmath.cos(trueA));
    declination[day] = dailyInsolation(lats, sconst, orbit.obliquity, trueL, astroDist, row);
    for (let i = 0; i < nLats; i++) {
      const v = row[i]!;
      daily[day * nLats + i] = v;
      annual[i] = annual[i]! + v / nDays;
      if (v > peak[i]!) peak[i] = v;
    }
  }
  return { daily, annual, peak, declination, nDays, nLats };
}
