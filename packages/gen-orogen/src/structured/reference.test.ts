// Phase 4b M3: the reference pass (design note 14 §3.1).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type World, hashWorld, loadWorld, saveWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages } from '../index';
import { DETAIL_STAGE, REF_MESH, REF_STAGE, STRUCTURED, refLayerSpecs } from './layers';
import { referenceState, structuredStages } from './stages';

const allStages = [...orogenStages, ...structuredStages];
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

async function structuredWorld(N: number, seed = 12345): Promise<World> {
  const w = createOrogenWorld({ N, seed });
  await runPipeline(w, allStages, { variant: STRUCTURED, strict: true });
  return w;
}

afterEach(() => vi.restoreAllMocks());

describe('reference pass (ref.pass)', () => {
  it('runs only in the structured variant, in fdlibm, on the 20k reference mesh', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random called during generation'); });
    const w = await structuredWorld(5000);
    expect(w.pipeline.completed.map((r) => r.stageId)).toEqual(['mesh', REF_STAGE, DETAIL_STAGE]);
    for (const r of w.pipeline.completed) expect(r.dmath).toEqual(['fdlibm']);
    expect(w.meshes.get(REF_MESH)!.mesh.numRegions).toBe(20001);
    expect(w.meshes.get('global')!.mesh.numRegions).toBe(5001);
    for (const s of refLayerSpecs()) if (s.id !== 'ref.debug.superPlates' || w.layers.has(REF_MESH, s.id)) expect(w.layers.keys().some((k) => k === `${REF_MESH}/${s.id}` || k.startsWith(`${REF_MESH}/${s.id}.`))).toBe(true);
    const d = await createOrogenWorld({ N: 5000 });
    await runPipeline(d, allStages, { strict: true });
    expect(d.pipeline.completed.map((r) => r.stageId)).not.toContain(REF_STAGE);
  });

  it('I2: every L0 layer and the plates table are bit-identical at every N', async () => {
    const a = await structuredWorld(5000), b = await structuredWorld(50000);
    const refKeys = a.layers.keys().filter((k) => k.startsWith(`${REF_MESH}/`)).sort();
    expect(refKeys).toEqual(b.layers.keys().filter((k) => k.startsWith(`${REF_MESH}/`)).sort());
    expect(refKeys.length).toBeGreaterThan(40);
    for (const k of refKeys) {
      const id = k.slice(REF_MESH.length + 1);
      expect(bytes(a.layers.get(REF_MESH, id)), k).toEqual(bytes(b.layers.get(REF_MESH, id)));
    }
    const ra = a.pipeline.completed.find((r) => r.stageId === REF_STAGE)!, rb = b.pipeline.completed.find((r) => r.stageId === REF_STAGE)!;
    expect(ra.outputHashes).toEqual(rb.outputHashes);
  });

  it('is a world with sensible structure (two seeds)', async () => {
    for (const seed of [12345, 777]) {
      const w = await structuredWorld(3000, seed);
      const e = w.layers.get(REF_MESH, 'ref.elevation') as Float32Array;
      let land = 0;
      for (const v of e) if (v > 0) land++;
      expect(land / e.length).toBeGreaterThan(0.15);
      expect(land / e.length).toBeLessThan(0.45);
      expect(new Set(w.layers.get(REF_MESH, 'ref.koppen')).size).toBeGreaterThan(15);
      const basins = new Set(Array.from(w.layers.get(REF_MESH, 'ref.basin') as Int32Array).filter((b) => b >= 0));
      expect(basins.size).toBeGreaterThan(20);
      expect(w.entities.get('plates')!.length).toBe(80);
    }
  });

  it('save, load and resume: the reference state recomputes to the stored layers; the world hash is unchanged', async () => {
    const w = await structuredWorld(3000);
    const { world: back } = await loadWorld(await saveWorld(w, { engine: 'test', now: new Date(0) }));
    expect(await hashWorld(back)).toEqual(await hashWorld(w));
    const s = referenceState(back); // cache miss after load: recomputed from params
    expect(bytes(s.elevRaw)).toEqual(bytes(back.layers.get(REF_MESH, 'ref.elevRaw')));
    expect(bytes(s.tect.r_plate)).toEqual(bytes(back.layers.get(REF_MESH, 'ref.plate')));
    const res = await runPipeline(back, allStages, { variant: STRUCTURED });
    expect(res.ran).toEqual([]);
  });
});
