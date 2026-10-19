import { describe, expect, it } from 'vitest';
import { OROGEN_DEFAULTS } from '@mapmaker/gen-orogen';
import { PRESETS, SETTINGS, changedParams, decodeState, encodeState } from './settings';

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
    it('Earth-like has the swept values (configuration L612), every key a known slider, on its step and inside its range', () => {
      expect(earth.values).toEqual({ jitter: 0.75, P: 81, numContinents: 4, nMag: 0.23, continentSizeVariety: 0.1, landCoverage: 0.36, terrainWarp: 0, smoothing: 0.15, glacialErosion: 0.75, hydraulicErosion: 0.4, thermalErosion: 0.25, ridgeSharpening: 0.95, temperatureOffset: -2, precipitationOffset: -0.5 });
      expect(Object.keys(earth.values).sort()).toEqual(SETTINGS.map((s) => s.key).sort());
      for (const s of SETTINGS) {
        const v = earth.values[s.key]!;
        expect(v >= s.min && v <= s.max).toBe(true);
        expect(Math.abs((v - s.min) / s.step - Math.round((v - s.min) / s.step))).toBeLessThan(1e-9);
      }
    });
    it('leave the defaults untouched and round-trip through the URL', () => {
      expect(Object.fromEntries(SETTINGS.map((s) => [s.key, s.def]))).toEqual(Object.fromEntries(Object.entries(OROGEN_DEFAULTS).filter(([k]) => SETTINGS.some((s) => s.key === k))));
      const changed = changedParams(earth.values);
      expect(Object.keys(changed).length).toBeGreaterThan(0);
      const q = encodeState({ seed: 5, params: earth.values });
      expect(decodeState('?' + q).params).toEqual(changed);
      expect(changedParams({ ...changed, ...Object.fromEntries(Object.keys(changed).map((k) => [k, SETTINGS.find((s) => s.key === k)!.def])) })).toEqual({});
    });
  });
});
