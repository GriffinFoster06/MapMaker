// Projection is a view (§3.7): switching projection, sampling, exporting (PNG, SVG), the vector path, the overlays and
// distortion never change a World. A generated structured world is hashed before and after every projection's view is built and used.
import { describe, expect, it } from 'vitest';
import { hashWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { MeshSampler, PROJECTIONS, ProjectionView, coastlines, distortion, distortionRaster, pathFor, sampleRaster, svgDocument, tissot } from './index';
import { exactView, exportDistortionPng, exportHeightmap, exportSvg } from './exact';

describe('World hash guard', () => {
  it('switching projection, sampling, exports, the vector path, overlays and distortion leave the World hash unchanged', async () => {
    const w = createOrogenWorld({ N: 20000, seed: 12345 });
    await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
    const before = await hashWorld(w);
    const mesh = w.meshes.get('global')!.mesh;
    const sampler = new MeshSampler(mesh);
    const elevation = w.layers.get('global', 'elevation');
    const coast = coastlines(mesh, (i) => elevation[i]! > 0);
    for (const s of PROJECTIONS) {
      const opts = { projection: s.id, width: 64, height: 32, rotate: [25, -10, 0] as [number, number, number] };
      const stock = new ProjectionView(opts);
      sampleRaster(stock, sampler, elevation, 'barycentric');
      exportHeightmap(opts, sampler, elevation, { kind: 'absolute' });
      exportSvg(opts, { coastlines: coast, tissot: { step: 45 } });
      svgDocument(stock, { coastlines: coast, tissot: { step: 45 } });
      pathFor(stock)(coast);
      tissot(stock);
      distortionRaster(stock, 'omega');
      exportDistortionPng(opts, 'areal');
      const ll = exactView(opts).invert(32, 16);
      if (ll) distortion(stock, ll[0], ll[1]);
    }
    expect(await hashWorld(w)).toBe(before);
  });
});
