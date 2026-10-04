// Runs orogen's unmodified planet-worker.js `generate` command in-process, as the parity oracle (tests and tools only;
// shipped code never imports this). The worker reads `self`, so a shim captures its postMessage.
import type { TypedArray } from '@mapmaker/core';
import { OROGEN_DEFAULTS, type OrogenParams } from './params';

type Done = Record<string, unknown> & { type: string; debugLayers: Record<string, TypedArray> };

let handler: ((e: { data: unknown }) => void) | undefined;

async function load(): Promise<(e: { data: unknown }) => void> {
  if (handler) return handler;
  const g = globalThis as unknown as { self?: { postMessage: (m: unknown) => void; onmessage?: (e: { data: unknown }) => void } };
  g.self ??= { postMessage: () => {} };
  const log = console.log;
  console.log = () => {}; // orogen logs diagnostics via console.log
  try { await import('../vendor/js/planet-worker.js'); } finally { console.log = log; }
  handler = g.self.onmessage!;
  return handler;
}

/** Stock orogen's result for the same parameters. `seed` is always passed, so Math.random is never reached. */
export async function runStockOrogen(params: Partial<OrogenParams> = {}): Promise<Done> {
  const { debugLayers: _ignored, ...p } = { ...OROGEN_DEFAULTS, ...params };
  void _ignored;
  const onmessage = await load();
  const g = globalThis as unknown as { self: { postMessage: (m: unknown) => void } };
  const captured: Done[] = [];
  g.self.postMessage = (m) => captured.push(m as Done);
  const log = console.log;
  console.log = () => {};
  try {
    onmessage({ data: { cmd: 'generate', ...p } });
  } finally { console.log = log; }
  const done = captured.find((m) => m.type === 'done');
  if (!done) {
    const err = captured.find((m) => m.type === 'error') as unknown as { message: string; stack: string } | undefined;
    throw new Error('stock orogen failed: ' + (err ? `${err.message}\n${err.stack}` : 'no result'));
  }
  return done;
}

/** The typed arrays of a stock result, keyed as spike 1a keyed them: top-level fields, then `debug.<name>`. */
export function stockArrays(done: Done): Record<string, TypedArray> {
  const out: Record<string, TypedArray> = {};
  for (const [k, v] of Object.entries(done)) if (ArrayBuffer.isView(v)) out[k] = v as unknown as TypedArray;
  for (const [k, v] of Object.entries(done.debugLayers)) if (ArrayBuffer.isView(v)) out[`debug.${k}`] = v;
  return out;
}
