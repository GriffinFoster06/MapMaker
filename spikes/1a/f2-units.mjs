// Spike 1a — F2: orogen elevation units. Checks (1) the range of raw elevation,
// (2) how much is lost by orogen's 6 km land cap, (3) whether canonical metres
// (Float32) → inverse S-curve → orogen climate reproduces the climate exactly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOrogen, orogenModule } from '../lib/orogen.mjs';
const { SphereMesh } = await orogenModule('sphere-mesh.js');
const { elevToHeightKm } = await orogenModule('color-map.js');
const { SimplexNoise } = await orogenModule('simplex-noise.js');
const { computeWind } = await orogenModule('wind.js');
const { computeOceanCurrents } = await orogenModule('ocean.js');
const { computePrecipitation } = await orogenModule('precipitation.js');
const { computeTemperature } = await orogenModule('temperature.js');
const { classifyKoppen } = await orogenModule('koppen.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = +(process.argv[2] ?? 200000), seed = +(process.argv[3] ?? 12345);
const r = runOrogen({ N, seed });
const E = r.r_elevation, nR = r.numRegions;

// Inverse of the land S-curve h = 6 t^4 (5 - 4t) on [0,1]; ocean is linear ×10.
function heightKmToElev(km) {
  if (km <= 0) return km / 10;
  if (km >= 6) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; (6 * m ** 4 * (5 - 4 * m) < km) ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}

let land = 0, over1 = 0, maxE = -Infinity, minE = Infinity;
for (let i = 0; i < nR; i++) { const e = E[i]; if (e > 0) { land++; if (e > 1) over1++; } maxE = Math.max(maxE, e); minE = Math.min(minE, e); }

const metres = new Float32Array(nR), back = new Float32Array(nR);
let maxDe = 0, maxDeLand = 0, nChanged = 0;
for (let i = 0; i < nR; i++) {
  metres[i] = elevToHeightKm(E[i]) * 1000;
  back[i] = heightKmToElev(metres[i] / 1000);
  const d = Math.abs(back[i] - Math.min(E[i], E[i] > 0 ? 1 : E[i]));
  if (back[i] !== E[i]) nChanged++;
  maxDe = Math.max(maxDe, d); if (E[i] > 0) maxDeLand = Math.max(maxDeLand, d);
}

function climate(elev) {
  const mesh = new SphereMesh(r.triangles, r.halfedges, nR);
  const noise = new SimplexNoise(seed);
  const plateIsOcean = new Set(r.plateIsOcean);
  const log = console.log; console.log = () => {};
  const wind = computeWind(mesh, r.r_xyz, elev, plateIsOcean, r.r_plate, noise);
  const ocean = computeOceanCurrents(mesh, r.r_xyz, elev, wind);
  const precip = computePrecipitation(mesh, r.r_xyz, elev, wind, ocean, 0, 0.3);
  const temp = computeTemperature(mesh, r.r_xyz, elev, wind, ocean, precip, 0);
  const koppen = classifyKoppen(mesh, elev, temp, precip);
  console.log = log;
  return { precipS: precip.r_precip_summer, tempS: temp.r_temperature_summer, tempW: temp.r_temperature_winter, koppen };
}
const a = climate(new Float32Array(E)), b = climate(back);
const sameAsWorker = Buffer.compare(Buffer.from(a.koppen.buffer), Buffer.from(r.debugLayers.koppen.buffer)) === 0;
const cmp = (x, y) => { let n = 0, m = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { n++; m = Math.max(m, Math.abs(x[i] - y[i])); } return { nDiff: n, maxAbs: m }; };
const out = {
  N, seed, numRegions: nR,
  rawElevation: { min: minE, max: maxE, landCells: land, landAbove1: over1, landAbove1Frac: over1 / land },
  metresRange: { min: metres.reduce((m, x) => Math.min(m, x), Infinity), max: metres.reduce((m, x) => Math.max(m, x), -Infinity) },
  roundTrip: { cellsChanged: nChanged, maxAbsDeltaRaw: maxDe, maxAbsDeltaRawLand: maxDeLand },
  climateRerunMatchesWorker: sameAsWorker,
  climateFromRoundTrip: { precipSummer: cmp(a.precipS, b.precipS), tempSummer: cmp(a.tempS, b.tempS), tempWinter: cmp(a.tempW, b.tempW), koppen: cmp(a.koppen, b.koppen) },
};
fs.writeFileSync(path.join(HERE, 'results', `f2-units-N${N}-s${seed}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
