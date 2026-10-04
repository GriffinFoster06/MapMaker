import { defineConfig, devices } from '@playwright/test';

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
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
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
