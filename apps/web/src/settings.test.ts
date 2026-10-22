import { describe, expect, it } from 'vitest';
import { OROGEN_DEFAULTS } from '@mapmaker/gen-orogen';
import { LEVELS, PRESETS, SETTINGS, changedParams, decodeState, encodeState, visibleAt } from './settings';

describe('world settings', () => {
  it('cover every orogen generation slider except Detail (the tier) and Seed, with orogen defaults', () => {
    const sliders = Object.fromEntries(Object.entries(OROGEN_DEFAULTS).filter(([k]) => !['seed', 'N', 'debugLayers'].includes(k)));
    expect(Object.fromEntries(SETTINGS.map((s) => [s.key, s.def]))).toEqual(sliders);
    for (const s of SETTINGS) expect(s.def >= s.min && s.def <= s.max).toBe(true);
  });
  it('send only changed values, so default worlds stay bit-identical', () => {
    const defaults = Object.fromEntries(SETTINGS.map((s) => [s.key, s.def]));
    expect(changedParams(defaults)).toEqual({});
    expect(changedParams({ ...defaults, P: 40, landCoverage: 2 })).toEqual({ P: 40, landCoverage: 1 });
  });
  it('round-trip through the URL, clamping and ignoring junk', () => {
    const q = encodeState({ seed: 777, tier: '1M', pipeline: 'parity', params: { P: 40, nMag: 0.4, temperatureOffset: -5 } });
    expect(q).toBe('seed=777&tier=1M&pipeline=parity&P=40&temperatureOffset=-5');
    expect(decodeState('?' + q)).toEqual({ seed: 777, tier: '1M', pipeline: 'parity', params: { P: 40, temperatureOffset: -5 } });
    expect(decodeState('?P=999&nMag=abc&bogus=1')).toEqual({ params: { P: 120 } });
  });

  describe('presets', () => {
    const earth = PRESETS.find((p) => p.id === 'earthlike')!;
    const L612 = { jitter: 0.75, P: 81, numContinents: 4, nMag: 0.23, continentSizeVariety: 0.1, landCoverage: 0.36, terrainWarp: 0, smoothing: 0.15, glacialErosion: 0.75, hydraulicErosion: 0.4, thermalErosion: 0.25, ridgeSharpening: 0.95, temperatureOffset: -2, precipitationOffset: -0.5 };
    it('Earth-like lists only the sliders where the swept values (configuration L612) differ from the defaults, on their steps and inside their ranges', () => {
      expect(earth.values).toEqual({ P: 81, nMag: 0.23, continentSizeVariety: 0.1, landCoverage: 0.36, terrainWarp: 0, smoothing: 0.15, glacialErosion: 0.75, hydraulicErosion: 0.4, thermalErosion: 0.25, ridgeSharpening: 0.95, temperatureOffset: -2, precipitationOffset: -0.5 });
      for (const [k, v] of Object.entries(earth.values)) expect(v, k).not.toBe(SETTINGS.find((s) => s.key === k)!.def);
      // Filled up with the defaults (what the panel's apply does), it is L612 again.
      expect(Object.fromEntries(SETTINGS.map((s) => [s.key, earth.values[s.key] ?? s.def]))).toEqual(L612);
      for (const s of SETTINGS) {
        const v = earth.values[s.key];
        if (v === undefined) continue;
        expect(v >= s.min && v <= s.max).toBe(true);
        expect(Math.abs((v - s.min) / s.step - Math.round((v - s.min) / s.step))).toBeLessThan(1e-9);
      }
    });
    it('leave the defaults untouched and round-trip through the URL', () => {
      expect(Object.fromEntries(SETTINGS.map((s) => [s.key, s.def]))).toEqual(Object.fromEntries(Object.entries(OROGEN_DEFAULTS).filter(([k]) => SETTINGS.some((s) => s.key === k))));
      const changed = changedParams(earth.values);
      expect(changed).toEqual(earth.values);
      const q = encodeState({ seed: 5, params: earth.values });
      expect(decodeState('?' + q).params).toEqual(changed);
      expect(changedParams({ ...changed, ...Object.fromEntries(Object.keys(changed).map((k) => [k, SETTINGS.find((s) => s.key === k)!.def])) })).toEqual({});
    });
  });

  describe('registry levels', () => {
    it('every parameter has a known level and a domain; a level shows its own and every lower level', () => {
      for (const st of SETTINGS) { expect(LEVELS).toContain(st.level); expect(st.domain.length).toBeGreaterThan(0); }
      const n = LEVELS.map((l) => visibleAt(l).length);
      expect(n[0]).toBeGreaterThan(0);
      expect(n[0]).toBeLessThan(n[1]!);
      expect(n[1]).toBe(SETTINGS.length);
      expect(n[2]).toBe(SETTINGS.length); // no expert-only parameters are registered yet (decision 5b-7)
      const simple = visibleAt('simple').map((x) => x.key);
      expect(simple).toEqual(expect.arrayContaining(['landCoverage', 'numContinents', 'temperatureOffset', 'precipitationOffset']));
      expect(simple).not.toContain('thermalErosion');
    });
  });
});
