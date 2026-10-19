// Q2 probe: shape metrics of generated worlds vs Earth, per stage layer. Usage:
//   tsx tools/tuning/earthlike/rect-probe.mjs [--N 200000] [--seeds 1,2,3] [--config default|organic|both] [--earth] [--out f.json]
import fs from 'node:fs';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { PNG } from 'pngjs';
import { rasterise, shapeMetrics } from './shape.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const pngDir = process.argv.includes('--png') ? arg('png', '.') : null;
function writePng(name, mesh, land) {
  if (!pngDir) return;
  fs.mkdirSync(pngDir, { recursive: true });
  const { grid, W, H } = rasterise(mesh, land, 720, 360);
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) { const v = grid[i] ? 235 : 40; png.data.set([v, v, v, 255], 4 * i); }
  fs.writeFileSync(`${pngDir}/${name}.png`, PNG.sync.write(png));
}

const N = Number(arg('N', '200000'));
const seeds = arg('seeds', '1,2,3').split(',').map(Number);
const which = arg('config', 'both');
const CONFIGS = { default: {}, organic: { jitter: 1, terrainWarp: 1, nMag: 0.5, smoothing: 0, continentSizeVariety: 0.7 } };
const r3 = (x) => Math.round(x * 1000) / 1000;
const brief = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? r3(v) : v]));
const out = {};

if (process.argv.includes('--earth')) {
  const { buildEarthContext } = await import('../climate/lib/earth-context.mjs');
  const ctx = await buildEarthContext({ N, seed: 1234 });
  const land = Uint8Array.from(ctx.r_elevation, (e) => (e > 0 ? 1 : 0));
  out.earth = brief(shapeMetrics(ctx.world.meshes.get('global').mesh, land));
  writePng('earth', ctx.world.meshes.get('global').mesh, land);
  console.error('earth', JSON.stringify(out.earth));
}
for (const name of which === 'both' ? Object.keys(CONFIGS) : [which]) {
  out[name] = {};
  for (const seed of seeds) {
    const t0 = performance.now();
    const w = createOrogenWorld({ N, seed, ...CONFIGS[name] });
    await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
    const mesh = w.meshes.get('global').mesh;
    const res = {};
    const el = w.layers.get('global', 'elevation');
    const land = Uint8Array.from(el, (e) => (e > 0 ? 1 : 0));
    res.final = brief(shapeMetrics(mesh, land));
    writePng(`${name}-${seed}`, mesh, land);
    out[name][seed] = { ...res, ms: Math.round(performance.now() - t0) };
    console.error(name, seed, JSON.stringify(out[name][seed]));
  }
}
const f = arg('out'); if (f) fs.writeFileSync(f, JSON.stringify(out, null, 1));
