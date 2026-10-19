// Exact CPU inverse sampler (ARCHITECTURE §3.7, raster path, "Exact (CPU, workers)"). Original shell code.
// For each pixel: ProjectionView.invert (d3 invert, domain check, 0.5 px round trip), the canonical unit vector
// (X = cos φ cos λ, Y = cos φ sin λ, Z = sin φ), the nearest cell (SpatialIndex), the containing Delaunay triangle
// (TriangleLocator, the search MultiLevel's prolongation uses), then the layer's sample rule:
//   barycentric  w0·v[a] + w1·v[b] + w2·v[c] over the containing triangle (P's arithmetic, MultiLevel.prolongInto);
//   nearest      the value of the nearest cell (its Voronoi cell).
// Pixels outside the domain are NaN. Each pixel is independent of the others except for the nearest-cell hint, which
// runs along a row from its first pixel; tiles are bands of whole rows, so a raster is bit-identical however it is
// tiled. Projection is a view: nothing here writes a World.
import { type SampleRule, type SphereMesh, SpatialIndex, TriangleLocator, dmath } from '@mapmaker/core';
import type { ProjectionView } from './view';

const RAD = Math.PI / 180;

/** Per-mesh lookup structures for the sampler; build once per mesh and reuse across views and layers. */
export class MeshSampler {
  readonly index: SpatialIndex;
  readonly locator: TriangleLocator;

  constructor(readonly mesh: SphereMesh) {
    this.index = new SpatialIndex(mesh);
    this.locator = new TriangleLocator(mesh);
  }
}

/** Canonical unit vector of a geographic point in degrees (+Z north, +X at (0°, 0°), +Y at (0°, 90°E)). */
export function unitVector(lon: number, lat: number, out: Float64Array): Float64Array {
  const l = lon * RAD, f = lat * RAD, cf = dmath.cos(f);
  out[0] = cf * dmath.cos(l);
  out[1] = cf * dmath.sin(l);
  out[2] = dmath.sin(f);
  return out;
}

export interface SampleRows {
  /** First row (inclusive) and end row (exclusive) of the band; default the whole view. */
  y0?: number;
  y1?: number;
}

/**
 * Samples a per-cell array of `sampler.mesh` through `view` into a row-major raster of the band's rows
 * (width × (y1 − y0)), NaN outside the domain.
 */
export function sampleRaster(view: ProjectionView, sampler: MeshSampler, values: ArrayLike<number>, rule: Exclude<SampleRule, 'none'>, rows: SampleRows = {}): Float64Array {
  const { width } = view, y0 = rows.y0 ?? 0, y1 = rows.y1 ?? view.height;
  if (values.length !== sampler.mesh.numRegions) throw new Error(`sampleRaster: ${values.length} values for ${sampler.mesh.numRegions} cells`);
  const out = new Float64Array(width * (y1 - y0));
  const T = sampler.mesh.triangles;
  const p = new Float64Array(3), w = new Float64Array(3);
  for (let j = y0, o = 0; j < y1; j++) {
    let hint = -1;
    for (let i = 0; i < width; i++, o++) {
      const ll = view.invert(i + 0.5, j + 0.5);
      if (!ll) { out[o] = NaN; continue; }
      unitVector(ll[0], ll[1], p);
      const near = sampler.index.nearestCell(p[0]!, p[1]!, p[2]!, hint);
      hint = near;
      if (rule === 'nearest') { out[o] = values[near]!; continue; }
      const t = sampler.locator.locate(p[0]!, p[1]!, p[2]!, near, w);
      if (t < 0) throw new Error(`sampleRaster: no containing triangle at pixel ${i},${j}`);
      out[o] = w[0]! * values[T[3 * t]!]! + w[1]! * values[T[3 * t + 1]!]! + w[2]! * values[T[3 * t + 2]!]!;
    }
  }
  return out;
}

/** Row bands of at most `rows` rows covering [0, height): the tiling the worker pool uses. */
export function rowBands(height: number, rows: number): { y0: number; y1: number }[] {
  const out: { y0: number; y1: number }[] = [];
  for (let y0 = 0; y0 < height; y0 += rows) out.push({ y0, y1: Math.min(height, y0 + rows) });
  return out;
}
