// Engine-worker kernels of the exact path (ARCHITECTURE §3.7, §6.1): the CPU inverse sampler and the heightmap export
// run where the World lives, through the `worldKernel` op. They only read the World.
import { type SphereMesh, type World } from '@mapmaker/core';
import { type HeightMapping, heightmapPngFromRaster } from '../png';
import { MeshSampler, rowBands, sampleRaster } from '../sampler';
import type { ViewOptions } from '../view';
import { exactView } from './index';

export type ViewSpec = Omit<ViewOptions, 'registry'>;

export interface SampleArgs { view: ViewSpec; layer: string; mesh?: string; y0?: number; y1?: number }
export interface HeightmapArgs { view: ViewSpec; mapping: HeightMapping; mesh?: string }

const samplers = new WeakMap<SphereMesh, MeshSampler>();
const samplerFor = (m: SphereMesh) => {
  let s = samplers.get(m);
  if (!s) { s = new MeshSampler(m); samplers.set(m, s); }
  return s;
};

function layerRaster(world: World, view: ViewSpec, layer: string, meshId = 'global', y0?: number, y1?: number): Float64Array {
  const d = world.registry.get(layer);
  if (d.sample === 'none' || d.kind === 'vector-en' || d.kind === 'bitset') throw new Error(`layer ${layer} cannot be sampled (${d.kind}, ${d.sample})`);
  const rec = world.meshes.get(meshId);
  if (!rec) throw new Error(`no such mesh: ${meshId}`);
  return sampleRaster(exactView(view), samplerFor(rec.mesh), world.layers.get(meshId, layer), d.sample, {
    ...(y0 !== undefined ? { y0 } : {}), ...(y1 !== undefined ? { y1 } : {}),
  });
}

/** Rows per tile of a heightmap export (the raster is assembled in row bands; the result does not depend on it). */
export const EXPORT_ROWS = 64;

export const projectionKernels = {
  /** A row band of a layer sampled through an exact view (NaN outside the domain). */
  'projection.sample': (world: World, a: SampleArgs) => layerRaster(world, a.view, a.layer, a.mesh, a.y0, a.y1),
  /** The 16-bit PNG heightmap of `elevation` (metres) through an exact view. */
  'projection.heightmap': (world: World, a: HeightmapArgs) => {
    const view = exactView(a.view);
    const metres = new Float64Array(view.width * view.height);
    for (const b of rowBands(view.height, EXPORT_ROWS)) metres.set(layerRaster(world, a.view, 'elevation', a.mesh, b.y0, b.y1), b.y0 * view.width);
    return heightmapPngFromRaster(view, metres, a.mapping);
  },
} satisfies Record<string, (world: World, args: never) => unknown>;
