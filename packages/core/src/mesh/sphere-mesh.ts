// Provenance: ported from upstream/orogen/js/sphere-mesh.js @ cc2662b (GPL-3.0), itself adapted from Red Blob
// Games sphere-mesh.js. See PROVENANCE.md. Mesh topology and the f32 point arithmetic are unchanged so that
// Phase 4a parity holds; additions are the canonical-frame Float64 points, circumcentres and cell areas.
import Delaunator from 'delaunator';
import { dmath } from '../dmath';
import { orogenToCanonical } from '../frame';

export type Precision = 'f32' | 'f64';

type PointArray = Float32Array | Float64Array;

/** Fibonacci sphere with jitter, in orogen's construction frame (pole at +z). */
export function generateFibonacciSphere(N: number, jitter: number, rng: () => number, precision: Precision = 'f32'): PointArray {
  const r_xyz: PointArray = precision === 'f32' ? new Float32Array(3 * N) : new Float64Array(3 * N);
  const s = 3.6 / Math.sqrt(N);
  const dlong = Math.PI * (3 - Math.sqrt(5));
  const dz = 2.0 / N;

  for (let k = 0, lng = 0, z = 1 - dz / 2; k < N; k++, z -= dz) {
    const r = Math.sqrt(1 - z * z);
    let latDeg = (dmath.asin(z) * 180) / Math.PI;
    let lonDeg = (lng * 180) / Math.PI;

    if (jitter > 0) {
      const jLat = rng() - rng();
      const jLon = rng() - rng();
      const nextZ = Math.max(-1, z - (dz * 2 * Math.PI * r) / s);
      latDeg += jitter * jLat * (latDeg - (dmath.asin(nextZ) * 180) / Math.PI);
      lonDeg += jitter * jLon * (((s / r) * 180) / Math.PI);
    }

    const latR = (latDeg * Math.PI) / 180;
    const lonR = (lonDeg * Math.PI) / 180;
    r_xyz[3 * k] = dmath.cos(latR) * dmath.cos(lonR);
    r_xyz[3 * k + 1] = dmath.cos(latR) * dmath.sin(lonR);
    r_xyz[3 * k + 2] = dmath.sin(latR);

    lng += dlong;
  }
  return r_xyz;
}

/** Stereographic projection from (0,0,1), for Delaunay on a sphere. */
export function stereographicProjection(r_xyz: PointArray, N: number): Float64Array {
  const flat = new Float64Array(2 * N);
  for (let i = 0; i < N; i++) {
    const z = r_xyz[3 * i + 2]!;
    // Clamp so a jittered point on the projection pole does not give Infinity; addPoleToMesh fixes connectivity.
    const denom = Math.max(1e-12, 1 - z);
    flat[2 * i] = r_xyz[3 * i]! / denom;
    flat[2 * i + 1] = r_xyz[3 * i + 1]! / denom;
  }
  return flat;
}

/** Close the mesh by connecting hull edges to the pole region. */
export function addPoleToMesh(poleId: number, triangles: Uint32Array | Int32Array, halfedges: Int32Array): { triangles: Int32Array; halfedges: Int32Array } {
  const numSides = triangles.length;
  const next = (s: number) => (s % 3 === 2 ? s - 2 : s + 1);

  let numUnpaired = 0;
  let firstUnpaired = -1;
  const pointToSide: number[] = [];
  for (let s = 0; s < numSides; s++) {
    if (halfedges[s] === -1) {
      numUnpaired++;
      pointToSide[triangles[s]!] = s;
      firstUnpaired = s;
    }
  }

  const nt = new Int32Array(numSides + 3 * numUnpaired);
  const nh = new Int32Array(numSides + 3 * numUnpaired);
  nt.set(triangles);
  nh.set(halfedges);

  for (let i = 0, s = firstUnpaired; i < numUnpaired; i++, s = pointToSide[nt[next(s)]!]!) {
    const ns = numSides + 3 * i;
    nh[s] = ns;
    nh[ns] = s;
    nt[ns] = nt[next(s)]!;
    nt[ns + 1] = nt[s]!;
    nt[ns + 2] = poleId;
    const k = numSides + ((3 * i + 4) % (3 * numUnpaired));
    nh[ns + 2] = k;
    nh[k] = ns + 2;
  }

  return { triangles: nt, halfedges: nh };
}

