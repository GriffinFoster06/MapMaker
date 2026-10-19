// Vector path (ARCHITECTURE §3.7, "Vector path: forward projection through d3"). Original shell code around d3-geo.
// Geometry is built on the sphere and handed to d3.geoPath as GeoJSON in degrees, so d3 does the adaptive great-circle
// resampling, antimeridian cutting and clip-circle/extent handling; nothing is stored projected. The d3 functions come
// from the view's own module set (spec.d3), so an exact view draws with the dmath-backed copy and a stock view with
// native math.
//
//   graticule   d3.geoGraticule at a given step, plus the sphere outline;
//   coastlines  closed loops along the Voronoi edges between land and sea cells (exact cell boundaries, not a contour):
//               each Delaunay triangle with land and sea vertices has exactly one land→sea halfedge, whose dual Voronoi
//               edge runs from the triangle's circumcentre to its neighbour's across that halfedge; following those
//               edges visits each coastal triangle once and closes every loop;
//   tissot      true indicatrices: geoCircle small circles of fixed angular radius at graticule nodes, plus the
//               ellipse's principal axes as geodesic segments along the principal directions of J' (distortion.ts),
//               of angular length r each way, so they project onto the axes of the indicatrix.
import type { GeoPath, GeoPermissibleObjects } from 'd3-geo';
import type { Feature, LineString, MultiLineString, Polygon } from 'geojson';
import { type SphereMesh, dmath } from '@mapmaker/core';
import { distortion, jacobian } from './distortion';
import type { ProjectionView } from './view';

const RAD = Math.PI / 180;

/** Degrees of a unit vector (canonical frame). */
export function lonLat(x: number, y: number, z: number): [number, number] {
  return [dmath.atan2(y, x) / RAD, dmath.atan2(z, Math.sqrt(x * x + y * y)) / RAD];
}

/** d3.geoPath for the view (its projection, its d3 module set). `digits` is d3's output precision. */
export function pathFor(view: ProjectionView, digits = 3): GeoPath<unknown, GeoPermissibleObjects> {
  return view.spec.d3.geo.geoPath(view.projection).digits(digits);
}

/** Graticule lines every `step` degrees (meridians stop short of the poles as d3's do, at ±(90 − ε)). */
export function graticule(view: ProjectionView, step = 10): MultiLineString {
  return view.spec.d3.geo.geoGraticule().step([step, step]).extentMinor([[-180, -90 + 1e-6], [180, 90 - 1e-6]])();
}

/** Coastline loops: Voronoi vertices (triangle ids) in order, each loop closed (first id repeated at the end). */
export function coastLoops(mesh: SphereMesh, isLand: (cell: number) => boolean): Int32Array[] {
  const T = mesh.triangles, H = mesh.halfedges, nt = mesh.numTriangles;
  const land = new Uint8Array(mesh.numRegions);
  for (let i = 0; i < mesh.numRegions; i++) land[i] = isLand(i) ? 1 : 0;
  // Per triangle, its land→sea halfedge, or −1.
  const out = new Int32Array(nt).fill(-1);
  for (let e = 0; e < T.length; e++) {
    const next = e % 3 === 2 ? e - 2 : e + 1;
    if (land[T[e]!] && !land[T[next]!]) out[(e / 3) | 0] = e;
  }
  const seen = new Uint8Array(nt);
  const loops: Int32Array[] = [];
  const buf: number[] = [];
  for (let t0 = 0; t0 < nt; t0++) {
    if (out[t0]! < 0 || seen[t0]) continue;
    buf.length = 0;
    let t = t0;
    while (!seen[t]) {
      seen[t] = 1;
      buf.push(t);
      t = (H[out[t]!]! / 3) | 0;
      if (out[t]! < 0) throw new Error(`coastLoops: open coastline at triangle ${t}`);
    }
    if (t !== t0) throw new Error(`coastLoops: loop from triangle ${t0} closed at ${t}`);
    buf.push(t0);
    loops.push(Int32Array.from(buf));
  }
  return loops;
}

/** Coastlines as GeoJSON (degrees), one closed LineString per loop; edges between vertices are great-circle arcs. */
export function coastlines(mesh: SphereMesh, isLand: (cell: number) => boolean): MultiLineString {
  const c = mesh.circumcentres;
  return {
    type: 'MultiLineString',
    coordinates: coastLoops(mesh, isLand).map((loop) => Array.from(loop, (t) => lonLat(c[3 * t]!, c[3 * t + 1]!, c[3 * t + 2]!))),
  };
}

