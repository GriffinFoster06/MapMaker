// Browser-side twin of lib/orogen.mjs: imports orogen's unmodified worker
// inside a real module Worker, intercepts its 'done' message, hashes every
// typed array, and can return raw arrays for ULP comparison.
import '../_work/orogen/js/planet-worker.js';
import { collectArrays, hashArrays, DEFAULTS } from '../lib/fields.mjs';

const workerOnMessage = self.onmessage;
const realPost = self.postMessage.bind(self);
let last = null;

self.onmessage = async (e) => {
  const { op } = e.data;
  if (op === 'run') {
    let done = null;
    self.postMessage = (m) => { if (m.type === 'done' || m.type === 'error') done = m; };
    const t = performance.now();
    workerOnMessage({ data: { cmd: 'generate', ...DEFAULTS, ...e.data.params } });
    const ms = performance.now() - t;
    self.postMessage = realPost;
    if (!done || done.type === 'error') { realPost({ op, error: done ? done.message : 'no result' }); return; }
    last = collectArrays(done);
    realPost({ op, ms, hashes: await hashArrays(last), ua: navigator.userAgent });
  } else if (op === 'get') {
    const a = last[e.data.key];
    realPost({ op, key: e.data.key, type: a.constructor.name, data: a.slice() });
  }
};
realPost({ op: 'ready' });
