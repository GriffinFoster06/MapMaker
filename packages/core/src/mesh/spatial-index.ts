// Provenance: original code (ARCHITECTURE §3.1 "spatial index"). Cube-map buckets give a start cell; a greedy walk
// on the Delaunay graph then reaches the nearest site, which is the Voronoi cell containing the query.
// The walk is exact because a local distance minimum on a Delaunay graph is the global minimum.
import type { SphereMesh } from './sphere-mesh';

function cubeFace(x: number, y: number, z: number): { face: number; u: number; v: number } {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) return x > 0 ? { face: 0, u: y / ax, v: z / ax } : { face: 1, u: y / ax, v: z / ax };
  if (ay >= az) return y > 0 ? { face: 2, u: x / ay, v: z / ay } : { face: 3, u: x / ay, v: z / ay };
  return z > 0 ? { face: 4, u: x / az, v: y / az } : { face: 5, u: x / az, v: y / az };
}

export class SpatialIndex {
  private readonly G: number;
  private readonly start: Int32Array; // per bucket: a representative cell, or -1

  constructor(private readonly mesh: SphereMesh, cellsPerBucket = 2) {
    const n = mesh.numRegions;
    this.G = Math.max(1, Math.ceil(Math.sqrt(n / (6 * cellsPerBucket))));
    this.start = new Int32Array(6 * this.G * this.G).fill(-1);
    const p = mesh.points;
    for (let i = 0; i < n; i++) {
      const b = this.bucket(p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!);
      if (this.start[b] === -1) this.start[b] = i;
    }
  }

  private bucket(x: number, y: number, z: number): number {
    const { face, u, v } = cubeFace(x, y, z);
    const G = this.G;
    const iu = Math.min(G - 1, Math.max(0, Math.floor(((u + 1) / 2) * G)));
    const iv = Math.min(G - 1, Math.max(0, Math.floor(((v + 1) / 2) * G)));
    return (face * G + iv) * G + iu;
  }

  /** Nearest cell centre to the unit vector (x, y, z). `hint` speeds up coherent queries. */
  nearestCell(x: number, y: number, z: number, hint = -1): number {
    let cur = hint >= 0 ? hint : this.start[this.bucket(x, y, z)]!;
    if (cur < 0) {
      // Empty bucket: scan outward through bucket ids until a representative is found.
      const b0 = this.bucket(x, y, z);
      for (let d = 1; cur < 0 && d < this.start.length; d++) {
        cur = this.start[(b0 + d) % this.start.length]!;
        if (cur < 0) cur = this.start[(b0 - d + this.start.length) % this.start.length]!;
      }
    }
    const { points: p, adjOffset, adjList } = this.mesh;
    const d2 = (i: number) => {
      const dx = p[3 * i]! - x, dy = p[3 * i + 1]! - y, dz = p[3 * i + 2]! - z;
      return dx * dx + dy * dy + dz * dz;
    };
    let best = d2(cur);
    for (;;) {
      let moved = false;
      for (let k = adjOffset[cur]!; k < adjOffset[cur + 1]!; k++) {
        const nb = adjList[k]!;
        const d = d2(nb);
        if (d < best) { best = d; cur = nb; moved = true; }
      }
      if (!moved) return cur;
    }
  }
}
