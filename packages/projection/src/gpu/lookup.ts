// Lookup data for the interactive GPU path (ARCHITECTURE §3.7, "Interactive (GPU)"; Phase 5 M4). Original shell code.
// The shaders (glsl.ts) find a pixel's containing Delaunay triangle by a bounded visibility walk that starts from a
// triangle-id cube map: each texel holds the triangle containing its centre direction. With at least as many texels
// as triangles a pixel is a step or two from its texel's triangle. The cube map is a lookup acceleration built from
// the sphere; values still come from the per-cell arrays.
//
// Cube faces (shared with the GLSL): the face of the largest |component| (ties: x before y before z, as
// SpatialIndex), coordinates (u, v) = the other two components over it, in [−1, 1]; texel (floor((u+1)/2·R),
// floor((v+1)/2·R)) clamped to [0, R − 1]. The six R × R faces are laid out 3 × 2 in one texture: face f at
// ((f mod 3)·R, ⌊f / 3⌋·R).
import { type SphereMesh, SpatialIndex, TriangleLocator } from '@mapmaker/core';

/** Face and texel of a direction (not necessarily unit). */
export function cubeTexel(x: number, y: number, z: number, R: number): { face: number; i: number; j: number } {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let face: number, u: number, v: number;
  if (ax >= ay && ax >= az) { face = x > 0 ? 0 : 1; u = y / ax; v = z / ax; }
  else if (ay >= az) { face = y > 0 ? 2 : 3; u = x / ay; v = z / ay; }
  else { face = z > 0 ? 4 : 5; u = x / az; v = y / az; }
  const i = Math.min(R - 1, Math.max(0, Math.floor(((u + 1) / 2) * R)));
  const j = Math.min(R - 1, Math.max(0, Math.floor(((v + 1) / 2) * R)));
  return { face, i, j };
}

/** Direction of a texel centre (unnormalised). */
export function texelDirection(face: number, i: number, j: number, R: number): [number, number, number] {
  const u = ((i + 0.5) / R) * 2 - 1, v = ((j + 0.5) / R) * 2 - 1;
  switch (face) {
    case 0: return [1, u, v];
    case 1: return [-1, u, v];
    case 2: return [u, 1, v];
    case 3: return [u, -1, v];
    case 4: return [u, v, 1];
    default: return [u, v, -1];
  }
}

/** Cube resolution for a mesh: at least one texel per triangle (6R² ≥ triangles). */
export const cubeResolution = (numTriangles: number) => Math.max(8, Math.ceil(Math.sqrt(numTriangles / 6)));

export interface CubeLookup {
  R: number;
  /** 3R × 2R texels, row-major: the triangle containing each texel's centre direction. */
  cube: Uint32Array;
}

/**
 * Builds the triangle-id cube map. Texels are visited in row order per face; each search walks from the previous
 * texel's triangle (TriangleLocator.walk), falling back to the CPU sampler's full search (nearest cell, then locate).
 */
export function buildCubeLookup(mesh: SphereMesh, R = cubeResolution(mesh.numTriangles)): CubeLookup {
  const index = new SpatialIndex(mesh), loc = new TriangleLocator(mesh);
  const W = 3 * R, cube = new Uint32Array(W * 2 * R);
  const w = new Float64Array(3);
  let t = -1;
  for (let face = 0; face < 6; face++) {
    const ox = (face % 3) * R, oy = Math.floor(face / 3) * R;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const [dx, dy, dz] = texelDirection(face, i, j, R);
      const s = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      const x = dx * s, y = dy * s, z = dz * s;
      t = t >= 0 ? loc.walk(x, y, z, t, w, 64) : -1;
      if (t < 0) t = loc.locate(x, y, z, index.nearestCell(x, y, z), w);
      if (t < 0) throw new Error(`buildCubeLookup: no triangle for texel ${face}/${i},${j}`);
      cube[(oy + j) * W + ox + i] = t;
    }
  }
  return { R, cube };
}

/** Width of the flat data textures (arrays laid out row-major, element k at (k mod width, ⌊k / width⌋)). */
export function flatTextureWidth(length: number, maxSize: number): { width: number; height: number } | null {
  const width = Math.min(maxSize, Math.max(1, length));
  const height = Math.ceil(length / width);
  return height <= maxSize ? { width, height } : null;
}

/** Pads an array to width × height (the texture upload size); the extra elements are 0. */
export function padTo<T extends Uint32Array | Float32Array | Uint8Array>(a: T, n: number): T {
  if (a.length === n) return a;
  const out = new (a.constructor as new (n: number) => T)(n);
  out.set(a);
  return out;
}
