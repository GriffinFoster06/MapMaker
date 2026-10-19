// Vector path (vector.ts, svg.ts): graticule, exact coastlines along land/sea cell edges, Tissot indicatrices, with
// the pole and antimeridian cases of §3.7.
import { describe, expect, it } from 'vitest';
import { OrogenLcg, SphereMesh, dmath } from '@mapmaker/core';
import {
  PROJECTIONS, ProjectionView, coastLoops, coastlines, distortion, geodesicPoint, graticule, lonLat, pathFor, tissot,
} from './index';
import { exactView, exportSvg } from './exact';

const RAD = Math.PI / 180;
const rng = new OrogenLcg('mesh', 11);
const M = SphereMesh.build({ N: 8000, jitter: 0.75, rng: () => rng.next(), precision: 'f64' });
const P = M.points;
const SPACING = Math.sqrt((4 * Math.PI) / M.numRegions); // typical cell spacing, radians

/** Subpaths of an SVG path string as point lists (d3 emits only M, L, Z and arcs for points; no arcs here). */
function subpaths(d: string): [number, number][][] {
  return d.split('M').filter(Boolean).map((s) => s.replace(/Z/g, '').split('L').map((q) => q.split(',').map(Number) as [number, number]));
}
const finite = (d: string) => subpaths(d).every((s) => s.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));

describe('graticule', () => {
  it('projects to finite paths in every projection, and its meridians reach the poles', () => {
    const g = graticule(new ProjectionView({ projection: 'equirectangular', width: 360, height: 180 }), 10);
    const lats = g.coordinates.flat().map((c) => c[1]!);
    expect(Math.max(...lats)).toBeGreaterThan(89.99);
    expect(Math.min(...lats)).toBeLessThan(-89.99);
    for (const s of PROJECTIONS) {
      const v = new ProjectionView({ projection: s.id, width: 400, height: 200, rotate: [30, -20, 0] });
      const d = pathFor(v)(graticule(v, 15))!;
      expect(d.length, s.id).toBeGreaterThan(100);
      expect(finite(d), s.id).toBe(true);
    }
  });
});

describe('coastlines', () => {
  const field = (i: number) => dmath.sin(5 * P[3 * i]!) + dmath.cos(4 * P[3 * i + 1]! + 1) * P[3 * i + 2]! - 0.2;

  it('are closed loops of Voronoi edges, one per land/sea Delaunay edge, each between a land and a sea cell', () => {
    const isLand = (i: number) => field(i) > 0;
    const loops = coastLoops(M, isLand);
    expect(loops.length).toBeGreaterThan(1);
    let landSeaEdges = 0;
    for (let e = 0; e < M.triangles.length; e++) {
      const n = e % 3 === 2 ? e - 2 : e + 1;
      if (isLand(M.triangles[e]!) && !isLand(M.triangles[n]!)) landSeaEdges++;
    }
    expect(loops.reduce((s, l) => s + l.length - 1, 0)).toBe(landSeaEdges);
    const T = M.triangles;
    for (const l of loops) {
      expect(l[0]).toBe(l[l.length - 1]);
      for (let k = 0; k + 1 < l.length; k++) {
        // Consecutive triangles share an edge with one land and one sea endpoint.
        const a = [T[3 * l[k]!], T[3 * l[k]! + 1], T[3 * l[k]! + 2]], b = new Set([T[3 * l[k + 1]!], T[3 * l[k + 1]! + 1], T[3 * l[k + 1]! + 2]]);
        const shared = a.filter((x) => b.has(x));
        expect(shared.length).toBe(2);
        expect(isLand(shared[0]!)).not.toBe(isLand(shared[1]!));
      }
    }
    // Each Voronoi vertex is equidistant from the cells of its triangle, so the line lies on the cell boundary.
    const c = M.circumcentres, t = loops[0]![0]!;
    const d = [0, 1, 2].map((j) => { const q = 3 * T[3 * t + j]!; return Math.hypot(P[q]! - c[3 * t]!, P[q + 1]! - c[3 * t + 1]!, P[q + 2]! - c[3 * t + 2]!); });
    expect(Math.max(...d) - Math.min(...d)).toBeLessThan(1e-12);
  });

  it('a polar ice cap gives one loop around the pole, drawn across the full width in equirectangular', () => {
    const lat0 = dmath.asin(0.8) / RAD;
    const g = coastlines(M, (i) => P[3 * i + 2]! > 0.8);
    expect(g.coordinates.length).toBe(1);
    for (const [, lat] of g.coordinates[0]!) expect(Math.abs(lat! - lat0)).toBeLessThan(SPACING / RAD);
    const v = new ProjectionView({ projection: 'equirectangular', width: 720, height: 360 });
    const pts = subpaths(pathFor(v)(g)!).flat();
    expect(Math.min(...pts.map((p) => p[0]))).toBeLessThan(5);
    expect(Math.max(...pts.map((p) => p[0]))).toBeGreaterThan(715);
    for (const [, y] of pts) expect(Math.abs(y - (90 - lat0) * 2)).toBeLessThan(2 * SPACING / RAD + 1e-9);
  });

  it('a continent across the antimeridian is cut there: no segment jumps across the map', () => {
    const g = coastlines(M, (i) => P[3 * i]! < -0.6); // cap centred on (0°, 180°)
    for (const id of ['equirectangular', 'mollweide', 'robinson']) {
      const v = exactView({ projection: id, width: 720, height: 360 });
      const s = subpaths(pathFor(v)(g)!);
      expect(s.length, id).toBeGreaterThanOrEqual(2);
      for (const sp of s) for (let k = 1; k < sp.length; k++) expect(Math.abs(sp[k]![0] - sp[k - 1]![0]), id).toBeLessThan(360);
    }
  });
});

