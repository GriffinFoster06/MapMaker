// Parallel per-cell kernels on shared memory (PERFORMANCE_STUDY §8 item 5, decision PK1). Original shell code.
//
// The generator's loops are synchronous and deep inside ported code, so a kernel call is a synchronous fork-join: the
// calling thread posts the job to every pool worker, takes chunks itself, and blocks in Atomics.wait until every chunk
// is done. Chunks are claimed from a shared counter, so a chunk is computed by exactly one thread; which thread does not
// matter, because each cell's result depends only on inputs the kernel does not write (core/parallel.ts). The calling
// thread always takes part, so the call completes even if no worker has started yet.
import { type CellArgs, type CellExecutor, type TypedArray, type TypedArrayCtor, cellKernel, isSharedArray, sharedMemoryAvailable } from '@mapmaker/core';
import type { WorkerPool } from './pool';

/** The pool message for one kernel call (protocol op 'cells'; no reply: completion is signalled through `ctl`). */
export interface CellsJob { op: 'cells'; name: string; n: number; chunk: number; args: CellArgs; ctl: Int32Array; err: Uint8Array }

const NEXT = 0, DONE = 1, ERR = 2;
const ERR_BYTES = 1024;

/** True where this thread may block in Atomics.wait (Node, workers; not a browser page's main thread). */
export function canBlock(): boolean {
  if (!sharedMemoryAvailable()) return false;
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 1, 0); return true; } catch { return false; }
}

function fail(job: CellsJob, e: unknown): void {
  if (Atomics.compareExchange(job.ctl, ERR, 0, 1) !== 0) return;
  const msg = new TextEncoder().encode(`cell kernel ${job.name}: ${e instanceof Error ? e.message : String(e)}`).subarray(0, ERR_BYTES);
  job.err.set(msg);
}

/** Claims and computes chunks until none are left. Runs in the caller and in every pool worker. */
export function serveCells(job: CellsJob): void {
  const { n, chunk, ctl } = job;
  const nChunks = Math.ceil(n / chunk);
  const k = cellKernel(job.name);
  for (;;) {
    const c = Atomics.add(ctl, NEXT, 1);
    if (c >= nChunks) return;
    if (!k) fail(job, new Error('not defined in this worker'));
    else if (Atomics.load(ctl, ERR) === 0) {
      try { k(job.args, c * chunk, Math.min(n, (c + 1) * chunk)); } catch (e) { fail(job, e); }
    }
    if (Atomics.add(ctl, DONE, 1) + 1 === nChunks) Atomics.notify(ctl, DONE);
  }
}

export interface ParallelCellsOptions {
  /** Cells per chunk (default 2048). */
  chunk?: number;
  /** Loops shorter than this run in the calling thread (default 16384). */
  minCells?: number;
  /** Throw if no chunk completes for this long (default 300 s): a worker died. */
  stallMs?: number;
}

/** The executor core's runCells uses when a worker pool is up: see the file comment. */
export class ParallelCells implements CellExecutor {
  readonly chunk: number;
  readonly minCells: number;
  private readonly stallMs: number;
  /** Reused SharedArrayBuffers for arguments that are not shared yet (copied in, and outputs copied back). */
  private arena: SharedArrayBuffer[] = [];
  /** Bytes copied through the arena so far (tests check that shared inputs are not copied). */
  copiedBytes = 0;
  /** Calls run in parallel, and calls declined (too short, or an argument that cannot be shared). */
  calls = 0;
  declined = 0;

  constructor(private readonly pool: WorkerPool, opts: ParallelCellsOptions = {}) {
    this.chunk = Math.max(1, Math.floor(opts.chunk ?? 2048));
    this.minCells = opts.minCells ?? 16384;
    this.stallMs = opts.stallMs ?? 300_000;
  }

  get workers(): number { return this.pool.size; }

  /** Bytes held by the argument arena. */
  get arenaBytes(): number { return this.arena.reduce((s, b) => s + b.byteLength, 0); }

  /** Drops the argument arena (after a run; the next call allocates again). */
  release(): void { this.arena = []; }

  private stage(slot: number, a: TypedArray): TypedArray {
    let sab = this.arena[slot];
    if (!sab || sab.byteLength < a.byteLength) sab = this.arena[slot] = new SharedArrayBuffer(Math.max(8, a.byteLength));
    const view = new (a.constructor as TypedArrayCtor<TypedArray>)(sab, 0, a.length);
    view.set(a as never);
    this.copiedBytes += a.byteLength;
    return view;
  }

  run(name: string, n: number, args: CellArgs, outputs: readonly string[]): boolean {
    if (n < this.minCells || this.pool.size === 0) { this.declined++; return false; }
    const shipped: CellArgs = {};
    const back: [TypedArray, TypedArray][] = [];
    const staged = new Map<TypedArray, TypedArray>(); // one copy per array, even if passed under two names
    let slot = 0;
    for (const [key, v] of Object.entries(args)) {
      if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') { shipped[key] = v; continue; }
      if (!ArrayBuffer.isView(v) || v instanceof DataView || v instanceof BigInt64Array || v instanceof BigUint64Array) { this.declined++; return false; } // plain arrays, objects
      const a = v as TypedArray;
      if (isSharedArray(a)) { shipped[key] = a; continue; }
      let s = staged.get(a);
      if (!s) staged.set(a, s = this.stage(slot++, a));
      shipped[key] = s;
      if (outputs.includes(key) && !back.some(([o]) => o === a)) back.push([a, s]);
    }
    const job: CellsJob = { op: 'cells', name, n, chunk: this.chunk, args: shipped, ctl: new Int32Array(new SharedArrayBuffer(16)), err: new Uint8Array(new SharedArrayBuffer(ERR_BYTES)) };
    // The seq-cst store orders the argument copies above before every worker's first Atomics.add on NEXT.
    Atomics.store(job.ctl, NEXT, 0);
    this.pool.post(job);
    serveCells(job);
    const nChunks = Math.ceil(n / this.chunk);
    for (let d = Atomics.load(job.ctl, DONE); d < nChunks; d = Atomics.load(job.ctl, DONE)) {
      if (Atomics.wait(job.ctl, DONE, d, this.stallMs) === 'timed-out' && Atomics.load(job.ctl, DONE) === d) {
        throw new Error(`cell kernel ${name}: no chunk finished in ${this.stallMs} ms (a pool worker stopped)`);
      }
    }
    if (Atomics.load(job.ctl, ERR) !== 0) {
      const bytes = job.err.slice();
      throw new Error(new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0))));
    }
    for (const [orig, s] of back) orig.set(s as never);
    this.calls++;
    return true;
  }
}
