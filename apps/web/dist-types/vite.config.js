import { defineConfig } from 'vite';
// GitHub Pages serves the site under /MapMaker/; tests and local dev use /.
export default defineConfig({
    base: process.env['VITE_BASE'] ?? '/',
    worker: { format: 'es' },
    build: { target: 'es2022', sourcemap: true },
});
