import { expect, test } from '@playwright/test';
import { bytesOf, sha256 } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';

// Phase 5b: a stroke on the flat map becomes an edit record, the engine re-runs only the stale stage, undo restores the
// world's bytes and the edited layers equal a Node run that applies the same edit records (replay is deterministic across
// engines and across the worker boundary).
test('edit tool: stroke, re-run, undo, redo, and the edited world equals Node', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe && !!window.__edit);
  await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 12345, variant: 'structured' }));
  const hash = (id: string) => page.evaluate((l) => window.__globe!.layerHash(l), id);
  const h0 = { elevation: await hash('elevation'), koppen: await hash('koppen') };

  await page.selectOption('#viewMode', 'flat');
  await page.waitForFunction(() => window.__flat!.ui.state().view === 'flat');
  await page.selectOption('#tool', 'raise');
  await page.locator('#map').scrollIntoViewIfNeeded(); // mouse coordinates are viewport-relative
  const box = (await page.locator('#map').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 30, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 10, { steps: 4 });
  await page.mouse.move(cx + 30, cy, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => { const s = window.__edit!.state(); return s.edits === 1 && s.cursor === 1 && s.stale.length === 0; }, null, { timeout: 120_000 });
  await expect(page.locator('#status')).toContainText('re-ran detail.pass');
  await expect(page.locator('#staleList')).toHaveText('up to date');
  const sent = await page.evaluate(() => window.__edit!.state().sent);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ op: 'raise', mode: 'pin', target: { kind: 'layer', id: 'elevation' } });

  const h1 = { elevation: await hash('elevation'), koppen: await hash('koppen') };
  expect(h1.elevation).not.toBe(h0.elevation);

  // The same edit records applied in Node give the same layers.
  const w = createOrogenWorld({ N: 20000, seed: 12345 });
  const stages = [...orogenStages, ...structuredStages];
  await runPipeline(w, stages, { strict: false, variant: STRUCTURED });
  for (const d of sent) w.edits.append(d);
  await runPipeline(w, stages, { strict: false, variant: STRUCTURED });
  const nodeHash = (...ids: string[]) => sha256(ids.map((id) => bytesOf(w.layers.get('global', id))));
  expect(h1.elevation).toBe(await nodeHash('detail.elevRaw'));
  expect(h1.koppen).toBe(await nodeHash('koppen', 'detail.elevRaw'));

  await page.click('#undo');
  await page.waitForFunction(() => { const s = window.__edit!.state(); return s.cursor === 0 && s.stale.length === 0; }, null, { timeout: 120_000 });
  expect(await hash('elevation')).toBe(h0.elevation);
  expect(await hash('koppen')).toBe(h0.koppen);
  await page.click('#redo');
  await page.waitForFunction(() => { const s = window.__edit!.state(); return s.cursor === 1 && s.stale.length === 0; }, null, { timeout: 120_000 });
  expect(await hash('elevation')).toBe(h1.elevation);
  expect(errors).toEqual([]);
});

// Phase 5c: the brush ring follows the pointer on the flat map and the globe, has the brush's radius, shows only while a
// tool is active, and never changes the world or the edit log.
test('brush cursor: a ring of the brush radius under the pointer on the flat map and the globe', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe && !!window.__edit);
  await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 12345, variant: 'structured' }));
  const hash = await page.evaluate(() => window.__flat!.worldHash());
  const ring = () => page.evaluate(() => window.__edit!.state().ring);
  const raf = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const slide = (id: string, v: number) => page.locator(id).evaluate((el, x) => { (el as HTMLInputElement).value = String(x); el.dispatchEvent(new Event('input')); }, v);
  const ringWidth = () => page.evaluate(() => (document.querySelector('#mapRing path') as SVGGraphicsElement).getBBox().width / (document.querySelector('#mapRing') as SVGSVGElement).viewBox.baseVal.width);

  await page.selectOption('#viewMode', 'flat');
  await page.waitForFunction(() => window.__flat!.ui.state().view === 'flat');
  await page.evaluate(() => window.__flat!.ui.rendered());
  await page.locator('#map').scrollIntoViewIfNeeded();
  const box = (await page.locator('#map').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  // No tool: no ring.
  await page.mouse.move(cx, cy);
  await raf();
  expect((await ring()).flat).toBe('');

  // A tool: a ring whose width is the brush diameter (6° radius on an equirectangular map: 12/360 of the map width).
  await page.selectOption('#tool', 'raise');
  await page.mouse.move(cx + 5, cy + 5);
  await raf();
  expect((await ring()).flat.startsWith('M')).toBe(true);
  expect(await ringWidth()).toBeGreaterThan((12 / 360) * 0.9);
  expect(await ringWidth()).toBeLessThan((12 / 360) * 1.1);
  await slide('#brushRadius', 12);
  await raf();
  expect(await ringWidth()).toBeGreaterThan((24 / 360) * 0.9);
  expect(await ringWidth()).toBeLessThan((24 / 360) * 1.1);

  // Leaving the map hides it.
  await page.mouse.move(box.x - 20, box.y - 20);
  await raf();
  expect((await ring()).flat).toBe('');

  // The globe: a ring of 96 points under the pointer, hidden when the pointer leaves.
  await page.selectOption('#viewMode', 'globe');
  await page.locator('#globe').scrollIntoViewIfNeeded();
  const g = (await page.locator('#globe').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await raf();
  expect((await ring()).globe).toBe(96);
  await page.mouse.move(g.x - 20, g.y - 20);
  await raf();
  expect((await ring()).globe).toBe(0);

  // Nothing was edited or changed.
  expect((await page.evaluate(() => window.__edit!.state())).edits).toBe(0);
  expect(await page.evaluate(() => window.__flat!.worldHash())).toBe(hash);
  expect(errors).toEqual([]);
});
