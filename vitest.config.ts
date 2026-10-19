import { defineConfig } from 'vitest/config';
import { d3Dmath } from './packages/projection/alias/d3-dmath.mjs';

export default defineConfig({
  // The exact projection path's dmath-backed copy of d3 (packages/projection/alias/d3-dmath.mjs).
  plugins: [d3Dmath()],
  // orogen's planet-worker.js imports Delaunator from a CDN URL; tests that run it as the stock oracle use the same
  // version (5.0.1) from npm.
  resolve: { alias: [{ find: /^https:\/\/cdn\.jsdelivr\.net\/npm\/delaunator@[\d.]+\/\+esm$/, replacement: 'delaunator' }] },
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
