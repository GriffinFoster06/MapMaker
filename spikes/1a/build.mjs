// Bundle browser-worker.js with esbuild; map orogen's CDN Delaunator import to
// the pinned local package (same mapping as lib/orogen-hooks.mjs for Node).
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
await esbuild.build({
  entryPoints: [path.join(HERE, 'browser-worker.js')],
  outfile: path.join(HERE, '..', '_data', 'www', 'worker.js'),
  bundle: true, format: 'esm', minify: false, logLevel: 'warning',
  plugins: [{
    name: 'cdn-delaunator',
    setup(b) {
      b.onResolve({ filter: /^https:\/\/cdn\.jsdelivr\.net\/npm\/delaunator/ }, async (args) =>
        b.resolve('delaunator', { kind: args.kind, resolveDir: HERE }));
    },
  }],
});
console.log('bundled');