describe('Tissot indicatrices', () => {
  const capArea = (r: number) => 2 * Math.PI * (1 - Math.cos(r * RAD));

  it('equal-area projections: every projected circle has the cap area, at the poles and on the antimeridian too', () => {
    for (const s of PROJECTIONS.filter((p) => p.equalArea)) {
      const v = exactView({ projection: s.id, width: 800, height: 400 });
      const ind = tissot(v, { step: 30, radius: 5 });
      expect(ind.some((t) => t.centre[0] === -180), s.id).toBe(true);
      expect(ind.some((t) => Math.abs(t.centre[1]) === 90), s.id).toBe(true);
      const area = v.spec.d3.geo.geoPath(v.projection).area;
      for (const t of ind) {
        // geoPath.area is in px²; the projected area is the cap's (sr) times scale². Within 1%: the residual is d3's
        // resampling of the clipped edge at the export tolerance (measured worst 0.6%, Mollweide's cusp poles).
        expect(Math.abs(area(t.circle) / (capArea(5) * v.scale * v.scale) - 1), `${s.id} at ${t.centre}`).toBeLessThan(0.01);
      }
    }
  });

  it('the axes run along the principal directions with lengths a·r and b·r (equirectangular, Mercator, sinusoidal)', () => {
    const r = 0.5;
    for (const [id, lon, lat] of [['equirectangular', 20, 60], ['mercator', -40, 50], ['sinusoidal', 120, 40], ['equalEarth', 170, -60]] as const) {
      const v = exactView({ projection: id, width: 800, height: 400 });
      const t = tissot(v, { step: 10, radius: r, poles: false }).find((x) => x.centre[0] === lon && x.centre[1] === lat)!;
      const d = distortion(v, lon, lat);
      if (d.outside) throw new Error('outside');
      const len = t.axes.map((ax) => {
        const [p, q] = [v.forward(...(ax.coordinates[0] as [number, number]))!, v.forward(...(ax.coordinates[2] as [number, number]))!];
        return Math.hypot(p[0] - q[0], p[1] - q[1]) / (2 * r * RAD * v.scale);
      });
      expect(len[0]! / d.a, id).toBeCloseTo(1, 2);
      expect(len[1]! / d.b, id).toBeCloseTo(1, 2);
      // The axes are perpendicular in the image.
      const vec = t.axes.map((ax) => { const p = v.forward(...(ax.coordinates[0] as [number, number]))!, q = v.forward(...(ax.coordinates[2] as [number, number]))!; return [q[0] - p[0], q[1] - p[1]]; });
      const cos = (vec[0]![0]! * vec[1]![0]! + vec[0]![1]! * vec[1]![1]!) / (Math.hypot(vec[0]![0]!, vec[0]![1]!) * Math.hypot(vec[1]![0]!, vec[1]![1]!));
      expect(Math.abs(cos), id).toBeLessThan(0.02);
    }
  });

  it('at a line or cusp pole the circle is drawn and the axes are omitted; at a point pole both are drawn (h = k = 1)', () => {
    for (const id of ['equirectangular', 'mollweide', 'equalEarth']) {
      const v = exactView({ projection: id, width: 800, height: 400 });
      const pole = tissot(v, { step: 90, radius: 5 }).filter((t) => Math.abs(t.centre[1]) === 90);
      expect(pole.length, id).toBe(2);
      for (const t of pole) {
        expect(t.axes, id).toEqual([]);
        const d = pathFor(v)(t.circle)!;
        expect(d.length).toBeGreaterThan(20);
        expect(finite(d)).toBe(true);
      }
    }
    const o = exactView({ projection: 'azimuthalEquidistant', width: 401, height: 401, rotate: [0, -90, 0] });
    const t = tissot(o, { step: 90, radius: 2 }).find((x) => x.centre[1] === 90)!;
    expect(t.axes.length).toBe(2);
    for (const ax of t.axes) {
      const p = o.forward(...(ax.coordinates[0] as [number, number]))!, q = o.forward(...(ax.coordinates[2] as [number, number]))!;
      expect(Math.hypot(p[0] - q[0], p[1] - q[1]) / (2 * 2 * RAD * o.scale)).toBeCloseTo(1, 6);
    }
  });

  it('Mercator excludes the pole nodes; nodes outside an orthographic hemisphere are skipped', () => {
    expect(tissot(exactView({ projection: 'mercator', width: 400, height: 400 }), { step: 30 }).some((t) => Math.abs(t.centre[1]) === 90)).toBe(false);
    const o = exactView({ projection: 'orthographic', width: 400, height: 400 });
    expect(tissot(o, { step: 30 }).every((t) => o.inDomain(t.centre[0], t.centre[1]))).toBe(true);
  });

  it('geodesicPoint moves r along the azimuth (east and north at the equator, across a pole)', () => {
    const e = geodesicPoint(10, 0, 0, 5 * RAD), n = geodesicPoint(10, 0, Math.PI / 2, 5 * RAD), over = geodesicPoint(30, 88, Math.PI / 2, 4 * RAD);
    expect(e[0]).toBeCloseTo(15, 12); expect(e[1]).toBeCloseTo(0, 12);
    expect(n[0]).toBeCloseTo(10, 12); expect(n[1]).toBeCloseTo(5, 12);
    expect(over[0]).toBeCloseTo(-150, 9); expect(over[1]).toBeCloseTo(88, 9);
    expect(lonLat(0, 0, 1)[1]).toBe(90);
  });
});

describe('SVG export', () => {
  it('is a well-formed document of finite paths, identical on repeat, for every projection', () => {
    const coast = coastlines(M, (i) => P[3 * i]! < -0.6);
    for (const s of PROJECTIONS) {
      const opts = { projection: s.id, width: 400, height: 200, rotate: [15, -25, 0] as [number, number, number] };
      const svg = exportSvg(opts, { graticule: 30, coastlines: coast, tissot: { step: 45, radius: 6 } });
      expect(svg.startsWith('<?xml')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      expect(svg, s.id).not.toMatch(/NaN|Infinity|undefined/);
      expect((svg.match(/<path /g) ?? []).length, s.id).toBeGreaterThan(3);
      expect(exportSvg(opts, { graticule: 30, coastlines: coast, tissot: { step: 45, radius: 6 } })).toBe(svg);
    }
  });
});