export interface Topology {
  triangles: Int32Array;
  halfedges: Int32Array;
  numRegions: number;
  adjOffset: Int32Array;
  adjList: Int32Array;
  adjTriList: Int32Array;
}

/** Dual-mesh topology: CSR neighbour regions and neighbour triangles per region (orogen's SphereMesh constructor). */
export function buildTopology(triangles: Int32Array, halfedges: Int32Array, numRegions: number): Topology {
  const next = (s: number) => (s % 3 === 2 ? s - 2 : s + 1);
  const numSides = triangles.length;
  const r_s = new Int32Array(numRegions).fill(-1);
  for (let s = 0; s < numSides; s++) {
    const r = triangles[s]!;
    if (r_s[r] === -1) r_s[r] = s;
  }
  const adjCount = new Int32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    const s0 = r_s[r]!;
    if (s0 === -1) continue;
    let s = s0;
    do {
      adjCount[r]!++;
      s = next(halfedges[s]!);
    } while (s !== s0);
  }
  const adjOffset = new Int32Array(numRegions + 1);
  for (let r = 0; r < numRegions; r++) adjOffset[r + 1] = adjOffset[r]! + adjCount[r]!;
  const total = adjOffset[numRegions]!;
  const adjList = new Int32Array(total);
  const adjTriList = new Int32Array(total);
  for (let r = 0; r < numRegions; r++) {
    const s0 = r_s[r]!;
    if (s0 === -1) continue;
    let s = s0;
    let idx = adjOffset[r]!;
    do {
      adjList[idx] = triangles[next(s)]!; // s_end_r
      adjTriList[idx] = (s / 3) | 0; // s_inner_t
      idx++;
      s = next(halfedges[s]!);
    } while (s !== s0);
  }
  return { triangles, halfedges, numRegions, adjOffset, adjList, adjTriList };
}

export interface BuildOptions {
  N: number;
  jitter: number;
  /** Draws jitter exactly as orogen does: two rng() pairs per point, in point order. */
  rng: () => number;
  precision?: Precision;
}

/** Canonical mesh (ARCHITECTURE §3.1). Region N is the closure cell, located at (0°N, 0°E) after the permutation. */
export class SphereMesh implements Topology {
  readonly triangles: Int32Array;
  readonly halfedges: Int32Array;
  readonly numRegions: number;
  readonly adjOffset: Int32Array;
  readonly adjList: Int32Array;
  readonly adjTriList: Int32Array;
  /** Cell centres, canonical frame (+Z north), Float64. Length 3 * numRegions. */
  readonly points: Float64Array;
  readonly precision: Precision;
  private _circ?: Float64Array;
  private _area?: Float64Array;

  constructor(points: Float64Array, topo: Topology, precision: Precision) {
    this.points = points;
    this.precision = precision;
    this.triangles = topo.triangles;
    this.halfedges = topo.halfedges;
    this.numRegions = topo.numRegions;
    this.adjOffset = topo.adjOffset;
    this.adjList = topo.adjList;
    this.adjTriList = topo.adjTriList;
  }

  get numTriangles(): number { return (this.triangles.length / 3) | 0; }

