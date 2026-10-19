import { defineConfig, devices } from '@playwright/test';

// Per-browser memory and timing benchmarks (Phase 4a, 4b). Not part of `npm run e2e`: run `npm run bench`.
// BENCH_TIERS=50k,200k limits the tiers; BENCH_VARIANT=parity|structured (default structured) picks the pipeline; BENCH_PROJECT picks the browser (default: both; WebKit is out of scope, decision W7).
// BENCH_MODE=worker runs the engine worker alone (no globe); every run records peak RSS per process kind.
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
  ],
  webServer: {
    command: `npm run build -w @mapmaker/web && npm run preview -w @mapmaker/web -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
