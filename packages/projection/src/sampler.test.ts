// Exact CPU inverse sampler (§3.7 raster path step 3): the extracted triangle search is MultiLevel's, results agree
// with brute force, tiling does not change a bit, and pixels at the poles and the antimeridian need no special case.
import { describe, expect, it } from 'vitest';
import { MultiLevel, OrogenLcg, SphereMesh, TriangleLocator, dmath } from '@mapmaker/core';
import { MeshSampler, ProjectionView, locateRaster, rowBands, sampleRaster, unitVector } from './index';
import { exactView } from './exact';

const mesh = (N: number, seed: number) => {
  const rng = new OrogenLcg('mesh', seed);
  return SphereMesh.build({ N, jitter: 0.75, rng: () => rng.next(), precision: 'f64' });
};
const M = mesh(4000, 3);
const S = new MeshSampler(M);
/** A smooth field with structure in every direction. */
const field = (m: SphereMesh) => {
  const v = new Float64Array(m.numRegions), p = m.points;
  for (let i = 0; i < m.numRegions; i++) v[i] = 1000 * dmath.sin(3 * p[3 * i]!) + 700 * p[3 * i + 1]! * p[3 * i + 2]! - 400 * p[3 * i + 2]!;
  return v;
};
const F = field(M);
const ids = Float64Array.from({ length: M.numRegions }, (_, i) => i);

