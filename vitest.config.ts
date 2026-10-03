import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
