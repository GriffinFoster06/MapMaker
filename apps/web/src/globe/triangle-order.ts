// The globe's index buffer (performance study, "After the first fixes"): the mesh's triangles, wound counter-clockwise seen from
// outside the sphere (so `FrontSide` drawing culls exactly the far side) and ordered by their lowest vertex number (cells are
// numbered along a spiral, so neighbouring triangles read neighbouring vertices: vertex-cache locality). Same triangles, same
// pixels: the order of opaque triangles with a depth test does not change the picture, and a triangle's winding only decides
// whether the back-face cull keeps it. Original code. The mesh's own `triangles` array is not modified.

export interface OrderedTriangles {
  indices: Uint32Array;
  /** How many triangles were wound clockwise in the input (and turned round). */
  flipped: number;
}

/** `points`: xyz of the unit vectors, any frame that keeps handedness (canonical or three.js's rotation of it). */
export function orderTriangles(points: ArrayLike<number>, tri: Int32Array | Uint32Array): OrderedTriangles {
  const nT = tri.length / 3;
  let maxId = 0;
  for (let i = 0; i < tri.length; i++) if (tri[i]! > maxId) maxId = tri[i]!;
  const key = new Uint32Array(nT), start = new Uint32Array(maxId + 2);
  const out = new Uint32Array(tri.length);
  let flipped = 0;
  // Pass 1: the lowest vertex of each triangle (the sort key) and its winding.
  const wind = new Uint8Array(nT);
  for (let t = 0; t < nT; t++) {
    const a = tri[3 * t]!, b = tri[3 * t + 1]!, c = tri[3 * t + 2]!;
    const k = a < b ? (a < c ? a : c) : (b < c ? b : c);
    key[t] = k;
    start[k + 1]!++;
    const ax = points[3 * a]!, ay = points[3 * a + 1]!, az = points[3 * a + 2]!;
    const bx = points[3 * b]!, by = points[3 * b + 1]!, bz = points[3 * b + 2]!;
    const cx = points[3 * c]!, cy = points[3 * c + 1]!, cz = points[3 * c + 2]!;
    // det(a, b, c) > 0: counter-clockwise seen from outside the sphere.
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    if (det < 0) { wind[t] = 1; flipped++; }
  }
  for (let i = 0; i <= maxId; i++) start[i + 1]! += start[i]!;
  // Pass 2: a stable counting sort (equal keys keep the mesh's order, so the result is deterministic).
  for (let t = 0; t < nT; t++) {
    const o = start[key[t]!]!++;
    if (wind[t]) { out[3 * o] = tri[3 * t]!; out[3 * o + 1] = tri[3 * t + 2]!; out[3 * o + 2] = tri[3 * t + 1]!; }
    else { out[3 * o] = tri[3 * t]!; out[3 * o + 1] = tri[3 * t + 1]!; out[3 * o + 2] = tri[3 * t + 2]!; }
  }
  return { indices: out, flipped };
}

/**
 * Whether two pictures of the globe (RGBA, `disc` the radius of the sphere in pixels, centred) agree: every pixel inside 97% of the
 * radius is identical, and along the limb at most 3e-5 of the disc's area differs (at the limb the far-side triangles of the former
 * draw path lie at the depth of the front ones, so one or two samples there take a far-side colour; the culled path has the right one).
 */
export function pictureAgrees(a: Uint8Array, b: Uint8Array, w: number, h: number, disc: number): boolean {
  const inner = 0.97 * disc, allowed = Math.ceil(3e-5 * Math.PI * disc * disc);
  let rim = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
    const p = i >> 2;
    if (Math.hypot((p % w) - w / 2, Math.floor(p / w) - h / 2) < inner || ++rim > allowed) return false;
  }
  return true;
}
