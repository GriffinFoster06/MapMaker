// Phase 4b M2: the elevation port equals the vendored elevation.js bit for bit under dmath 'native'.
// Inputs are built with the vendored modules exactly as planet-worker.js handleGenerate does (sphere, coarse plates,
// projection, smoothing, densities, plate physics, super plates, mantle field); vendor and port then run on deep
// copies of the same inputs, and every output (and every mutated input) is compared.
/* eslint-disable @typescript-eslint/no-explicit-any */
import Delaunator from 'delaunator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dmath } from '@mapmaker/core';
import * as vRng from '../../vendor/js/rng.js';
import * as vNoise from '../../vendor/js/simplex-noise.js';
import * as vMesh from '../../vendor/js/sphere-mesh.js';
import * as vCoarse from '../../vendor/js/coarse-plates.js';
import * as vPlates from '../../vendor/js/plates.js';
import * as vPhysics from '../../vendor/js/plate-physics.js';
import * as vSuper from '../../vendor/js/super-plates.js';
import { SUPER_PLATE_PHYSICS_MULT } from '../../vendor/js/terrain-config.js';
import * as v from '../../vendor/js/elevation.js';
import * as p from './elevation';
import { SimplexNoise } from './simplex-noise';
import { SphereMesh } from './sphere-mesh';
import type { PortMesh } from './types';

vMesh.setDelaunator(Delaunator);
const native = <T>(f: () => T): T => dmath.withMode('native', f);
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

interface Inputs {
  vmesh: any; pmesh: PortMesh; r_xyz: Float32Array; r_plate: Int32Array;
  plateSeeds: Set<number>; plateVec: Record<number, p.PlateVec>; plateIsOcean: Set<number>;
  plateDensity: Record<number, number>; superPlateData: any; r_mantleField: Float32Array;
}

/** planet-worker.js handleGenerate, up to the assignElevation call (defaults: P=80, jitter 0.75, 4 continents). */
function buildInputs(N: number, seed: number): Inputs {
  const P = 80, numContinents = 4, continentSizeVariety = 0, landCoverage = 0.3;
  const { mesh, r_xyz } = vMesh.buildSphere(N, 0.75, vRng.makeRng(seed));
  const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
    vCoarse.generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);
  const r_plate = vCoarse.projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, P);
  vPlates.smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3);
  const plateSeeds = coarsePlateSeeds, plateVec = coarsePlateVec, plateIsOcean = coarsePlateIsOcean;
  const plateDensity: Record<number, number> = {};
  for (const r of plateSeeds) {
    const drng = vRng.makeRng(r + 777);
    const ocean = 3.0 + drng() * 0.5;
    const land = 2.4 + drng() * 0.5;
    plateDensity[r] = plateIsOcean.has(r) ? ocean : land;
  }
  const { mantleField } = vPhysics.applyPlatePhysics(plateVec, plateSeeds, plateIsOcean, coarse_r_plate, coarseMesh, coarse_xyz, seed);
  const superPlateData = vSuper.buildSuperPlates(coarseMesh, coarse_r_plate, plateSeeds, plateVec, plateIsOcean, plateDensity, r_plate);
  const spSeeds = new Set<number>();
  for (let i = 0; i < superPlateData.numSuperPlates; i++) spSeeds.add(i);
  vPhysics.applyPlatePhysics(superPlateData.superPlateVec, spSeeds, superPlateData.superPlateIsOcean, superPlateData.r_superPlate, mesh, r_xyz, seed + 7777, SUPER_PLATE_PHYSICS_MULT);
  const r_mantleField = new Float32Array(mesh.numRegions);
  const sum: Record<number, number> = {}, cnt: Record<number, number> = {};
  for (let r = 0; r < coarseMesh.numRegions; r++) {
    const pid = coarse_r_plate[r]!;
    sum[pid] = (sum[pid] || 0) + mantleField[r]!;
    cnt[pid] = (cnt[pid] || 0) + 1;
  }
  for (let r = 0; r < mesh.numRegions; r++) {
    const pid = r_plate[r]!;
    r_mantleField[r] = cnt[pid] ? sum[pid]! / cnt[pid]! : 0;
  }
  const pmesh = new SphereMesh(mesh.triangles, mesh.halfedges, mesh.numRegions);
  return { vmesh: mesh, pmesh, r_xyz, r_plate, plateSeeds, plateVec: plateVec as Record<number, p.PlateVec>, plateIsOcean, plateDensity, superPlateData, r_mantleField };
}

