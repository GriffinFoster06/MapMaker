// Engine-worker kernel of the globe's layers: a layer switch costs the page nothing but receiving buffers. The globe's colour per
// cell and the flat map's layer are made here, by the same code (colors.ts) that made them on the page before, and transferred.
// Original shell code. Only reads the World.
import { type TypedArray, type World, arrayIds } from '@mapmaker/core';
import { withTransfer } from '@mapmaker/engine';
import type { GpuLayer } from '../flat/gpu-map';
import { makeLayers } from './colors';

export const globeKernels = {
  /** `raw`: the raw elevation layer of the world's pipeline variant (RAW_ELEVATION). */
  'globe.layer': (w: World, a: { id: string; raw: string }) => {
    const layer = makeLayers(a.raw).find((l) => l.id === a.id);
    if (!layer) throw new Error(`unknown layer: ${a.id}`);
    const data: Record<string, TypedArray[]> = {};
    for (const id of layer.need) data[id] = arrayIds(w.registry.get(id)).map((x) => w.layers.get('global', x));
    const colors = new Float32Array(3 * w.meshes.get('global')!.mesh.numRegions);
    layer.paint(data, colors);
    const flat = layer.flat(data);
    // The flat layer's arrays are fresh (Float32Array.from or a new paint), never the World's own.
    const buffers = [colors.buffer, ...Object.values(flat).filter((v): v is Float32Array => v instanceof Float32Array).map((v) => v.buffer)];
    return withTransfer({ colors, flat } as { colors: Float32Array; flat: GpuLayer }, buffers);
  },
};
