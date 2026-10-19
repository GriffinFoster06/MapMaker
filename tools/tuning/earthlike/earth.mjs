// Earth's targets at a given N: the Earth heightmap through the app's import, Kottek's Köppen grid. Cached per N.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEarthContext } from '../climate/lib/earth-context.mjs';
import { GRID_H, GRID_W, NO_DATA, loadGroundTruth } from '../climate/lib/ground-truth.mjs';
import { earthKoppen, worldMetrics } from './metrics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function earthTargets(N, cacheDir = path.join(HERE, 'targets')) {
  const file = path.join(cacheDir, `earth-N${N}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const ctx = await buildEarthContext({ N, seed: 1234 });
  const mesh = ctx.world.meshes.get('global').mesh;
  const m = worldMetrics(mesh, ctx.r_elevation, null);
  m.koppen = earthKoppen(loadGroundTruth(), GRID_W, GRID_H, NO_DATA);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(m, null, 1));
  return m;
}
