// Run orogen's unmodified planet-worker.js 'generate' command in Node.
// The worker reads `self`; we provide a shim and capture its postMessage.
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULTS } from './fields.mjs';

register('./orogen-hooks.mjs', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OROGEN = path.resolve(HERE, '..', '_work', 'orogen');

globalThis.self ??= { postMessage: () => {} };

/** Load planet-worker.js from an orogen tree and return a synchronous generate() runner. */
export async function makeRunner(root) {
  const log = console.log;
  console.log = () => {};   // orogen logs diagnostics via console.log
  try {
    await import(pathToFileURL(path.join(root, 'js', 'planet-worker.js')).href);
  } finally {
    console.log = log;
  }
  const onmessage = globalThis.self.onmessage;
  return (params, { quiet = true } = {}) => {
    const captured = [];
    globalThis.self.postMessage = (m) => captured.push(m);
    const log = console.log;
    if (quiet) console.log = () => {};
    try {
      onmessage({ data: { cmd: 'generate', ...DEFAULTS, ...params } });
    } finally {
      console.log = log;
    }
    const done = captured.find((m) => m.type === 'done');
    if (!done) {
      const err = captured.find((m) => m.type === 'error');
      throw new Error('orogen generate failed: ' + (err ? err.message + '\n' + err.stack : 'no result'));
    }
    return done;
  };
}

export const runOrogen = await makeRunner(OROGEN);

export function orogenModule(rel, root = OROGEN) {
  return import(pathToFileURL(path.join(root, 'js', rel)).href);
}
