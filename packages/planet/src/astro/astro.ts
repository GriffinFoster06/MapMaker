// Original code (design note 20; Phase 6a M5): stage 0a, the sky of a planet. Inputs are the star (or two), the planet's orbit
// and spin, and moons; outputs are the bodies table, the values the climate mapping needs (PlanetInput patch), the calendar,
// equilibrium tides, eclipse frequency and habitability flags. Built on the ports in this package (Baraffe stars, LL13
// circumbinary orbits, Kopparapu habitable zone) and on standard celestial mechanics (Kepler's laws; equilibrium tide:
// Murray & Dermott 1999 ch. 4; spin-orbit locking time: Gladman et al. 1996, Icarus 122; Holman & Wiegert 1999 stability).
import { dmath } from '@mapmaker/core';
import { BIGG } from '../eqtide/ctl.js';
import { AUM, DAYSEC, DEGRAD, MSUN, YEARSEC } from '../poise/constants.js';
import { baraffeStar, habitableZone } from '../stellar/baraffe.js';
import type { PlanetInput } from '../mapping/earth.js';

export interface StarSpec {
  /** Mass in solar masses. */
  massSolar: number;
  /** Age in Gyr. */
  ageGyr: number;
  /** Override the Baraffe luminosity, W (e.g. exactly 3.846e26 for the Sun). */
  luminosity_W?: number;
  /** Override the Baraffe effective temperature, K. */
  teff_K?: number;
  /** Override the Baraffe radius, m. */
  radius_m?: number;
}

export interface MoonSpec {
  name?: string;
  mass_kg: number;
  radius_m: number;
  semiMajorAxis_m: number;
  /** Inclination to the planet's orbital plane, degrees. */
  inclination_deg: number;
}

export interface AstroInput {
  star: StarSpec;
  /** A second star (circumbinary planet): the binary's orbit, with the pair orbiting the planet's barycentre. */
  companion?: { star: StarSpec; semiMajorAxis_AU: number; eccentricity: number };
  planet: {
    semiMajorAxis_AU: number;
    eccentricity: number;
    obliquity_deg: number;
    rotationPeriod_s: number;
    longPerihelion_deg: number;
    mass_kg: number;
    radius_m: number;
  };
  moons: MoonSpec[];
}

export interface BodyRow {
  id: string;
  kind: 'star' | 'planet' | 'moon';
  mass_kg: number;
  radius_m: number;
  luminosity_W?: number;
  teff_K?: number;
  /** Semi-major axis about its primary (stars: the binary, if any), m. */
  semiMajorAxis_m: number;
  eccentricity: number;
  period_s: number;
}

export interface LeapRule {
  /** Leap days per cycle and the cycle length in years (a continued-fraction convergent of the year/day ratio). */
  leapDays: number;
  years: number;
  /** Calendar drift in days per year. */
  errorDaysPerYear: number;
}

export interface MoonCalendar {
  name: string;
  siderealMonth_days: number;
  synodicMonth_days: number;
  monthsPerYear: number;
  solarEclipsesPerYear: number;
  /** Equilibrium tide amplitude of this moon at the equator, m. */
  tideAmplitude_m: number;
}

export interface AstroResult {
  bodies: BodyRow[];
  /** What the climate mapping reads from the sky: merge into the planet's inputs. */
  planetInput: Pick<PlanetInput, 'luminosity_W' | 'semiMajorAxis_AU' | 'eccentricity' | 'obliquity_deg' | 'rotationPeriod_s' | 'longPerihelion_deg' | 'tidallyLocked'>;
  calendar: {
    day_s: number;
    year_s: number;
    daysPerYear: number;
    moons: MoonCalendar[];
    leapRules: LeapRule[];
  };
  tide: {
    /** Equilibrium amplitude of the star's tide at the equator, m. */
    starAmplitude_m: number;
    /** Sum of all constituents at the equator (spring tide), m. */
    springEquator_m: number;
  };
  habitability: {
    /** The six Kopparapu (2013) limits, AU (see `habitableZone`). */
    limits_AU: number[];
    zone: 'too hot' | 'inner edge' | 'habitable zone' | 'outer edge' | 'too cold';
    lockTime_yr: number;
    tidallyLocked: boolean;
  };
  /** Reasons the sky is outside the models, empty when everything is supported. */
  notes: string[];
  validity: 'ok' | 'extrapolated' | 'unsupported';
}

const cube = (x: number): number => x * x * x;
const starProps = (s: StarSpec): { L: number; T: number; R: number } => {
  const b = baraffeStar(s.massSolar * MSUN, s.ageGyr * 1e9);
  return { L: s.luminosity_W ?? b.luminosity, T: s.teff_K ?? b.temperature, R: s.radius_m ?? b.radius };
};

