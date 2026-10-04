// Adapters that give Node worker_threads the PortLike shape (the browser's Worker already has it).
import type { MessagePort, Worker } from 'node:worker_threads';
import type { PoolPort, } from './pool';

export function nodeWorkerPort(worker: Worker): PoolPort {
  const port: PoolPort = {
    postMessage: (m, t) => worker.postMessage(m, t as never),
    onmessage: null,
    terminate: () => worker.terminate(),
  };
  worker.on('message', (data) => port.onmessage?.({ data }));
  return port;
}

export function nodeParentPort(parent: MessagePort): PoolPort {
  const port: PoolPort = { postMessage: (m, t) => parent.postMessage(m, t as never), onmessage: null };
  parent.on('message', (data) => port.onmessage?.({ data }));
  return port;
}
