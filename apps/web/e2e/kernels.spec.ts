import { expect, test, type Page } from '@playwright/test';
import { hashWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';

// Decision PK1: where the page is cross-origin isolated (here through the ?coi shim; the desktop app always is), the
// engine worker runs the per-cell kernels in its pool of kernel workers; elsewhere it runs them itself. The World is the
// same bit for bit either way, and equals Node's serial one.
const N = 20000, SEED = 4242;
// Without the shim, isolation follows the host: the local preview is not isolated, Cloudflare Pages is (its smoke test
// sets E2E_EXPECT_ISOLATED=1, as in coi.spec.ts).
const nativeHeaders = !!process.env['E2E_EXPECT_ISOLATED'];

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

test('without the shim: the pool is used exactly where the host isolates the page, with the same World hash', async ({ page }) => {
  await page.goto('./');
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(nativeHeaders);
  const { stats, hash } = await generate(page);
  if (nativeHeaders) expect(stats.kernelWorkers).toBeGreaterThan(0);
  else expect(stats.kernelWorkers).toBe(0); // the engine worker runs the kernels itself
  expect(hash).toBe(nodeHash);
});
