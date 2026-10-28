import { describe, expect, it } from 'vitest';
import type { World } from '@mapmaker/core';
import { CLIMATE_DEFAULTS } from '../vendor/js/climate-config.js';
import { planetContext, recordPlanet } from './params.js';

// The Earth sky: every value equals EARTH_PLANET, so the mapping must return orogen's constants bit for bit.
const earthSky = {
  star: { massSolar: 1, ageGyr: 4.6, luminosity_W: 3.846e26, teff_K: 5772, radius_m: 6.957e8 },
  planet: { semiMajorAxis_AU: 1.00000011, eccentricity: 0.0167, obliquity_deg: 23.44, rotationPeriod_s: 86164.0905, longPerihelion_deg: 102.94719, mass_kg: 5.972e24, radius_m: 6.371e6 },
  moons: [{ name: 'Moon', mass_kg: 7.342e22, radius_m: 1.7374e6, semiMajorAxis_m: 3.844e8, inclination_deg: 5.145 }],
};

// recordPlanet only touches world.planet.
const fakeWorld = (): World => ({ planet: {} }) as unknown as World;

describe('astro in the generator params (stage 0a)', () => {
  it('without a sky or a planet nothing is recorded, so existing hashes hold', () => {
    expect(planetContext({})).toBeNull();
    const world = fakeWorld();
    recordPlanet(world, null);
    expect(world.planet['astro']).toBeUndefined();
    expect(world.planet['mapping']).toBeUndefined();
  });

  it('the Earth sky maps to orogen\'s own climate constants (identity) and records the sky', () => {
    const c = planetContext({ astro: earthSky });
    expect(c).not.toBeNull();
    expect(Object.keys(c!.climate)).toEqual([]);
    expect(c!.radiusKm).toBe(6371);
    expect(c!.mapping.validity).toBe('ok');
    const world = fakeWorld();
    recordPlanet(world, c);
    const rec = world.planet['astro'] as { bodies: unknown[]; calendar: { moons: unknown[] }; validity: string };
    expect(rec.bodies.length).toBe(3);
    expect(rec.calendar.moons.length).toBe(1);
    expect(rec.validity).toBe('ok');
    void CLIMATE_DEFAULTS;
  });

  it('a close-in planet around a K dwarf is reported unsupported through the mapping record', () => {
    const c = planetContext({ astro: { ...earthSky, star: { massSolar: 0.7, ageGyr: 5 }, planet: { ...earthSky.planet, semiMajorAxis_AU: 0.1 }, moons: [] } });
    const world = fakeWorld();
    recordPlanet(world, c);
    const mapping = world.planet['mapping'] as { validity: string; notes: string[] };
    expect(mapping.validity).toBe('unsupported');
    expect(mapping.notes.some((n) => /tidally locked/.test(n))).toBe(true);
  });

  it('explicit planet fields take precedence over the sky', () => {
    const c = planetContext({ astro: earthSky, planet: { obliquity_deg: 10 } });
    expect(c!.mapping.inputs.obliquity_deg).toBe(10);
  });
});
