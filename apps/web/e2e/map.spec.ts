import { expect, test } from '@playwright/test';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { MeshSampler } from '@mapmaker/projection';
import { exportHeightmap } from '@mapmaker/projection/exact';
import { createHash } from 'node:crypto';

// Phase 5 M5: the flat map in the app. The globe/flat switch, the GPU path and the CPU fallback, rotation and zoom,
// the overlays, and the heightmap export, whose bytes must equal a Node export of the same world and view. Nothing on
// the map writes the World: its hash is unchanged after every step.
const N = 20000, SEED = 12345;

test('flat map: switch, projections, overlays, zoom, and the heightmap export equals Node', async ({ page }) => {
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

  // Globe → flat: the map shows, the globe hides; the default projection is drawn by the GPU with the graticule.
  await expect(page.locator('#map')).toBeHidden();
  await page.selectOption('#viewMode', 'flat');
  await rendered();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#globe')).toBeHidden();
  await expect(page.locator('#mapStatus')).toContainText('GPU');
  expect(await page.evaluate(() => document.querySelectorAll('#mapSvg path.graticule').length)).toBe(1);

  // Rotation and the overlays: coastlines, Tissot indicatrices and a distortion heatmap.
  await page.selectOption('#projection', 'orthographic');
  await slide('#rotPhi', -40);
  await page.check('#ovCoast');
  await page.check('#ovTissot');
  await page.selectOption('#ovDistortion', 'omega');
  await rendered();
  expect((await page.evaluate(() => window.__flat!.ui.state())).rotate).toEqual([0, -40, 0]);
  expect(await page.evaluate(() => (document.querySelector('#mapSvg path.coast')?.getAttribute('d') ?? '').length)).toBeGreaterThan(1000);
  expect(await page.evaluate(() => document.querySelectorAll('#mapSvg .tissot path').length)).toBeGreaterThan(10);
  await expect(page.locator('#mapDist')).toBeVisible();

  // Zoom with the wheel, then reset.
  const box = (await page.locator('#map').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.mouse.wheel(0, -600);
  await rendered();
  expect((await page.evaluate(() => window.__flat!.ui.state())).zoom).toBeGreaterThan(1.5);

  // A projection without a shader is drawn by the CPU path (reduced resolution, in the worker).
  await page.selectOption('#ovDistortion', '');
  await page.selectOption('#projection', 'winkel3');
  await rendered();
  await expect(page.locator('#mapStatus')).toContainText('CPU');
  expect((await page.evaluate(() => window.__flat!.ui.state())).zoom).toBe(1);

  // Heightmap export of the current projection and rotation: the bytes equal Node's exact export.
  await page.selectOption('#projection', 'robinson');
  await slide('#rotLambda', 25);
  await page.locator('#exportWidth').fill('512');
  await page.selectOption('#exportMapping', 'land');
  await rendered();
  const exp = await page.evaluate(() => window.__flat!.ui.exportHeightmap());
  expect(exp.args.view).toMatchObject({ projection: 'robinson', width: 512, rotate: [25, -40, 0] });
  expect(exp.args.mapping).toEqual({ kind: 'land' });
  const svgHash = await page.evaluate(() => window.__flat!.ui.exportSvg());
  expect(svgHash).toMatch(/^[0-9a-f]{64}$/);

  const w = createOrogenWorld({ N, seed: SEED });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const node = exportHeightmap(exp.args.view, new MeshSampler(w.meshes.get('global')!.mesh), w.layers.get('global', 'elevation'), exp.args.mapping, exp.args.png ?? {});
  expect(exp.sha256).toBe(createHash('sha256').update(node.png).digest('hex'));

  expect(await page.evaluate(() => window.__flat!.worldHash())).toBe(hash);
  expect(errors).toEqual([]);
});

// Phase 5c: conic projections with standard parallels (decision 5c-1). Drawn by the CPU path; the controls set the
// view's parallels, the export carries them, and the exported heightmap equals Node's exact export.
test('conic projections: parallels controls, CPU draw, and an export equal to Node', async ({ page }) => {
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

  await page.selectOption('#viewMode', 'flat');
  await rendered();
  await expect(page.locator('#parallelsBox')).toBeHidden();
  for (const id of ['conicEqualArea', 'conicConformal', 'conicEquidistant']) {
    await page.selectOption('#projection', id);
    await rendered();
    await expect(page.locator('#parallelsBox')).toBeVisible();
    await expect(page.locator('#mapStatus')).toContainText('CPU');
    expect((await page.evaluate(() => window.__flat!.ui.state())).parallels).toEqual([30, 60]);
  }
  await page.selectOption('#projection', 'conicEqualArea');
  await slide('#par1', 15);
  await slide('#par2', 45);
  await page.locator('#exportWidth').fill('512');
  await rendered();
  expect((await page.evaluate(() => window.__flat!.ui.state())).parallels).toEqual([15, 45]);
  const exp = await page.evaluate(() => window.__flat!.ui.exportHeightmap());
  expect(exp.args.view).toMatchObject({ projection: 'conicEqualArea', width: 512, parallels: [15, 45] });
  const w = createOrogenWorld({ N, seed: SEED });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const node = exportHeightmap(exp.args.view, new MeshSampler(w.meshes.get('global')!.mesh), w.layers.get('global', 'elevation'), exp.args.mapping, exp.args.png ?? {});
  expect(exp.sha256).toBe(createHash('sha256').update(node.png).digest('hex'));
  // A non-conic projection carries no parallels.
  await page.selectOption('#projection', 'robinson');
  await rendered();
  await expect(page.locator('#parallelsBox')).toBeHidden();
  expect((await page.evaluate(() => window.__flat!.ui.state())).parallels).toBeUndefined();
  expect(await page.evaluate(() => window.__flat!.worldHash())).toBe(hash);
  expect(errors).toEqual([]);
});
