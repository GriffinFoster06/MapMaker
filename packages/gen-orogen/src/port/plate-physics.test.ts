// Phase 4b M2: the plate-physics and super-plates ports equal the vendored JavaScript bit for bit under dmath 'native'.
// Inputs are produced by the vendored modules exactly as orogen's worker does (planet-worker.js, scratch.ts
// computeTectonics); vendor and port then run on deep copies, and every output and mutated input is compared.
/* eslint-disable @typescript-eslint/no-explicit-any */
import Delaunator from 'delaunator';
import { describe, expect, it } from 'vitest';
import { dmath } from '@mapmaker/core';
import * as vMesh from '../../vendor/js/sphere-mesh.js';
import * as vRng from '../../vendor/js/rng.js';
import * as vCoarse from '../../vendor/js/coarse-plates.js';
import * as vPlates from '../../vendor/js/plates.js';
import * as vPhysJs from '../../vendor/js/plate-physics.js';
import * as vSuperJs from '../../vendor/js/super-plates.js';
import { SUPER_PLATE_PHYSICS_MULT } from '../../vendor/js/terrain-config.js';
import * as pPhys from './plate-physics';
import * as pSuper from './super-plates';

vMesh.setDelaunator(Delaunator);
// The vendored JSDoc return types are incomplete (no velDelta); treat the vendor modules as untyped.
const vPhys: any = vPhysJs, vSuper: any = vSuperJs;
const native = <T>(f: () => T): T => dmath.withMode('native', f);
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

/** Deep, order- and sign-sensitive equality: toStrictEqual (Object.is on numbers) plus key/insertion order. */
function same(b: unknown, a: unknown): void {
  expect(b).toStrictEqual(a);
  expect(order(b)).toEqual(order(a));
}
function order(x: unknown): unknown {
  if (x instanceof Set) return { set: [...x].map(order) };
  if (x instanceof Map) return { map: [...x].map(([k, v]) => [order(k), order(v)]) };
  if (ArrayBuffer.isView(x)) return { view: x.constructor.name, b: bytes(x).toString('base64') };
  if (Array.isArray(x)) return x.map(order);
  if (x && typeof x === 'object') return Object.entries(x).map(([k, v]) => [k, order(v)]);
  if (typeof x === 'number') return Object.is(x, -0) ? '-0' : String(x);
  return x;
}
const clonePlateVec = (pv: any): any => structuredClone(pv);

interface Inputs {
  mesh: any; r_xyz: Float32Array; coarseMesh: any; coarse_xyz: Float32Array; coarse_r_plate: Int32Array;
  plateSeeds: Set<number>; plateVec: any; plateIsOcean: Set<number>; plateDensity: Record<number, number>; r_plate: Int32Array;
}

function makeInputs(seed: number, N: number, P = 80): Inputs {
  const { mesh, r_xyz } = vMesh.buildSphere(N, 0.75, vRng.makeRng(seed));
  const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
    vCoarse.generateCoarsePlates(seed, P, 4, 0.35, 0.3);
  const r_plate = vCoarse.projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, P);
  vPlates.smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3);
  const plateDensity: Record<number, number> = {};
  for (const r of coarsePlateSeeds as Set<number>) {
    const drng = vRng.makeRng(r + 777);
    const ocean = 3.0 + drng() * 0.5;
    const land = 2.4 + drng() * 0.5;
    plateDensity[r] = coarsePlateIsOcean.has(r) ? ocean : land;
  }
  return {
    mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, plateSeeds: coarsePlateSeeds, plateVec: coarsePlateVec,
    plateIsOcean: coarsePlateIsOcean, plateDensity, r_plate,
  };
}

