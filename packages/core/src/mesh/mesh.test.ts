import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Delaunator from 'delaunator';
import { describe, expect, it } from 'vitest';
import { dmath } from '../dmath';
import { hashArrays } from '../hash';
import { OrogenLcg } from '../rng/orogen-lcg';
import { SphereMesh } from './sphere-mesh';
import { SpatialIndex } from './spatial-index';

const ROOT = resolve(__dirname, '../../../..');
const OROGEN_MESH = resolve(ROOT, 'upstream/orogen/js/sphere-mesh.js');
const OROGEN_RNG = resolve(ROOT, 'upstream/orogen/js/rng.js');
const HAVE_UPSTREAM = existsSync(OROGEN_MESH) && existsSync(OROGEN_RNG);
const JITTER = 0.75;

function build(N: number, seed: number, precision: 'f32' | 'f64' = 'f32') {
  const rng = new OrogenLcg('mesh', seed);
  return SphereMesh.build({ N, jitter: JITTER, rng: () => rng.next(), precision });
}

const buildNative = (N: number, seed: number, precision: 'f32' | 'f64' = 'f32') => dmath.withMode('native', () => build(N, seed, precision));

describe.skipIf(!HAVE_UPSTREAM)('SphereMesh vs upstream orogen sphere-mesh.js @ cc2662b', () => {
  for (const [N, seed] of [[20000, 12345], [20000, 777], [200000, 12345]] as const) {
    it(`byte-identical topology and permuted f32 points at N=${N} seed=${seed}`, async () => {
      const om = await import(pathToFileURL(OROGEN_MESH).href);
      const { makeRng } = await import(pathToFileURL(OROGEN_RNG).href);
      om.setDelaunator(Delaunator);
      const ref = om.buildSphere(N, JITTER, makeRng(seed));
      const mine = buildNative(N, seed, 'f32'); // parity path: native mode, as orogen runs
      expect(Buffer.from(mine.triangles.buffer)).toEqual(Buffer.from(ref.mesh.triangles.buffer));
      expect(Buffer.from(mine.halfedges.buffer)).toEqual(Buffer.from(ref.mesh.halfedges.buffer));
      expect(Buffer.from(mine.adjOffset.buffer)).toEqual(Buffer.from(ref.mesh.adjOffset.buffer));
      expect(Buffer.from(mine.adjList.buffer)).toEqual(Buffer.from(ref.mesh.adjList.buffer));
      expect(Buffer.from(mine.adjTriList.buffer)).toEqual(Buffer.from(ref.mesh._adjTriList.buffer));
      // Inverse permutation recovers orogen's Float32 r_xyz exactly (F1, §3.1).
      const back = mine.orogenPoints() as Float32Array;
      expect(Buffer.from(back.buffer)).toEqual(Buffer.from(ref.r_xyz.buffer));
      // neighborDist: orogen computes it in orogen's frame; distances are permutation-invariant up to rounding.
      const nd = om.computeNeighborDist(ref.mesh, ref.r_xyz) as Float32Array;
      const mine_nd = mine.neighborDist();
      let worst = 0;
      for (let i = 0; i < nd.length; i++) worst = Math.max(worst, Math.abs(nd[i]! - mine_nd[i]!));
      expect(worst).toBeLessThan(1e-6);
    });
  }
});

describe('SphereMesh', () => {
  it('matches the committed golden hash (CI path, no upstream needed)', async () => {
    const m = build(20000, 12345, 'f32');
    const h = await hashArrays({ triangles: m.triangles, halfedges: m.halfedges, adjList: m.adjList, points: m.points });
    expect(h).toEqual(GOLDEN_20K);
  });

  it('the golden hash is the same in native mode (f32 points and topology are mode-independent)', async () => {
    const m = buildNative(20000, 12345, 'f32');
    expect(await hashArrays({ triangles: m.triangles, halfedges: m.halfedges, adjList: m.adjList, points: m.points })).toEqual(GOLDEN_20K);
  });

  it('f64 points differ from f32 only at f32 rounding scale', () => {
    const a = build(5000, 3, 'f32'), b = build(5000, 3, 'f64');
    let worst = 0;
    for (let i = 0; i < a.points.length; i++) worst = Math.max(worst, Math.abs(a.points[i]! - b.points[i]!));
    expect(worst).toBeLessThan(1e-6);
  });

  it('cell areas sum to 4π and circumcentres are unit vectors', () => {
    const m = build(20000, 12345);
    let s = 0;
    for (const a of m.cellArea_sr) s += a;
    expect(s).toBeCloseTo(4 * Math.PI, 8);
    const c = m.circumcentres;
    for (let t = 0; t < m.numTriangles; t += 97) expect(Math.hypot(c[3 * t]!, c[3 * t + 1]!, c[3 * t + 2]!)).toBeCloseTo(1, 12);
  });

  // Seam cell (F1, spike 1a): the closure cell sits at (0N, 0E), small and irregular but not degenerate.
  for (const seed of [12345, 777]) {
    it(`seam cell is at (0N,0E), small and irregular but bounded (seed ${seed}, N=200k)`, () => {
      const m = build(200000, seed);
      const seam = m.numRegions - 1;
      expect([m.points[3 * seam], m.points[3 * seam + 1], m.points[3 * seam + 2]]).toEqual([1, 0, 0]);
      const rel = m.cellArea_sr[seam]! / ((4 * Math.PI) / m.numRegions);
      expect(rel).toBeGreaterThan(0.28 - 0.01);
      expect(rel).toBeLessThan(0.62 + 0.01);
      const deg = m.adjOffset[seam + 1]! - m.adjOffset[seam]!;
      expect(deg).toBeGreaterThanOrEqual(4);
      expect(deg).toBeLessThanOrEqual(6);
    });
  }
});

