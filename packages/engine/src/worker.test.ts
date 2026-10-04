import { MessageChannel, Worker } from 'node:worker_threads';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashWorld, loadWorld, saveWorld } from '@mapmaker/core';
import { EngineClient, WorkerPool, attachHost, dummyHistoryStage, runPipeline } from './index';
import { nodeWorkerPort } from './node-adapter';
import { makeWorld } from './test-helpers';

const stageVersions = { 'dummy-history': '1' };

describe('worker protocol (in-process MessageChannel)', () => {
  function pair() {
    const { port1, port2 } = new MessageChannel();
    attachHost(port2 as never, { stages: [dummyHistoryStage], engine: 'test', kernels: { double: (x: number) => x * 2 } });
    const client = new EngineClient(port1 as never);
    return { client, close: () => { port1.close(); port2.close(); } };
  }

  it('load -> run with progress -> snapshot equals a direct run', async () => {
    const ref = makeWorld(); await runPipeline(ref, [dummyHistoryStage]);
    const { client, close } = pair();
    const info = await client.load(await saveWorld(makeWorld(), { engine: 't' }));
    expect(info).toMatchObject({ viewOnly: false, tick: 0 });
    const seen: number[] = [];
    const res = await client.run({ onProgress: (p) => seen.push(p.fraction) });
    expect(res.ran).toEqual(['dummy-history']);
    expect(seen.length).toBe(30);
    expect(seen[seen.length - 1]).toBe(1);
    expect(await client.hash()).toBe(await hashWorld(ref));
    const { world } = await loadWorld(await client.snapshot(), { stageVersions });
    expect(await hashWorld(world)).toBe(await hashWorld(ref));
    close();
  });

  it('cancel mid-run, snapshot, resume in a fresh host == uninterrupted', async () => {
    const ref = makeWorld(); await runPipeline(ref, [dummyHistoryStage]);
    const a = pair();
    await a.client.load(await saveWorld(makeWorld(), { engine: 't' }));
    const res = await a.client.run({ onProgress: (p) => { if (p.fraction >= 12 / 30) a.client.cancel(); } });
    expect(res.cancelledAt).toBe('dummy-history');
    const snap = await a.client.snapshot();
    a.close();
    const b = pair();
    expect((await b.client.load(snap)).tick).toBeGreaterThanOrEqual(12);
    expect((await b.client.run()).ran).toEqual(['dummy-history']);
    expect(await b.client.hash()).toBe(await hashWorld(ref));
    b.close();
  });

  it('streams checkpoint snapshots that can be resumed', async () => {
    const { client, close } = pair();
    await client.load(await saveWorld(makeWorld(), { engine: 't' }));
    const cps: Uint8Array[] = [];
    await client.run({ checkpointEvery: 10, onCheckpoint: (b) => cps.push(b) });
    expect(cps.length).toBe(3);
    const { world } = await loadWorld(cps[0]!, { stageVersions });
    expect(world.timeline.tick).toBeGreaterThanOrEqual(10);
    close();
  });

  it('reports errors and unknown kernels', async () => {
    const { client, close } = pair();
    await expect(client.run()).rejects.toThrow(/no world loaded/);
    await expect(client.kernel('nope', 1)).rejects.toThrow(/unknown kernel/);
    expect(await client.kernel('double', 21)).toBe(42);
    close();
  });
});

describe('worker pool (real worker_threads)', () => {
  let entry = '';
  beforeAll(() => {
    // Bundle the worker entry the way a browser worker would be bundled; Node cannot load extensionless TS imports.
    entry = join(mkdtempSync(join(tmpdir(), 'mm-worker-')), 'node-worker.mjs');
    buildSync({ entryPoints: [resolve(__dirname, 'node-worker.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry, external: ['node:*'] });
  });

  it('runs kernels across workers, keeps order, and a worker can run the full pipeline', async () => {
    const pool = new WorkerPool(() => nodeWorkerPort(new Worker(entry)), 3);
    try {
      const ranges = Array.from({ length: 8 }, (_, i) => ({ from: i * 1000, to: (i + 1) * 1000 }));
      const got = await pool.map<number>('sumSquares', ranges);
      const want = ranges.map(({ from, to }) => { let s = 0; for (let i = from; i < to; i++) s += i * i; return s; });
      expect(got).toEqual(want);
    } finally { await pool.terminate(); }
  });

  it('a worker_threads engine host runs the dummy history and matches the in-process hash', async () => {
    const worker = new Worker(entry);
    const client = new EngineClient(nodeWorkerPort(worker) as never);
    try {
      const ref = makeWorld(); await runPipeline(ref, [dummyHistoryStage]);
      await client.load(await saveWorld(makeWorld(), { engine: 't' }));
      await client.run();
      expect(await client.hash()).toBe(await hashWorld(ref));
    } finally { await worker.terminate(); }
  });
});
