import { expect, test } from '@playwright/test';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { biomeColor } from '@mapmaker/gen-orogen/palettes';
import { cartoKernels } from '@mapmaker/carto/kernels';
import { createHash } from 'node:crypto';

// Phase 5c: the styled map in the app. The globe and the flat map show a theme with hillshade, the overlays carry rivers,
// labels, a scale bar and a legend, a style never changes the World, the GPU's pixels agree with the exact path's, and the
// exported raster equals Node's exact export byte for byte.
const N = 20000, SEED = 12345;

const hashCanvas = (page: import('@playwright/test').Page, sel: string) =>
  page.evaluate((s) => { const c = document.querySelector(s) as HTMLCanvasElement; return c.toDataURL('image/png').length + ':' + c.toDataURL('image/png').slice(-200); }, sel);

test('styled map: themes, relief, labels, GPU against the exact path, and an export equal to Node', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  await page.evaluate(([n, seed]) => window.__globe!.generate({ N: n!, seed: seed! }), [N, SEED]);
  const hash = await page.evaluate(() => window.__flat!.worldHash());
  const rendered = () => page.evaluate(() => window.__flat!.ui.rendered());
  const slide = (id: string, v: number) => page.locator(id).evaluate((el, x) => { (el as HTMLInputElement).value = String(x); el.dispatchEvent(new Event('input')); }, v);

  // The globe: a styled layer, with labels once the camera rests.
  await page.selectOption('#layer', 'styled');
  await page.waitForFunction(() => window.__flat!.ui.globeLabels() > 0, null, { timeout: 60_000 });
  const globeLabels = await page.evaluate(() => window.__flat!.ui.globeLabels());
  expect(globeLabels).toBeGreaterThan(2);
  expect(await page.evaluate(() => window.__globe!.litFraction())).toBeGreaterThan(0.1);

  // The flat map: GPU, with the styled overlays.
  await page.selectOption('#viewMode', 'flat');
  await rendered();
  await expect(page.locator('#mapStatus')).toContainText('GPU');
  await expect(page.locator('#styledOverlays')).toBeVisible();
  const has = (css: string) => page.evaluate((c) => document.querySelectorAll(`#mapSvg ${c}`).length, css);
  await page.waitForFunction(() => document.querySelectorAll('#mapSvg .carto-coast').length === 1 && document.querySelectorAll('#mapSvg path.carto-river').length > 0 && document.querySelectorAll('#mapSvg .carto-legend').length === 1 && document.querySelectorAll('#mapSvg .carto-scale').length === 1 && window.__flat!.ui.labelCount() > 3);
  expect(await has('.carto-coast')).toBe(1);
  expect(await has('path.carto-river')).toBeGreaterThan(0);
  expect(await has('.carto-legend')).toBe(1);
  expect(await has('.carto-scale')).toBe(1);
  const labels = await page.evaluate(() => window.__flat!.ui.labelCount());
  expect(labels).toBeGreaterThan(3);
  expect(await has('.carto-label')).toBe(labels);

  // The GPU's pixels agree with the exact path's raster (float32 against dmath doubles; differences are the coast and the
  // shading's rounding).
  for (const theme of ['atlas', 'satellite', 'political']) {
    await page.selectOption('#styleSel', theme);
    await page.waitForTimeout(400);
    await rendered();
    const c = await page.evaluate(() => window.__flat!.ui.compareStyled());
    console.log(`GPU against exact, ${theme}:`, JSON.stringify(c));
    expect(c.inside).toBeGreaterThan(c.w * c.h * 0.5);
    expect(c.coverageMismatch).toBeLessThan(0.002);
    expect(c.mean).toBeLessThan(0.5);
    expect(c.p99).toBeLessThanOrEqual(2);
    expect(c.over8).toBe(0);
  }

  // Style and relief change the picture, never the World.
  await page.selectOption('#styleSel', 'atlas');
  await page.waitForTimeout(400);
  await rendered();
  const atlas = await hashCanvas(page, '#mapGpu');
  await page.selectOption('#styleSel', 'parchment');
  await page.waitForTimeout(400);
  await rendered();
  expect(await hashCanvas(page, '#mapGpu')).not.toBe(atlas);
  await page.selectOption('#styleSel', 'atlas');
  await slide('#reliefStrength', 0);
  await page.waitForTimeout(400);
  await rendered();
  const flatRelief = await hashCanvas(page, '#mapGpu');
  await slide('#reliefStrength', 1);
  await page.waitForTimeout(400);
  await rendered();
  expect(await hashCanvas(page, '#mapGpu')).not.toBe(flatRelief);
  await slide('#reliefStrength', 0.75);
  await page.waitForTimeout(400);

  // Overlays switch off.
  await page.uncheck('#ovLabels');
  await rendered();
  await page.waitForFunction(() => document.querySelectorAll('#mapSvg .carto-label').length === 0);
  await page.check('#ovLabels');
  await page.uncheck('#ovRivers');
  await rendered();
  await page.waitForFunction(() => document.querySelectorAll('#mapSvg path.carto-river').length === 0);
  await page.check('#ovRivers');

  // A conic (CPU path) and a rotated view still draw the styled map.
  await page.selectOption('#projection', 'conicConformal');
  await rendered();
  await expect(page.locator('#mapStatus')).toContainText('CPU');
  await page.waitForFunction(() => window.__flat!.ui.labelCount() > 0);
  expect(await page.evaluate(() => window.__flat!.ui.labelCount())).toBeGreaterThan(0);
  await page.selectOption('#projection', 'orthographic');
  await slide('#rotPhi', -35);
  await rendered();
  await page.waitForFunction(() => document.querySelectorAll('#mapSvg .carto-coast').length === 1 && document.querySelectorAll('#mapSvg path.carto-river').length > 0 && document.querySelectorAll('#mapSvg .carto-legend').length === 1 && document.querySelectorAll('#mapSvg .carto-scale').length === 1 && window.__flat!.ui.labelCount() > 3);
  expect(await has('.carto-coast')).toBe(1);

  // The export: the raster PNG equals Node's exact export of the same world, view and style; the PNG is composed, the SVG whole.
  await page.selectOption('#projection', 'robinson');
  await slide('#rotPhi', 0);
  await page.locator('#exportWidth').fill('640');
  await rendered();
  const exp = await page.evaluate(() => window.__flat!.ui.exportStyled());
  expect(exp.pngWidth).toBe(640);
  expect(exp.args.view).toMatchObject({ projection: 'robinson', width: 640 });
  expect(exp.args.style.id).toBe('atlas');
  expect(exp.svg).toContain('<image');
  expect(exp.svg).toContain('class="carto-coast"');
  expect(exp.pngBytes).toBeGreaterThan(20_000);

  const w = createOrogenWorld({ N, seed: SEED });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const k = cartoKernels({ biome: { color: biomeColor as never, rawElevation: 'detail.elevRaw' } });
  const node = k['carto.png'](w, { view: exp.args.view, style: exp.args.style });
  expect(exp.rasterSha256).toBe(createHash('sha256').update(node).digest('hex'));
  const nodeSvg = k['carto.svg'](w, { view: exp.args.view, style: exp.args.style });
  expect(createHash('sha256').update(exp.svg).digest('hex')).toBe(createHash('sha256').update(nodeSvg).digest('hex'));

  expect(await page.evaluate(() => window.__flat!.worldHash())).toBe(hash);
  expect(errors).toEqual([]);
});
