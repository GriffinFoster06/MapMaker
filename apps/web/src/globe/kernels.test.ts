// `globe.layer`: the worker's colours and flat layer are what the page computed before (colors.ts paint and flat on the layer data).
import { beforeAll, describe, expect, test } from 'vitest';
import { type TypedArray, type World, arrayIds, createOrogenFor } from './kernels-test-world';
import { RAW_ELEVATION, makeLayers } from './colors';
import { globeKernels } from './kernels';

let world: World;
beforeAll(async () => { world = await createOrogenFor(); }, 120_000);

describe('globe.layer kernel', () => {
  test('every layer: colours and flat layer equal the page-side computation on copies of the layer data', () => {
    const raw = RAW_ELEVATION['structured']!;
    for (const layer of makeLayers(raw)) {
      const data: Record<string, TypedArray[]> = {};
      for (const id of layer.need) data[id] = arrayIds(world.registry.get(id)).map((a) => world.layers.get('global', a).slice());
      const colors = new Float32Array(3 * world.meshes.get('global')!.mesh.numRegions);
      layer.paint(data, colors);
      const flat = layer.flat(data);
      const r = globeKernels['globe.layer'](world, { id: layer.id, raw });
      expect(Buffer.from(r.colors.buffer), layer.id).toEqual(Buffer.from(colors.buffer));
      const got = r.flat as unknown as Record<string, unknown>, want = flat as unknown as Record<string, unknown>;
      expect(Object.keys(got).sort(), layer.id).toEqual(Object.keys(want).sort());
      for (const k of Object.keys(want)) {
        const w = want[k], g = got[k];
        if (ArrayBuffer.isView(w)) expect(Buffer.from((g as Float32Array).buffer), `${layer.id}.${k}`).toEqual(Buffer.from(w.buffer));
        else expect(g, `${layer.id}.${k}`).toEqual(w);
      }
    }
  });
});
