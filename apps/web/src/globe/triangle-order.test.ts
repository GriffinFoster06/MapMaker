import { describe, expect, test } from 'vitest';
import { SphereMesh } from '@mapmaker/core';
import { orderTriangles, pictureAgrees } from './triangle-order';

const mesh = SphereMesh.build({ N: 3000, jitter: 0.75, rng: ((s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296))(7), precision: 'f64' });
// three.js frame (x, y, z) -> (x, z, -y), as the globe's position buffer.
const pos = new Float32Array(3 * mesh.numRegions);
for (let i = 0; i < mesh.numRegions; i++) { pos[3 * i] = mesh.points[3 * i]!; pos[3 * i + 1] = mesh.points[3 * i + 2]!; pos[3 * i + 2] = -mesh.points[3 * i + 1]!; }
const tri = new Uint32Array(mesh.triangles.buffer, mesh.triangles.byteOffset, mesh.triangles.length);

const det = (t: ArrayLike<number>, k: number) => {
  const [a, b, c] = [t[3 * k]!, t[3 * k + 1]!, t[3 * k + 2]!];
  const P = (i: number) => [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!] as const;
  const [A, B, C] = [P(a), P(b), P(c)];
  return A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
};
const key = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y).join(',');

describe('globe triangle order', () => {
  const before = tri.slice(), { indices, flipped } = orderTriangles(pos, tri);

  test('the same triangles, the mesh array untouched', () => {
    expect(indices.length).toBe(tri.length);
    const a = new Map<string, number>();
    for (let k = 0; k < tri.length / 3; k++) a.set(key(tri[3 * k]!, tri[3 * k + 1]!, tri[3 * k + 2]!), 1);
    for (let k = 0; k < indices.length / 3; k++) expect(a.has(key(indices[3 * k]!, indices[3 * k + 1]!, indices[3 * k + 2]!))).toBe(true);
    expect(new Set(Array.from({ length: indices.length / 3 }, (_, k) => key(indices[3 * k]!, indices[3 * k + 1]!, indices[3 * k + 2]!))).size).toBe(tri.length / 3);
    expect(tri).toEqual(before);
  });

  test('every triangle is counter-clockwise seen from outside (so FrontSide culls exactly the far side)', () => {
    for (let k = 0; k < indices.length / 3; k++) expect(det(indices, k)).toBeGreaterThan(0);
    expect(flipped).toBeGreaterThanOrEqual(0);
  });

  test('ordered by lowest vertex number, ties in the mesh order', () => {
    let last = -1;
    for (let k = 0; k < indices.length / 3; k++) {
      const m = Math.min(indices[3 * k]!, indices[3 * k + 1]!, indices[3 * k + 2]!);
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
  });
});

describe('pictureAgrees', () => {
  const w = 200, h = 200, disc = 80;
  const blank = () => new Uint8Array(w * h * 4);
  const set = (a: Uint8Array, x: number, y: number) => { a[4 * (y * w + x)] = 9; };
  test('identical pictures agree; one pixel inside the disc does not', () => {
    expect(pictureAgrees(blank(), blank(), w, h, disc)).toBe(true);
    const b = blank();
    set(b, 100, 100);
    expect(pictureAgrees(blank(), b, w, h, disc)).toBe(false);
    set(b, 100, 100);
  });
  test('a pixel on the limb is tolerated, a handful are not', () => {
    const one = blank();
    set(one, 100 + 79, 100);
    expect(pictureAgrees(blank(), one, w, h, disc)).toBe(true);
    const many = blank();
    for (let y = 100; y < 110; y++) set(many, 100 + 79, y);
    expect(pictureAgrees(blank(), many, w, h, disc)).toBe(false);
  });
});
