// Cell kernels for the engine's own tests (cells.test.ts); the test worker entry imports this module too.
import { threadId } from 'node:worker_threads';
import { defineCellKernel, dmath } from '@mapmaker/core';

/** Reads its own and its neighbour's input (an array it does not write), writes out[i], and accumulates acc[i]. */
defineCellKernel<{ [k: string]: unknown; input: Float64Array; out: Float32Array; acc: Float64Array; k: number }>('test.cells', ({ input, out, acc, k }, from, to) => {
  const n = input.length;
  for (let i = from; i < to; i++) {
    const v = dmath.sin(input[i]! * k) + dmath.atan2(input[(i + 1) % n]!, 1 + i);
    out[i] = v;
    acc[i]! += v * v;
  }
});

/** Throws at cell `at`. */
defineCellKernel<{ [k: string]: unknown; out: Float64Array; at: number }>('test.throws', ({ out, at }, from, to) => {
  for (let i = from; i < to; i++) {
    if (i === at) throw new Error(`bad cell ${i}`);
    out[i] = i;
  }
});

/** Records which thread computed each cell (after some work, so the workers get chunks too). */
defineCellKernel<{ [k: string]: unknown; who: Int32Array }>('test.who', ({ who }, from, to) => {
  for (let i = from; i < to; i++) {
    let s = 0;
    for (let j = 0; j < 2000; j++) s += dmath.sin(i + j);
    who[i] = s > 1e9 ? -1 : threadId;
  }
});
