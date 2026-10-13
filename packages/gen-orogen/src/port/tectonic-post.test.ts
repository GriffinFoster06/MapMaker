// Phase 4b M2: the ported plate, ocean/land, coarse-plate and terrain post-processing modules equal the vendored
// JavaScript bit for bit under dmath 'native', on realistic inputs (orogen's own call sequence and arguments).
/* eslint-disable @typescript-eslint/no-explicit-any */
import Delaunator from 'delaunator';
import { describe, expect, it } from 'vitest';
import { dmath } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import * as vRng from '../../vendor/js/rng.js';
import * as vMeshM from '../../vendor/js/sphere-mesh.js';
import * as vCoarseM from '../../vendor/js/coarse-plates.js';
import * as vPlatesM from '../../vendor/js/plates.js';
import * as vOceanM from '../../vendor/js/ocean-land.js';
import * as vPostM from '../../vendor/js/terrain-post.js';
import { DETAIL_NOISE_DAMPEN_STRENGTH } from '../../vendor/js/terrain-config.js';
import * as pMesh from './sphere-mesh';
import * as pCoarse from './coarse-plates';
import * as pPlates from './plates';
import * as pOcean from './ocean-land';
import * as pPost from './terrain-post';
import { OROGEN_DEFAULTS, createOrogenWorld, orogenStages } from '../index';
import { getScratch } from '../scratch';
import { debugId } from '../layers';
import { computeDetailDampenField, computeOrogenicField } from '../orchestration';

const vMesh = vMeshM as any, vCoarse = vCoarseM as any, vPlates = vPlatesM as any, vOcean = vOceanM as any, vPost = vPostM as any;
vMesh.setDelaunator(Delaunator);
const native = <T>(f: () => T): T => dmath.withMode('native', f);
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const sameBytes = (b: ArrayBufferView, a: ArrayBufferView) => {
  expect(b.constructor).toBe(a.constructor);
  expect(bytes(b).equals(bytes(a))).toBe(true);
};
const portMeshOf = (m: any): pMesh.SphereMesh => new pMesh.SphereMesh(m.triangles, m.halfedges, m.numRegions);

describe('coarse plates, plates, ocean/land ports = vendor (native mode)', () => {
  for (const seed of [12345, 777]) {
    it(`generateCoarsePlates + projectCoarsePlates + smoothAndReconnectPlates, seed ${seed}`, () => native(() => {
      const { P, numContinents, continentSizeVariety, landCoverage } = OROGEN_DEFAULTS;
      const a = vCoarse.generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);
      const b = pCoarse.generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);
      sameBytes(b.coarse_xyz, a.coarse_xyz);
      sameBytes(b.coarseMesh.adjList, a.coarseMesh.adjList);
      sameBytes(b.coarse_r_plate, a.coarse_r_plate);
      expect([...b.coarsePlateSeeds]).toEqual([...a.coarsePlateSeeds]);
      expect([...b.coarsePlateIsOcean]).toEqual([...a.coarsePlateIsOcean]);
      expect(b.coarsePlateVec).toEqual(a.coarsePlateVec);
      expect(Object.keys(b.coarsePlateVec)).toEqual(Object.keys(a.coarsePlateVec));
      expect(a.coarsePlateIsOcean.size).toBeGreaterThan(0);

      for (const N of [20000, 200000]) {
        const hv = vMesh.buildSphere(N, 0.75, vRng.makeRng(seed));
        const hp = portMeshOf(hv.mesh);
        const ra = vCoarse.projectCoarsePlates(hv.mesh, hv.r_xyz, a.coarseMesh, a.coarse_xyz, a.coarse_r_plate, seed, P);
        const rb = pCoarse.projectCoarsePlates(hp, hv.r_xyz, b.coarseMesh, b.coarse_xyz, b.coarse_r_plate, seed, P);
        sameBytes(rb, ra);
        // numPlates omitted (lowPlateT = 0 branch) and a low plate count
        sameBytes(pCoarse.projectCoarsePlates(hp, hv.r_xyz, b.coarseMesh, b.coarse_xyz, b.coarse_r_plate, seed),
          vCoarse.projectCoarsePlates(hv.mesh, hv.r_xyz, a.coarseMesh, a.coarse_xyz, a.coarse_r_plate, seed));
        sameBytes(pCoarse.projectCoarsePlates(hp, hv.r_xyz, b.coarseMesh, b.coarse_xyz, b.coarse_r_plate, seed, 12),
          vCoarse.projectCoarsePlates(hv.mesh, hv.r_xyz, a.coarseMesh, a.coarse_xyz, a.coarse_r_plate, seed, 12));
        // planet-worker / computeTectonics: smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3)
        const sa = ra.slice(), sb = rb.slice();
        vPlates.smoothAndReconnectPlates(hv.mesh, sa, a.coarsePlateSeeds, 3);
        pPlates.smoothAndReconnectPlates(hp, sb, b.coarsePlateSeeds, 3);
        sameBytes(sb, sa);
        expect(bytes(sa).equals(bytes(ra))).toBe(false); // the smoothing did something
      }
    }), 120_000);
  }

  it('generatePlates and assignOceanLand directly, several plate counts and options', () => native(() => {
    const hv = vMesh.buildSphere(20000, 0.75, vRng.makeRng(4242));
    const hp = portMeshOf(hv.mesh);
    for (const [P, seed] of [[80, 12345], [20, 777], [7, 31]] as const) {
      const a = vPlates.generatePlates(hv.mesh, hv.r_xyz, P, seed);
      const b = pPlates.generatePlates(hp, hv.r_xyz, P, seed);
      sameBytes(b.r_plate, a.r_plate);
      expect([...b.plateSeeds]).toEqual([...a.plateSeeds]);
      expect(b.plateVec).toEqual(a.plateVec);
      for (const [nc, variety, cover] of [[4, 0.35, 0.3], [1, 0, 0.3], [6, 1, 0.5], [3, 0.7, 0.1]] as const) {
        const oa = vOcean.assignOceanLand(hv.mesh, a.r_plate, a.plateSeeds, hv.r_xyz, seed, nc, variety, cover);
        const ob = pOcean.assignOceanLand(hp, b.r_plate, b.plateSeeds, hv.r_xyz, seed, nc, variety, cover);
        expect([...ob]).toEqual([...oa]);
      }
      // default parameters
      expect([...pOcean.assignOceanLand(hp, b.r_plate, b.plateSeeds, hv.r_xyz, seed, 4)])
        .toEqual([...vOcean.assignOceanLand(hv.mesh, a.r_plate, a.plateSeeds, hv.r_xyz, seed, 4)]);
    }
  }), 120_000);
});