/** orogen's tectonics chain (worker order), with every step compared vendor vs port. */
function compareChain(inp: Inputs, seed: number): { numSuperPlates: number } {
  const { mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, plateSeeds, plateIsOcean, plateDensity, r_plate } = inp;
  const pvA = clonePlateVec(inp.plateVec), pvB = clonePlateVec(inp.plateVec);
  same(pvB, pvA);

  // 1. Coarse plate physics (mutates plateVec).
  const a1 = vPhys.applyPlatePhysics(pvA, plateSeeds, plateIsOcean, coarse_r_plate, coarseMesh, coarse_xyz, seed);
  const b1 = pPhys.applyPlatePhysics(pvB, plateSeeds, plateIsOcean, coarse_r_plate, coarseMesh, coarse_xyz, seed);
  expect(bytes(b1.mantleField)).toEqual(bytes(a1.mantleField));
  expect(bytes(b1.velDelta)).toEqual(bytes(a1.velDelta));
  same(b1.plateDebug, a1.plateDebug);
  same(pvB, pvA);

  // 2. Super plates.
  const a2 = vSuper.buildSuperPlates(coarseMesh, coarse_r_plate, plateSeeds, pvA, plateIsOcean, plateDensity, r_plate);
  const b2 = pSuper.buildSuperPlates(coarseMesh, coarse_r_plate, plateSeeds, pvB, plateIsOcean, plateDensity, r_plate);
  expect(bytes(b2.r_superPlate)).toEqual(bytes(a2.r_superPlate));
  same(b2, a2);
  same(pvB, pvA);

  // 3. Super-plate physics on the hi-res mesh (mutates superPlateVec).
  const spBefore = clonePlateVec(a2.superPlateVec);
  const spSeeds = new Set<number>();
  for (let i = 0; i < a2.numSuperPlates; i++) spSeeds.add(i);
  const a3 = vPhys.applyPlatePhysics(a2.superPlateVec, spSeeds, a2.superPlateIsOcean, a2.r_superPlate, mesh, r_xyz, seed + 7777, SUPER_PLATE_PHYSICS_MULT);
  const b3 = pPhys.applyPlatePhysics(b2.superPlateVec, spSeeds, b2.superPlateIsOcean, b2.r_superPlate, mesh, r_xyz, seed + 7777, SUPER_PLATE_PHYSICS_MULT);
  expect(bytes(b3.mantleField)).toEqual(bytes(a3.mantleField));
  expect(bytes(b3.velDelta)).toEqual(bytes(a3.velDelta));
  same(b3.plateDebug, a3.plateDebug);
  same(b2.superPlateVec, a2.superPlateVec);
  // The super-plate pass must have changed something, else the comparison is vacuous.
  expect(order(a2.superPlateVec)).not.toEqual(order(spBefore));

  // 4. Debug expansion to the hi-res mesh.
  const a4 = vPhys.expandPlatePhysicsDebug(a1.plateDebug, a1.mantleField, a1.velDelta, r_plate, mesh.numRegions, coarse_r_plate, coarseMesh.numRegions);
  const b4 = pPhys.expandPlatePhysicsDebug(b1.plateDebug, b1.mantleField, b1.velDelta, r_plate, mesh.numRegions, coarse_r_plate, coarseMesh.numRegions);
  for (const k of Object.keys(a4) as (keyof typeof b4)[]) expect(bytes(b4[k])).toEqual(bytes((a4 as any)[k]));
  same(Object.keys(b4), Object.keys(a4));
  return { numSuperPlates: a2.numSuperPlates };
}

describe('plate-physics and super-plates ports = vendor (native mode)', () => {
  for (const seed of [12345, 777]) {
    it(`full tectonics chain, seed ${seed}, N=20000`, () => native(() => {
      const { numSuperPlates } = compareChain(makeInputs(seed, 20000), seed);
      expect(numSuperPlates).toBeGreaterThan(2);
    }), 120_000);
  }

  it('full tectonics chain, seed 12345, N=200000', () => native(() => {
    compareChain(makeInputs(12345, 200000), 12345);
  }), 300_000);

  it('few plates (P=10) and many (P=200)', () => native(() => {
    compareChain(makeInputs(4242, 5000, 10), 4242);
    compareChain(makeInputs(99, 5000, 200), 99);
  }), 120_000);

  it('buildSuperPlates fallbacks: missing plateVec entries/poles and densities', () => native(() => {
    const inp = makeInputs(31337, 5000, 40);
    const seeds = [...inp.plateSeeds];
    for (const variant of ['mixed', 'allZeroOmega', 'allMissing'] as const) {
      const pv = clonePlateVec(inp.plateVec);
      if (variant === 'mixed') {
        for (let i = 0; i < seeds.length; i += 3) delete pv[seeds[i]!];
        for (let i = 1; i < seeds.length; i += 5) if (pv[seeds[i]!]) pv[seeds[i]!].pole = null;
        for (let i = 2; i < seeds.length; i += 4) if (pv[seeds[i]!]) pv[seeds[i]!].omega = 0;
      }
      if (variant === 'allZeroOmega') for (const k of Object.keys(pv)) pv[k].omega = 0; // lLen = 0: largest-plate pole
      if (variant === 'allMissing') for (const k of Object.keys(pv)) delete pv[k]; // no plate: [0, 1, 0]
      const dens = { ...inp.plateDensity };
      for (let i = 0; i < seeds.length; i += 2) delete dens[seeds[i]!];
      const pvA = clonePlateVec(pv), pvB = clonePlateVec(pv);
      const a = vSuper.buildSuperPlates(inp.coarseMesh, inp.coarse_r_plate, inp.plateSeeds, pvA, inp.plateIsOcean, dens, inp.r_plate);
      const b = pSuper.buildSuperPlates(inp.coarseMesh, inp.coarse_r_plate, inp.plateSeeds, pvB, inp.plateIsOcean, dens, inp.r_plate);
      same(b, a);
      same(pvB, pvA);
    }
  }), 120_000);

  it('applyPlatePhysics with zero velocities and an all-ocean / all-land world', () => native(() => {
    const inp = makeInputs(5, 5000, 30);
    for (const variant of ['zero', 'ocean', 'land'] as const) {
      const pv = clonePlateVec(inp.plateVec);
      let ocean = inp.plateIsOcean;
      if (variant === 'zero') for (const k of Object.keys(pv)) pv[k].omega = 0;
      if (variant === 'ocean') ocean = new Set(inp.plateSeeds);
      if (variant === 'land') ocean = new Set();
      const pvA = clonePlateVec(pv), pvB = clonePlateVec(pv);
      const a = vPhys.applyPlatePhysics(pvA, inp.plateSeeds, ocean, inp.coarse_r_plate, inp.coarseMesh, inp.coarse_xyz, 5, 1.3);
      const b = pPhys.applyPlatePhysics(pvB, inp.plateSeeds, ocean, inp.coarse_r_plate, inp.coarseMesh, inp.coarse_xyz, 5, 1.3);
      same(b, a);
      same(pvB, pvA);
    }
  }), 120_000);
});
