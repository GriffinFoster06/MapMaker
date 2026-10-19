// The exact path in the engine worker: the `worldKernel` op serves the sampler and the heightmap export from the
// World the worker owns, with results identical to calling the exact path directly.
import { describe, expect, it } from 'vitest';
import { EngineClient, type PortLike, runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, startOrogenHost, structuredStages } from '@mapmaker/gen-orogen';
import { MeshSampler, ProjectionView, buildCubeLookup, locateRaster, sampleRaster } from '../index';
import { coastlines } from '../vector';
import { exactView, exportHeightmap, exportSvg } from './index';
import { projectionKernels } from './kernels';

describe('projection world kernels', () => {
  it('sample bands, the heightmap PNG and the SVG match the direct exact path', async () => {
    const { port1, port2 } = new MessageChannel();
    startOrogenHost(port2 as unknown as PortLike, 'test', { worldKernels: projectionKernels });
    const client = new EngineClient(port1 as unknown as PortLike);
    try {
      await client.create({ N: 20000, seed: 777 });
      await client.run({ variant: STRUCTURED, strict: false });
      const w = createOrogenWorld({ N: 20000, seed: 777 });
      await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
      const sampler = new MeshSampler(w.meshes.get('global')!.mesh);
      const view = { projection: 'mollweide', width: 96, height: 48, rotate: [10, 0, 0] as [number, number, number] };
      const band = await client.worldKernel<Float64Array>('projection.sample', { view, layer: 'elevation', y0: 10, y1: 20 });
      const direct = sampleRaster(exactView(view), sampler, w.layers.get('global', 'elevation'), 'barycentric', { y0: 10, y1: 20 });
      expect(Buffer.from(band.buffer).equals(Buffer.from(direct.buffer))).toBe(true);
      const png = await client.worldKernel<Uint8Array>('projection.heightmap', { view, mapping: { kind: 'land' } });
      expect(Buffer.from(png).equals(Buffer.from(exportHeightmap(view, sampler, w.layers.get('global', 'elevation'), { kind: 'land' }).png))).toBe(true);
      const elev = w.layers.get('global', 'elevation');
      const svg = await client.worldKernel<string>('projection.svg', { view, layers: { graticule: 30, tissot: { step: 45 } } });
      expect(svg).toBe(exportSvg(view, { graticule: 30, tissot: { step: 45 }, coastlines: coastlines(w.meshes.get('global')!.mesh, (i) => elev[i]! > 0) }));
      expect(await client.worldKernel('projection.coastlines', {})).toEqual(coastlines(w.meshes.get('global')!.mesh, (i) => elev[i]! > 0));
      const loc = await client.worldKernel<{ tri: Int32Array; cell: Int32Array }>('projection.locate', { view, y0: 5, y1: 9 });
      const located = locateRaster(new ProjectionView(view), sampler, { y0: 5, y1: 9 });
      expect([...loc.tri]).toEqual([...located.tri]);
      expect([...loc.cell]).toEqual([...located.cell]);
      const lk = await client.worldKernel<{ R: number; cube: Uint32Array; adjOffset: Int32Array; adjList: Int32Array }>('projection.gpuLookup', {});
      const want = buildCubeLookup(w.meshes.get('global')!.mesh);
      expect(lk.R).toBe(want.R);
      expect(Buffer.from(lk.cube.buffer).equals(Buffer.from(want.cube.buffer))).toBe(true);
      expect(lk.adjList.length).toBe(w.meshes.get('global')!.mesh.adjList.length);
      await expect(client.worldKernel('projection.sample', { view, layer: 'wind.summer' })).rejects.toThrow();
    } finally { port1.close(); port2.close(); }
  });
});
