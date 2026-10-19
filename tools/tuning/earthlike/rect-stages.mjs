// Q2: where does the blocky shape enter? Shape metrics of the land mask at each stage of the stock (parity) pipeline:
// plate-level land/ocean assignment, raw elevation before erosion, after erosion. Usage:
//   tsx tools/tuning/earthlike/rect-stages.mjs [--N 200000] [--seeds 1,2,3,4] [--config default|organic] [--png dir]
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { runPipeline } from '@mapmaker/engine';
import { STAGE, createOrogenWorld, getScratch, orogenStages } from '@mapmaker/gen-orogen';
import { rasterise, shapeMetrics } from './shape.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('N', '200000')), seeds = arg('seeds', '1,2,3,4').split(',').map(Number), cfg = arg('config', 'default');
const CONFIGS = { default: {}, organic: { jitter: 1, terrainWarp: 1, nMag: 0.5, smoothing: 0, continentSizeVariety: 0.7 } };
const dir = arg('png', null);
// --set P=40,numContinents=8 overrides parameters on top of the config.
const SET = Object.fromEntries((arg('set', '') || '').split(',').filter(Boolean).map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));
const r3 = (x) => Math.round(x * 1000) / 1000;
const brief = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? r3(v) : v]));
function png(name, mesh, land) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const { grid, W, H } = rasterise(mesh, land, 720, 360), p = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) { const v = grid[i] ? 235 : 40; p.data.set([v, v, v, 255], 4 * i); }
  fs.writeFileSync(`${dir}/${name}.png`, PNG.sync.write(p));
}
for (const seed of seeds) {
  const w = createOrogenWorld({ N, seed, ...CONFIGS[cfg], ...SET });
  await runPipeline(w, orogenStages, { only: [STAGE.mesh, STAGE.tectonics], strict: false });
  const mesh = w.meshes.get('global').mesh, s = getScratch(w);
  const plate = s.tect.r_plate, ocean = s.tect.plateIsOcean;
  const plateLand = Uint8Array.from(plate, (p) => (ocean.has(p) ? 0 : 1));
  const masks = { plateLand };
  await runPipeline(w, orogenStages, { only: [STAGE.elevation, STAGE.erosion], strict: false });
  masks.elevPre = Uint8Array.from(w.layers.get('global', 'orogen.elevPre'), (e) => (e > 0 ? 1 : 0));
  masks.elevRaw = Uint8Array.from(w.layers.get('global', 'orogen.elevRaw'), (e) => (e > 0 ? 1 : 0));
  const res = {};
  for (const [k, m] of Object.entries(masks)) { res[k] = brief(shapeMetrics(mesh, m)); png(`${cfg}-${seed}-${k}`, mesh, m); }
  console.error(cfg, JSON.stringify(SET), seed, JSON.stringify(res));
}
