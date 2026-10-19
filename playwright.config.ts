import { register } from 'node:module';
import { defineConfig, devices } from '@playwright/test';

// The determinism spec re-runs the probe in Node on a mismatch; the probe's exact projection path needs the d3-dmath
// alias (packages/projection/alias/d3-dmath.mjs).
register('./packages/projection/alias/d3-dmath.mjs', import.meta.url);

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
    // Supported browsers: Firefox (development) and Chromium (Electron's engine); decision W7. No WebKit.
    // Headless Firefox on Linux has no hardware GL; FIREFOX_HEADED=1 runs it headed instead (CI: xvfb-run on Linux).
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        ...(process.env['FIREFOX_HEADED'] ? { headless: false } : {}),
        // Software WebGL2 on runners without a GPU (Firefox otherwise blocklists the driver).
        launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false, 'webgl.enable-webgl2': true, 'layers.acceleration.force-enabled': true } },
      },
    },
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
