// Phase 4a parity test (ARCHITECTURE §7): the shell's orogen pipeline equals stock orogen for the same seed.
// The oracle is the vendored, verbatim planet-worker.js. With upstream/ present, the same comparison also runs
// against upstream/orogen directly (nightly job).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrogenLcg, SphereMesh, type World, dmath, hashWorld, loadWorld, orogenToCanonical, saveWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { OROGEN_DEFAULTS, type OrogenParams, createOrogenWorld, orogenStages, orogenView, readParams } from './index';
import { runStockOrogen, stockArrays } from './stock';
import { elevToHeightKm } from './vendor';

const ROOT = resolve(__dirname, '../../..');
const UPSTREAM_WORKER = resolve(ROOT, 'upstream/orogen/js/planet-worker.js');

async function runShell(params: Partial<OrogenParams>, only?: string[]): Promise<World> {
  const w = createOrogenWorld({ debugLayers: true, ...params });
  await runPipeline(w, orogenStages, { strict: true, ...(only ? { only } : {}) });
  return w;
}

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function diffReport(key: string, a: ArrayBufferView, b: ArrayBufferView): string {
  const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>;
  if (x.length !== y.length) return `${key}: length ${x.length} vs ${y.length}`;
  let n = 0, first = -1, worst = 0;
  for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) { n++; if (first < 0) first = i; worst = Math.max(worst, Math.abs(x[i]! - y[i]!)); }
  return `${key}: ${n} differing elements, first at ${first}, max |diff| ${worst}`;
}

function compareAll(shell: Record<string, ArrayBufferView>, stock: Record<string, ArrayBufferView>): string[] {
  const problems: string[] = [];
  for (const k of Object.keys(stock)) {
    const m = shell[k];
    if (!m) { problems.push(`${k}: missing from shell output`); continue; }
    if (m.constructor !== stock[k]!.constructor || !bytes(m).equals(bytes(stock[k]!))) problems.push(diffReport(k, m, stock[k]!));
  }
  for (const k of Object.keys(shell)) if (!(k in stock)) problems.push(`${k}: extra in shell output`);
  return problems;
}

afterEach(() => vi.restoreAllMocks());

describe.each([[20000, 12345], [20000, 777], [200000, 12345]] as const)('shell pipeline vs stock orogen, N=%i seed=%i', (N, seed) => {
  it('matches all 69 stock arrays bit for bit, and the canonical layers derive exactly', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random called during generation'); });
    const stock = await runStockOrogen({ N, seed });
    const world = await runShell({ N, seed });
    const stockA = stockArrays(stock);
    expect(Object.keys(stockA).length).toBe(69);
    const problems = compareAll(orogenView(world), stockA);
    expect(problems).toEqual([]);

    // Canonical layers are exact transforms of stock output.
    const mesh = world.meshes.get('global')!.mesh;
    const canon = orogenToCanonical(stock['r_xyz'] as Float32Array);
    expect(bytes(mesh.points).equals(bytes(canon as Float64Array))).toBe(true);
    const metres = world.layers.get('global', 'elevation') as Float32Array;
    const raw = stock['r_elevation'] as Float32Array;
    for (let i = 0; i < raw.length; i++) if (metres[i] !== Math.fround(elevToHeightKm(raw[i]!) * 1000)) throw new Error(`elevation[${i}]`);
    expect(bytes(world.layers.get('global', 'plate')).equals(bytes(stock['r_plate'] as Int32Array))).toBe(true);
    expect(bytes(world.layers.get('global', 'koppen')).equals(bytes(stockA['debug.koppen']!))).toBe(true);
    expect(bytes(world.layers.get('global', 'wind.summer.north')).equals(bytes(stockA['r_wind_north_summer']!))).toBe(true);
  }, 180_000);
});

