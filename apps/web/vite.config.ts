import { defineConfig } from 'vite';
import { d3Dmath } from '../../packages/projection/alias/d3-dmath.mjs';

// GitHub Pages serves the site under /MapMaker/; tests and local dev use /.
export default defineConfig({
  base: process.env['VITE_BASE'] ?? '/',
  // The exact projection path's dmath-backed copy of d3 (packages/projection/alias/d3-dmath.mjs).
  plugins: [d3Dmath()],
  worker: { format: 'es', plugins: () => [d3Dmath()] },
  build: { target: 'es2022', sourcemap: true },
});
