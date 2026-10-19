// Colour arithmetic of the styled map (Phase 5c). Original code. Style colours are sRGB; shading multiplies light, so the
// work is done in linear light and the result goes through the same linear → sRGB transfer three.js applies to the globe
// and the flat-map shader (decision 5-13), so every view shows the same colours. The shader (packages/projection/src/gpu/
// glsl.ts, `lutColor`) repeats the lookup below with float32 arithmetic; this file is the reference and the exact path.
import { dmath } from '@mapmaker/core';
import { type RGB, type Stop, type Style } from './style';

/** Entries per half of the lookup table (ocean, land). */
export const LUT_N = 512;

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : dmath.pow((c + 0.055) / 1.055, 2.4));

/** three.js LinearTosRGB (r160 colorspace_pars_fragment); the exponent is its constant 0.41666. */
export const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : dmath.pow(c, 0.41666) * 1.055 - 0.055);

/** A byte of a linear channel (clamped, through the sRGB transfer). */
export const byteOf = (linear: number): number => Math.round(Math.min(1, Math.max(0, linearToSrgb(linear))) * 255);

/** A style's two hypsometric ramps sampled into linear-light RGBA texels: the ocean half then the land half. */
export interface Lut {
  /** 2 × LUT_N texels, 4 floats each (alpha 1). Ocean texel k is at elevation oceanMin·(1 − k/(N−1)); land texel k at landMax·k/(N−1). */
  rgba: Float32Array;
  /** Deepest ocean stop (negative metres). */
  oceanMin: number;
  /** Highest land stop (positive metres). */
  landMax: number;
}

function ramp(stops: Stop[], m: number): [number, number, number] {
  const lin = (c: RGB): [number, number, number] => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
  if (m <= stops[0]!.m) return lin(stops[0]!.c);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!, b = stops[i]!;
    if (m <= b.m) {
      const t = b.m === a.m ? 1 : (m - a.m) / (b.m - a.m), la = lin(a.c), lb = lin(b.c);
      return [la[0] + (lb[0] - la[0]) * t, la[1] + (lb[1] - la[1]) * t, la[2] + (lb[2] - la[2]) * t];
    }
  }
  return lin(stops[stops.length - 1]!.c);
}

export function buildLut(style: Pick<Style, 'ocean' | 'land'>): Lut {
  const oceanMin = style.ocean[0]!.m, landMax = style.land[style.land.length - 1]!.m;
  const rgba = new Float32Array(2 * LUT_N * 4);
  for (let k = 0; k < LUT_N; k++) {
    const o = ramp(style.ocean, oceanMin * (1 - k / (LUT_N - 1))), l = ramp(style.land, (landMax * k) / (LUT_N - 1));
    rgba.set([o[0], o[1], o[2], 1], 4 * k);
    rgba.set([l[0], l[1], l[2], 1], 4 * (LUT_N + k));
  }
  return { rgba, oceanMin, landMax };
}

/** Linear-light colour at elevation `m` (metres): the ocean half for m ≤ 0, the land half above, interpolated between texels. */
export function lutColor(lut: Lut, m: number, out: number[] | Float64Array = [0, 0, 0]): number[] | Float64Array {
  const sea = m <= 0;
  const t = sea ? (m - lut.oceanMin) / (0 - lut.oceanMin) : m / lut.landMax;
  const x = Math.min(1, Math.max(0, t)) * (LUT_N - 1), i0 = Math.min(LUT_N - 2, Math.floor(x)), f = x - i0;
  const base = 4 * ((sea ? 0 : LUT_N) + i0), d = lut.rgba;
  for (let c = 0; c < 3; c++) out[c] = d[base + c]! + (d[base + 4 + c]! - d[base + c]!) * f;
  return out;
}