function bruteNearest(x: number, y: number, z: number): number {
  const p = M.points;
  let best = -1, bd = Infinity;
  for (let i = 0; i < M.numRegions; i++) {
    const d = (p[3 * i]! - x) ** 2 + (p[3 * i + 1]! - y) ** 2 + (p[3 * i + 2]! - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Brute force over all triangles: the barycentric value in the most interior containing triangle. */
function bruteBary(x: number, y: number, z: number, v: ArrayLike<number>): number {
  const L = new TriangleLocator(M), w = new Float64Array(3), T = M.triangles;
  let best = -1, score = -Infinity;
  for (let t = 0; t < M.numTriangles; t++) { const s = L.bary(t, x, y, z, w); if (s > score) { score = s; best = t; } }
  L.bary(best, x, y, z, w);
  const s = w[0]! + w[1]! + w[2]!;
  return (w[0]! * v[T[3 * best]!]! + w[1]! * v[T[3 * best + 1]!]! + w[2]! * v[T[3 * best + 2]!]!) / s;
}

describe('TriangleLocator (extracted from MultiLevel.buildInterpolation)', () => {
  it('gives MultiLevel exactly the cells and weights it had (bit-identical prolongation)', () => {
    const coarse = mesh(2000, 1), fine = mesh(9000, 2);
    const ml = new MultiLevel(coarse, fine);
    const L = new TriangleLocator(coarse), w = new Float64Array(3), T = coarse.triangles, fp = fine.points;
    for (let i = 0; i < fine.numRegions; i++) {
      const t = L.locate(fp[3 * i]!, fp[3 * i + 1]!, fp[3 * i + 2]!, ml.parentOf[i]!, w);
      for (let j = 0; j < 3; j++) {
        expect(T[3 * t + j]).toBe(ml.interpCells[3 * i + j]);
        expect(Object.is(w[j], ml.interpWeights[3 * i + j])).toBe(true);
      }
    }
  });
});

describe('sampleRaster', () => {
  const W = 180, H = 90;

  it('nearest gives the brute-force nearest cell; barycentric the brute-force containing triangle', () => {
    for (const id of ['equirectangular', 'mollweide', 'orthographic']) {
      const v = exactView({ projection: id, width: W, height: H, rotate: [20, -35, 10] });
      const near = sampleRaster(v, S, ids, 'nearest');
      const bary = sampleRaster(v, S, F, 'barycentric');
      const p = new Float64Array(3);
      for (let j = 0; j < H; j += 7) for (let i = 0; i < W; i += 7) {
        const ll = v.invert(i + 0.5, j + 0.5), o = j * W + i;
        if (!ll) { expect(near[o]).toBeNaN(); expect(bary[o]).toBeNaN(); continue; }
        unitVector(ll[0], ll[1], p);
        expect(near[o], `${id} ${i},${j}`).toBe(bruteNearest(p[0]!, p[1]!, p[2]!));
        expect(bary[o]!).toBeCloseTo(bruteBary(p[0]!, p[1]!, p[2]!, F), 9);
      }
    }
  });

  it('locateRaster reproduces sampleRaster bit for bit by either rule (the CPU path of the flat map)', () => {
    const v = exactView({ projection: 'mollweide', width: W, height: H, rotate: [40, 10, 0] });
    const r = locateRaster(v, S), T = M.triangles;
    const bary = sampleRaster(v, S, F, 'barycentric'), near = sampleRaster(v, S, ids, 'nearest');
    for (let o = 0; o < W * H; o++) {
      const t = r.tri[o]!;
      if (t < 0) { expect(bary[o]).toBeNaN(); expect(r.cell[o]).toBe(-1); continue; }
      const val = r.w[3 * o]! * F[T[3 * t]!]! + r.w[3 * o + 1]! * F[T[3 * t + 1]!]! + r.w[3 * o + 2]! * F[T[3 * t + 2]!]!;
      expect(Object.is(val, bary[o])).toBe(true);
      expect(r.cell[o]).toBe(near[o]);
    }
    const band = locateRaster(v, S, { y0: 20, y1: 30 });
    expect([...band.tri]).toEqual([...r.tri.subarray(20 * W, 30 * W)]);
  });

  it('is bit-identical however it is tiled in row bands', () => {
    const v = exactView({ projection: 'robinson', width: W, height: H });
    const whole = sampleRaster(v, S, F, 'barycentric');
    for (const rows of [1, 7, 32]) {
      const parts = rowBands(H, rows).map((b) => sampleRaster(v, S, F, 'barycentric', b));
      const joined = new Float64Array(W * H);
      let o = 0;
      for (const p of parts) { joined.set(p, o); o += p.length; }
      expect(Buffer.from(joined.buffer).equals(Buffer.from(whole.buffer)), `rows ${rows}`).toBe(true);
    }
  });

  it('a pixel centred on a pole samples the pole, continuous with its neighbours', () => {
    for (const lat of [90, -90]) {
      // Odd size: pixel (100, 100) is centred on the raw origin, the pole in polar aspect.
      const v = exactView({ projection: 'azimuthalEqualArea', width: 201, height: 201, rotate: [0, -lat, 0] });
      const ll = v.invert(100.5, 100.5)!;
      expect(Math.abs(ll[1] - lat)).toBeLessThan(1e-9);
      const r = sampleRaster(v, S, F, 'barycentric', { y0: 99, y1: 102 });
      const pole = bruteBary(0, 0, Math.sign(lat), F);
      expect(r[201 + 100]!).toBeCloseTo(pole, 6);
      // Neighbours: |Δ| within the field's gradient bound (|∇F| < 4100 per radian) times their distance from the pole.
      for (const [di, dj] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
        const q = v.invert(100.5 + di, 100.5 + dj)!, arc = (90 - Math.abs(q[1])) * Math.PI / 180;
        expect(Math.abs(r[(1 + dj) * 201 + 100 + di]! - pole)).toBeLessThan(4100 * arc);
      }
      const n = sampleRaster(v, S, ids, 'nearest', { y0: 100, y1: 101 });
      expect(n[100]).toBe(bruteNearest(0, 0, Math.sign(lat)));
    }
  });

  it('the antimeridian is no seam: across it, columns differ no more than anywhere else', () => {
    const v = exactView({ projection: 'equirectangular', width: 720, height: 360 });
    const r = sampleRaster(v, S, F, 'barycentric');
    let seam = 0, interior = 0;
    for (let j = 0; j < 360; j++) {
      seam = Math.max(seam, Math.abs(r[j * 720]! - r[j * 720 + 719]!));
      for (let i = 1; i < 720; i++) interior = Math.max(interior, Math.abs(r[j * 720 + i]! - r[j * 720 + i - 1]!));
    }
    expect(seam).toBeLessThanOrEqual(interior);
    // Rotated by 180°, the antimeridian is the centre column and samples the same cells as before.
    const rot = exactView({ projection: 'equirectangular', width: 720, height: 360, rotate: [180, 0, 0] });
    const a = sampleRaster(v, S, ids, 'nearest'), b = sampleRaster(rot, S, ids, 'nearest');
    for (let j = 0; j < 360; j++) {
      expect(b[j * 720 + 359], `row ${j}`).toBe(a[j * 720 + 719]);
      expect(b[j * 720 + 360], `row ${j}`).toBe(a[j * 720]);
    }
  });

  it('the stock (native-math) view samples the same cells as the exact one', () => {
    const e = exactView({ projection: 'equalEarth', width: W, height: H });
    const s = new ProjectionView({ projection: 'equalEarth', width: W, height: H });
    const a = sampleRaster(e, S, ids, 'nearest'), b = sampleRaster(s, S, ids, 'nearest');
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) diff++;
    expect(diff).toBe(0);
  });
});
