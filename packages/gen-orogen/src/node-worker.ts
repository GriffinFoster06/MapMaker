// worker_threads entry for tests and the Node tools. Bundled with esbuild (Node cannot load extensionless TS imports).
import { parentPort } from 'node:worker_threads';
import { nodeParentPort } from '@mapmaker/engine/node-adapter';
import { startOrogenHost } from './host';

if (!parentPort) throw new Error('node-worker must run in a worker thread');
startOrogenHost(nodeParentPort(parentPort), `node ${process.version}`);
