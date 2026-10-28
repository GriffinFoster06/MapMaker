// Original code (design note 10 §3.2 to §3.4): a pure function from planet parameters to orogen's climate constants.
// Every rule is written as (base value) x (ratio of a physical quantity to Earth's), so Earth inputs return the base
// constants bit for bit. The fitted constants (class c) apply the difference between the planet's and Earth's fit to
// the base values, which also gives exact identity.
//   Held & Hou (1980), J. Atmos. Sci. 37: Hadley-cell edge ~ (g H dtheta / (Omega^2 R^2 theta0))^(1/2);
//   Williams & Kasting (1997), Icarus 129: heat-transport coefficient D ~ (p / p_E)(cp / cp_E)(mu_E / mu)^2 (Omega_E / Omega)^2.
import { dmath } from '@mapmaker/core';
import { solveAnnualEbm } from '../poise/ebm-annual.js';
import { annualInsolation, latGrid } from '../poise/insolation.js';
import { fitTempCurve, type TempCurve } from './fit.js';
import { AUM, DEGRAD, EARTH_PLANET, rotationRate, surfaceGravity, type PlanetInput } from './earth.js';
import { CLIMATE_TAGS } from './tags.js';

export type Validity = 'ok' | 'extrapolated' | 'unsupported';

export interface MappingEntry {
  key: string;
  value: number;
  earthValue: number;
  tag: 'a' | 'b' | 'c';
  rule: string;
  unit: string;
  validity: Validity;
}

export interface Ratios {
  gravity: number;
  rotation: number;
  radius: number;
  pressure: number;
  obliquity: number;
  hadley: number;
  seasonalAmplitude: number;
  diffusion: number;
}

export interface MappingResult {
  inputs: PlanetInput;
  ratios: Ratios;
  /** The full set of climate constants: the base values with the mapped ones replaced. */
  climateConstants: Record<string, number>;
  /** Overrides of terrain constants that depend on gravity. */
  terrainConstants: Record<string, number>;
  /** Land cover for the generator (1 - ocean fraction). */
  landCoverage: number;
  report: MappingEntry[];
  validity: Validity;
  /** Reasons for any validity other than 'ok'. */
  notes: string[];
}

/** Terrain constant that depends on gravity (packages/gen-orogen/vendor/js/terrain-config.js:421). */
export const TERRAIN_BASE: Readonly<Record<string, number>> = Object.freeze({ PEAK_COMPRESS_POWER: 0.9 });

const EARTH_DIFFUSION = 0.44;
const N_LATS = 90;
const sq = (x: number): number => x * x;
const worse = (a: Validity, b: Validity): Validity => (a === 'unsupported' || b === 'unsupported' ? 'unsupported' : a === 'extrapolated' || b === 'extrapolated' ? 'extrapolated' : 'ok');

function ebmProfile(p: PlanetInput): { latDeg: Float64Array; temp: Float64Array; seasonal: number } {
  const lats = latGrid(N_LATS);
  const mass = 1; // stellar mass in solar masses: the year length follows from a only
  const year_s = 3.15576e7 * dmath.sqrt((p.semiMajorAxis_AU * p.semiMajorAxis_AU * p.semiMajorAxis_AU) / mass);
  const nDays = Math.max(12, Math.min(800, Math.round(year_s / p.rotationPeriod_s)));
  const ins = annualInsolation(lats, {
    luminosity_W: p.luminosity_W, semiMajorAxis_m: p.semiMajorAxis_AU * AUM, ecc: p.eccentricity,
    obliquity: p.obliquity_deg * DEGRAD, longP: p.longPerihelion_deg * DEGRAD, nDays,
  });
  const diffusion = EARTH_DIFFUSION
    * (p.surfacePressure_Pa / EARTH_PLANET.surfacePressure_Pa) * (p.cp / EARTH_PLANET.cp)
    * sq(EARTH_PLANET.meanMolarMass / p.meanMolarMass) * sq(rotationRate(EARTH_PLANET) / rotationRate(p));
  const albedo = p.oceanFraction * 0.263 + (1 - p.oceanFraction) * 0.363;
  const ebm = solveAnnualEbm({
    lats, annualInsol: ins.annual, diffusion, surfAlbedo: albedo, planckA: 203.3 - p.greenhouse_Wm2,
  });
  // Seasonal amplitude of insolation at mid-latitudes: mean of (peak - annual) / annual for |lat| in [30, 60] degrees.
  let s = 0;
  let cnt = 0;
  const latDeg = new Float64Array(N_LATS);
  for (let i = 0; i < N_LATS; i++) {
    latDeg[i] = lats[i]! / DEGRAD;
    const a = Math.abs(latDeg[i]!);
    if (a >= 30 && a <= 60) {
      s += (ins.peak[i]! - ins.annual[i]!) / ins.annual[i]!;
      cnt++;
    }
  }
  return { latDeg, temp: ebm.temp, seasonal: s / cnt };
}

