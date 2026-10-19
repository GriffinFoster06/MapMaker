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
