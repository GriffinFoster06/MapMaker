// Phase 4b M2: the wind, ocean-current and Köppen ports equal the vendored JavaScript bit for bit under dmath 'native'.
// Inputs are a real shell pipeline run up to erosion; vendor and port each get their own deep copies of every input.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dmath } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import * as vWind from '../../vendor/js/wind.js';
import * as vOcean from '../../vendor/js/ocean.js';
import * as vKoppen from '../../vendor/js/koppen.js';
import * as vPrecip from '../../vendor/js/precipitation.js';
import * as vTemp from '../../vendor/js/temperature.js';
import * as vNoise from '../../vendor/js/simplex-noise.js';
import * as vRng from '../../vendor/js/rng.js';
import * as pWind from './wind';
import * as pOcean from './ocean';
import * as pKoppen from './koppen';
import * as pNoise from './simplex-noise';
import type { PortMesh } from './types';
import { createOrogenWorld, getScratch, orogenStages, readParams } from '../index';

const native = <T>(f: () => T): T => dmath.withMode('native', f);
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const isTyped = (x: unknown): x is ArrayBufferView => ArrayBuffer.isView(x);

/** Deep copy: typed arrays get a fresh buffer of the same type, objects and arrays are rebuilt in key order. */
function clone<T>(x: T): T {
  if (isTyped(x)) return (x as unknown as { slice(): T }).slice();
  if (x instanceof Set) return new Set(x) as T;
  if (Array.isArray(x)) return x.map(clone) as T;
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clone(v)])) as T;
  return x;
}

/** Bit-exact comparison of two results: same keys in the same order, typed arrays equal by type and bytes. */
function expectSame(port: Record<string, unknown>, vendor: Record<string, unknown>, skip: string[] = []): void {
  expect(Object.keys(port)).toEqual(Object.keys(vendor));
  for (const k of Object.keys(vendor)) {
    if (skip.includes(k)) continue;
    const a = port[k], b = vendor[k];
    if (isTyped(b)) {
      expect(a?.constructor, k).toBe(b.constructor);
      expect(bytes(a as ArrayBufferView).equals(bytes(b)), k).toBe(true);
    } else {
      expect(a, k).toEqual(b);
    }
  }
}

/** Timing arrays hold performance.now deltas: compare their shape (stage labels) only. */
function expectSameTiming(port: { stage: string }[], vendor: { stage: string }[]): void {
  expect(port.map((t) => t.stage)).toEqual(vendor.map((t) => t.stage));
}

interface Inputs {
  mesh: PortMesh;
  r_xyz: Float32Array;
  r_elevation: Float32Array;
  r_plate: Int32Array;
  plateIsOcean: Set<number>;
  seed: number;
  precipitationOffset: number;
  landCoverage: number;
  temperatureOffset: number;
}

async function pipelineInputs(N: number, seed: number): Promise<Inputs> {
  const world = createOrogenWorld({ N, seed, debugLayers: true });
  await runPipeline(world, orogenStages, { only: ['mesh', 'orogen.tectonics', 'orogen.elevation', 'orogen.erosion'] });
  const s = getScratch(world);
  const p = readParams(world);
  const r_elevation = (world.layers.get('global', 'orogen.elevRaw') as Float32Array).slice();
  const r_plate = new Int32Array((world.layers.get('global', 'plate') as unknown as Int32Array));
  const plates = world.entities.get('plates')!;
  const ids = plates.column('plateId'), oc = plates.column('oceanic');
  const plateIsOcean = new Set<number>();
  for (let i = 0; i < ids.length; i++) if (oc[i]) plateIsOcean.add(ids[i]!);
  return {
    mesh: s.mesh as unknown as PortMesh, r_xyz: s.r_xyz.slice(), r_elevation, r_plate, plateIsOcean, seed: p.seed,
    precipitationOffset: p.precipitationOffset, landCoverage: p.landCoverage, temperatureOffset: p.temperatureOffset,
  };
}

