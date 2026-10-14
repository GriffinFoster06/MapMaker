// Phase 4b M2: the temperature, precipitation and heuristic-precipitation ports equal the vendored JavaScript bit for
// bit under dmath 'native'. Inputs are a real shell pipeline run up to erosion; the wind and ocean inputs come from the
// VENDORED wind.js / ocean.js so this test isolates these three modules. Vendor and port each get deep copies.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dmath } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import * as vWind from '../../vendor/js/wind.js';
import * as vOcean from '../../vendor/js/ocean.js';
import * as vUtil from '../../vendor/js/climate-util.js';
import * as vNoise from '../../vendor/js/simplex-noise.js';
import * as vPrecip from '../../vendor/js/precipitation.js';
import * as vTemp from '../../vendor/js/temperature.js';
import * as vHeur from '../../vendor/js/heuristic-precip.js';
import { resetClimateParams, setClimateParams } from '../../vendor/js/climate-config.js';
import * as pPrecip from './precipitation';
import * as pTemp from './temperature';
import * as pHeur from './heuristic-precip';
import * as pUtil from './climate-util';
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

/** Bit-exact comparison: same keys in the same order, typed arrays equal by type and bytes, other values deep-equal. */
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
const stages = (t: { stage: string }[]) => t.map((e) => e.stage);

interface Inputs {
  mesh: PortMesh;
  r_xyz: Float32Array;
  r_elevation: Float32Array;
  wind: any;
  ocean: any;
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
  const mesh = s.mesh as unknown as PortMesh, r_xyz = s.r_xyz.slice();
  // Wind and ocean from the vendored modules, exactly as the climate stage calls them.
  const wind = native(() => vWind.computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, new vNoise.SimplexNoise(p.seed))) as any;
  const ocean = native(() => vOcean.computeOceanCurrents(mesh, r_xyz, r_elevation, wind)) as any;
  return {
    mesh, r_xyz, r_elevation, wind, ocean,
    precipitationOffset: p.precipitationOffset, landCoverage: p.landCoverage, temperatureOffset: p.temperatureOffset,
  };
}

/** Run vendor and port on separate deep copies of the same arguments; compare results and the (possibly mutated) inputs. */
function both(vf: (...a: any[]) => any, pf: (...a: any[]) => any, args: unknown[]): { v: any; p: any } {
  const va = clone(args), pa = clone(args);
  const v = native(() => vf(...va)), p = native(() => pf(...pa));
  for (let i = 0; i < args.length; i++) {
    const x = va[i], y = pa[i];
    if (isTyped(x)) expect(bytes(y as ArrayBufferView).equals(bytes(x)), `arg ${i}`).toBe(true);
    else if (x && typeof x === 'object' && !(x as any).adjOffset) expectSame(y as any, x as any, ['_windTiming', '_oceanTiming', '_precipTiming']);
  }
  return { v, p };
}

function comparePrecipitation(inp: Inputs, wind: any, ocean: any, po: number, lc: number): any {
  const { mesh } = inp;
  const { v, p } = both(vPrecip.computePrecipitation, pPrecip.computePrecipitation, [mesh, inp.r_xyz, inp.r_elevation, wind, ocean, po, lc]);
  expectSame(p, v, ['_precipTiming']);
  expect(stages(p._precipTiming)).toEqual(stages(v._precipTiming));
  return v;
}

function compareTemperature(inp: Inputs, wind: any, ocean: any, precip: any, to: number): void {
  const { mesh } = inp;
  const { v, p } = both(vTemp.computeTemperature, pTemp.computeTemperature, [mesh, inp.r_xyz, inp.r_elevation, wind, ocean, precip, to]);
  expectSame(p, v, ['_tempTiming']);
  expect(stages(p._tempTiming)).toEqual(stages(v._tempTiming));
}

function compareAll(inp: Inputs): void {
  const { mesh, wind, ocean } = inp;
  const n = mesh.numRegions;

  // ── computeHeuristicWindField (both seasons' ITCZ; each side uses its own makeItczLookup) ──
  for (const lats of [wind.itczLatsSummer, wind.itczLatsWinter]) {
    const vl = vUtil.makeItczLookup(wind.itczLons, lats), pl = pUtil.makeItczLookup(wind.itczLons, lats);
    const hv = native(() => vHeur.computeHeuristicWindField(n, wind.r_lat, wind.r_lon, vl)) as any;
    const hp = native(() => pHeur.computeHeuristicWindField(n, wind.r_lat, wind.r_lon, pl));
    expectSame(hp as any, hv);
  }

  // ── computeHeuristicPrecipitation (gradients from the vendored computeGradients) ──
  const gE = new Float32Array(n), gN = new Float32Array(n);
  native(() => vWind.computeGradients(mesh, inp.r_xyz, inp.r_elevation, wind.r_eastX, wind.r_eastY, wind.r_eastZ, wind.r_northX, wind.r_northY, wind.r_northZ, gE, gN));
  {
    const { v, p } = both(vHeur.computeHeuristicPrecipitation, pHeur.computeHeuristicPrecipitation, [mesh, inp.r_xyz, inp.r_elevation, wind, gE, gN, wind.r_coastDistLand]);
    expectSame(p, v);
  }

  // ── computePrecipitation and computeTemperature with the stage's parameters ──
  const precip = comparePrecipitation(inp, wind, ocean, inp.precipitationOffset, inp.landCoverage);
  compareTemperature(inp, wind, ocean, precip, inp.temperatureOffset);
  // non-default offsets / land coverage (landCoverage > 0.4 branch)
  const precip2 = comparePrecipitation(inp, wind, ocean, 0.6, 0.55);
  compareTemperature(inp, wind, ocean, precip2, -4.5);

  // fallbacks: no continentality / westness / plate continentality, no ocean fields, no precipitation
  const { r_continentality: _c, r_westness: _w, r_plateContinentality: _pc, ...bareWind } = wind;
  void _c; void _w; void _pc;
  const precip3 = comparePrecipitation(inp, bareWind, {}, 0, 0.3);
  compareTemperature(inp, bareWind, {}, precip3, 0);
  compareTemperature(inp, wind, ocean, {}, 0);

  // climate switches off (contrast 1, no current modulation, no monsoon, no winter cooling)
  try {
    setClimateParams({
      PRECIP_SEASON_CONTRAST: 1, PRECIP_COLD_CURRENT_SUPPRESS: 0, PRECIP_WARM_CURRENT_BOOST: 0, PRECIP_MONSOON_ADD: 0,
      TEMP_CONT_WINTER_COOL_C: 0, TEMP_WINTER_COOL_WEST_RELIEF: 0,
    });
    const precip4 = comparePrecipitation(inp, wind, ocean, inp.precipitationOffset, inp.landCoverage);
    compareTemperature(inp, wind, ocean, precip4, inp.temperatureOffset);
  } finally {
    resetClimateParams();
  }
}

afterEach(() => { vi.restoreAllMocks(); resetClimateParams(); });

describe.each([[20000, 12345], [20000, 777], [200000, 12345]] as const)('temperature / precipitation ports = vendor, N=%i seed=%i', (N, seed) => {
  it('every export matches bit for bit, including mutated inputs', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});  // vendored precipitation.js / temperature.js log diagnostics
    const inp = await pipelineInputs(N, seed);
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random called'); });
    compareAll(inp);
  }, 600_000);
});
