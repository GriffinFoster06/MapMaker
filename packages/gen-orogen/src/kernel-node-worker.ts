// worker_threads entry of a Node kernel pool (node-pool.ts): an engine host with no stages that runs per-cell kernels.
import { parentPort } from 'node:worker_threads';
import { initRealm } from '@mapmaker/core';
import { attachHost } from '@mapmaker/engine';
import { nodeParentPort } from '@mapmaker/engine/node-adapter';
import './kernels';

initRealm();
if (!parentPort) throw new Error('kernel-node-worker must run in a worker thread');
attachHost(nodeParentPort(parentPort), { stages: [], engine: `node ${process.version}` });
