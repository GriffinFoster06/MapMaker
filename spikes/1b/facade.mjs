// Spike 1b — minimal sphere-backed PackedGraph facade for Azgaar's generators.
// One sphere mesh serves as both `grid` and `pack` (cells.g[i] = i).
// Planar fields (cells.p, vertices.p) are equirectangular "pixels" of a
// W×H graph; they are only used by Azgaar for geometry it draws (feature
// polygons, meanders, havens), not for flow routing.
import { elevToHeightKmAt } from './units.mjs';

export const GRAPH_W = 3600, GRAPH_H = 1800;   // 0.1° per "pixel"

const toPx = (x, y, z) => {           // orogen frame: lat = asin(y), lon = atan2(x, z)
  const lat = Math.asin(Math.max(-1, Math.min(1, y))), lon = Math.atan2(x, z);
  return [(lon + Math.PI) / (2 * Math.PI) * GRAPH_W, (Math.PI / 2 - lat) / Math.PI * GRAPH_H];
};

/**
 * Build Azgaar `grid`, `pack`, `options` globals from an orogen result.
 * Mapping (documented scales, from spikes/1b/azgaar-native-scales.json):
 *   h     : metres → Azgaar 0–100 (sea level 20, height exponent 2: m = (h − 18)²)
 *   prec  : orogen normalised annual precip (95th pct ≈ 1) × PREC_SCALE → Uint8
 *   temp  : mean of orogen summer/winter °C → Int8
 *   area  : cell area in km²
 *   cells.b: all 0 on a closed sphere, except ONE deep-ocean cell flagged as
 *            "border" so Azgaar classifies the world ocean as type "ocean".
 */
export function buildFacade(Voronoi, r, { seed = 'mapmaker-1b', PREC_SCALE = 45 } = {}) {
  const nR = r.numRegions, xyz = r.r_xyz;
  const points = new Array(nR);
  for (let i = 0; i < nR; i++) points[i] = toPx(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]);
  const { cells, vertices } = new Voronoi({ triangles: r.triangles, halfedges: r.halfedges }, points, nR);
  cells.i = Uint32Array.from({ length: nR }, (_, i) => i);

  // Voronoi vertices: spherical circumcentre of each triangle, then to "pixels".
  const T = r.triangles;
  for (let t = 0; t < T.length / 3; t++) {
    const a = 3 * T[3 * t], b = 3 * T[3 * t + 1], c = 3 * T[3 * t + 2];
    const abx = xyz[b] - xyz[a], aby = xyz[b + 1] - xyz[a + 1], abz = xyz[b + 2] - xyz[a + 2];
    const acx = xyz[c] - xyz[a], acy = xyz[c + 1] - xyz[a + 1], acz = xyz[c + 2] - xyz[a + 2];
    let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    if (nx * xyz[a] + ny * xyz[a + 1] + nz * xyz[a + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    vertices.p[t] = toPx(nx / len, ny / len, nz / len);
  }

  const h = new Uint8Array(nR), prec = new Uint8Array(nR), temp = new Int8Array(nR), area = new Float32Array(nR);
  let deepest = 0;
  for (let i = 0; i < nR; i++) {
    const m = elevToHeightKmAt(r.r_elevation[i]) * 1000;
    h[i] = m > 0 ? Math.min(100, Math.max(20, Math.round(18 + Math.sqrt(m)))) : Math.max(0, Math.min(19, Math.round(20 + m / 300)));
    if (r.r_elevation[i] < r.r_elevation[deepest]) deepest = i;
    const p = (r.r_precip_summer[i] + r.r_precip_winter[i]) / 2;
    prec[i] = Math.max(0, Math.min(255, Math.round(p * PREC_SCALE)));
    temp[i] = Math.max(-128, Math.min(127, Math.round((r.r_temperature_summer[i] + r.r_temperature_winter[i]) / 2)));
  }
  // cell area (km²): 1/3 of each incident spherical triangle
  for (let t = 0; t < T.length; t += 3) {
    const v = [T[t], T[t + 1], T[t + 2]].map((k) => [xyz[3 * k], xyz[3 * k + 1], xyz[3 * k + 2]]);
    const [A, B, C] = v;
    const trip = A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
    const den = 1 + A[0] * B[0] + A[1] * B[1] + A[2] * B[2] + B[0] * C[0] + B[1] * C[1] + B[2] * C[2] + C[0] * A[0] + C[1] * A[1] + C[2] * A[2];
    const E = 2 * Math.atan2(Math.abs(trip), den) * 6371 * 6371 / 3;
    area[T[t]] += E; area[T[t + 1]] += E; area[T[t + 2]] += E;
  }
  cells.b = new Uint8Array(nR);
  cells.b[deepest] = 1;
  Object.assign(cells, { p: points, h, area, g: cells.i, culture: new Uint16Array(nR) });

  globalThis.grid = { cells: { i: cells.i, h, c: cells.c, b: cells.b, prec, temp }, points, features: [] };
  globalThis.pack = { cells, vertices, features: [], rivers: [], cultures: [] };
  globalThis.options = {
    map: { seed, graph: { width: GRAPH_W, height: GRAPH_H, points: nR }, units: { height: { exponent: 2 } } },
    generation: { resolveDepressionsSteps: 250, lakeElevationLimit: 20 },
  };
  globalThis.Names = { getCulture: () => 'River' };
  return { deepest, h, prec, temp };
}
