// Comparison of GPU debug renders (packages/projection/src/gpu/glsl.ts, DebugMode 1 and 2) with the CPU path, in
// Node with float64: d3 invert through the stock ProjectionView, and MeshSampler's locateRaster/sampleRaster.
import { type LocatedRaster, type MeshSampler, type ProjectionView, type ViewOptions, lonLat, unitVector } from '@mapmaker/projection';

/** Measured maxima are in docs/DECISIONS_LOG.md (5-10); these bounds sit above them in every browser. */
export const GPU_TOLERANCES = {
  /**
   * Angle between the shader's direction and d3 invert's (radians). Largest where the projection compresses (the
   * orthographic limb, azimuthal antipodes, pole lines), where the same angle is a tiny on-screen displacement; the
   * visible measure is pxError.
   */
  angleRad: 1e-4,
  /** Displacement of the shader's point in screen pixels (d3 forward of it, minus the pixel centre), at zoom 1. */
  pxError: 0.02,
  /** The same at 16× zoom (the flat map's maximum). */
  pxErrorZoom16: 0.05,
  /** Fraction of inside pixels whose triangle differs from the CPU sampler's (each one must be explained, below). */
  triMismatchFrac: 0.001,
  /** Value error relative to the layer's range, where the triangle agrees (float32 values and weights, position). */
  valueRelErr: 5e-4,
} as const;

/** How close (in their own units) a domain rule must be to its boundary for an in/out difference to count as an edge. */
const EDGE = { px: 0.02, rad: 1e-5 };
/** Float32 noise allowances for "explained" lookup differences: normalised weight, and distance to a Voronoi edge (rad). */
const EDGE_WEIGHT = 1e-5;
const VORONOI_GAP = 1e-6;
const RAD = Math.PI / 180;

export interface ViewStats {
  view: ViewOptions;
  inside: number;
  angleRad: number;
  pxError: number;
  domainMismatch: number;
  domainMismatchNonEdge: number;
  nonEdgeExample?: string;
  triMismatchFrac: number;
  /** Triangle differences the shader's own point does not explain. */
  triUnexplained: number;
  cellMismatchFrac: number;
  cellUnexplained: number;
  valueRelErr: number;
  walkFlags: number;
  maxWalk: number;
}

const f32 = (u: number) => new Float32Array(new Uint32Array([u]).buffer)[0]!;

/** Whether a pixel lies within EDGE of a domain boundary of the view (in which case f32 may classify it either way). */
function nearEdge(view: ProjectionView, x: number, y: number): boolean {
  const ll = view.projection.invert?.([x, y]);
  if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return true; // the inverse itself breaks down here
  if (Math.abs(90 - Math.abs(ll[1])) * RAD < EDGE.rad) return true;
  const [, rlat] = view.toRaw(ll as [number, number]);
  if (Math.abs(90 - Math.abs(rlat)) * RAD < EDGE.rad) return true; // a raw pole: d3's own result there is rounding noise
  if (view.spec.maxRawLat !== undefined && Math.abs(Math.abs(rlat) * RAD - view.spec.maxRawLat) < EDGE.rad) return true;
  if (view.clipAngle !== null) {
    const centre = view.toRaw.invert([0, 0]) as [number, number];
    const d = view.spec.d3.geo.geoDistance(ll as [number, number], centre);
    if (Math.abs(d - view.clipAngle * RAD) < EDGE.rad) return true;
  }
  const xy = view.projection(ll as [number, number]);
  return !!xy && Math.abs(Math.hypot(xy[0] - x, xy[1] - y) - 0.5) < EDGE.px;
}

