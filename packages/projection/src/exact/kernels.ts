// Engine-worker kernels of the exact path (ARCHITECTURE §3.7, §6.1): the CPU inverse sampler and the heightmap export
// run where the World lives, through the `worldKernel` op. They only read the World.
import { type SphereMesh, type World } from '@mapmaker/core';
import { type HeightMapping, type HeightmapOptions, heightmapPngFromRaster } from '../png';
import { buildCubeLookup } from '../gpu/lookup';
import { distortionRaster, type DistortionQuantity } from '../overlay';
import { MeshSampler, locateRaster, rowBands, sampleRaster } from '../sampler';
import { ProjectionView } from '../view';
import type { ViewOptions } from '../view';
import { type SvgLayers } from '../svg';
import { coastlines } from '../vector';
import { exactView, exportSvg } from './index';

export type ViewSpec = Omit<ViewOptions, 'registry'>;

export interface SampleArgs { view: ViewSpec; layer: string; mesh?: string; y0?: number; y1?: number }
export interface SvgArgs { view: ViewSpec; layers?: Omit<SvgLayers, 'coastlines'>; coastlines?: boolean; mesh?: string }
export interface LocateArgs { view: ViewSpec; mesh?: string; y0?: number; y1?: number }
export interface DistortionArgs { view: ViewSpec; quantity: DistortionQuantity; y0?: number; y1?: number }
export interface HeightmapArgs { view: ViewSpec; mapping: HeightMapping; mesh?: string; png?: HeightmapOptions }

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
    return heightmapPngFromRaster(view, metres, a.mapping, a.png);
  },
  /** SVG of the vector layers, with coastlines traced along the land/sea cell edges of `elevation` (land: > 0 m). */
  'projection.svg': (world: World, a: SvgArgs) => {
    const layers: SvgLayers = { ...a.layers };
    if (a.coastlines ?? true) {
      const meshId = a.mesh ?? 'global', elev = world.layers.get(meshId, 'elevation');
      layers.coastlines = coastlines(world.meshes.get(meshId)!.mesh, (i) => elev[i]! > 0);
    }
    return exportSvg(a.view, layers);
  },
  /**
   * Interactive CPU path (projections without a shader): per-pixel triangle, weights and nearest cell of a row band,
   * through a stock view (native math; display only, never exported).
   */
  'projection.locate': (world: World, a: LocateArgs) => {
    const rec = world.meshes.get(a.mesh ?? 'global');
    if (!rec) throw new Error(`no such mesh: ${a.mesh}`);
    return locateRaster(new ProjectionView(a.view), samplerFor(rec.mesh), { ...(a.y0 !== undefined ? { y0: a.y0 } : {}), ...(a.y1 !== undefined ? { y1: a.y1 } : {}) });
  },
  /** Lookup data of the GPU path: the triangle-id cube map and the Delaunay adjacency (gpu/lookup.ts). */
  'projection.gpuLookup': (world: World, a: { mesh?: string }) => {
    const rec = world.meshes.get(a.mesh ?? 'global');
    if (!rec) throw new Error(`no such mesh: ${a.mesh}`);
    const m = rec.mesh, { R, cube } = buildCubeLookup(m);
    return { R, cube, adjOffset: m.adjOffset.slice(), adjList: m.adjList.slice() };
  },
  /** A distortion overlay band through a stock view (display; exports use exportDistortionPng). */
  'projection.distortion': (_world: World, a: DistortionArgs) => {
    const r = distortionRaster(new ProjectionView(a.view), a.quantity, { ...(a.y0 !== undefined ? { y0: a.y0 } : {}), ...(a.y1 !== undefined ? { y1: a.y1 } : {}) });
    return { values: r.values, singular: r.singular, outside: r.outside };
  },
} satisfies Record<string, (world: World, args: never) => unknown>;