function compareAll(inp: Inputs): void {
  const { mesh } = inp;
  const n = mesh.numRegions;

  // ── computeWind ──
  const vin = clone({ r_xyz: inp.r_xyz, r_elevation: inp.r_elevation, r_plate: inp.r_plate, plateIsOcean: inp.plateIsOcean });
  const pin = clone(vin);
  const vw = native(() => vWind.computeWind(mesh, vin.r_xyz, vin.r_elevation, vin.plateIsOcean, vin.r_plate, new vNoise.SimplexNoise(inp.seed))) as any;
  const pw = native(() => pWind.computeWind(mesh, pin.r_xyz, pin.r_elevation, pin.plateIsOcean, pin.r_plate, new pNoise.SimplexNoise(inp.seed))) as any;
  expectSame(pw, vw, ['_windTiming']);
  expectSameTiming(pw._windTiming, vw._windTiming);
  expectSame(pin as any, vin as any);
  expect(bytes(pin.r_elevation).equals(bytes(inp.r_elevation))).toBe(true);
  // a non-default axial tilt and no noise
  const vw2 = native(() => vWind.computeWind(mesh, inp.r_xyz, inp.r_elevation, inp.plateIsOcean, inp.r_plate, null, 31)) as any;
  const pw2 = native(() => pWind.computeWind(mesh, inp.r_xyz, inp.r_elevation, inp.plateIsOcean, inp.r_plate, null, 31)) as any;
  expectSame(pw2, vw2, ['_windTiming']);

  // ── computeGradients (standalone, on the elevation field, as precipitation.js uses it) ──
  const gv = [new Float32Array(n), new Float32Array(n)] as const, gp = [new Float32Array(n), new Float32Array(n)] as const;
  native(() => vWind.computeGradients(mesh, inp.r_xyz, inp.r_elevation, vw.r_eastX, vw.r_eastY, vw.r_eastZ, vw.r_northX, vw.r_northY, vw.r_northZ, gv[0], gv[1]));
  native(() => pWind.computeGradients(mesh, inp.r_xyz, inp.r_elevation, pw.r_eastX, pw.r_eastY, pw.r_eastZ, pw.r_northX, pw.r_northY, pw.r_northZ, gp[0], gp[1]));
  expect(bytes(gp[0]).equals(bytes(gv[0]))).toBe(true);
  expect(bytes(gp[1]).equals(bytes(gv[1]))).toBe(true);
  // Float64 outputs: no Float32 store to absorb a 1-ulp double difference, so this checks the arithmetic itself
  const hv = [new Float64Array(n), new Float64Array(n)] as const, hp = [new Float64Array(n), new Float64Array(n)] as const;
  native(() => vWind.computeGradients(mesh, inp.r_xyz, vw.r_pressure_summer, vw.r_eastX, vw.r_eastY, vw.r_eastZ, vw.r_northX, vw.r_northY, vw.r_northZ, hv[0], hv[1]));
  native(() => pWind.computeGradients(mesh, inp.r_xyz, pw.r_pressure_summer, pw.r_eastX, pw.r_eastY, pw.r_eastZ, pw.r_northX, pw.r_northY, pw.r_northZ, hp[0], hp[1]));
  expect(bytes(hp[0]).equals(bytes(hv[0]))).toBe(true);
  expect(bytes(hp[1]).equals(bytes(hv[1]))).toBe(true);

  // ── computeOceanCurrents ──
  const vwc = clone(vw), pwc = clone(pw);
  const vo = native(() => vOcean.computeOceanCurrents(mesh, vin.r_xyz, vin.r_elevation, vwc)) as any;
  const po = native(() => pOcean.computeOceanCurrents(mesh, pin.r_xyz, pin.r_elevation, pwc)) as any;
  expectSame(po, vo, ['_oceanTiming']);
  expectSameTiming(po._oceanTiming, vo._oceanTiming);
  expectSame(pwc, vwc, ['_windTiming']);
  expectSame(pwc, pw, ['_windTiming']);
  // the r_lon fallback (wind result without r_lon)
  const { r_lon: _a, ...vNoLon } = clone(vw);
  const { r_lon: _b, ...pNoLon } = clone(pw);
  void _a; void _b;
  const vo2 = native(() => vOcean.computeOceanCurrents(mesh, inp.r_xyz, inp.r_elevation, vNoLon)) as any;
  const po2 = native(() => pOcean.computeOceanCurrents(mesh, inp.r_xyz, inp.r_elevation, pNoLon)) as any;
  expectSame(po2, vo2, ['_oceanTiming']);

  // ── classifyKoppen (temperature and precipitation from the vendored modules) ──
  const precip = native(() => vPrecip.computePrecipitation(mesh, inp.r_xyz, inp.r_elevation, clone(vw), clone(vo), inp.precipitationOffset, inp.landCoverage)) as any;
  const temp = native(() => vTemp.computeTemperature(mesh, inp.r_xyz, inp.r_elevation, clone(vw), clone(vo), clone(precip), inp.temperatureOffset)) as any;
  const tIn = { r_temperature_summer: temp.r_temperature_summer, r_temperature_winter: temp.r_temperature_winter };
  const pIn = { r_precip_summer: precip.r_precip_summer, r_precip_winter: precip.r_precip_winter, r_westness: precip.r_westness };
  const [vt, vp, pt, pp] = [clone(tIn), clone(pIn), clone(tIn), clone(pIn)];
  const vk = native(() => vKoppen.classifyKoppen(mesh, inp.r_elevation, vt, vp)) as Uint8Array;
  const pk = native(() => pKoppen.classifyKoppen(mesh, inp.r_elevation, pt, pp));
  expect(pk.constructor).toBe(Uint8Array);
  expect(bytes(pk).equals(bytes(vk))).toBe(true);
  expectSame(pt, vt);
  expectSame(pp, vp);
  expect(new Set(vk).size).toBeGreaterThan(8);  // the inputs exercise many classes
  // without r_westness
  const noWest = { r_precip_summer: precip.r_precip_summer, r_precip_winter: precip.r_precip_winter };
  const vk2 = native(() => vKoppen.classifyKoppen(mesh, inp.r_elevation, tIn, noWest)) as Uint8Array;
  const pk2 = native(() => pKoppen.classifyKoppen(mesh, inp.r_elevation, tIn, noWest));
  expect(bytes(pk2).equals(bytes(vk2))).toBe(true);
}