  /** Jittered Fibonacci–Voronoi mesh, as orogen's buildSphere, then the F1 axis permutation. */
  static build(opts: BuildOptions): SphereMesh {
    const { N, jitter, rng } = opts;
    const precision = opts.precision ?? 'f32';
    const r_xyz = generateFibonacciSphere(N, jitter, rng, precision);
    const flat = stereographicProjection(r_xyz, N);
    const delaunay = new Delaunator(flat);

    const withPole: PointArray = precision === 'f32' ? new Float32Array(3 * (N + 1)) : new Float64Array(3 * (N + 1));
    withPole.set(r_xyz);
    withPole[3 * N] = 0;
    withPole[3 * N + 1] = 0;
    withPole[3 * N + 2] = 1;

    const closed = addPoleToMesh(N, delaunay.triangles, delaunay.halfedges);
    const topo = buildTopology(closed.triangles, closed.halfedges, N + 1);
    return new SphereMesh(orogenToCanonical(withPole) as Float64Array, topo, precision);
  }

  /** Cell centres in orogen's physics frame at the mesh precision (inverse of the F1 permutation). */
  orogenPoints(): Float32Array | Float64Array {
    const out = this.precision === 'f32' ? new Float32Array(this.points.length) : new Float64Array(this.points.length);
    const p = this.points;
    for (let i = 0; i < p.length; i += 3) {
      out[i] = p[i + 1]!; // x_o = Y
      out[i + 1] = p[i + 2]!; // y_o = Z
      out[i + 2] = p[i]!; // z_o = X
    }
    return out;
  }

  /** Euclidean distance to each neighbour, indexed like adjList (orogen computeNeighborDist, Float32). */
  neighborDist(): Float32Array {
    const { adjOffset, adjList, points: p } = this;
    const out = new Float32Array(adjList.length);
    for (let r = 0; r < this.numRegions; r++) {
      const x = p[3 * r]!, y = p[3 * r + 1]!, z = p[3 * r + 2]!;
      for (let i = adjOffset[r]!; i < adjOffset[r + 1]!; i++) {
        const nb = adjList[i]!;
        const dx = x - p[3 * nb]!, dy = y - p[3 * nb + 1]!, dz = z - p[3 * nb + 2]!;
        out[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }
    return out;
  }

  /** Voronoi vertices: unit circumcentres of the Delaunay triangles, on the same side as the triangle. */
  get circumcentres(): Float64Array {
    if (this._circ) return this._circ;
    const p = this.points, T = this.triangles;
    const out = new Float64Array(this.numTriangles * 3);
    for (let t = 0; t < this.numTriangles; t++) {
      const a = 3 * T[3 * t]!, b = 3 * T[3 * t + 1]!, c = 3 * T[3 * t + 2]!;
      const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = dmath.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const side = nx * (p[a]! + p[b]! + p[c]!) + ny * (p[a + 1]! + p[b + 1]! + p[c + 1]!) + nz * (p[a + 2]! + p[b + 2]! + p[c + 2]!);
      const sgn = side < 0 ? -1 : 1;
      out[3 * t] = sgn * nx; out[3 * t + 1] = sgn * ny; out[3 * t + 2] = sgn * nz;
    }
    this._circ = out;
    return out;
  }

  /** Barycentric dual area per cell in steradians: one third of each incident spherical triangle. Sums to 4π. */
  get cellArea_sr(): Float64Array {
    if (this._area) return this._area;
    const p = this.points, T = this.triangles;
    const area = new Float64Array(this.numRegions);
    for (let t = 0; t < T.length; t += 3) {
      const a = 3 * T[t]!, b = 3 * T[t + 1]!, c = 3 * T[t + 2]!;
      const ax = p[a]!, ay = p[a + 1]!, az = p[a + 2]!;
      const bx = p[b]!, by = p[b + 1]!, bz = p[b + 2]!;
      const cx = p[c]!, cy = p[c + 1]!, cz = p[c + 2]!;
      const trip = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
      const den = 1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az);
      const E = 2 * dmath.atan2(Math.abs(trip), den);
      area[T[t]!]! += E / 3;
      area[T[t + 1]!]! += E / 3;
      area[T[t + 2]!]! += E / 3;
    }
    this._area = area;
    return area;
  }
}
