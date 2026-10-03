// Spike 1a — F1: axis convention + the mesh-construction seam.
// orogen builds the Fibonacci sphere around +z and closes it with an extra
// "pole" region N at (0,0,1); physics treats +y as north. So the closure cell
// sits on the physical equator at 0°E, and the spiral's other end (0,0,-1)
// sits at 0°N 180°E. This script checks the permutation and looks for
// artifacts at both spots. Usage: node axis-seam.mjs [N] [seeds...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOrogen, orogenModule } from '../lib/orogen.mjs';
const { SphereMesh } = await orogenModule('sphere-mesh.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = +(process.argv[2] ?? 200000);
const seeds = process.argv.slice(3).map(Number);
if (!seeds.length) seeds.push(12345, 777, 4242, 9001, 31337);

const FIELDS = ['r_elevation', 'r_precip_summer', 'r_precip_winter', 'r_temperature_summer', 'r_temperature_winter', 'r_wind_east_summer', 'r_plate'];
const runs = [];
for (const seed of seeds) {
  const r = runOrogen({ N, seed });
  const nR = r.numRegions, xyz = r.r_xyz;
  const mesh = new SphereMesh(r.triangles, r.halfedges, nR);
  const { adjOffset, adjList } = mesh;
  const seam = nR - 1;
  // Fibonacci's far end: the region nearest the construction -z pole (0,0,-1).
  let south = 0, best = 2;
  for (let i = 0; i < nR; i++) if (xyz[3 * i + 2] < best) { best = xyz[3 * i + 2]; south = i; }

  // Permutation check: canonical (X,Y,Z) = (z_o, x_o, y_o)
  let maxLatErr = 0, maxLonErr = 0;
  for (let i = 0; i < nR; i++) {
    const xo = xyz[3 * i], yo = xyz[3 * i + 1], zo = xyz[3 * i + 2];
    const X = zo, Y = xo, Z = yo;
    const latO = Math.asin(Math.max(-1, Math.min(1, yo))), lonO = Math.atan2(xo, zo);
    const latC = Math.asin(Math.max(-1, Math.min(1, Z))), lonC = Math.atan2(Y, X);
    maxLatErr = Math.max(maxLatErr, Math.abs(latO - latC)); maxLonErr = Math.max(maxLonErr, Math.abs(lonO - lonC));
  }
  const latlon = (i) => [Math.asin(xyz[3 * i + 1]) * 180 / Math.PI, Math.atan2(xyz[3 * i], xyz[3 * i + 2]) * 180 / Math.PI];

  // Dual (barycentric) cell area: 1/3 of each incident spherical triangle.
  const area = new Float64Array(nR);
  const T = r.triangles;
  const v = (i) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
  for (let t = 0; t < T.length; t += 3) {
    const a = v(T[t]), b = v(T[t + 1]), c = v(T[t + 2]);
    const trip = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    const den = 1 + (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) + (b[0] * c[0] + b[1] * c[1] + b[2] * c[2]) + (c[0] * a[0] + c[1] * a[1] + c[2] * a[2]);
    const E = 2 * Math.atan2(Math.abs(trip), den);
    for (let k = 0; k < 3; k++) area[T[t + k]] += E / 3;
  }
  const meanArea = 4 * Math.PI / nR;
  const deg = (i) => adjOffset[i + 1] - adjOffset[i];
  const nnDist = (i) => { let m = 9; for (let k = adjOffset[i]; k < adjOffset[i + 1]; k++) { const j = adjList[k]; m = Math.min(m, Math.acos(Math.min(1, xyz[3 * i] * xyz[3 * j] + xyz[3 * i + 1] * xyz[3 * j + 1] + xyz[3 * i + 2] * xyz[3 * j + 2]))); } return m; };
  const degs = Array.from({ length: nR }, (_, i) => deg(i)).sort((a, b) => a - b);
  const nnAll = []; for (let i = 0; i < nR; i += 7) nnAll.push(nnDist(i)); nnAll.sort((a, b) => a - b);

  // Roughness: |f - mean(neighbours)| normalised by the field's global std,
  // percentile of the seam cell within the equatorial band |lat|<5°.
  const roughPct = {};
  for (const f of FIELDS) {
    const F = f === 'r_plate' ? null : r[f];
    const band = [], rough = new Float64Array(nR);
    for (let i = 0; i < nR; i++) {
      if (f === 'r_plate') { let diff = 0; for (let k = adjOffset[i]; k < adjOffset[i + 1]; k++) diff += r.r_plate[adjList[k]] !== r.r_plate[i]; rough[i] = diff / deg(i); }
      else { let s = 0; for (let k = adjOffset[i]; k < adjOffset[i + 1]; k++) s += F[adjList[k]]; rough[i] = Math.abs(F[i] - s / deg(i)); }
      if (Math.abs(xyz[3 * i + 1]) < Math.sin(5 * Math.PI / 180)) band.push(rough[i]);
    }
    band.sort((a, b) => a - b);
    const pct = (x) => { let lo = 0, hi = band.length; while (lo < hi) { const m = (lo + hi) >> 1; if (band[m] < x) lo = m + 1; else hi = m; } return +(100 * lo / band.length).toFixed(1); };
    roughPct[f] = { seam: pct(rough[seam]), south: pct(rough[south]) };
  }
  runs.push({
    seed, numRegions: nR, seamIndex: seam,
    seamXYZ_orogen: Array.from(v(seam)), seamLatLon: latlon(seam), southIndex: south, southLatLon: latlon(south),
    permutation: { maxLatErrRad: maxLatErr, maxLonErrRad: maxLonErr },
    degree: { seam: deg(seam), south: deg(south), min: degs[0], p50: degs[nR >> 1], p999: degs[Math.floor(nR * 0.999)], max: degs[nR - 1] },
    areaOverMean: { seam: +(area[seam] / meanArea).toFixed(3), south: +(area[south] / meanArea).toFixed(3) },
    nnDistOverMedian: { seam: +(nnDist(seam) / nnAll[nnAll.length >> 1]).toFixed(3), south: +(nnDist(south) / nnAll[nnAll.length >> 1]).toFixed(3) },
    roughnessPercentileInEquatorialBand: roughPct,
  });
  console.error('seed', seed, 'done');
}
fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'results', `axis-seam-N${N}.json`), JSON.stringify(runs, null, 1));
console.log(JSON.stringify(runs, null, 1));
