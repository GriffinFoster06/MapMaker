// A worker_threads pool for the per-cell kernels in Node (tests, the probe and the scripts; decision PK1). Not exported
// from the package index: it uses esbuild and node:*, which a browser bundle must not see. Original shell code.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { buildSync } from 'esbuild';
import { setCellExecutor, setSharedAllocation } from '@mapmaker/core';
import { ParallelCells, type ParallelCellsOptions, WorkerPool, defaultPoolSize } from '@mapmaker/engine';
import { nodeWorkerPort } from '@mapmaker/engine/node-adapter';

let entry = '';

/** Bundles the worker entry once per process (Node cannot load the extensionless TypeScript imports directly). */
function workerEntry(): string {
  if (!entry) {
    const out = join(mkdtempSync(join(tmpdir(), 'mm-kernels-')), 'kernel-node-worker.mjs');
    buildSync({ entryPoints: [join(dirname(fileURLToPath(import.meta.url)), 'kernel-node-worker.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, external: ['node:*'], logLevel: 'error' });
    entry = out;
  }
  return entry;
}

export interface NodeKernelPool { pool: WorkerPool; executor: ParallelCells; terminate(): Promise<void> }

/**
 * Starts `size` kernel workers (default: hardware threads − 1), waits until they answer, and installs them as this
 * realm's cell executor with shared allocation on. `terminate` removes the executor and turns shared allocation off.
 */
export async function startNodeKernelPool(size?: number, opts: ParallelCellsOptions = {}): Promise<NodeKernelPool> {
  const file = workerEntry();
  const pool = new WorkerPool(() => nodeWorkerPort(new Worker(file)), size ?? defaultPoolSize());
  await pool.ready();
  const executor = new ParallelCells(pool, opts);
  setSharedAllocation(true);
  const prev = setCellExecutor(executor);
  return {
    pool,
    executor,
    terminate: async () => {
      setCellExecutor(prev);
      setSharedAllocation(false);
      await pool.terminate();
    },
  };
}