/** Point at angular distance r (radians) from (lon, lat) along azimuth θ measured from east towards north. */
export function geodesicPoint(lon: number, lat: number, theta: number, r: number): [number, number] {
  const l = lon * RAD, f = lat * RAD;
  const cl = dmath.cos(l), sl = dmath.sin(l), cf = dmath.cos(f), sf = dmath.sin(f);
  const ct = dmath.cos(theta), st = dmath.sin(theta), cr = dmath.cos(r), sr = dmath.sin(r);
  // p cos r + (cos θ · east + sin θ · north) sin r.
  const x = cf * cl * cr + (ct * -sl + st * -sf * cl) * sr;
  const y = cf * sl * cr + (ct * cl + st * -sf * sl) * sr;
  const z = sf * cr + st * cf * sr;
  return lonLat(x, y, z);
}

/**
 * Principal directions of J' at a point: azimuths (radians from east towards north) of the directions stretched by a
 * and by b, from the eigenvectors of J'ᵀJ'. Null where the projection is not differentiable (a line or cusp raw pole)
 * or the point is outside the domain; θ_b = θ_a + π/2. For a ≈ b (conformal) the direction is arbitrary and θ_a = 0.
 */
export function principalAxes(view: ProjectionView, lon: number, lat: number): { thetaA: number; a: number; b: number } | null {
  const d = distortion(view, lon, lat);
  if (d.outside || d.poleLimit || d.singular) return null;
  const [xe, ye, xn, yn] = jacobian(view, lon, lat, view.toRaw([lon, lat])[0]);
  // J'ᵀJ' = [[p, q], [q, s]]; the eigenvector of the larger eigenvalue is at angle ½·atan2(2q, p − s).
  const p = xe * xe + ye * ye, q = xe * xn + ye * yn, s = xn * xn + yn * yn;
  const thetaA = 0.5 * dmath.atan2(2 * q, p - s);
  return { thetaA, a: d.a, b: d.b };
}

export interface TissotOptions {
  /** Spacing of the nodes in degrees (graticule nodes from the equator and the prime meridian). Default 30. */
  step?: number;
  /** Angular radius of each small circle, degrees. Default 5. */
  radius?: number;
  /** Include the poles as nodes. Default true. */
  poles?: boolean;
}

export interface TissotIndicatrix {
  centre: [number, number];
  /** The geodesic small circle (d3 geoCircle), a closed polygon on the sphere. */
  circle: Polygon;
  /** The two principal axes as geodesic segments through the centre (absent where J' is undefined). */
  axes: LineString[];
}

/** Tissot indicatrices at graticule nodes inside the view's domain (centre in the domain). */
export function tissot(view: ProjectionView, opts: TissotOptions = {}): TissotIndicatrix[] {
  const step = opts.step ?? 30, radius = opts.radius ?? 5, r = radius * RAD;
  const nodes: [number, number][] = [];
  for (let lat = -90 + step; lat < 90 - 1e-9; lat += step) for (let lon = -180; lon < 180 - 1e-9; lon += step) nodes.push([lon, lat]);
  if (opts.poles ?? true) nodes.push([0, 90], [0, -90]);
  // precision is the step around the circle, in degrees of azimuth: 128 vertices; d3.geoPath resamples adaptively.
  const circle = view.spec.d3.geo.geoCircle().radius(radius).precision(360 / 128);
  const out: TissotIndicatrix[] = [];
  for (const [lon, lat] of nodes) {
    if (!view.inDomain(lon, lat)) continue;
    const ax = principalAxes(view, lon, lat);
    const axes: LineString[] = ax
      ? [ax.thetaA, ax.thetaA + Math.PI / 2].map((t) => ({ type: 'LineString', coordinates: [geodesicPoint(lon, lat, t + Math.PI, r), [lon, lat], geodesicPoint(lon, lat, t, r)] }))
      : [];
    out.push({ centre: [lon, lat], circle: circle.center([lon, lat])(), axes });
  }
  return out;
}

/** Tissot indicatrices as GeoJSON features (circles and axes), for geoPath. */
export function tissotFeatures(ind: TissotIndicatrix[]): { circles: Feature<Polygon>[]; axes: Feature<LineString>[] } {
  return {
    circles: ind.map((t) => ({ type: 'Feature', properties: { centre: t.centre }, geometry: t.circle })),
    axes: ind.flatMap((t) => t.axes.map((g) => ({ type: 'Feature' as const, properties: { centre: t.centre }, geometry: g }))),
  };
}
