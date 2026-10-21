/* global process */
// Builds the desktop app into dist/: main.cjs and preload.cjs (esbuild; electron-updater is bundled in, so the packaged
// app needs no node_modules) and web/ (a copy of the Vite build, which must already exist: `npm run build`).
import { build } from 'esbuild';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDist = join(here, '..', 'web', 'dist');
if (!existsSync(join(webDist, 'index.html'))) throw new Error('apps/web/dist is missing: run `npm run build` first');

rmSync(join(here, 'dist'), { recursive: true, force: true });
for (const name of ['main', 'preload']) {
  await build({ entryPoints: [join(here, 'src', `${name}.ts`)], outfile: join(here, 'dist', `${name}.cjs`), bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], logLevel: 'warning' });
}
cpSync(webDist, join(here, 'dist', 'web'), { recursive: true });
process.stdout.write('desktop build ok\n');
