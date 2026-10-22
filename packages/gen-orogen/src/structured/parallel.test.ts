// Decision PK1: the structured pipeline with its per-cell kernels in a worker pool gives the same World, bit for bit,
// as the serial run, for 1, 2, 5 and 8 workers and chunk sizes that put chunk edges anywhere.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type World, hashWorld, setCellExecutor } from '@mapmaker/core';
import { ParallelCells, runPipeline } from '@mapmaker/engine';
import { createOrogenWorld } from '../create';
import { type NodeKernelPool, startNodeKernelPool } from '../node-pool';
import { orogenStages } from '../stages';
import { STRUCTURED } from './layers';
import { structuredStages } from './stages';

const N = 30011;

async function generate(): Promise<{ world: World; hashes: Record<string, string> }> {
  const world = createOrogenWorld({ N, seed: 777 });
  await runPipeline(world, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const hashes: Record<string, string> = { world: await hashWorld(world) };
  for (const key of world.layers.keys()) { const i = key.indexOf('/'); hashes[key] = await world.layers.hash(key.slice(0, i), key.slice(i + 1)); }
  return { world, hashes };
}

describe('structured pipeline with parallel cell kernels', () => {
  let serial: Record<string, string>;
  const pools: NodeKernelPool[] = [];
  beforeAll(async () => {
    serial = (await generate()).hashes;
    for (const size of [1, 2, 5, 8]) pools.push(await startNodeKernelPool(size));
  }, 120_000);
  afterAll(async () => { for (const p of pools.reverse()) await p.terminate(); });

  it('equals the serial World for 1, 2, 5 and 8 workers and odd chunk sizes, with every kernel call in parallel', async () => {
    const chunks = [333, 1021, 4093, 7];
    for (const [i, p] of pools.entries()) {
      const ex = new ParallelCells(p.pool, { chunk: chunks[i]!, minCells: 0 });
      setCellExecutor(ex);
      const { world, hashes } = await generate();
      const where = `workers=${p.pool.size} chunk=${chunks[i]}`;
      expect(hashes, where).toEqual(serial);
      // Six kernel calls per elevation pass (warp, two detail noises, band, coastal, uniform), on L0 and at N; none fell
      // back to the serial path because of an argument that could not be shared.
      expect(ex.declined, where).toBe(0);
      expect(ex.calls, where).toBe(12);
      // Shared allocation is on: the layers and the mesh arrays the kernels read live in SharedArrayBuffers.
      expect(world.layers.get('global', 'detail.elevRaw').buffer).toBeInstanceOf(SharedArrayBuffer);
    }
  }, 300_000);
});