afterEach(() => vi.restoreAllMocks());

describe('wind/ocean/Köppen ports = vendor (native mode)', () => {
  it('smoothstep', () => {
    const r = vRng.makeRng(5);
    const edges: [number, number][] = [[0, 1], [1, 0], [2, 2], [-3, 5], [0.2, 0.45], [90, 60], [0, Math.sin(5 * Math.PI / 180)]];
    for (const [e0, e1] of edges) {
      for (let i = 0; i < 500; i++) {
        const x = (r() * 2 - 0.5) * (Math.abs(e1 - e0) + 1) + Math.min(e0, e1);
        expect(Object.is(pWind.smoothstep(e0, e1, x), vWind.smoothstep(e0, e1, x))).toBe(true);
      }
      for (const x of [e0, e1, -Infinity, Infinity, NaN, 0, -0]) expect(Object.is(pWind.smoothstep(e0, e1, x), vWind.smoothstep(e0, e1, x))).toBe(true);
    }
  });

  it('V8 `q ** 2` equals the port\'s `q * q` (the rewrite used for every squared Gaussian term in wind.js)', () => {
    const r = vRng.makeRng(11);
    for (let i = 0; i < 200000; i++) {
      const q = (r() - 0.5) * Math.pow(10, Math.floor(r() * 40) - 20);
      expect(Object.is(q ** 2, q * q)).toBe(true);
      expect(Object.is(Math.exp(-0.5 * q ** 2), Math.exp(-0.5 * (q * q)))).toBe(true);
    }
    for (const q of [0, -0, 1e-200, -1e-200, 1e200, Infinity, -Infinity, NaN, Number.MIN_VALUE, Number.MAX_VALUE]) expect(Object.is(q ** 2, q * q)).toBe(true);
  });

  it('KOPPEN_CLASSES', () => {
    expect(pKoppen.KOPPEN_CLASSES).toEqual(vKoppen.KOPPEN_CLASSES);
  });

  it('module exports match', () => {
    expect(Object.keys(pWind).filter((k) => typeof (pWind as any)[k] === 'function').sort()).toEqual(Object.keys(vWind).sort());
    expect(Object.keys(pOcean).sort()).toEqual(Object.keys(vOcean).sort());
    expect(Object.keys(pKoppen).sort()).toEqual(Object.keys(vKoppen).sort());
  });

  it.each([[20000, 12345], [20000, 777], [200000, 12345]] as const)('pipeline inputs N=%i seed=%i', async (N, seed) => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random called'); });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    compareAll(await pipelineInputs(N, seed));
  }, 300_000);
});
