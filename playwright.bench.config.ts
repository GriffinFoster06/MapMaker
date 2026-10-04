import { defineConfig, devices } from '@playwright/test';

// Per-browser memory and timing benchmarks (Phase 4a). Not part of `npm run e2e`: run `npm run bench`.
// BENCH_TIERS=50k,200k limits the tiers; BENCH_PROJECT picks the browser (default: all three).
const PORT = 4174;

export default defineConfig({
  testDir: 'apps/web/bench',
  timeout: 45 * 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}/` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--enable-precise-memory-info'] } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run build -w @mapmaker/web && npm run preview -w @mapmaker/web -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