type Args = [Float32Array, Set<number>, Int32Array, Record<number, p.PlateVec>, Set<number>, Record<number, number>, any, Float32Array | null];
const copyArgs = (i: Inputs, withSuper: boolean, withMantle: boolean): Args => structuredClone([
  i.r_xyz, i.plateIsOcean, i.r_plate, i.plateVec, i.plateSeeds, i.plateDensity, withSuper ? i.superPlateData : null, withMantle ? i.r_mantleField : null,
]);

/** Deep equality that compares typed arrays by bytes and numbers with Object.is; Sets/Maps/objects in order. */
function same(a: unknown, b: unknown, path = '$'): string[] {
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || !bytes(a).equals(bytes(b))) return [path];
    return [];
  }
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b) ? [] : [`${path}: ${String(a)} vs ${String(b)}`];
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set)) return [path];
    return same([...a], [...b], `${path}<set>`);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [`${path}: length`];
    return a.flatMap((x, k) => same(x, b[k], `${path}[${k}]`));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join() !== kb.join()) return [`${path}: keys ${ka.join()} vs ${kb.join()}`];
    return ka.flatMap((k) => same((a as any)[k], (b as any)[k], `${path}.${k}`));
  }
  return Object.is(a, b) ? [] : [`${path}: ${String(a)} vs ${String(b)}`];
}

function runBoth(inp: Inputs, seed: number, withSuper = true, withMantle = true): void {
  const nMag = 0.4, spread = 5;
  const va = copyArgs(inp, withSuper, withMantle), pa = copyArgs(inp, withSuper, withMantle);
  const vr = native(() => v.assignElevation(inp.vmesh, va[0], va[1], va[2], va[3], va[4], new vNoise.SimplexNoise(seed), nMag, seed, spread, va[5], va[6], va[7]));
  const pr = native(() => p.assignElevation(inp.pmesh, pa[0], pa[1], pa[2], pa[3], pa[4], new SimplexNoise(seed), nMag, seed, spread, pa[5], pa[6], pa[7]));
  // _timing is wall-clock; compare its shape only.
  expect(pr._timing.map((t) => t.stage)).toEqual(vr._timing.map((t: { stage: string }) => t.stage));
  const vRest: Record<string, unknown> = { ...vr }, pRest: Record<string, unknown> = { ...pr };
  delete vRest._timing; delete pRest._timing;
  expect(Object.keys(pRest)).toEqual(Object.keys(vRest));
  expect(Object.keys(pr.debugLayers)).toEqual(Object.keys(vr.debugLayers));
  expect(same(pRest, vRest)).toEqual([]);
  // Inputs mutated (or not) identically.
  expect(same(pa, va)).toEqual([]);
  // Sanity: the run produced real terrain.
  expect(pr.r_elevation.some((e) => e > 0.2)).toBe(true);
  expect(pr.mountain_r.size).toBeGreaterThan(0);
}

// The vendored elevation.js prints [phasor]/[islandArcs] diagnostics; keep the test output quiet.
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());