describe('SphereMesh in fdlibm mode', () => {
  const fdBuild = (N: number, seed: number, precision: 'f32' | 'f64') => {
    const m = build(N, seed, precision);
    return { m, area: m.cellArea_sr, circ: m.circumcentres };
  };

  it('matches committed golden hashes for Float64 points, topology, areas and circumcentres (every OS and engine)', async () => {
    const { m, area, circ } = fdBuild(20000, 12345, 'f64');
    const h = await hashArrays({ triangles: m.triangles, adjList: m.adjList, points: m.points, area, circ });
    expect(h).toEqual(GOLDEN_20K_FDLIBM_F64);
  });

  it('is repeatable, and the mode is restored afterwards', () => {
    const a = fdBuild(5000, 3, 'f64'), b = fdBuild(5000, 3, 'f64');
    expect(Buffer.from(a.m.points.buffer)).toEqual(Buffer.from(b.m.points.buffer));
    expect(Buffer.from(a.area.buffer)).toEqual(Buffer.from(b.area.buffer));
    expect(dmath.mode).toBe('fdlibm');
  });

  it('agrees with native mode to within a few ULP, with the same f32 topology at N=20k', () => {
    const fd = fdBuild(20000, 12345, 'f32').m, nat = buildNative(20000, 12345, 'f32');
    expect(Buffer.from(fd.triangles.buffer)).toEqual(Buffer.from(nat.triangles.buffer));
    expect(Buffer.from(fd.adjList.buffer)).toEqual(Buffer.from(nat.adjList.buffer));
    let worst = 0;
    for (let i = 0; i < fd.points.length; i++) worst = Math.max(worst, Math.abs(fd.points[i]! - nat.points[i]!));
    expect(worst).toBeLessThan(1e-7); // f32 rounding scale
  });
});

describe('SpatialIndex', () => {
  it('finds the true nearest cell, including near poles and the seam', () => {
    const m = build(20000, 12345);
    const idx = new SpatialIndex(m);
    const q = new OrogenLcg('q', 99);
    const queries: number[][] = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    for (let i = 0; i < 400; i++) {
      const v = [q.next() - 0.5, q.next() - 0.5, q.next() - 0.5];
      const l = Math.hypot(v[0]!, v[1]!, v[2]!);
      queries.push(v.map((x) => x / l));
    }
    const p = m.points;
    for (const [x, y, z] of queries as [number, number, number][]) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < m.numRegions; i++) {
        const d = (p[3 * i]! - x) ** 2 + (p[3 * i + 1]! - y) ** 2 + (p[3 * i + 2]! - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      const got = idx.nearestCell(x, y, z);
      const dg = (p[3 * got]! - x) ** 2 + (p[3 * got + 1]! - y) ** 2 + (p[3 * got + 2]! - z) ** 2;
      expect(dg).toBeLessThanOrEqual(bd + 1e-15);
      expect(got === best || dg === bd).toBe(true);
    }
  });
});

// N=20000, seed 12345, jitter 0.75, f32. Equal to orogen's output (see the upstream parity test above).
const GOLDEN_20K: Record<string, string> = {
  adjList: '7bfd687e845af00e9d60569a4c809ba7a7d9177e6851c7206d0e75724afc402a',
  halfedges: 'ca9446d95347ed090469c89d8398b6572c541d3dbf312406b39decd56c43b647',
  points: 'e05e51505b3f7af215837959d8e3e11876398d3bae3bff4c7c72fd65f54aaa2b',
  triangles: '81eb69480b954367f4a4afafe4ab72a7fa4e5921c3da8b2f492b7d06449b5011',
};

// N=20000, seed 12345, jitter 0.75, f64, dmath.mode = 'fdlibm'. Pure IEEE arithmetic, so identical on every engine and CPU.
const GOLDEN_20K_FDLIBM_F64: Record<string, string> = {
  adjList: 'ffa097dc06b8300d9b9d522473bcede840cbb28be0d2b97c8afcdcf27d6a52c6',
  area: '47f36149c3be4c63f8e49d68bbae798b0f8f27cfe87706f7569175d47274ea79',
  circ: 'a67831fc69504b4d2cb0934b95d61915960f76a2be37e72daddc1e858e3828e4',
  points: '2113b0864dbcde3d31a0d49cb1df43365634aea924e082d7a65677f5e04c5d49',
  triangles: 'bb66d2e389a1c6f34b101af435dbf35b5e89fbce35ef3fd9b2c9af3316d639d8',
};
