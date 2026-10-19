import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Save a world to a .mapmaker file from the page and load it back: the World hash is equal, and the loaded world draws.
test('save and load a .mapmaker world file', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 4242 }));
  const hash = await page.evaluate(() => window.__flat!.worldHash());
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#saveWorld')]);
  expect(dl.suggestedFilename()).toMatch(/\.mapmaker$/);
  const path = await dl.path();
  expect(readFileSync(path).subarray(0, 2).toString()).toBe('PK');

  // A different world in its place, then the file back.
  await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 99 }));
  expect(await page.evaluate(() => window.__flat!.worldHash())).not.toBe(hash);
  await page.setInputFiles('#loadFile', path);
  await expect(page.locator('#status')).toContainText('loaded 20,001 cells', { timeout: 60_000 });
  expect(await page.evaluate(() => window.__flat!.worldHash())).toBe(hash);
  expect(await page.evaluate(() => window.__globe!.litFraction())).toBeGreaterThan(0.1);
});