/** Amplitude (m) of the semidiurnal equilibrium tide at the equator raised by a body of `mass` at distance `d` (Murray & Dermott). */
export const equilibriumTide = (mass: number, d: number, planetMass: number, planetRadius: number): number =>
  0.75 * (mass / planetMass) * cube(planetRadius / d) * planetRadius;

/** Equilibrium tide amplitude at latitude `lat` (rad) for the semidiurnal constituent: cos^2 of latitude. */
export const tideAtLatitude = (equatorAmplitude: number, lat: number): number => equatorAmplitude * dmath.cos(lat) * dmath.cos(lat);

/** Convergents of the continued fraction of `ratio` (year / day): [365, 1/4, ...] gives leap rules. */
export function leapRules(ratio: number, maxTerms = 6): LeapRule[] {
  const out: LeapRule[] = [];
  const whole = Math.floor(ratio);
  let frac = ratio - whole;
  // Convergents p/q of [0; a1, a2, ...] start from p0/q0 = 0/1 and p(-1)/q(-1) = 1/0.
  let h1 = 0;
  let h0 = 1;
  let k1 = 1;
  let k0 = 0;
  for (let i = 0; i < maxTerms && frac > 1e-9; i++) {
    const x = 1 / frac;
    const a = Math.floor(x);
    frac = x - a;
    const h = a * h1 + h0;
    const k = a * k1 + k0;
    h0 = h1; h1 = h;
    k0 = k1; k1 = k;
    // convergent for the fractional part: h / k leap days per k years
    out.push({ leapDays: k1 === 0 ? 0 : h1, years: k1, errorDaysPerYear: Math.abs(whole + h1 / k1 - ratio) });
  }
  // The first convergent of the fractional part is the integer-level rule; keep only distinct, useful ones.
  return out.filter((r, i) => i === 0 || r.errorDaysPerYear < out[i - 1]!.errorDaysPerYear);
}

