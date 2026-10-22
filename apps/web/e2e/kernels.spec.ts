import { expect, test, type Page } from '@playwright/test';
import { hashWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';

// Decision PK1: where the page is cross-origin isolated (here through the ?coi shim; the desktop app always is), the
// engine worker runs the per-cell kernels in its pool of kernel workers; elsewhere it runs them itself. The World is the
// same bit for bit either way, and equals Node's serial one.
const N = 20000, SEED = 4242;

let nodeHash: string;
test.beforeAll(async () => {
  const w = createOrogenWorld({ N, seed: SEED });
  await runPipeline(w, [...orogenStages, ...structuredStages], { strict: false, variant: STRUCTURED });
  nodeHash = await hashWorld(w);
});

async function generate(page: Page) {
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  const { stats } = await page.evaluate(([n, seed]) => window.__globe!.generate({ N: n!, seed: seed! }), [N, SEED]);
  return { stats, hash: await page.evaluate(() => window.__flat!.worldHash()) };
}

test('isolated: the kernels run in the pool, and the World hash equals Node', async ({ page }) => {
  await page.goto('./?coi');
  await page.waitForFunction(() => self.crossOriginIsolated === true, null, { timeout: 20_000 });
  const { stats, hash } = await generate(page);
  expect(stats.kernelWorkers).toBeGreaterThan(0);
  expect(stats.kernelCalls).toBe(12);
  expect(hash).toBe(nodeHash);
});

test('not isolated: the kernels run in the engine worker, with the same World hash', async ({ page }) => {
  await page.goto('./');
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);
  const { stats, hash } = await generate(page);
  expect(stats.kernelWorkers).toBe(0);
  expect(hash).toBe(nodeHash);
});
