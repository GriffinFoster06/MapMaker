// Node module-resolution hook: orogen imports Delaunator from a CDN URL
// (planet-worker.js:19). Redirect it to the pinned local npm package so the
// vendored worker runs unmodified under Node.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://cdn.jsdelivr.net/npm/delaunator')) {
    return next('delaunator', context);
  }
  return next(specifier, context);
}