export function computeAstro(input: AstroInput): AstroResult {
  const notes: string[] = [];
  let validity: AstroResult['validity'] = 'ok';
  const worse = (v: AstroResult['validity']): void => {
    if (v === 'unsupported' || (v === 'extrapolated' && validity === 'ok')) validity = v;
  };

  const s0 = starProps(input.star);
  const m0 = input.star.massSolar * MSUN;
  if (!(Number.isFinite(s0.L) && Number.isFinite(s0.T))) {
    notes.push('star outside the Baraffe (2015) grid (0.07 to 1.4 solar masses, 1 Myr to about 10 Gyr): give a luminosity and temperature');
    worse('unsupported');
  }
  let s1: { L: number; T: number; R: number } | null = null;
  let m1 = 0;
  if (input.companion) {
    s1 = starProps(input.companion.star);
    m1 = input.companion.star.massSolar * MSUN;
    if (!Number.isFinite(s1.L)) {
      notes.push('companion star outside the Baraffe grid');
      worse('unsupported');
    }
  }
  const L = s0.L + (s1?.L ?? 0);
  const Mstars = m0 + m1;
  const p = input.planet;
  const a = p.semiMajorAxis_AU * AUM;
  const year_s = (2 * Math.PI * dmath.sqrt(cube(a) / (BIGG * (Mstars + p.mass_kg))));

  const bodies: BodyRow[] = [
    { id: 'star0', kind: 'star', mass_kg: m0, radius_m: s0.R, luminosity_W: s0.L, teff_K: s0.T, semiMajorAxis_m: 0, eccentricity: 0, period_s: 0 },
  ];
  if (input.companion && s1) {
    const ab = input.companion.semiMajorAxis_AU * AUM;
    const periodB = 2 * Math.PI * dmath.sqrt((ab * ab * ab) / (BIGG * Mstars));
    bodies.push({ id: 'star1', kind: 'star', mass_kg: m1, radius_m: s1.R, luminosity_W: s1.L, teff_K: s1.T, semiMajorAxis_m: ab, eccentricity: input.companion.eccentricity, period_s: periodB });
    // Holman & Wiegert (1999) critical semi-major axis for a circumbinary planet.
    const e = input.companion.eccentricity;
    const mu = m1 / Mstars;
    const aCrit = (1.6 + 5.1 * e - 2.22 * e * e + 4.12 * mu - 4.27 * e * mu - 5.09 * mu * mu + 4.61 * e * e * mu * mu) * ab;
    if (a < aCrit) {
      notes.push(`planet orbit (${p.semiMajorAxis_AU} AU) is inside the binary's critical radius (${(aCrit / AUM).toFixed(3)} AU, Holman and Wiegert 1999): unstable`);
      worse('unsupported');
    }
  }
  bodies.push({ id: 'planet', kind: 'planet', mass_kg: p.mass_kg, radius_m: p.radius_m, semiMajorAxis_m: a, eccentricity: p.eccentricity, period_s: year_s });

  const day_s = p.rotationPeriod_s;
  const moonCal: MoonCalendar[] = [];
  const tideAmps: number[] = [];
  const sunT = equilibriumTide(Mstars, a, p.mass_kg, p.radius_m);
  tideAmps.push(sunT);
  for (const [i, m] of input.moons.entries()) {
    const id = m.name ?? `moon${i}`;
    const P = 2 * Math.PI * dmath.sqrt(cube(m.semiMajorAxis_m) / (BIGG * (p.mass_kg + m.mass_kg)));
    bodies.push({ id, kind: 'moon', mass_kg: m.mass_kg, radius_m: m.radius_m, semiMajorAxis_m: m.semiMajorAxis_m, eccentricity: 0, period_s: P });
    const synodic = 1 / Math.abs(1 / P - 1 / year_s);
    // A solar eclipse needs the moon within the eclipse limit of the node at new moon: the sum of the angular radii of the
    // star and the moon and the parallax of the moon seen from the planet's surface.
    const thetaStar = s0.R / a;
    const thetaMoon = m.radius_m / m.semiMajorAxis_m;
    const parallax = p.radius_m / m.semiMajorAxis_m;
    const limit = thetaStar + thetaMoon + parallax;
    const inc = Math.max(m.inclination_deg * DEGRAD, 1e-12);
    const fraction = inc <= limit ? 1 : (2 / Math.PI) * dmath.asin(limit / inc);
    const perYear = year_s / synodic;
    const tide = equilibriumTide(m.mass_kg, m.semiMajorAxis_m, p.mass_kg, p.radius_m);
    tideAmps.push(tide);
    moonCal.push({
      name: id, siderealMonth_days: P / DAYSEC, synodicMonth_days: synodic / DAYSEC, monthsPerYear: perYear,
      solarEclipsesPerYear: perYear * fraction, tideAmplitude_m: tide,
    });
  }

  // Habitability: Kopparapu (2013) limits for the total luminosity at the (luminosity-weighted) effective temperature.
  const teff = s1 ? (s0.L * s0.T + s1.L * s1.T) / L : s0.T;
  const limits = habitableZone(L, teff).map((x) => x / AUM);
  const zone = a / AUM < limits[0]! ? 'too hot' : a / AUM < limits[1]! ? 'inner edge' : a / AUM <= limits[4]! ? 'habitable zone' : a / AUM <= limits[5]! ? 'outer edge' : 'too cold';
  // Tidal locking (Gladman et al. 1996): t = omega a^6 I Q / (3 G m*^2 k2 R^5), I = 0.33 m R^2, Q = 100, k2 = 0.3.
  const omega = (2 * Math.PI) / day_s;
  const lock_s = (omega * cube(a) * cube(a) * 0.33 * p.mass_kg * 100) / (3 * BIGG * Mstars * Mstars * 0.3 * cube(p.radius_m));
  const lockTime_yr = lock_s / YEARSEC;
  const tidallyLocked = lockTime_yr < input.star.ageGyr * 1e9;
  if (tidallyLocked) {
    notes.push('the planet is tidally locked by its star within the star\'s age: the climate model does not cover it');
    worse('unsupported');
  }

  return {
    bodies,
    planetInput: {
      luminosity_W: L, semiMajorAxis_AU: p.semiMajorAxis_AU, eccentricity: p.eccentricity, obliquity_deg: p.obliquity_deg,
      rotationPeriod_s: day_s, longPerihelion_deg: p.longPerihelion_deg, tidallyLocked,
    },
    calendar: { day_s, year_s, daysPerYear: year_s / day_s, moons: moonCal, leapRules: leapRules(year_s / day_s) },
    tide: { starAmplitude_m: sunT, springEquator_m: tideAmps.reduce((s, x) => s + x, 0) },
    habitability: { limits_AU: limits, zone, lockTime_yr, tidallyLocked },
    notes,
    validity,
  };
}

/** Stellar torque multiplier for DistRot from the moons (1 + sum (m / M) (a / d)^3). */
export function moonTorqueMultiplier(input: AstroInput): number {
  const a = input.planet.semiMajorAxis_AU * AUM;
  const M = input.star.massSolar * MSUN + (input.companion ? input.companion.star.massSolar * MSUN : 0);
  return 1 + input.moons.reduce((s, m) => s + (m.mass_kg / M) * cube(a / m.semiMajorAxis_m), 0);
}