/**
 * Maps planet parameters to climate constants. `base` is the Earth set (orogen's CLIMATE_DEFAULTS); every key must be
 * tagged in CLIMATE_TAGS.
 */
export function mapPlanet(input: Partial<PlanetInput>, base: Readonly<Record<string, number>>): MappingResult {
  const p: PlanetInput = { ...EARTH_PLANET, ...input };
  const E = EARTH_PLANET;
  const notes: string[] = [];

  const g = surfaceGravity(p);
  const gE = surfaceGravity(E);
  const gravity = g / gE;
  const rotation = rotationRate(p) / rotationRate(E);
  const radius = p.radius_m / E.radius_m;
  const pressure = p.surfacePressure_Pa / E.surfacePressure_Pa;
  const obliquity = dmath.sin(p.obliquity_deg * DEGRAD) / dmath.sin(E.obliquity_deg * DEGRAD);
  const hadley = dmath.sqrt(gravity) / (rotation * radius);
  const diffusion = (pressure * (p.cp / E.cp) * sq(E.meanMolarMass / p.meanMolarMass)) / (rotation * rotation);

  // Validity of the inputs (note 10 §3.4).
  let validity: Validity = 'ok';
  const flag = (v: Validity, why: string): void => {
    if (v !== 'ok') {
      validity = worse(validity, v);
      notes.push(why);
    }
  };
  flag(rotation < 0.25 || rotation > 4 ? 'unsupported' : rotation < 0.5 || rotation > 2 ? 'extrapolated' : 'ok', `rotation rate ${rotation.toFixed(3)} x Earth`);
  flag(p.obliquity_deg > 54 ? 'unsupported' : p.obliquity_deg > 40 ? 'extrapolated' : 'ok', `obliquity ${p.obliquity_deg} deg`);
  flag(pressure < 0.1 || pressure > 10 ? 'unsupported' : pressure < 0.5 || pressure > 2 ? 'extrapolated' : 'ok', `surface pressure ${pressure.toFixed(3)} x Earth`);
  flag(gravity < 0.3 || gravity > 3 ? 'extrapolated' : 'ok', `gravity ${gravity.toFixed(3)} x Earth`);
  flag(p.tidallyLocked ? 'unsupported' : 'ok', 'tidally locked');

  // The energy-balance profile, for the fitted constants and the seasonal-amplitude ratio.
  const planetProfile = ebmProfile(p);
  const earthProfile = ebmProfile(E);
  const seasonalAmplitude = planetProfile.seasonal / earthProfile.seasonal;

  const startCurve: TempCurve = {
    peak: base['TEMP_PEAK_C']!, range: base['TEMP_POLEWARD_RANGE_C']!, exp: base['TEMP_POLEWARD_EXP']!, plateau: base['TEMP_TROPICAL_PLATEAU_DEG']!,
  };
  const sameInputs = JSON.stringify(p) === JSON.stringify(E);
  let curveDelta: TempCurve = { peak: 0, range: 0, exp: 0, plateau: 0 };
  if (!sameInputs) {
    const fp = fitTempCurve(planetProfile.latDeg, planetProfile.temp, startCurve);
    const fe = fitTempCurve(earthProfile.latDeg, earthProfile.temp, startCurve);
    curveDelta = { peak: fp.peak - fe.peak, range: fp.range - fe.range, exp: fp.exp - fe.exp, plateau: fp.plateau - fe.plateau };
  }

  // Latitude of a band edge under Held-Hou scaling: sin(lat) scales with the Hadley ratio.
  const bandLat = (v: number, cap = 85): number => (hadley === 1 ? v : Math.min(cap, dmath.asin(Math.min(1, hadley * dmath.sin(v * DEGRAD))) / DEGRAD));
  // Distances and widths in the same belt scale linearly.
  const bandLen = (v: number, cap = 85): number => (hadley === 1 ? v : Math.min(cap, v * hadley));
  const byRatio = (v: number, r: number): number => (r === 1 ? v : v * r);

  const mapped: Record<string, number> = { ...base };
  const set = (k: string, v: number): void => {
    mapped[k] = v;
  };
  // Class a: Held-Hou belts
  for (const k of ['WIND_SUBTROP_HIGH_LAT_DEG', 'PRECIP_SUBTROP_CENTER_SUMMER_DEG', 'PRECIP_SUBTROP_CENTER_WINTER_DEG', 'WIND_SUBPOLAR_LOW_LAT_DEG', 'HEUR_ZONAL_WESTERLY_PEAK_DEG']) set(k, bandLat(base[k]!));
  for (const k of ['WIND_SUBTROP_HIGH_WIDTH_DEG', 'HEUR_ZONAL_DESERT_END_DEG', 'HEUR_ZONAL_DRY_POLEWARD_DEG']) set(k, bandLen(base[k]!));
  // Class a: obliquity (subsolar-latitude amplitude)
  for (const k of ['WIND_ITCZ_CLAMP_DEG', 'WIND_SUBTROP_SEASONAL_SHIFT_DEG']) set(k, byRatio(base[k]!, obliquity));
  // Class a: pressure bands
  for (const k of ['WIND_ITCZ_LOW_DEPTH_HPA', 'WIND_SUBTROP_HIGH_STRENGTH_HPA', 'WIND_SUBPOLAR_LOW_DEPTH_HPA', 'WIND_POLAR_HIGH_STRENGTH_HPA', 'WIND_SUMMER_THERMAL_LOW_HPA', 'WIND_WINTER_THERMAL_HIGH_HPA']) set(k, byRatio(base[k]!, pressure));
  // Class a: gravity (lapse rates), seasonal swing
  for (const k of ['TEMP_MOIST_LAPSE_C_PER_KM', 'TEMP_DRY_LAPSE_EXTRA_C_PER_KM']) set(k, byRatio(base[k]!, gravity));
  set('TEMP_SWING_SCALE', byRatio(base['TEMP_SWING_SCALE']!, seasonalAmplitude));
  // Class c: the fitted temperature curve
  // The fit is bounded (plateau 0 to 60 degrees, exponent 0.3 to 4, range at least 1); the applied values keep the same bounds.
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  set('TEMP_PEAK_C', base['TEMP_PEAK_C']! + curveDelta.peak);
  set('TEMP_POLEWARD_RANGE_C', Math.max(1, base['TEMP_POLEWARD_RANGE_C']! + curveDelta.range));
  set('TEMP_POLEWARD_EXP', clamp(base['TEMP_POLEWARD_EXP']! + curveDelta.exp, 0.3, 4));
  set('TEMP_TROPICAL_PLATEAU_DEG', clamp(base['TEMP_TROPICAL_PLATEAU_DEG']! + curveDelta.plateau, 0, 60));

  const terrainConstants: Record<string, number> = { ...TERRAIN_BASE };
  if (gravity !== 1) terrainConstants['PEAK_COMPRESS_POWER'] = Math.min(1, Math.max(0.5, 1 - 0.1 * gravity));

  const report: MappingEntry[] = Object.keys(base).map((key) => {
    const t = CLIMATE_TAGS[key];
    if (!t) throw new Error(`climate constant ${key} has no tag in CLIMATE_TAGS`);
    return { key, value: mapped[key]!, earthValue: base[key]!, tag: t.tag, rule: t.rule, unit: t.unit, validity };
  });

  return {
    inputs: p,
    ratios: { gravity, rotation, radius, pressure, obliquity, hadley, seasonalAmplitude, diffusion },
    climateConstants: mapped,
    terrainConstants,
    landCoverage: 1 - p.oceanFraction,
    report,
    validity,
    notes,
  };
}