/** orogen's elevation field before post-processing, from the shell pipeline (vendored stages, native mode). */
async function elevationFixture(N: number, seed: number) {
  const world = createOrogenWorld({ debugLayers: true, N, seed });
  await runPipeline(world, orogenStages, { strict: true, only: ['mesh', 'orogen.tectonics', 'orogen.elevation'] });
  const s = getScratch(world);
  const layer = (id: string) => world.layers.get('global', id) as Float32Array | undefined;
  const elev = new Float32Array(layer('orogen.elevPre')!);
  return {
    vmesh: s.mesh as any, pmesh: portMeshOf(s.mesh), r_xyz: s.r_xyz, nd: s.neighborDist, elev,
    hotspot: layer(debugId('hotspot')),
    dampen: computeDetailDampenField(layer(debugId('cratonWeight')), layer(debugId('basinWeight'))),
    orogenic: computeOrogenicField(layer(debugId('orogenicPower'))),
  };
}

const isOceanOf = (e: Float32Array) => { const o = new Uint8Array(e.length); for (let r = 0; r < e.length; r++) if (e[r]! <= 0) o[r] = 1; return o; };

/** runPostProcessing (orchestration.ts, = planet-worker.js) with the terrain-post functions of `lib`. */
function postSequence(lib: any, mesh: any, f: Awaited<ReturnType<typeof elevationFixture>>, seed: number): Float32Array {
  const { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp } = OROGEN_DEFAULTS;
  const e = f.elev.slice();
  lib.warpTerrain(mesh, e, f.r_xyz, seed, terrainWarp, f.hotspot);
  const o = isOceanOf(e);
  lib.smoothElevation(mesh, e, o, Math.round(1 + smoothing * 4), 0.2 + smoothing * 0.5);
  lib.applyDetailNoise(mesh, f.r_xyz, e, o, seed, { dampenField: f.dampen, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: f.orogenic });
  lib.applyDetailNoise(mesh, f.r_xyz, e, o, seed, {
    amplitudeKm: 0.05, frequencyMult: 2.0, warpAmpMult: 2.0, bipolar: true, biasExponent: 0.4, seedOffset: 13579,
    dampenField: f.dampen, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: f.orogenic,
  });
  lib.erodeComposite(mesh, e, f.r_xyz, o, Math.round(hydraulicErosion * 20), hydraulicErosion * 0.0006, 0.5, 1.0,
    Math.round(thermalErosion * 10), 1.2 - thermalErosion * 0.4, thermalErosion * 0.15, Math.round(glacialErosion * 10), glacialErosion, f.nd);
  lib.sharpenRidges(mesh, e, o, Math.round(1 + ridgeSharpening * 3), ridgeSharpening * 0.08);
  lib.applySoilCreep(mesh, e, o, 3, 0.1125);
  return e;
}

