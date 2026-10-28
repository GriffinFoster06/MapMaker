// Phase 6 M2 (design note 10): the planet-parameter mapping against orogen's vendored constants.
import { describe, expect, it } from 'vitest';
import { CLIMATE_TAGS, EARTH_PLANET, TERRAIN_BASE, mapPlanet } from '@mapmaker/planet';
import { CLIMATE_DEFAULTS } from '../vendor/js/climate-config.js';
import { PEAK_COMPRESS_POWER } from '../vendor/js/terrain-config.js';

const base = CLIMATE_DEFAULTS as Readonly<Record<string, number>>;

describe('climate constant tags', () => {
  it('every orogen climate constant is tagged, and every tag names a constant', () => {
    expect(Object.keys(CLIMATE_TAGS).sort()).toEqual(Object.keys(base).sort());
    expect(Object.keys(base).length).toBe(97);
  });
  it('each tag has a class, a rule and a unit', () => {
    for (const t of Object.values(CLIMATE_TAGS)) {
      expect(['a', 'b', 'c']).toContain(t.tag);
      expect(t.rule.length).toBeGreaterThan(0);
      expect(t.unit.length).toBeGreaterThan(0);
    }
  });
  it('the terrain base matches the vendored terrain constant', () => {
    expect(TERRAIN_BASE['PEAK_COMPRESS_POWER']).toBe(PEAK_COMPRESS_POWER);
  });
});

describe('identity at Earth (note 10 §3.3)', () => {
  const r = mapPlanet({}, base);
  it('returns CLIMATE_DEFAULTS bit for bit', () => {
    for (const k of Object.keys(base)) expect(Object.is(r.climateConstants[k], base[k])).toBe(true);
  });
  it('leaves the terrain constant, validity and land cover at their Earth values', () => {
    expect(r.terrainConstants['PEAK_COMPRESS_POWER']).toBe(PEAK_COMPRESS_POWER);
    expect(r.validity).toBe('ok');
    expect(r.landCoverage).toBeCloseTo(0.31, 12);
    for (const v of Object.values(r.ratios)) expect(v).toBe(1);
  });
  it('the report has one complete entry per constant', () => {
    expect(r.report.length).toBe(97);
    for (const e of r.report) {
      expect(e.value).toBe(e.earthValue);
      expect(e.validity).toBe('ok');
    }
  });
});

