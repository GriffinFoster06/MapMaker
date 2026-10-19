// Edit regions to per-cell weights (design note 16 §3.4: regions are geometry in unit vectors, never cell ids, so an
// edit re-rasterises onto any mesh). Original shell code. All transcendental math goes through dmath.
import { type EditRegion, type SphereMesh, SpatialIndex, dmath } from '@mapmaker/core';

export interface CellWeights {
  /** Ascending cell indices. */
  cells: Int32Array;
  /** Weight in (0, 1] per cell. */
  w: Float64Array;
}

const EMPTY: CellWeights = { cells: new Int32Array(0), w: new Float64Array(0) };
const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

type V3 = readonly [number, number, number];
const at = (a: ArrayLike<number>, i: number): V3 => [a[3 * i]!, a[3 * i + 1]!, a[3 * i + 2]!];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.sqrt(dot(a, a)); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : a; };

/** Largest cosine of the angle between `p` and the great-circle arc A→B (the arc's closest point). */
function cosToArc(p: V3, A: V3, B: V3): number {
  const n = cross(A, B);
  const nl = Math.sqrt(dot(n, n));
  const ends = Math.max(dot(p, A), dot(p, B));
  if (nl < 1e-12) return ends;
  const nn: V3 = [n[0] / nl, n[1] / nl, n[2] / nl];
  const s = dot(p, nn);
  const q: V3 = [p[0] - s * nn[0], p[1] - s * nn[1], p[2] - s * nn[2]];
  const ql = Math.sqrt(dot(q, q));
  if (ql < 1e-12) return ends;
  const qh: V3 = [q[0] / ql, q[1] / ql, q[2] / ql];
  return dot(cross(A, qh), nn) >= 0 && dot(cross(qh, B), nn) >= 0 ? ql : ends;
}

/** Points along the polyline, no further apart than `step` radians (spherical interpolation), for flood-fill seeds. */
function samples(path: V3[], step: number): V3[] {
  const out: V3[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const ang = dmath.acos(Math.max(-1, Math.min(1, dot(a, b))));
    const k = Math.max(1, Math.ceil(ang / step));
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      out.push(j === k ? b : norm([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]));
    }
  }
  return out;
}

function flood(mesh: SphereMesh, idx: SpatialIndex, seeds: V3[], accept: (c: number) => number): CellWeights {
  const n = mesh.numRegions, seen = new Uint8Array(n), queue: number[] = [], cells: number[] = [], w: number[] = [];
  for (const s of seeds) { const c = idx.nearestCell(s[0], s[1], s[2]); if (!seen[c]) { seen[c] = 1; queue.push(c); } }
  const first = new Set(queue);
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]!, wt = accept(c);
    if (wt > 0 || first.has(c)) {
      if (wt > 0) { cells.push(c); w.push(wt); }
      for (let k = mesh.adjOffset[c]!; k < mesh.adjOffset[c + 1]!; k++) { const nb = mesh.adjList[k]!; if (!seen[nb]) { seen[nb] = 1; queue.push(nb); } }
    }
  }
  const order = Int32Array.from(cells.keys()).sort((a, b) => cells[a]! - cells[b]!);
  return { cells: Int32Array.from(order, (i) => cells[i]!), w: Float64Array.from(order, (i) => w[i]!) };
}

export function rasterise(mesh: SphereMesh, region: EditRegion, index: SpatialIndex): CellWeights {
  if (!region) return EMPTY;
  const p = mesh.points;
  if (region.kind === 'cells') {
    const cells: number[] = [];
    for (let i = 0; i + 1 < region.runs.length; i += 2) for (let c = region.runs[i]!; c < region.runs[i]! + region.runs[i + 1]!; c++) if (c >= 0 && c < mesh.numRegions) cells.push(c);
    cells.sort((a, b) => a - b);
    return { cells: Int32Array.from(cells), w: new Float64Array(cells.length).fill(1) };
  }
  if (region.kind === 'brush') {
    const path: V3[] = [];
    for (let i = 0; i + 2 < region.path.length; i += 3) path.push(norm([region.path[i]!, region.path[i + 1]!, region.path[i + 2]!]));
    if (!path.length || !(region.radius > 0)) return EMPTY;
    const r = region.radius, r0 = r * (1 - Math.max(0, Math.min(1, region.falloff)));
    const cosR = dmath.cos(r);
    const dist = (c: number): number => {
      const q = at(p, c);
      let best = -1;
      if (path.length === 1) best = dot(q, path[0]!);
      else for (let i = 1; i < path.length; i++) best = Math.max(best, cosToArc(q, path[i - 1]!, path[i]!));
      return best;
    };
    const res = flood(mesh, index, samples(path, Math.max(r / 2, 1e-6)), (c) => {
      const cs = dist(c);
      if (cs < cosR) return 0;
      const d = dmath.acos(Math.min(1, cs));
      return d <= r0 ? 1 : Math.max(1e-9, smoothstep((r - d) / (r - r0)));
    });
    if (res.cells.length) return res;
    // A brush smaller than a cell still edits the cell under its centre line.
    const c = index.nearestCell(path[0]![0], path[0]![1], path[0]![2]);
    return { cells: Int32Array.of(c), w: Float64Array.of(1) };
  }
  // polygon: ring of unit vectors; point-in-polygon in the gnomonic projection about the ring's centroid.
  const ring: V3[] = [];
  for (let i = 0; i + 2 < region.ring.length; i += 3) ring.push(norm([region.ring[i]!, region.ring[i + 1]!, region.ring[i + 2]!]));
  if (ring.length < 3) return EMPTY;
  const c0 = norm(ring.reduce<V3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]));
  const up: V3 = Math.abs(c0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(up, c0)), e2 = cross(c0, e1);
  const proj = (v: V3): [number, number] | null => { const d = dot(v, c0); return d > 1e-6 ? [dot(v, e1) / d, dot(v, e2) / d] : null; };
  const poly = ring.map((v) => proj(v));
  if (poly.some((q) => q === null)) return EMPTY;
  const P = poly as [number, number][];
  const inside = (c: number): number => {
    const q = proj(at(p, c));
    if (!q) return 0;
    let ins = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i]!, [xj, yj] = P[j]!;
      if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins ? 1 : 0;
  };
  return flood(mesh, index, [c0, ...ring], inside);
}