describe('terrain-post ports = vendor (native mode)', () => {
  it('each export on a realistic N=20000 elevation field (seed 12345)', async () => {
    const seed = 12345;
    const f = await elevationFixture(20000, seed);
    native(() => {
      const { vmesh, pmesh, r_xyz, nd } = f;
      const o = isOceanOf(f.elev);
      expect(o.some((x) => x === 1) && o.some((x) => x === 0)).toBe(true);
      // Run vendor fn and port fn on copies of the same elevation; compare the mutated arrays.
      const check = (run: (lib: any, mesh: any, e: Float32Array) => void, base = f.elev) => {
        const ea = base.slice(), eb = base.slice();
        run(vPost, vmesh, ea);
        run(pPost, pmesh, eb);
        sameBytes(eb, ea);
        expect(bytes(ea).equals(bytes(base))).toBe(false); // the function changed something
        return eb;
      };

      check((L, m, e) => L.warpTerrain(m, e, r_xyz, seed, 0.75, f.hotspot));
      check((L, m, e) => L.warpTerrain(m, e, r_xyz, seed + 1, 1.0, null));
      const warped = check((L, m, e) => L.warpTerrain(m, e, r_xyz, seed, 0.3));
      { const ea = f.elev.slice(), eb = f.elev.slice(); vPost.warpTerrain(vmesh, ea, r_xyz, seed, 0); pPost.warpTerrain(pmesh, eb, r_xyz, seed, 0); sameBytes(eb, ea); }

      const ow = isOceanOf(warped);
      check((L, m, e) => L.smoothElevation(m, e, ow, 1, 0.25), warped);
      check((L, m, e) => L.smoothElevation(m, e, ow, 5, 0.7), warped);

      check((L, m, e) => L.applyDetailNoise(m, r_xyz, e, ow, seed), warped);
      check((L, m, e) => L.applyDetailNoise(m, r_xyz, e, ow, seed, { dampenField: f.dampen, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: f.orogenic }), warped);
      check((L, m, e) => L.applyDetailNoise(m, r_xyz, e, ow, seed, {
        amplitudeKm: 0.05, frequencyMult: 2.0, warpAmpMult: 2.0, bipolar: true, biasExponent: 0.4, seedOffset: 13579,
        dampenField: f.dampen, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: f.orogenic,
      }), warped);

      // erodeComposite: orogen defaults (hydraulic + thermal + glacial), and each process alone / stronger
      const ero = (h: number, t: number, g: number) => (L: any, m: any, e: Float32Array) =>
        L.erodeComposite(m, e, r_xyz, ow, Math.round(h * 20), h * 0.0006, 0.5, 1.0, Math.round(t * 10), 1.2 - t * 0.4, t * 0.15, Math.round(g * 10), g, nd);
      check(ero(0.5, 0.1, 0.5), warped);
      check(ero(1, 0, 0), warped);
      check(ero(0, 1, 0), warped);
      check(ero(0, 0, 1), warped);
      check(ero(0.3, 0.6, 1), warped);
      check((L, m, e) => L.erodeComposite(m, e, r_xyz, ow, 4, 0.0003, 0.5, 1.0, 2, 1.0, 0.1, undefined, undefined, nd), warped);

      check((L, m, e) => L.sharpenRidges(m, e, ow, 3, 0.04), warped);
      check((L, m, e) => L.sharpenRidges(m, e, ow, 4, 0.5), warped);
      check((L, m, e) => L.applySoilCreep(m, e, ow, 3, 0.1125), warped);

      // The whole runPostProcessing sequence
      sameBytes(postSequence(pPost, pmesh, f, seed), postSequence(vPost, vmesh, f, seed));
    });
  }, 300_000);

  for (const [N, seed] of [[20000, 777], [200000, 12345]] as const) {
    it(`runPostProcessing sequence, N=${N} seed ${seed}`, async () => {
      const f = await elevationFixture(N, seed);
      native(() => sameBytes(postSequence(pPost, f.pmesh, f, seed), postSequence(vPost, f.vmesh, f, seed)));
    }, 600_000);
  }
});
