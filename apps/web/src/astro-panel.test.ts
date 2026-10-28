import { describe, expect, it } from 'vitest';
import { MOON_PRESETS, SKY_DEFAULT, STAR_PRESETS, astroFromChoice, decodeSky, encodeSky, skyBadge } from './astro-panel';
import { withDefaults } from './planet-panel';
import { decodeState, encodeState } from './settings';

const earth = withDefaults({});

describe('sky panel (design note 20)', () => {
  it('Earth\'s sky sends nothing to the generator and reads as Earth', () => {
    expect(astroFromChoice(SKY_DEFAULT, earth)).toBeUndefined();
    expect(skyBadge(SKY_DEFAULT, earth)).toEqual({ validity: 'ok', text: 'Earth\'s sky', lines: [] });
    expect(encodeSky(SKY_DEFAULT)).toEqual({});
  });

  it('builds the sky from the planet sliders and the chosen star and moons', () => {
    const a = astroFromChoice({ star: 'k-dwarf', moons: 'two-moons' }, { ...earth, distance: 0.6, obliquity: 15 })!;
    expect(a.star.massSolar).toBe(0.7);
    expect(a.moons.length).toBe(2);
    expect(a.planet.semiMajorAxis_AU).toBe(0.6);
    expect(a.planet.obliquity_deg).toBe(15);
    expect(a.companion).toBeUndefined();
    expect(astroFromChoice({ star: 'binary', moons: 'none' }, earth)!.companion?.star.massSolar).toBe(0.2);
  });

  it('shows month, tide and eclipse lines for a moon, and tidal locking as outside the model', () => {
    const ok = skyBadge({ star: 'sun', moons: 'two-moons' }, earth);
    expect(ok.validity).toBe('ok');
    expect(ok.lines.length).toBeGreaterThan(2);
    expect(ok.lines.join('\n')).toMatch(/solar eclipses a year/);
    const locked = skyBadge({ star: 'm-dwarf', moons: 'earth-moon' }, { ...earth, distance: 0.3 });
    expect(locked.validity).toBe('unsupported');
    expect(locked.text).toMatch(/outside model validity.*tidally locked/);
    expect(skyBadge({ star: 'sun', moons: 'none' }, earth).lines.join('\n')).toMatch(/no lunar tides/);
  });

  it('round-trips through the page URL together with the planet values', () => {
    const q = encodeState({ seed: 7, tier: '50k', params: {}, planet: { obliquity: 12.5 }, sky: { star: 'binary', moons: 'none' } });
    expect(q).toContain('as_star=binary');
    expect(q).toContain('as_moons=none');
    const st = decodeState(q);
    expect(st.sky).toEqual({ star: 'binary', moons: 'none' });
    expect(st.planet).toEqual({ obliquity: 12.5 });
    expect(encodeState({ seed: 7, tier: '50k', params: {}, sky: SKY_DEFAULT })).not.toContain('as_');
  });

  it('ignores unknown ids and has unique preset ids', () => {
    expect(decodeSky(new URLSearchParams('as_star=nope&as_moons=nada'))).toBeUndefined();
    expect(decodeSky(new URLSearchParams('as_star=m-dwarf'))).toEqual({ star: 'm-dwarf', moons: 'earth-moon' });
    expect(new Set(STAR_PRESETS.map((s) => s.id)).size).toBe(STAR_PRESETS.length);
    expect(new Set(MOON_PRESETS.map((s) => s.id)).size).toBe(MOON_PRESETS.length);
  });
});
