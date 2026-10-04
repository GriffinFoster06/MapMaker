import { expect, test } from '@playwright/test';
import { bytesOf, sha256 } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages } from '@mapmaker/gen-orogen';

// Phase 4a: the globe in each browser. Generation runs in the engine worker; the layers the page receives must be
// bit-identical to a Node run of the same pipeline (orogen output is deterministic across engines, spike 1a and the probe).
test('globe renders a generated world, switches layers, and layer data equals Node', async ({ page, browserName }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe);

  const run = await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 12345 }));
  info.annotations.push({ type: 'generate-20k', description: `${browserName}: ${Math.round(run.totalMs)} ms, working set ${(run.stats.layerBytes + run.stats.meshBytes) / 1e6} MB` });
  expect(run.stats.dmath).toBe('fdlibm');
  expect(Object.keys(run.stages)).toEqual(expect.arrayContaining(['mesh', 'orogen.tectonics', 'orogen.elevation', 'orogen.erosion', 'orogen.climate', 'orogen.koppen']));

  expect(await page.evaluate(() => window.__globe!.litFraction()), 'globe is not blank').toBeGreaterThan(0.05);

  const sums: number[] = [];
  for (const layer of ['elevation', 'koppen', 'plate', 'temp.summer']) {
    await page.evaluate((l) => window.__globe!.setLayer(l), layer);
    sums.push(await page.evaluate(() => window.__globe!.pixelSum()));
  }
  expect(new Set(sums).size, `layer switches change the picture (${sums.join(', ')})`).toBe(sums.length);

  // Layer arrays as received in the browser == a Node run.
  const w = createOrogenWorld({ N: 20000, seed: 12345 });
  await runPipeline(w, orogenStages, { strict: false });
  const nodeHash = async (...ids: string[]) => sha256(ids.map((id) => bytesOf(w.layers.get('global', id))));
  expect(await page.evaluate(() => window.__globe!.layerHash('elevation'))).toBe(await nodeHash('orogen.elevRaw'));
  expect(await page.evaluate(() => window.__globe!.layerHash('koppen'))).toBe(await nodeHash('koppen', 'orogen.elevRaw'));
  expect(await page.evaluate(() => window.__globe!.layerHash('wind.summer'))).toBe(await nodeHash('wind.summer.east', 'wind.summer.north'));
  expect(errors).toEqual([]);
});
