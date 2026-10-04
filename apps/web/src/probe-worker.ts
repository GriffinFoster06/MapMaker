import { runProbe } from '@mapmaker/determinism/probe';
import { initRealm, type TypedArray } from '@mapmaker/core';

initRealm();

let arrays: Record<string, TypedArray> | undefined;

self.onmessage = async (e: MessageEvent<{ op: 'run' } | { op: 'get'; key: string }>) => {
  try {
    if (e.data.op === 'run') {
      const r = await runProbe({ keepArrays: true });
      arrays = r.arrays;
      self.postMessage({ op: 'run', version: r.version, hashes: r.hashes, ua: navigator.userAgent });
    } else {
      const a = arrays?.[e.data.key];
      self.postMessage({ op: 'get', key: e.data.key, type: a?.constructor.name, data: a ? Array.from(a as ArrayLike<number>, (x) => (Number.isNaN(x) ? 'NaN' : x)) : null });
    }
  } catch (err) {
    self.postMessage({ op: 'error', message: err instanceof Error ? err.stack ?? err.message : String(err) });
  }
};
