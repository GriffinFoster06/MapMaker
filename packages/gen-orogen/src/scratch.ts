// Per-world scratch state of the orogen adapter. Original shell code.
//
// orogen's stage functions take objects that are not per-cell layers (Sets, per-plate maps, the vendored SphereMesh).
// Everything a stage needs that is not a layer or a table is rebuilt from layers, tables, params and the seed. That
// keeps single-shot stages resumable from their recorded inputs (§5): after a save and load the scratch is empty and
// is recomputed on demand, deterministically.
import { type World } from '@mapmaker/core';
import {
  SUPER_PLATE_PHYSICS_MULT, SimplexNoise, VendorSphereMesh, applyPlatePhysics, buildSuperPlates, computeNeighborDist,
  expandPlatePhysicsDebug, generateCoarsePlates, makeRng, projectCoarsePlates, smoothAndReconnectPlates,
} from './vendor';
import type { OrogenParams } from './params';

/** The vendored SphereMesh (orogen's own class), as the vendored stage functions expect it. */
export interface OMesh {
  triangles: Int32Array; halfedges: Int32Array; numRegions: number; numTriangles: number;
  adjOffset: Int32Array; adjList: Int32Array; adjTriList: Int32Array;
  s_begin_r(s: number): number;
}

export interface PlateVec { pole: [number, number, number]; omega: number }

export interface SuperPlates { numSuperPlates: number; superPlateVec: unknown; superPlateIsOcean: unknown; r_superPlate: unknown }

export interface Tectonics {
  r_plate: Int32Array;
  plateSeeds: Set<number>;
  plateVec: Record<number, PlateVec>;
  plateIsOcean: Set<number>;
  plateDensity: Record<number, number>;
  superPlateData: SuperPlates | null;
  r_mantleField: Float32Array;
  /** Hi-res expansion of the plate-physics diagnostics, keyed by debug field name. */
  physicsDebug: Record<string, Float32Array>;
}

export interface Climate {
  itczLons: Float32Array;
  itczLatsSummer: Float32Array;
  itczLatsWinter: Float32Array;
}

export interface Scratch {
  mesh: OMesh;
  r_xyz: Float32Array;
  neighborDist: Float32Array;
  tect?: Tectonics;
  climate?: Climate;
}

const store = new WeakMap<World, Scratch>();

export function dropScratch(world: World): void { store.delete(world); }
export function peekScratch(world: World): Scratch | undefined { return store.get(world); }

/** The vendored mesh view of the world's `global` mesh: same triangles and halfedges, points in orogen's frame (F1), Float32. */
export function getScratch(world: World, meshId = 'global'): Scratch {
  const have = store.get(world);
  if (have) return have;
  const rec = world.meshes.get(meshId);
  if (!rec) throw new Error(`mesh ${meshId} not present; run the mesh stage first`);
  const m = rec.mesh;
  if (m.precision !== 'f32') throw new Error('orogen parity runs on the Float32 mesh (§3.1); build the mesh with precision f32');
  const r_xyz = m.orogenPoints() as Float32Array;
  const mesh = new VendorSphereMesh(m.triangles, m.halfedges, m.numRegions) as OMesh;
  const s: Scratch = { mesh, r_xyz, neighborDist: computeNeighborDist(mesh, r_xyz) };
  store.set(world, s);
  return s;
}

/**
 * Plate partition, plate physics and super plates (planet-worker.js handleGenerate lines 219-304). Runs the vendored
 * code, so the caller must be inside dmath.withMode('native').
 */
export function computeTectonics(s: Scratch, p: OrogenParams): Tectonics {
  const { seed, P, numContinents, continentSizeVariety, landCoverage } = p;
  const { mesh, r_xyz } = s;
  const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
    generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);

  const r_plate: Int32Array = projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, P);
  smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3);

  const plateSeeds: Set<number> = coarsePlateSeeds;
  const plateVec: Record<number, PlateVec> = coarsePlateVec;
  const plateIsOcean: Set<number> = coarsePlateIsOcean;

  const plateDensity: Record<number, number> = {};
  for (const r of plateSeeds) {
    const drng = makeRng(r + 777);
    const ocean = 3.0 + drng() * 0.5;
    const land = 2.4 + drng() * 0.5;
    plateDensity[r] = plateIsOcean.has(r) ? ocean : land;
  }

  const { plateDebug, mantleField, velDelta } = applyPlatePhysics(plateVec, plateSeeds, plateIsOcean, coarse_r_plate, coarseMesh, coarse_xyz, seed);

  let superPlateData: SuperPlates | null = null;
  if (P >= 8) {
    const sp = buildSuperPlates(coarseMesh, coarse_r_plate, plateSeeds, plateVec, plateIsOcean, plateDensity, r_plate) as SuperPlates;
    superPlateData = sp;
    const spSeeds = new Set<number>();
    for (let i = 0; i < sp.numSuperPlates; i++) spSeeds.add(i);
    applyPlatePhysics(sp.superPlateVec, spSeeds, sp.superPlateIsOcean, sp.r_superPlate, mesh, r_xyz, seed + 7777, SUPER_PLATE_PHYSICS_MULT);
  }

  const r_mantleField = new Float32Array(mesh.numRegions);
  {
    const sum: Record<number, number> = {}, cnt: Record<number, number> = {};
    for (let r = 0; r < coarseMesh.numRegions; r++) {
      const pid = coarse_r_plate[r]!;
      sum[pid] = (sum[pid] || 0) + mantleField[r];
      cnt[pid] = (cnt[pid] || 0) + 1;
    }
    for (let r = 0; r < mesh.numRegions; r++) {
      const pid = r_plate[r]!;
      r_mantleField[r] = cnt[pid] ? sum[pid]! / cnt[pid]! : 0;
    }
  }

  const ppd = expandPlatePhysicsDebug(plateDebug, mantleField, velDelta, r_plate, mesh.numRegions, coarse_r_plate, coarseMesh.numRegions);
  const physicsDebug: Record<string, Float32Array> = {
    continentalDrag: ppd.dl_continentalDrag, sizeVelocity: ppd.dl_sizeVelocity, plateSpeed: ppd.dl_plateSpeed,
    velChange: ppd.dl_velChange, mantleFlow: ppd.dl_mantleFlow,
  };
  return { r_plate, plateSeeds, plateVec, plateIsOcean, plateDensity, superPlateData, r_mantleField, physicsDebug };
}

export function newNoise(seed: number): unknown { return new SimplexNoise(seed); }
