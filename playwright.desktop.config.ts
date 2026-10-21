import { register } from 'node:module';
import { defineConfig } from '@playwright/test';

// Same alias as playwright.config.ts: the Node reference run below needs the dmath-backed d3 for the exact projection path.
register('./packages/projection/alias/d3-dmath.mjs', import.meta.url);

// The Electron smoke test (decision P4): launches the built desktop app (npm run desktop:build first).
export default defineConfig({
  testDir: 'apps/desktop/e2e',
  timeout: 180_000,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
});
