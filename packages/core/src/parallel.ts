// Per-cell kernels (PERFORMANCE_STUDY §8 item 5, decision PK1). Original shell code.
//
// A cell kernel computes cells [from, to) of a loop whose cells are independent: a cell reads what it needs from arrays
// the kernel does not write, writes only its own entries of the kernel's outputs, and no sum runs across cells. Such a
// loop gives the same bits whether it runs in one call or in chunks on several threads, because every cell runs the
// same code on the same inputs. `runCells` hands the loop to the installed executor (the engine's worker pool on shared
// memory) or, without one, runs it in this thread over [0, n): the serial fallback, and the reference the parallel
// result is tested against.
import { dmath } from './dmath';

/** Kernel arguments: typed arrays, numbers, booleans, strings and null. Anything else makes the executor decline. */
export type CellArgs = Record<string, unknown>;
export type CellKernel<A extends CellArgs = CellArgs> = (args: A, from: number, to: number) => void;

export interface CellExecutor {
  /** Runs kernel `name` over [0, n) and returns true; or returns false without running it (the caller then runs it here). */
  run(name: string, n: number, args: CellArgs, outputs: readonly string[]): boolean;
}

const kernels = new Map<string, CellKernel>();
let executor: CellExecutor | null = null;

/** Registers a kernel under a global name. Worker entries import the defining modules, so both sides know it. */
export function defineCellKernel<A extends CellArgs>(name: string, fn: CellKernel<A>): void {
  const prev = kernels.get(name);
  if (prev && prev !== fn) throw new Error(`cell kernel ${name} is defined twice`);
  kernels.set(name, fn as CellKernel);
}

export function cellKernel(name: string): CellKernel | undefined { return kernels.get(name); }

/** Installs (or with null removes) the executor for this realm; returns the previous one. */
export function setCellExecutor(e: CellExecutor | null): CellExecutor | null {
  const prev = executor;
  executor = e;
  return prev;
}

export function cellExecutor(): CellExecutor | null { return executor; }

/**
 * Runs kernel `name` over cells [0, n). `outputs` names the arguments the kernel writes. Workers run in dmath's
 * default 'fdlibm' mode, so in any other mode (the parity tests' 'native') the kernel runs here.
 */
export function runCells<A extends CellArgs>(name: string, n: number, args: A, outputs: readonly (keyof A & string)[]): void {
  const k = kernels.get(name);
  if (!k) throw new Error(`unknown cell kernel: ${name}`);
  if (n <= 0) return;
  if (executor && dmath.mode === 'fdlibm' && executor.run(name, n, args, outputs)) return;
  k(args, 0, n);
}
