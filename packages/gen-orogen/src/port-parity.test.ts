// Phase 4b M2: the TypeScript ports (./port) replace the vendored modules (./vendor) in the shell's orogen stages, and
// the result must still equal stock orogen (the vendored planet-worker.js, which imports the vendored JS directly)
// bit for bit. Parity stages run in dmath 'native', where dmath.* is Math.*, so any difference is a porting error.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages, orogenView } from './index';
import { runStockOrogen, stockArrays } from './stock';
import * as port from './port';
import * as used from './vendor';

vi.mock('./vendor', async () => await import('./port'));

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function diffReport(key: string, a: ArrayBufferView, b: ArrayBufferView): string {
  const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>;
  if (x.length !== y.length) return `${key}: length ${x.length} vs ${y.length}`;
  let n = 0, first = -1, worst = 0;
  for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) { n++; if (first < 0) first = i; worst = Math.max(worst, Math.abs(x[i]! - y[i]!)); }
  return `${key}: ${n} differing elements, first at ${first}, max |diff| ${worst}`;
}

afterEach(() => vi.restoreAllMocks());

it('the stages see the ports, not the vendored modules (the comparison below is not vacuous)', () => {
  const names = Object.keys(port) as (keyof typeof port)[];
  expect(names.length).toBe(Object.keys(used).length);
  for (const k of names) expect(used[k]).toBe(port[k]);
});

describe.each([[20000, 12345], [20000, 777], [200000, 12345]] as const)('ported pipeline vs stock orogen, N=%i seed=%i', (N, seed) => {
  it('matches all 69 stock arrays bit for bit', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random called during generation'); });
    const stock = stockArrays(await runStockOrogen({ N, seed }));
    const world = createOrogenWorld({ debugLayers: true, N, seed });
    await runPipeline(world, orogenStages, { strict: true });
    const shell = orogenView(world);
    expect(Object.keys(stock).length).toBe(69);
    const problems: string[] = [];
    for (const k of Object.keys(stock)) {
      const m = shell[k];
      if (!m) { problems.push(`${k}: missing`); continue; }
      if (m.constructor !== stock[k]!.constructor || !bytes(m).equals(bytes(stock[k]!))) problems.push(diffReport(k, m, stock[k]!));
    }
    expect(problems).toEqual([]);
  });
});
