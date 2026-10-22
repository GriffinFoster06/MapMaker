// Parallel per-cell kernels (cells.ts, decision PK1): parallel equals serial, whatever the worker count and chunk size.
import { Worker } from 'node:worker_threads';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allocArray, runCells, setCellExecutor, setSharedAllocation } from '@mapmaker/core';
import { ParallelCells, WorkerPool } from './index';
import { nodeWorkerPort } from './node-adapter';
import './test-kernels';

function inputs(n: number) {
  const input = new Float64Array(n);
  for (let i = 0; i < n; i++) input[i] = Math.sin(i * 12.9898) * 43758.5453 % 7;
  const acc = new Float64Array(n);
  for (let i = 0; i < n; i++) acc[i] = i / 3;
  return { input, out: new Float32Array(n), acc, k: 1.7 };
}

function serial(n: number) {
  const a = inputs(n);
  runCells('test.cells', n, a, ['out', 'acc']);
  return a;
}

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

describe('parallel cell kernels (real worker_threads)', () => {
  let entry = '';
  const pools = new Map<number, WorkerPool>();
  beforeAll(async () => {
    entry = join(mkdtempSync(join(tmpdir(), 'mm-cells-')), 'node-worker.mjs');
    buildSync({ entryPoints: [resolve(__dirname, 'node-worker.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry, external: ['node:*'] });
    for (const size of [1, 2, 5, 8]) {
      const p = new WorkerPool(() => nodeWorkerPort(new Worker(entry)), size);
      await p.ready();
      pools.set(size, p);
    }
  });
  afterAll(async () => {
    setCellExecutor(null);
    setSharedAllocation(false);
    await Promise.all([...pools.values()].map((p) => p.terminate()));
  });

  it('equals the serial result for 1, 2, 5 and 8 workers and chunk edges at odd sizes', () => {
    for (const n of [1, 4095, 20001]) {
      const want = serial(n);
      for (const size of [1, 2, 5, 8]) {
        for (const chunk of [1, 7, 333, 4097]) {
          if (chunk === 1 && n > 4095) continue; // 20001 one-cell chunks per worker count adds time, not coverage
          const ex = new ParallelCells(pools.get(size)!, { chunk, minCells: 0 });
          setCellExecutor(ex);
          const got = inputs(n);
          runCells('test.cells', n, got, ['out', 'acc']);
          setCellExecutor(null);
          expect(ex.calls, `n=${n} workers=${size} chunk=${chunk}`).toBe(1);
          expect(bytes(got.out).equals(bytes(want.out)), `out n=${n} workers=${size} chunk=${chunk}`).toBe(true);
          expect(bytes(got.acc).equals(bytes(want.acc)), `acc n=${n} workers=${size} chunk=${chunk}`).toBe(true);
          expect(bytes(got.input).equals(bytes(want.input))).toBe(true);
        }
      }
    }
  });

  it('spreads the chunks over the workers and the calling thread', () => {
    const ex = new ParallelCells(pools.get(8)!, { chunk: 16, minCells: 0 });
    setCellExecutor(ex);
    const who = new Int32Array(20000);
    runCells('test.who', who.length, { who }, ['who']);
    setCellExecutor(null);
    expect(new Set(who).size).toBeGreaterThan(2);
  });

  it('works on shared arrays in place, without copying them', () => {
    const n = 30011, want = serial(n);
    setSharedAllocation(true);
    const a = inputs(n);
    const sh = { input: allocArray(Float64Array, n), out: allocArray(Float32Array, n), acc: allocArray(Float64Array, n), k: a.k };
    sh.input.set(a.input); sh.acc.set(a.acc);
    setSharedAllocation(false);
    const ex = new ParallelCells(pools.get(5)!, { chunk: 1001, minCells: 0 });
    setCellExecutor(ex);
    runCells('test.cells', n, sh, ['out', 'acc']);
    setCellExecutor(null);
    expect(ex.copiedBytes).toBe(0);
    expect(bytes(sh.out).equals(bytes(want.out))).toBe(true);
    expect(bytes(sh.acc).equals(bytes(want.acc))).toBe(true);
  });

  it('declines arguments it cannot share and loops below minCells; the caller then runs them', () => {
    const ex = new ParallelCells(pools.get(2)!, { chunk: 64, minCells: 1000 });
    setCellExecutor(ex);
    const small = inputs(999);
    runCells('test.cells', 999, small, ['out', 'acc']);
    const plain = { ...inputs(2000), input: Array.from(inputs(2000).input) };
    runCells('test.cells', 2000, plain as never, ['out', 'acc']);
    setCellExecutor(null);
    expect(ex.calls).toBe(0);
    expect(ex.declined).toBe(2);
    expect(bytes(small.out).equals(bytes(serial(999).out))).toBe(true);
    expect(bytes(plain.out).equals(bytes(serial(2000).out))).toBe(true);
  });

  it('reports a kernel error from a worker, and the pool keeps working', () => {
    const ex = new ParallelCells(pools.get(8)!, { chunk: 10, minCells: 0 });
    setCellExecutor(ex);
    try {
      expect(() => runCells('test.throws', 5000, { out: new Float64Array(5000), at: 4321 }, ['out'])).toThrow(/test\.throws: bad cell 4321/);
      const got = inputs(5000);
      runCells('test.cells', 5000, got, ['out', 'acc']);
      expect(bytes(got.out).equals(bytes(serial(5000).out))).toBe(true);
    } finally { setCellExecutor(null); }
  });
});
