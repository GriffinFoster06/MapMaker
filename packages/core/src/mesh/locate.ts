// Provenance: original code (design note 14 §3.5; ARCHITECTURE §3.7 raster path step 3). Extracted unchanged from
// MultiLevel.buildInterpolation so that prolongation and the projection sampler share one triangle search.
// Locates the Delaunay triangle of a SphereMesh containing a unit vector and gives its barycentric weights.
import type { SphereMesh } from './sphere-mesh';

const triple = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) =>
  ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);

export class TriangleLocator {
  /** Orientation of each triangle seen from outside the sphere; containment tests are sign-adjusted by it. */
  private readonly orient: Int8Array;

  constructor(readonly mesh: SphereMesh) {
    const q = mesh.points, T = mesh.triangles, nt = mesh.numTriangles;
    this.orient = new Int8Array(nt);
    for (let t = 0; t < nt; t++) {
      const a = 3 * T[3 * t]!, b = 3 * T[3 * t + 1]!, c = 3 * T[3 * t + 2]!;
      this.orient[t] = triple(q[a]!, q[a + 1]!, q[a + 2]!, q[b]!, q[b + 1]!, q[b + 2]!, q[c]!, q[c + 1]!, q[c + 2]!) < 0 ? -1 : 1;
    }
  }

  /** Barycentric (gnomonic) coordinates of x in triangle t, into w; the smallest one is ≥ 0 iff x lies inside. */
  bary(t: number, x: number, y: number, z: number, w: Float64Array): number {
    const q = this.mesh.points, T = this.mesh.triangles;
    const a = 3 * T[3 * t]!, b = 3 * T[3 * t + 1]!, c = 3 * T[3 * t + 2]!;
    const s = this.orient[t]!;
    w[0] = s * triple(x, y, z, q[b]!, q[b + 1]!, q[b + 2]!, q[c]!, q[c + 1]!, q[c + 2]!);
    w[1] = s * triple(q[a]!, q[a + 1]!, q[a + 2]!, x, y, z, q[c]!, q[c + 1]!, q[c + 2]!);
    w[2] = s * triple(q[a]!, q[a + 1]!, q[a + 2]!, q[b]!, q[b + 1]!, q[b + 2]!, x, y, z);
    const sum = w[0]! + w[1]! + w[2]!;
    return Math.min(w[0]!, w[1]!, w[2]!) / (sum > 0 ? sum : 1);
  }

  /**
   * The triangle containing the unit vector (x, y, z), given `near`, the mesh cell nearest to it (or one close by).
   * On return w holds its barycentric weights, clamped at 0 and normalised to sum 1, for the vertices
   * triangles[3t], [3t + 1], [3t + 2]. Returns −1 when no triangle contains the point (not expected on a closed mesh).
   */
  locate(x: number, y: number, z: number, near: number, w: Float64Array): number {
    const { adjOffset, adjTriList, halfedges: H } = this.mesh;
    const nt = this.mesh.numTriangles;
    // The containing triangle is usually incident to the nearest site; take the most interior candidate.
    let best = -1, bestScore = -Infinity;
    for (let k = adjOffset[near]!; k < adjOffset[near + 1]!; k++) {
      const t = adjTriList[k]!;
      const score = this.bary(t, x, y, z, w);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    // Otherwise walk across the edge the point lies outside of (visibility walk on the Delaunay triangulation).
    for (let steps = 0; bestScore < 0 && steps < 4 * nt; steps++) {
      this.bary(best, x, y, z, w);
      let side = 0;
      for (let j = 1; j < 3; j++) if (w[j]! < w[side]!) side = j;
      // Weight j is opposite vertex j, i.e. edge from vertex j+1 to j+2, which is halfedge 3t + (j+1)%3.
      const opp = H[3 * best + ((side + 1) % 3)]!;
      best = (opp / 3) | 0;
      bestScore = this.bary(best, x, y, z, w);
    }
    if (bestScore < -1e-12) return -1;
    this.bary(best, x, y, z, w);
    const w0 = Math.max(0, w[0]!), w1 = Math.max(0, w[1]!), w2 = Math.max(0, w[2]!);
    const s = w0 + w1 + w2;
    w[0] = w0 / s; w[1] = w1 / s; w[2] = w2 / s;
    return best;
  }

  /**
   * Visibility walk from triangle `start` to the triangle containing (x, y, z), with at most `maxSteps` steps (the
   * walk of `locate` without its start search). Returns −1 when the bound is reached. Weights in w are raw.
   */
  walk(x: number, y: number, z: number, start: number, w: Float64Array, maxSteps = 4 * this.mesh.numTriangles): number {
    const H = this.mesh.halfedges;
    let t = start;
    for (let steps = 0; steps <= maxSteps; steps++) {
      if (this.bary(t, x, y, z, w) >= 0) return t;
      let side = 0;
      for (let j = 1; j < 3; j++) if (w[j]! < w[side]!) side = j;
      t = (H[3 * t + ((side + 1) % 3)]! / 3) | 0;
    }
    return -1;
  }
}
