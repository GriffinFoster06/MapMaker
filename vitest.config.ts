import { defineConfig } from 'vitest/config';

export default defineConfig({
  // orogen's planet-worker.js imports Delaunator from a CDN URL; tests that run it as the stock oracle use the same
  // version (5.0.1) from npm.
  resolve: { alias: [{ find: /^https:\/\/cdn\.jsdelivr\.net\/npm\/delaunator@[\d.]+\/\+esm$/, replacement: 'delaunator' }] },
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
