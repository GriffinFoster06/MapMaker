// Phase 4b M2: the small ported modules equal the vendored JavaScript bit for bit under dmath 'native'.
import Delaunator from 'delaunator';
import { describe, expect, it } from 'vitest';
import { dmath } from '@mapmaker/core';
import * as vRng from '../../vendor/js/rng.js';
import * as vNoise from '../../vendor/js/simplex-noise.js';
import * as vMesh from '../../vendor/js/sphere-mesh.js';
import * as vUtil from '../../vendor/js/climate-util.js';
import * as vColor from '../../vendor/js/color-map.js';
import * as pRng from './rng';
import * as pNoise from './simplex-noise';
import * as pMesh from './sphere-mesh';
import * as pUtil from './climate-util';
import * as pColor from './color-map';

vMesh.setDelaunator(Delaunator);
const native = <T>(f: () => T): T => dmath.withMode('native', f);
const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

describe('foundation ports = vendor (native mode)', () => {
  it('rng', () => {
    for (const seed of [0, 1, 12345, 777.5, -3]) {
      const a = vRng.makeRng(seed), b = pRng.makeRng(seed);
      for (let i = 0; i < 1000; i++) expect(Object.is(a(), b())).toBe(true);
      const ai = vRng.makeRandInt(seed), bi = pRng.makeRandInt(seed);
      for (let i = 0; i < 100; i++) expect(ai(97)).toBe(bi(97));
    }
  });

  it('simplex noise, fbm and ridged fbm', () => {
    for (const seed of [0, 42, 12345 + 501]) {
      const a = new vNoise.SimplexNoise(seed), b = new pNoise.SimplexNoise(seed);
      const r = vRng.makeRng(seed + 1);
      for (let i = 0; i < 3000; i++) {
        const x = 8 * r() - 4, y = 8 * r() - 4, z = 8 * r() - 4;
        expect(Object.is(a.noise3D(x, y, z), b.noise3D(x, y, z))).toBe(true);
        expect(Object.is(a.fbm(x, y, z), b.fbm(x, y, z))).toBe(true);
        expect(Object.is(a.fbm(x, y, z, 7, 0.5), b.fbm(x, y, z, 7, 0.5))).toBe(true);
        expect(Object.is(a.ridgedFbm(x, y, z), b.ridgedFbm(x, y, z))).toBe(true);
      }
    }
  });

  it('sphere mesh, neighbour distances, triangle centres', () => native(() => {
    for (const N of [5000, 20000]) {
      const a = vMesh.buildSphere(N, 0.75, vRng.makeRng(9)), b = pMesh.buildSphere(N, 0.75, pRng.makeRng(9));
      expect(bytes(b.r_xyz)).toEqual(bytes(a.r_xyz));
      for (const k of ['triangles', 'halfedges', 'adjOffset', 'adjList', '_adjTriList', '_r_s'] as const) expect(bytes(b.mesh[k])).toEqual(bytes(a.mesh[k]));
      expect(bytes(pMesh.computeNeighborDist(b.mesh, b.r_xyz))).toEqual(bytes(vMesh.computeNeighborDist(a.mesh, a.r_xyz)));
      expect(bytes(pMesh.generateTriangleCenters(b.mesh, b.r_xyz))).toEqual(bytes(vMesh.generateTriangleCenters(a.mesh, a.r_xyz)));
      expect(b.mesh.r_circulate_t([], 17)).toEqual(a.mesh.r_circulate_t([], 17));
      expect(b.mesh.s_outer_t(100)).toBe(a.mesh.s_outer_t(100));
    }
  }));

  it('climate utilities', () => native(() => {
    const { mesh } = pMesh.buildSphere(5000, 0.75, pRng.makeRng(3));
    const r = vRng.makeRng(4);
    const f = Float32Array.from({ length: mesh.numRegions }, () => r() * 10 - 3);
    const fa = f.slice(), fb = f.slice();
    vUtil.smoothField(mesh, fa, 3); pUtil.smoothField(mesh, fb, 3);
    expect(bytes(fb)).toEqual(bytes(fa));
    for (const p of [0, 0.01, 0.5, 0.97, 0.999]) expect(Object.is(pUtil.percentile(f, p), vUtil.percentile(f, p))).toBe(true);
    const lons = Float32Array.from({ length: 72 }, (_, i) => i), lats = Float32Array.from({ length: 72 }, () => r() * 0.3 - 0.1);
    const la = vUtil.makeItczLookup(lons, lats), lb = pUtil.makeItczLookup(lons, lats);
    for (let i = -400; i < 400; i++) expect(Object.is(lb(i / 50), la(i / 50))).toBe(true);
  }));

  it('colour map', () => {
    for (let i = -700; i <= 1300; i++) {
      const e = i / 1000;
      expect(Object.is(pColor.elevToHeightKm(e), vColor.elevToHeightKm(e))).toBe(true);
      expect(pColor.elevationToColor(e)).toEqual(vColor.elevationToColor(e));
      for (let k = 0; k <= 31; k++) expect(pColor.biomeColor(k, e)).toEqual(vColor.biomeColor(k, e));
    }
  });
});