describe.each([[20000, 12345], [20000, 777], [200000, 12345]] as const)('elevation port = vendor (native), N=%i seed=%i', (N, seed) => {
  let inp: Inputs;
  beforeAll(() => { inp = native(() => buildInputs(N, seed)); }, 300_000);

  it('assignElevation: every returned array, set and debug layer', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random called'); });
    runBoth(inp, seed);
  });

  if (N === 20000) {
    it('assignElevation without super plates and without a mantle field', () => {
      runBoth(inp, seed, false, false);
      runBoth(inp, seed, true, false);
    });

    it('exported helpers: plateVelocityAt, findCollisions, propagateStress, assignDistanceField, expandRegions', () => native(() => {
      const { vmesh, pmesh, r_xyz, r_plate, plateIsOcean, plateVec, plateDensity } = inp;
      const n = vmesh.numRegions as number;
      for (const pid of Object.keys(plateVec).map(Number)) {
        for (let r = 0; r < n; r += 997) {
          const a = v.plateVelocityAt(plateVec, pid, r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2]);
          const b = p.plateVelocityAt(plateVec, pid, r_xyz[3 * r]!, r_xyz[3 * r + 1]!, r_xyz[3 * r + 2]!);
          expect(same(b, a)).toEqual([]);
        }
      }

      const vc = v.findCollisions(vmesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, new vNoise.SimplexNoise(seed));
      const pc = p.findCollisions(pmesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, new SimplexNoise(seed));
      expect(same(pc, vc)).toEqual([]);
      expect(pc.r_stress.some((s) => s > 0)).toBe(true);

      for (const [decay, sdecay, passes] of [[0.9, 0.6, 12], [0.97, 0.8, 40]] as const) {
        const vs = [new Float32Array(vc.r_stress), new Float32Array(vc.r_stressDir), new Float32Array(vc.r_subductFactor)] as const;
        const ps = [new Float32Array(vc.r_stress), new Float32Array(vc.r_stressDir), new Float32Array(vc.r_subductFactor)] as const;
        v.propagateStress(vmesh, vs[0], vs[1], vs[2], r_plate, r_xyz, plateIsOcean, decay, sdecay, passes);
        p.propagateStress(pmesh, ps[0], ps[1], ps[2], r_plate, r_xyz, plateIsOcean, decay, sdecay, passes);
        expect(same([...ps], [...vs])).toEqual([]);
        expect(bytes(ps[0]).equals(bytes(vc.r_stress))).toBe(false);
      }

      for (const [seeds, stops] of [[vc.mountain_r, vc.ocean_r], [vc.coastline_r, new Set()], [vc.ocean_r, vc.coastline_r]] as const) {
        const a = v.assignDistanceField(vmesh, seeds, stops, seed + 1);
        const b = p.assignDistanceField(pmesh, seeds as Set<number>, stops as Set<number>, seed + 1);
        expect(bytes(b).equals(bytes(a))).toBe(true);
      }

      for (const steps of [0, 1, 3]) {
        const a = v.expandRegions(vmesh, vc.mountain_r, steps), b = p.expandRegions(pmesh, pc.mountain_r, steps);
        expect([...b]).toEqual([...a]);
      }
      expect(p.expandRegions(pmesh, pc.mountain_r, 0)).toBe(pc.mountain_r);
    }));
  }
}, 300_000);

describe('shared structure (Phase 4b M4)', () => {
  it('recording the phasor kernels changes nothing; replaying them on the same mesh reproduces the field exactly', () => {
    const inp = buildInputs(20000, 12345);
    const run = (structure?: p.ElevationStructure) => {
      const a = copyArgs(inp, true, true);
      return p.assignElevation(inp.pmesh, a[0], a[1], a[2], a[3], a[4], new SimplexNoise(12345), 0.4, 12345, 5, a[5], a[6], a[7], structure);
    };
    const stock = run();
    const structure: p.ElevationStructure = {};
    const rec = run(structure);
    expect(bytes(rec.r_elevation)).toEqual(bytes(stock.r_elevation));
    expect(structure.phasorKernels!.length).toBeGreaterThan(100);
    const replay = run({ phasorKernels: structure.phasorKernels! });
    expect(bytes(replay.r_elevation)).toEqual(bytes(stock.r_elevation));
    expect(bytes(replay.debugLayers.phasorRidge)).toEqual(bytes(stock.debugLayers.phasorRidge));
  });
});
