// Distortion overlays (ARCHITECTURE §3.7, "Distortion", rule 4). Original shell code. Each pixel's value is computed
// on the inverse path: ProjectionView.invert (with its domain check), then distortion() at that point, so pole
// pixels follow the pole rules of distortion.ts and are never NaN. Outside the domain: NaN, flagged `outside`.
// A divergent limit (+Infinity) is flagged `singular` and drawn in a dedicated colour, not by clamping the ramp.
//
// Ramps (RGBA, 8 bits):
//   areal, h, k   log2 of the scale over [−3, 3] (⅛× to 8×), diverging blue → white (1×) → red;
//   omega         ω over [0°, 90°], white → dark purple, clamped at 90° (ω up to 180° occurs only next to singular
//                 or line poles, where the ramp end already reads as "extreme").
//   singular      SINGULAR_RGBA; outside: transparent.
import { dmath } from '@mapmaker/core';
import { distortion } from './distortion';
import type { ProjectionView } from './view';

export type DistortionQuantity = 'areal' | 'omega' | 'h' | 'k';

export interface DistortionRaster {
  width: number;
  /** Rows y0 .. y0 + rows − 1 of the view. */
  y0: number;
  quantity: DistortionQuantity;
  /** Per pixel: the value (degrees for ω), NaN outside the domain, +Infinity where the limit diverges. */
  values: Float64Array;
  /** 1 where the value is a divergent limit. */
  singular: Uint8Array;
  /** 1 outside the projection's domain. */
  outside: Uint8Array;
}

/** The overlay quantity at every pixel of rows [y0, y1). */
export function distortionRaster(view: ProjectionView, quantity: DistortionQuantity, rows: { y0?: number; y1?: number } = {}): DistortionRaster {
  const { width } = view, y0 = rows.y0 ?? 0, y1 = rows.y1 ?? view.height, n = width * (y1 - y0);
  const values = new Float64Array(n), singular = new Uint8Array(n), outside = new Uint8Array(n);
  for (let j = y0, o = 0; j < y1; j++) for (let i = 0; i < width; i++, o++) {
    const ll = view.invert(i + 0.5, j + 0.5);
    const d = ll ? distortion(view, ll[0], ll[1]) : null;
    if (!d || d.outside) { values[o] = NaN; outside[o] = 1; continue; }
    const v = d[quantity];
    values[o] = v;
    if (v === Infinity) singular[o] = 1;
  }
  return { width, y0, quantity, values, singular, outside };
}

/** The dedicated colour of singular pixels (rule 4): opaque green, outside both ramps. */
export const SINGULAR_RGBA: readonly [number, number, number, number] = [0, 200, 70, 255];

type Stop = [number, number, number, number]; // t, r, g, b
const DIVERGING: Stop[] = [[0, 33, 102, 172], [0.25, 103, 169, 207], [0.5, 247, 247, 247], [0.75, 239, 138, 98], [1, 178, 24, 43]];
const SEQUENTIAL: Stop[] = [[0, 252, 251, 253], [0.5, 158, 154, 200], [1, 63, 0, 125]];

function ramp(stops: Stop[], t: number, out: Uint8ClampedArray, o: number): void {
  t = Math.max(0, Math.min(1, t));
  let k = 1;
  while (k < stops.length - 1 && t > stops[k]![0]) k++;
  const [t0, r0, g0, b0] = stops[k - 1]!, [t1, r1, g1, b1] = stops[k]!;
  const u = (t - t0) / (t1 - t0);
  out[o] = Math.round(r0 + u * (r1 - r0)); out[o + 1] = Math.round(g0 + u * (g1 - g0)); out[o + 2] = Math.round(b0 + u * (b1 - b0)); out[o + 3] = 255;
}

/** Position of a value on its ramp, in [0, 1]. */
export function rampPosition(quantity: DistortionQuantity, v: number): number {
  if (quantity === 'omega') return Math.min(1, v / 90);
  return Math.max(0, Math.min(1, (dmath.log2(v) + 3) / 6));
}

/** RGBA pixels of a raster (row-major, 4 bytes per pixel). */
export function distortionRgba(r: DistortionRaster): Uint8ClampedArray {
  const n = r.values.length, out = new Uint8ClampedArray(4 * n);
  const stops = r.quantity === 'omega' ? SEQUENTIAL : DIVERGING;
  for (let i = 0; i < n; i++) {
    if (r.outside[i]) continue; // transparent
    if (r.singular[i]) { out.set(SINGULAR_RGBA, 4 * i); continue; }
    ramp(stops, rampPosition(r.quantity, r.values[i]!), out, 4 * i);
  }
  return out;
}
