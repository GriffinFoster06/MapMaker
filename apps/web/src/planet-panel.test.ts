import { describe, expect, it } from 'vitest';
import { EARTH_PLANET } from '@mapmaker/planet';
import { PLANET_PRESETS, PLANET_SETTINGS, decodePlanetValues, encodePlanetValues, planetBadge, planetFromValues, withDefaults } from './planet-panel';
import { decodeState, encodeState } from './settings';

describe('planet panel', () => {
  it('the slider defaults are Earth, to the slider resolution', () => {
    expect(planetFromValues(withDefaults({}))).toEqual({});
    for (const s of PLANET_SETTINGS) {
      expect(s.def).toBeGreaterThanOrEqual(s.min);
      expect(s.def).toBeLessThanOrEqual(s.max);
      const earth = EARTH_PLANET[s.field] as number;
      expect(Math.abs(s.toInput(s.def) - earth) / earth || 0).toBeLessThan(1e-3);
    }
  });
  it('a moved slider reaches the generator in its own units, and only that one', () => {
    expect(planetFromValues({ obliquity: 10 })).toEqual({ obliquity_deg: 10 });
    expect(planetFromValues({ radius: 0.5 })).toEqual({ radius_m: 0.5 * EARTH_PLANET.radius_m });
    expect(planetFromValues({ rotation: 12 })).toEqual({ rotationPeriod_s: 43200 });
    expect(planetFromValues({ pressure: 2 })).toEqual({ surfacePressure_Pa: 2 * EARTH_PLANET.surfacePressure_Pa });
  });
  it('values are clamped to the slider range', () => {
    expect(planetFromValues({ obliquity: 500 })).toEqual({ obliquity_deg: 90 });
  });
  it('presets: Earth is empty, the others change the planet', () => {
    const by = Object.fromEntries(PLANET_PRESETS.map((p) => [p.id, p]));
    expect(planetFromValues(withDefaults(by['earth']!.values))).toEqual({});
    expect(Object.keys(planetFromValues(withDefaults(by['mars-like']!.values))).length).toBeGreaterThan(4);
    for (const p of PLANET_PRESETS) for (const k of Object.keys(p.values)) expect(PLANET_SETTINGS.some((s) => s.key === k)).toBe(true);
  });
  it('the badge reports the model validity', () => {
    expect(planetBadge({})).toEqual({ validity: 'ok', text: 'Earth' });
    expect(planetBadge({ obliquity: 30 }).validity).toBe('ok');
    expect(planetBadge({ obliquity: 45 }).validity).toBe('extrapolated');
    const mars = planetBadge(withDefaults(PLANET_PRESETS.find((p) => p.id === 'mars-like')!.values));
    expect(mars.validity).toBe('unsupported');
    expect(mars.text).toMatch(/outside model validity/);
    expect(planetBadge(withDefaults(PLANET_PRESETS.find((p) => p.id === 'super-earth')!.values)).validity).toBe('ok');
  });
  it('encodes only non-default values and reads them back, ignoring junk', () => {
    expect(encodePlanetValues(withDefaults({}))).toEqual({});
    const enc = encodePlanetValues({ obliquity: 12.5, mass: 2 });
    expect(enc).toEqual({ pl_obliquity: 12.5, pl_mass: 2 });
    const q = new URLSearchParams({ pl_obliquity: '12.5', pl_mass: 'abc', pl_unknown: '3', pl_radius: '99' });
    expect(decodePlanetValues(q)).toEqual({ obliquity: 12.5, radius: 3 });
  });
  it('the page URL carries the planet and round-trips', () => {
    const q = encodeState({ seed: 7, tier: '50k', params: {}, planet: { obliquity: 12.5, rotation: 30 } });
    expect(q).toContain('pl_obliquity=12.5');
    expect(decodeState(q).planet).toEqual({ obliquity: 12.5, rotation: 30 });
    expect(encodeState({ seed: 7, params: {}, planet: withDefaults({}) })).toBe('seed=7');
  });
});
