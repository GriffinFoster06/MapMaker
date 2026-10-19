import { register } from 'node:module';
import { defineConfig, devices } from '@playwright/test';

// The determinism spec re-runs the probe in Node on a mismatch; the probe's exact projection path needs the d3-dmath
// alias (packages/projection/build/d3-dmath.mjs).
register('./packages/projection/build/d3-dmath.mjs', import.meta.url);

const PORT = 4173;
// E2E_BASE_URL points the same specs at a deployed site (GitHub Pages smoke test); otherwise a local preview is built.
const remote = process.env['E2E_BASE_URL'];

export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: remote ? (remote.endsWith('/') ? remote : remote + '/') : `http://127.0.0.1:${PORT}/` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Headless Firefox on Linux has no WebGL (no GL context without a display), so the globe test cannot run there.
    // FIREFOX_HEADED=1 runs it headed instead; CI sets it under xvfb-run on Linux (docs/benchmarks/NOTES.md).
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...(process.env['FIREFOX_HEADED'] ? { headless: false } : {}) } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  ...(remote ? {} : {
    webServer: {
      command: `npm run build -w @mapmaker/web && npm run preview -w @mapmaker/web -- --host 127.0.0.1 --port ${PORT} --strictPort`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  }),
});
