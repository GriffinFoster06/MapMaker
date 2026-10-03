// Bundle azgaar-entry.ts (TypeScript, '@/…' path alias) into _data/azgaar-hydro.mjs.
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '_work', 'azgaar', 'src');
await esbuild.build({
  entryPoints: [path.join(HERE, 'azgaar-entry.ts')],
  outfile: path.join(HERE, '..', '_data', 'azgaar-hydro.mjs'),
  bundle: true, format: 'esm', platform: 'node', logLevel: 'warning',
  alias: { '@': SRC },
  nodePaths: [path.join(HERE, '..', '_work', 'azgaar', 'node_modules')],
});
console.log('bundled');