describe('monotonicity and sign (note 10 §5)', () => {
  const m = (x: Parameters<typeof mapPlanet>[0]) => mapPlanet(x, base).climateConstants;
  const E = EARTH_PLANET;
  it('faster rotation moves the subtropical highs and the subpolar lows equatorward', () => {
    const fast = m({ rotationPeriod_s: E.rotationPeriod_s / 2 });
    const slow = m({ rotationPeriod_s: E.rotationPeriod_s * 2 });
    expect(fast['WIND_SUBTROP_HIGH_LAT_DEG']!).toBeLessThan(base['WIND_SUBTROP_HIGH_LAT_DEG']!);
    expect(slow['WIND_SUBTROP_HIGH_LAT_DEG']!).toBeGreaterThan(base['WIND_SUBTROP_HIGH_LAT_DEG']!);
    expect(fast['WIND_SUBPOLAR_LOW_LAT_DEG']!).toBeLessThan(base['WIND_SUBPOLAR_LOW_LAT_DEG']!);
  });
  it('higher obliquity raises the ITCZ excursion and the seasonal swing; none gives no swing', () => {
    const hi = m({ obliquity_deg: 35 });
    expect(hi['WIND_ITCZ_CLAMP_DEG']!).toBeGreaterThan(base['WIND_ITCZ_CLAMP_DEG']!);
    expect(hi['TEMP_SWING_SCALE']!).toBeGreaterThan(base['TEMP_SWING_SCALE']!);
    const zero = m({ obliquity_deg: 0, eccentricity: 0 });
    expect(zero['TEMP_SWING_SCALE']!).toBeLessThan(0.05 * base['TEMP_SWING_SCALE']!);
  });
  it('higher gravity raises the lapse rates and lowers the peak-compression exponent', () => {
    const heavy = mapPlanet({ mass_kg: E.mass_kg * 2 }, base);
    expect(heavy.climateConstants['TEMP_DRY_LAPSE_EXTRA_C_PER_KM']!).toBeGreaterThan(base['TEMP_DRY_LAPSE_EXTRA_C_PER_KM']!);
    expect(heavy.terrainConstants['PEAK_COMPRESS_POWER']!).toBeLessThan(PEAK_COMPRESS_POWER);
  });
  it('a stronger greenhouse raises the fitted peak temperature', () => {
    expect(m({ greenhouse_Wm2: 20 })['TEMP_PEAK_C']!).toBeGreaterThan(base['TEMP_PEAK_C']!);
    expect(m({ greenhouse_Wm2: -20 })['TEMP_PEAK_C']!).toBeLessThan(base['TEMP_PEAK_C']!);
  });
  it('a dimmer star lowers the fitted peak temperature', () => {
    expect(m({ luminosity_W: E.luminosity_W * 0.9 })['TEMP_PEAK_C']!).toBeLessThan(base['TEMP_PEAK_C']!);
  });
  it('pressure bands scale with surface pressure', () => {
    expect(m({ surfacePressure_Pa: E.surfacePressure_Pa * 2 })['WIND_SUBTROP_HIGH_STRENGTH_HPA']!).toBeCloseTo(2 * base['WIND_SUBTROP_HIGH_STRENGTH_HPA']!, 10);
  });
  it('ocean fraction sets the land cover', () => {
    expect(mapPlanet({ oceanFraction: 0.5 }, base).landCoverage).toBeCloseTo(0.5, 12);
  });
});

describe('validity bounds (note 10 §3.4)', () => {
  const v = (x: Parameters<typeof mapPlanet>[0]) => mapPlanet(x, base).validity;
  it('flags extrapolated and unsupported inputs, and still maps them', () => {
    expect(v({ rotationPeriod_s: EARTH_PLANET.rotationPeriod_s / 3 })).toBe('extrapolated');
    expect(v({ rotationPeriod_s: EARTH_PLANET.rotationPeriod_s / 5 })).toBe('unsupported');
    expect(v({ obliquity_deg: 45 })).toBe('extrapolated');
    expect(v({ obliquity_deg: 60 })).toBe('unsupported');
    expect(v({ surfacePressure_Pa: EARTH_PLANET.surfacePressure_Pa * 4 })).toBe('extrapolated');
    expect(v({ tidallyLocked: true })).toBe('unsupported');
    const odd = mapPlanet({ obliquity_deg: 60, tidallyLocked: true }, base);
    expect(odd.notes.length).toBeGreaterThan(1);
    for (const x of Object.values(odd.climateConstants)) expect(Number.isFinite(x)).toBe(true);
  });
});

describe('determinism and a Mars-like planet', () => {
  const mars = {
    radius_m: 3.3895e6, mass_kg: 6.417e23, rotationPeriod_s: 88642.66, obliquity_deg: 25.19, eccentricity: 0.0934,
    semiMajorAxis_AU: 1.5237, surfacePressure_Pa: 610, oceanFraction: 0.3, greenhouse_Wm2: 0, meanMolarMass: 43.34,
  };
  it('is repeatable', () => {
    expect(JSON.stringify(mapPlanet(mars, base))).toBe(JSON.stringify(mapPlanet(mars, base)));
  });
  it('produces finite constants and flags the thin atmosphere', () => {
    const r = mapPlanet(mars, base);
    for (const x of Object.values(r.climateConstants)) expect(Number.isFinite(x)).toBe(true);
    expect(r.validity).toBe('unsupported');
    expect(r.climateConstants['WIND_SUBTROP_HIGH_STRENGTH_HPA']!).toBeLessThan(base['WIND_SUBTROP_HIGH_STRENGTH_HPA']! * 0.01);
  });
});