describe('shell pipeline rules', () => {
  it('canonical `mesh` stage runs in fdlibm; every orogen stage is a parity stage that used native mode', async () => {
    const w = await runShell({ N: 5000 });
    const by = Object.fromEntries(w.pipeline.completed.map((r) => [r.stageId, r.dmath]));
    expect(by['mesh']).toEqual(['fdlibm']);
    for (const id of ['orogen.tectonics', 'orogen.elevation', 'orogen.erosion', 'orogen.climate', 'orogen.koppen']) expect(by[id], id).toEqual(['fdlibm', 'native']);
    expect(dmath.mode).toBe('fdlibm');
  });

  it('the mesh stage in fdlibm gives the same Float32 mesh as native mode', async () => {
    const a = await runShell({ N: 20000, debugLayers: false }, ['mesh']);
    const nativeMesh = dmath.withMode('native', () => {
      const rng = new OrogenLcg('x', OROGEN_DEFAULTS.seed);
      return SphereMesh.build({ N: 20000, jitter: OROGEN_DEFAULTS.jitter, rng: () => rng.next(), precision: 'f32' });
    });
    const m = a.meshes.get('global')!.mesh;
    expect(bytes(m.points).equals(bytes(nativeMesh.points))).toBe(true);
    expect(bytes(m.triangles).equals(bytes(nativeMesh.triangles))).toBe(true);
  });

  it('rejects a planet radius other than 6371 km (F3)', async () => {
    const w = createOrogenWorld({ N: 2000 });
    w.planet['radius_m'] = 3_389_500;
    expect(() => readParams(w)).toThrow(/6371/);
    await expect(runPipeline(w, orogenStages)).rejects.toThrow(/6371/);
  });

  it('private orogen layers cannot be read by other stages', async () => {
    const w = createOrogenWorld({ N: 2000 });
    const rogue = { id: 'other.consumer', version: '1', reads: ['orogen.elevRaw'], writes: [], run() {} };
    await expect(runPipeline(w, [rogue])).rejects.toThrow(/private layer orogen.elevRaw/);
  });

  it('keeps debug fields out of the world unless asked (memory)', async () => {
    const w = await runShell({ N: 3000, debugLayers: false });
    const keys = w.layers.keys().filter((k) => k.includes('orogen.debug.'));
    expect(keys.map((k) => k.split('orogen.debug.')[1]).sort()).toEqual(['basinWeight', 'cratonWeight', 'hotspot', 'orogenicPower']);
  });

  it('save after the climate stage, load, resume: identical world to an uninterrupted run (§5 exact resume)', async () => {
    const full = await runShell({ N: 8000, seed: 5 });
    const part = await runShell({ N: 8000, seed: 5 }, ['mesh', 'orogen.tectonics', 'orogen.elevation', 'orogen.erosion', 'orogen.climate']);
    const { world } = await loadWorld(await saveWorld(part, { engine: 'test' }));
    const res = await runPipeline(world, orogenStages, { strict: true });
    expect(res.ran).toEqual(['orogen.koppen']);
    expect(await hashWorld(world)).toBe(await hashWorld(full));
    // A load also drops the scratch: re-running the elevation stage recomputes the tectonics from the seed, same result.
    const res2 = await runPipeline(world, orogenStages, { strict: true });
    expect(res2.ran).toEqual([]);
  });
});

describe.skipIf(!existsSync(UPSTREAM_WORKER))('shell pipeline vs upstream/orogen planet-worker.js (needs upstream/)', () => {
  it('is bit-identical to the unvendored upstream worker at N=20k', async () => {
    const g = globalThis as unknown as { self: { postMessage: (m: unknown) => void; onmessage?: (e: { data: unknown }) => void } };
    const saved = { onmessage: g.self.onmessage };
    const log = console.log;
    console.log = () => {};
    try { await import(/* @vite-ignore */ pathToFileURL(UPSTREAM_WORKER).href); } finally { console.log = log; }
    const onmessage = g.self.onmessage!;
    const captured: Record<string, unknown>[] = [];
    g.self.postMessage = (m) => captured.push(m as Record<string, unknown>);
    console.log = () => {};
    try { onmessage({ data: { cmd: 'generate', ...OROGEN_DEFAULTS, N: 20000, seed: 12345, debugLayers: undefined } }); } finally { console.log = log; }
    g.self.onmessage = saved.onmessage;
    const done = captured.find((m) => m['type'] === 'done') as never;
    const world = await runShell({ N: 20000, seed: 12345 });
    expect(compareAll(orogenView(world), stockArrays(done))).toEqual([]);
  }, 120_000);
});

describe('engine worker (worker_threads)', () => {
  it('runs the orogen pipeline in a Node engine worker with the same world hash as in-process', async () => {
    const { Worker } = await import('node:worker_threads');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { buildSync } = await import('esbuild');
    const { EngineClient } = await import('@mapmaker/engine');
    const { nodeWorkerPort } = await import('@mapmaker/engine/node-adapter');
    const entry = join(mkdtempSync(join(tmpdir(), 'mm-orogen-')), 'node-worker.mjs');
    buildSync({ entryPoints: [resolve(__dirname, 'node-worker.ts')], bundle: true, platform: 'node', format: 'esm', outfile: entry, external: ['node:*'], logLevel: 'error' });

    const params = { N: 8000, seed: 5, debugLayers: true };
    const ref = await runShell(params);
    const worker = new Worker(entry);
    const client = new EngineClient(nodeWorkerPort(worker) as never);
    try {
      await client.create(params);
      const res = await client.run();
      expect(res.ran).toEqual(['mesh', 'orogen.tectonics', 'orogen.elevation', 'orogen.erosion', 'orogen.climate', 'orogen.koppen']);
      expect(await client.hash()).toBe(await hashWorld(ref));
      const stats = await client.stats();
      expect(stats.dmath).toBe('fdlibm');
      expect(stats.layerBytes).toBeGreaterThan(0);
      const layers = await client.layers(['elevation', 'koppen']);
      expect(layers['elevation']![0]!.length).toBe(8001);
    } finally { await worker.terminate(); }
  }, 120_000);
});
