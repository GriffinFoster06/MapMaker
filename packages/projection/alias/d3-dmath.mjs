// The d3-dmath alias (ARCHITECTURE §3.5, §3.7; Phase 5 decision 2): a second, dmath-backed copy of d3-geo and
// d3-geo-projection for the exact path, built at module-resolution time. d3's files are read unmodified; only the
// two src/math.js modules are replaced, by src/exact/geo-math.ts and src/exact/projection-math.ts.
//
// Entry specifiers 'virtual:d3-geo-dmath' and 'virtual:d3-geo-projection-dmath' resolve to the packages'
// src/index.js with the query QUERY. Inside that graph (importer carries QUERY): relative imports keep the query,
// except the math.js modules, which resolve to the shims; bare 'd3-geo' and 'd3-geo-projection' resolve to the
// copies; anything else (d3-array, which does no transcendental math on this path) resolves normally. The stock
// packages are untouched and stay on native math for interactive display.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const QUERY = '?mapmaker-dmath';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const index = { 'd3-geo': require.resolve('d3-geo'), 'd3-geo-projection': require.resolve('d3-geo-projection') };
const entries = { 'virtual:d3-geo-dmath': 'd3-geo', 'virtual:d3-geo-projection-dmath': 'd3-geo-projection' };
const shims = new Map([
  [resolvePath(dirname(index['d3-geo']), 'math.js'), resolvePath(here, '../src/exact/geo-math.ts')],
  [resolvePath(dirname(index['d3-geo-projection']), 'math.js'), resolvePath(here, '../src/exact/projection-math.ts')],
]);

const clean = (id) => (id.endsWith(QUERY) ? id.slice(0, -QUERY.length) : id);

/** Resolve `source` imported from `importer` (filesystem paths). Returns a path, or null for default resolution. */
export function resolveD3Dmath(source, importer) {
  if (source in entries) return index[entries[source]] + QUERY;
  if (!importer || !importer.endsWith(QUERY)) return null;
  if (source in index) return index[source] + QUERY;
  if (source.startsWith('./') || source.startsWith('../')) {
    const p = resolvePath(dirname(clean(importer)), source);
    return shims.get(p) ?? p + QUERY;
  }
  return null;
}

/** Vite (and Vitest) plugin. */
export function d3Dmath() {
  return {
    name: 'mapmaker-d3-dmath',
    enforce: 'pre',
    resolveId(source, importer) {
      return resolveD3Dmath(source, importer);
    },
    load(id) {
      return id.endsWith(QUERY) ? readFileSync(clean(id), 'utf8') : null;
    },
  };
}

/** Node module-customization hooks (module.register), for scripts run under tsx; see register.mjs. */
export async function resolve(specifier, context, next) {
  const importer = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL.split('?')[0]) + (context.parentURL.endsWith(QUERY) ? QUERY : '') : undefined;
  const r = resolveD3Dmath(specifier, importer);
  if (r === null) return next(specifier, context);
  const url = pathToFileURL(clean(r)).href + (r.endsWith(QUERY) ? QUERY : '');
  return { url, shortCircuit: true, format: r.endsWith(QUERY) ? 'module' : undefined };
}
