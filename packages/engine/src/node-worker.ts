// worker_threads entry used by tests and the Node probe. Browser builds use their own entry that calls attachHost.
import { parentPort } from 'node:worker_threads';
import { dmath, initRealm } from '@mapmaker/core';
import { attachHost } from './host';
import { nodeParentPort } from './node-adapter';
import { dummyHistoryStage } from './stages/dummy-history';

initRealm();
if (!parentPort) throw new Error('node-worker must run in a worker thread');
attachHost(nodeParentPort(parentPort), {
  stages: [dummyHistoryStage],
  engine: `node ${process.version}`,
  kernels: {
    dmathMode: () => dmath.mode,
    // Pure data-parallel test kernel: sum of squares of a range.
    sumSquares: ({ from, to }: { from: number; to: number }) => { let s = 0; for (let i = from; i < to; i++) s += i * i; return s; },
  },
});