export function compareGeo(view: ProjectionView, geo: Uint32Array): Pick<ViewStats, 'inside' | 'angleRad' | 'pxError' | 'domainMismatch' | 'domainMismatchNonEdge' | 'nonEdgeExample'> {
  const W = view.width, H = view.height, p = new Float64Array(3);
  let inside = 0, angle = 0, px = 0, mism = 0, nonEdge = 0, example: string | undefined;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = j * W + i, x = i + 0.5, y = j + 0.5;
    const g = geo[4 * o + 3] !== 0, ll = view.invert(x, y);
    if (g !== !!ll) {
      mism++;
      if (!nearEdge(view, x, y)) { nonEdge++; example ??= `pixel ${i},${j} gpu ${g ? 'in' : 'out'}`; }
      continue;
    }
    if (!ll) continue;
    inside++;
    const gx = f32(geo[4 * o]!), gy = f32(geo[4 * o + 1]!), gz = f32(geo[4 * o + 2]!), gn = Math.hypot(gx, gy, gz);
    const vx = gx / gn, vy = gy / gn, vz = gz / gn; // direction: the lookup is invariant to the vector's length
    unitVector(ll[0], ll[1], p);
    angle = Math.max(angle, Math.hypot(vx - p[0]!, vy - p[1]!, vz - p[2]!));
    // Displacement on screen: d3 forward of the shader's point against d3 forward of d3's own point (which is the
    // pixel centre except where d3 clamps, e.g. just outside the orthographic disc). At a raw pole every longitude is
    // the same point, so it is measured only away from one.
    if (Math.abs(90 - Math.abs(view.toRaw(ll)[1])) * RAD > 1e-6) {
      const q = view.projection(lonLat(vx, vy, vz)), r = view.projection(ll);
      if (q && r) px = Math.max(px, Math.hypot(q[0] - r[0], q[1] - r[1]));
    }
  }
  return { inside, angleRad: angle, pxError: px, domainMismatch: mism, domainMismatchNonEdge: nonEdge, ...(example ? { nonEdgeExample: example } : {}) };
}

export function compareSample(view: ProjectionView, geo: Uint32Array, smp: Uint32Array, loc: LocatedRaster, values: Float64Array, sampler: MeshSampler): Pick<ViewStats, 'triMismatchFrac' | 'triUnexplained' | 'cellMismatchFrac' | 'cellUnexplained' | 'valueRelErr' | 'walkFlags' | 'maxWalk'> {
  const n = view.width * view.height, mesh = sampler.mesh, P = mesh.points;
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (!Number.isNaN(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const range = hi - lo || 1;
  let both = 0, triMis = 0, triBad = 0, cellMis = 0, cellBad = 0, valErr = 0, flags = 0, maxWalk = 0;
  const w = new Float64Array(3);
  for (let o = 0; o < n; o++) {
    if (geo[4 * o + 3] === 0 || loc.tri[o]! < 0) continue;
    both++;
    const st = smp[4 * o + 2]!;
    if (st >>> 16) flags++;
    maxWalk = Math.max(maxWalk, st & 0xff);
    // The shader's own point, in float64.
    const gx = f32(geo[4 * o]!), gy = f32(geo[4 * o + 1]!), gz = f32(geo[4 * o + 2]!), gn = Math.hypot(gx, gy, gz);
    const x = gx / gn, y = gy / gn, z = gz / gn;
    const tg = geo[4 * o + 3]! - 1, tc = loc.tri[o]!;
    if (tg !== tc) {
      triMis++;
      // Explained when the shader's triangle contains the shader's point to within float32 noise of an edge.
      if (sampler.locator.bary(tg, x, y, z, w) < -EDGE_WEIGHT) triBad++;
    } else {
      valErr = Math.max(valErr, Math.abs(f32(smp[4 * o]!) - values[o]!) / range);
    }
    const cg = smp[4 * o + 1]! - 1, cc = loc.cell[o]!;
    if (cg !== cc) {
      cellMis++;
      // Explained when the shader's cell is the nearest to the shader's point, to within float32 noise.
      const d = (c: number) => Math.hypot(P[3 * c]! - x, P[3 * c + 1]! - y, P[3 * c + 2]! - z);
      if (d(cg) - d(sampler.index.nearestCell(x, y, z)) > VORONOI_GAP) cellBad++;
    }
  }
  return { triMismatchFrac: both ? triMis / both : 0, triUnexplained: triBad, cellMismatchFrac: both ? cellMis / both : 0, cellUnexplained: cellBad, valueRelErr: valErr, walkFlags: flags, maxWalk };
}
