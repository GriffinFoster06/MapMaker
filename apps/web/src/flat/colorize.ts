// Pixel colours of the flat map on the CPU path, with the shader's rules (packages/projection/src/gpu/glsl.ts): a
// barycentric layer interpolates values with sampleRaster's arithmetic and then applies its palette; a nearest layer
// takes the nearest cell's colour; both pass three.js's linear → sRGB transfer, as the globe's output does.
import { elevationToColor } from '@mapmaker/gen-orogen/palettes';
import type { LocatedRaster } from '@mapmaker/projection';
import type { GpuLayer } from './gpu-map';
import { ramp } from '../globe/colors';

/** three.js LinearTosRGB (r160 colorspace_pars_fragment), per channel. */
export const toSRGB = (c: number) => (c <= 0.0031308 ? c * 12.92 : Math.pow(c, 0.41666) * 1.055 - 0.055);
const byte = (c: number) => Math.round(Math.min(1, Math.max(0, toSRGB(c))) * 255);

/** RGBA8 pixels (transparent outside the domain) of a located row band for a layer. */
export function colorize(r: LocatedRaster, l: GpuLayer, triangles: Int32Array): Uint8ClampedArray {
  const n = r.tri.length, out = new Uint8ClampedArray(4 * n);
  for (let o = 0; o < n; o++) {
    const t = r.tri[o]!;
    if (t < 0) continue;
    let rgb: ArrayLike<number>;
    if (l.rule === 'nearest') {
      const c = r.cell[o]!;
      rgb = [l.colors[3 * c]!, l.colors[3 * c + 1]!, l.colors[3 * c + 2]!];
    } else {
      const v = l.values;
      const value = r.w[3 * o]! * v[triangles[3 * t]!]! + r.w[3 * o + 1]! * v[triangles[3 * t + 1]!]! + r.w[3 * o + 2]! * v[triangles[3 * t + 2]!]!;
      rgb = l.palette === 'elevation' ? (elevationToColor(value) as number[]) : ramp((value - l.lo) / (l.hi - l.lo));
    }
    out[4 * o] = byte(rgb[0]!); out[4 * o + 1] = byte(rgb[1]!); out[4 * o + 2] = byte(rgb[2]!); out[4 * o + 3] = 255;
  }
  return out;
}
