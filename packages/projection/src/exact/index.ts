// The exact path (ARCHITECTURE §3.7): the projection registry over dmath-backed copies of d3-geo and
// d3-geo-projection, for the CPU inverse sampler and every export. Importing this module needs the d3-dmath alias
// (build/d3-dmath.mjs: the Vite plugin, or the Node loader hook for tsx scripts). Interactive display uses the stock
// registry (PROJECTIONS), with native math.
import * as geo from 'virtual:d3-geo-dmath';
import * as proj from 'virtual:d3-geo-projection-dmath';
import { buildRegistry, type ProjectionSpec } from '../registry';
import { type HeightMapping, type HeightmapExport, heightmapPng } from '../png';
import type { MeshSampler } from '../sampler';
import { ProjectionView, type ViewOptions } from '../view';

export const EXACT_PROJECTIONS: readonly ProjectionSpec[] = buildRegistry({ geo, proj });

/** A ProjectionView over the exact registry. */
export const exactView = (opts: Omit<ViewOptions, 'registry'>) => new ProjectionView({ ...opts, registry: EXACT_PROJECTIONS });

/** The 16-bit heightmap export (png.ts), always through an exact view. */
export function exportHeightmap(opts: Omit<ViewOptions, 'registry'>, sampler: MeshSampler, elevationM: ArrayLike<number>, mapping: HeightMapping): HeightmapExport {
  return heightmapPng(exactView(opts), sampler, elevationM, mapping);
}
