// Projection is a view (§3.7): switching projection, sampling, exporting and evaluating distortion never change a
// World. A generated structured world is hashed before and after every projection's view is built and used.
import { describe, expect, it } from 'vitest';
import { hashWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { MeshSampler, PROJECTIONS, ProjectionView, distortion, sampleRaster } from './index';
import { exactView, exportHeightmap } from './exact';

describe('World hash guard', () => {
  it('switching projection, sampling, exporting and distortion leave the World hash unchanged', async () => {
    const w = createOrogenWorld({ N: 20000, seed: 12345 });
    await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
    const before = await hashWorld(w);
    const mesh = w.meshes.get('global')!.mesh;
    const sampler = new MeshSampler(mesh);
    const elevation = w.layers.get('global', 'elevation');
    for (const s of PROJECTIONS) {
      const opts = { projection: s.id, width: 64, height: 32, rotate: [25, -10, 0] as [number, number, number] };
      const stock = new ProjectionView(opts);
      sampleRaster(stock, sampler, elevation, 'barycentric');
      exportHeightmap(opts, sampler, elevation, { kind: 'absolute' });
      const ll = exactView(opts).invert(32, 16);
      if (ll) distortion(stock, ll[0], ll[1]);
    }
    expect(await hashWorld(w)).toBe(before);
  });
});
