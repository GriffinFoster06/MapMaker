import { describe, expect, it } from 'vitest';
import { OROGEN_DEFAULTS } from '@mapmaker/gen-orogen';
import { SETTINGS, changedParams, decodeState, encodeState } from './settings';

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
});
