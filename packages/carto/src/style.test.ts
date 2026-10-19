import { describe, expect, test } from 'vitest';
import { LUT_N, buildLut, byteOf, linearToSrgb, lutColor, srgbToLinear } from './colour';
import { LABEL_KINDS, THEMES, THEME_IDS, styleFor, styleKey } from './style';
import { furnitureLayout, niceNumber, riverThreshold } from './overlay';
import { RIVER_MIN_SR } from './data';

describe('styles', () => {
  test('five built-in themes with increasing stops, fonts for every label kind and sane sizes', () => {
    expect(THEME_IDS.sort()).toEqual(['atlas', 'parchment', 'physical', 'political', 'satellite']);
    for (const s of Object.values(THEMES)) {
      for (const ramp of [s.ocean, s.land]) for (let i = 1; i < ramp.length; i++) expect(ramp[i]!.m, s.id).toBeGreaterThan(ramp[i - 1]!.m);
      expect(s.ocean[s.ocean.length - 1]!.m, s.id).toBe(0);
      expect(s.land[0]!.m, s.id).toBe(0);
      for (const k of LABEL_KINDS) { expect(s.labels.fonts[k].size, `${s.id} ${k}`).toBeGreaterThan(5); expect(s.labels.fonts[k].size).toBeLessThan(30); }
      expect(s.relief.strength).toBeGreaterThanOrEqual(0);
      expect(s.relief.strength).toBeLessThanOrEqual(1);
    }
  });
  test('styleFor merges overrides and rejects unknown ids; styleKey is order-independent', () => {
    expect(styleFor('atlas', { background: '#000000' }).background).toBe('#000000');
    expect(() => styleFor('nope')).toThrow(/unknown style/);
    const a = { ...THEMES['atlas']! }, b = Object.fromEntries(Object.entries(THEMES['atlas']!).reverse()) as typeof a;
    expect(styleKey(a)).toBe(styleKey(b));
    expect(styleKey(THEMES['atlas']!)).not.toBe(styleKey(THEMES['parchment']!));
  });
});

describe('colour', () => {
  test('sRGB transfer round-trips and matches three.js at its breakpoints', () => {
    for (const v of [0, 0.001, 0.0031308, 0.04, 0.2, 0.5, 0.9, 1]) expect(srgbToLinear(linearToSrgb(v))).toBeCloseTo(v, 4);
    expect(linearToSrgb(0.0031308)).toBeCloseTo(0.0031308 * 12.92, 12);
    expect(byteOf(0)).toBe(0);
    expect(byteOf(1)).toBe(255);
    expect(byteOf(2)).toBe(255);
    expect(byteOf(-1)).toBe(0);
  });
  test('the lookup has an ocean half and a land half, hits the stops, and steps at sea level', () => {
    const s = THEMES['atlas']!, lut = buildLut(s);
    expect(lut.rgba).toHaveLength(2 * LUT_N * 4);
    expect(lut.oceanMin).toBe(-9000);
    expect(lut.landMax).toBe(6500);
    const c = [0, 0, 0];
    const css = (m: number) => { lutColor(lut, m, c); return c.map((x) => byteOf(x)); };
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    for (const st of s.ocean) for (let k = 0; k < 3; k++) expect(Math.abs(css(st.m)[k]! - hex(`#${st.c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`)[k]!)).toBeLessThanOrEqual(2);
    for (const st of s.land.filter((x) => x.m > 0)) for (let k = 0; k < 3; k++) expect(Math.abs(css(st.m)[k]! - Math.round(st.c[k]! * 255))).toBeLessThanOrEqual(2);
    // Exactly 0 m is sea (land is elevation > 0), so the first land stop shows from the first metre.
    for (let k = 0; k < 3; k++) expect(Math.abs(css(0.5)[k]! - Math.round(s.land[0]!.c[k]! * 255))).toBeLessThanOrEqual(2);
    // Just below and just above sea level are different ramps: a sharp coastline.
    const sea = css(-0.001), land = css(0.001);
    expect(Math.abs(sea[0]! - land[0]!) + Math.abs(sea[1]! - land[1]!)).toBeGreaterThan(20);
    // Beyond the ends the colour is clamped.
    expect(css(-20000)).toEqual(css(-9000));
    expect(css(20000)).toEqual(css(6500));
  });
});

describe('overlay helpers', () => {
  test('niceNumber is 1, 2 or 5 times a power of ten, not above the value', () => {
    for (const [v, n] of [[1, 1], [1.9, 1], [2, 2], [4.99, 2], [5, 5], [9.9, 5], [130, 100], [260, 200], [740, 500], [0.37, 0.2]] as const) expect(niceNumber(v), String(v)).toBeCloseTo(n, 12);
  });
  test('the river threshold falls with the square of the view scale and never below the data floor', () => {
    const s = THEMES['atlas']!;
    expect(riverThreshold(s, 160)).toBeCloseTo(s.rivers.minAreaSr, 12);
    expect(riverThreshold(s, 320)).toBeCloseTo(s.rivers.minAreaSr / 4, 12);
    expect(riverThreshold(s, 1e6)).toBe(RIVER_MIN_SR);
  });
  test('furniture boxes scale with the width, stay inside the view and do not overlap', () => {
    for (const [W, H] of [[1000, 500], [4000, 2000], [300, 200]] as const) {
      const f = furnitureLayout(W, H, THEMES['atlas']!, { scaleBar: true, legend: true });
      for (const b of [f.scale!, f.legend!]) { expect(b.x1).toBeGreaterThanOrEqual(0); expect(b.y1).toBeGreaterThanOrEqual(0); expect(b.x2).toBeLessThanOrEqual(W); expect(b.y2).toBeLessThanOrEqual(H); }
      expect(f.legend!.x2 <= f.scale!.x1 || f.scale!.x2 <= f.legend!.x1 || f.legend!.y2 <= f.scale!.y1).toBe(true);
    }
    expect(furnitureLayout(1000, 500, THEMES['parchment']!, { scaleBar: true, legend: true }).legend).toBeNull(); // the theme has none
    expect(furnitureLayout(1000, 500, THEMES['atlas']!, { scaleBar: false, legend: false })).toEqual({ scale: null, legend: null });
  });
});
