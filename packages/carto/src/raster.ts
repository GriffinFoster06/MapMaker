// The styled raster (Phase 5c): pixel colours of a style through a view, with the exact sampler's arithmetic. Original
// code. For each pixel the view's inverse gives the containing Delaunay triangle, the barycentric weights and the nearest
// cell (locateRaster); the elevation is interpolated and put through the ocean or land ramp (so a coastline is a sharp edge
// inside a triangle, decision 5-13), the climate and landmass modes take the nearest cell's land colour above sea level,
// and the relief factor is interpolated and multiplied in linear light. The export always passes an exact view (dmath).
import { hexToRgbaBytes } from './svg-util';
import { type LocatedRaster, type MeshSampler, type ProjectionView, locateRaster, rowBands } from '@mapmaker/projection';
import { type Lut, buildLut, byteOf, lutColor } from './colour';
import type { CellStyle } from './cellstyle';
import type { Style } from './style';

/** RGBA8 pixels of the band of rows `[y0, y1)`; outside the view's domain the colour is `outside` (default transparent). */
export function styleBand(r: LocatedRaster, T: Int32Array, elev: ArrayLike<number>, cs: Pick<CellStyle, 'factor' | 'colors'>, lut: Lut, outside: [number, number, number, number] = [0, 0, 0, 0]): Uint8ClampedArray {
  const n = r.tri.length, out = new Uint8ClampedArray(4 * n);
  const c = [0, 0, 0];
  for (let o = 0; o < n; o++) {
    const t = r.tri[o]!;
    if (t < 0) { out.set(outside, 4 * o); continue; }
    const a = T[3 * t]!, b = T[3 * t + 1]!, d = T[3 * t + 2]!, w0 = r.w[3 * o]!, w1 = r.w[3 * o + 1]!, w2 = r.w[3 * o + 2]!;
    const e = w0 * elev[a]! + w1 * elev[b]! + w2 * elev[d]!;
    const f = w0 * cs.factor[a]! + w1 * cs.factor[b]! + w2 * cs.factor[d]!;
    if (cs.colors && e > 0) {
      const cell = r.cell[o]!;
      c[0] = cs.colors[3 * cell]!; c[1] = cs.colors[3 * cell + 1]!; c[2] = cs.colors[3 * cell + 2]!;
    } else lutColor(lut, e, c);
    out[4 * o] = byteOf(c[0]! * f); out[4 * o + 1] = byteOf(c[1]! * f); out[4 * o + 2] = byteOf(c[2]! * f); out[4 * o + 3] = 255;
  }
  return out;
}

/** The whole view as RGBA8, in bands of whole rows (bit-identical however it is tiled). */
export function styledRaster(view: ProjectionView, sampler: MeshSampler, elev: ArrayLike<number>, cs: CellStyle, style: Style, opts: { opaque?: boolean; rowsPerBand?: number } = {}): Uint8ClampedArray {
  const { width, height } = view, out = new Uint8ClampedArray(4 * width * height), lut = buildLut(style);
  const outside = opts.opaque ? hexToRgbaBytes(style.background) : undefined;
  for (const b of rowBands(height, opts.rowsPerBand ?? 64)) {
    const located = locateRaster(view, sampler, { y0: b.y0, y1: b.y1 });
    out.set(styleBand(located, sampler.mesh.triangles, elev, cs, lut, outside), 4 * b.y0 * width);
  }
  return out;
}
