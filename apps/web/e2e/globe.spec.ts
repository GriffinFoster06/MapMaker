import { expect, test } from '@playwright/test';
import { bytesOf, sha256 } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';

// The globe in each browser. Generation runs in the engine worker; the layers the page receives must be bit-identical
// to a Node run of the same pipeline (deterministic across engines: spike 1a, the probe, and fdlibm-only structured
// stages). Phase 4b: the structured pipeline is the default; stock orogen stays available as the `parity` variant.
for (const variant of ['structured', 'parity'] as const) {
  test(`globe renders a generated world (${variant}), switches layers, and layer data equals Node`, async ({ page, browserName }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await page.waitForFunction(() => !!window.__globe);

    const run = await page.evaluate((v) => window.__globe!.generate({ N: 20000, seed: 12345, variant: v }), variant);
    info.annotations.push({ type: `generate-20k-${variant}`, description: `${browserName}: ${Math.round(run.totalMs)} ms, working set ${(run.stats.layerBytes + run.stats.meshBytes) / 1e6} MB` });
    expect(run.stats.dmath).toBe('fdlibm');
    const expected = variant === 'structured' ? ['mesh', 'ref.pass', 'detail.pass'] : ['mesh', 'orogen.tectonics', 'orogen.elevation', 'orogen.erosion', 'orogen.climate', 'orogen.koppen'];
    expect(Object.keys(run.stages)).toEqual(expect.arrayContaining(expected));

    expect(await page.evaluate(() => window.__globe!.litFraction()), 'globe is not blank').toBeGreaterThan(0.05);

    const sums: number[] = [];
    for (const layer of ['elevation', 'koppen', 'plate', 'temp.summer']) {
      await page.evaluate((l) => window.__globe!.setLayer(l), layer);
      sums.push(await page.evaluate(() => window.__globe!.pixelSum()));
    }
    expect(new Set(sums).size, `layer switches change the picture (${sums.join(', ')})`).toBe(sums.length);

    // Layer arrays as received in the browser == a Node run.
    const w = createOrogenWorld({ N: 20000, seed: 12345 });
    await runPipeline(w, [...orogenStages, ...structuredStages], { strict: false, variant: variant === 'structured' ? STRUCTURED : 'parity' });
    const raw = variant === 'structured' ? 'detail.elevRaw' : 'orogen.elevRaw';
    const nodeHash = async (...ids: string[]) => sha256(ids.map((id) => bytesOf(w.layers.get('global', id))));
    expect(await page.evaluate(() => window.__globe!.layerHash('elevation'))).toBe(await nodeHash(raw));
    expect(await page.evaluate(() => window.__globe!.layerHash('koppen'))).toBe(await nodeHash('koppen', raw));
    expect(await page.evaluate(() => window.__globe!.layerHash('wind.summer'))).toBe(await nodeHash('wind.summer.east', 'wind.summer.north'));
    expect(errors).toEqual([]);
  });
}

// World settings: orogen's generation sliders on the page, read from a shared link, and sent to the generator. The
// world generated through the Generate button with non-default settings equals a Node run with the same settings.
test('world settings panel: link state, Generate with settings equals Node', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?seed=777&tier=20k&landCoverage=0.5&P=40&temperatureOffset=-5');
  await page.waitForFunction(() => !!window.__globe);
  await expect(page.locator('#settings input[type=range]')).toHaveCount(14);
  await expect(page.locator('#set-landCoverage')).toHaveValue('0.5');
  await expect(page.locator('#set-P')).toHaveValue('40');
  await expect(page.locator('#seed')).toHaveValue('777');
  await expect(page.locator('#tier')).toHaveValue('20k');

  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('cells in', { timeout: 120_000 });
  const w = createOrogenWorld({ N: 20000, seed: 777, landCoverage: 0.5, P: 40, temperatureOffset: -5 });
  await runPipeline(w, [...orogenStages, ...structuredStages], { strict: false, variant: STRUCTURED });
  expect(await page.evaluate(() => window.__globe!.layerHash('koppen')))
    .toBe(await sha256(['koppen', 'detail.elevRaw'].map((id) => bytesOf(w.layers.get('global', id)))));

  await page.locator('#resetSettings').click();
  await expect(page.locator('#set-landCoverage')).toHaveValue('0.3');
  expect(new URL(page.url()).searchParams.get('landCoverage')).toBeNull();
  expect(errors).toEqual([]);
});
