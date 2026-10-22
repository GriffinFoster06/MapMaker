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

// Dragging the globe draws a frame for the pointer moves, not one frame per drag. The render request used to cancel the
// pending frame and ask again on every camera change, so moves arriving about once per frame (as Playwright's do, and as a
// 120 Hz trackpad's can) starved the globe: one draw for 150 moves. The count of GL draw calls is the evidence.
test('globe: a drag draws frames while it moves (no starvation)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe);
  await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 12345 }));
  await page.locator('#globe').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    const proto = WebGL2RenderingContext.prototype;
    for (const m of ['drawElements', 'drawElementsInstanced'] as const) {
      const orig = proto[m] as (...a: unknown[]) => unknown;
      (proto as unknown as Record<string, unknown>)[m] = function (this: WebGL2RenderingContext, ...a: unknown[]) { w.__draws++; return orig.apply(this, a); };
    }
  });
  const box = (await page.locator('#globe').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, MOVES = 120;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < MOVES; i++) await page.mouse.move(cx + 120 * Math.sin(i / 20), cy + 70 * Math.cos(i / 20));
  await page.mouse.up();
  await page.waitForTimeout(300);
  const draws = await page.evaluate(() => (window as unknown as { __draws: number }).__draws);
  expect(draws, `${draws} draws for ${MOVES} pointer moves`).toBeGreaterThan(MOVES / 2);
  expect(errors).toEqual([]);
});

// The globe draws front faces only, with the triangles ordered by lowest vertex, but only where that draws the same picture
// (performance study, "After the first fixes"): `Globe.verifyFastPath` compares the two ways on random colours from several
// viewpoints when a mesh is set and keeps the former way unless every pixel agrees. Here the faster way, when it is in use, is
// compared with the former way on the real layers from other viewpoints: not one pixel inside the disc may differ, and on the limb
// at most 3e-5 of the disc's area (the former way draws far-side triangles at the depth of the front ones there). Which way a browser ends up with
// is recorded (software GL and Firefox are expected to keep the former way).
test('globe: the faster draw path, where it is used, paints the same pixels as the former one', async ({ page, browserName }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe);
  await page.evaluate(() => window.__globe!.generate({ N: 50000, seed: 12345 }));
  const path = await page.evaluate(() => window.__globe!.drawPath());
  info.annotations.push({ type: 'globe-draw-path', description: `${browserName}: ${path}` });
  await page.locator('#globe').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await page.locator('#globe').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const seen = new Set<number>();
  for (const [dx, dy, wheel] of [[0, 0, 0], [140, 40, 0], [-90, -120, 400], [200, 10, -300]] as const) {
    if (dx || dy) { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 4 }); await page.mouse.move(cx + dx, cy + dy, { steps: 4 }); await page.mouse.up(); }
    if (wheel) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, wheel); }
    await page.waitForTimeout(300); // the camera and its pending frame settle before the pictures are taken
    for (const layer of ['elevation', 'koppen']) {
      await page.evaluate((l) => window.__globe!.setLayer(l), layer);
      const r = await page.evaluate(async () => {
        const g = window.__globe!, c = document.getElementById('globe') as HTMLCanvasElement;
        const grab = async () => {
          const sum = g.pixelSum(); // draws, then the canvas holds that picture
          const bm = await createImageBitmap(c), o = new OffscreenCanvas(bm.width, bm.height), x = o.getContext('2d')!;
          x.drawImage(bm, 0, 0);
          const img = x.getImageData(0, 0, bm.width, bm.height);
          return { sum, img, data: img.data };
        };
        const now = await grab();
        g.setFormerDraw(true);
        const old = await grab();
        g.setFormerDraw(false);
        // The disc: the farthest pixel that is not the clear colour (5, 6, 13) from the canvas centre. Inside 97% of it every pixel must
        // agree; on the limb the former path may differ in a few samples (far-side triangles at the depth of the front ones).
        const { width: W, height: H } = now.img;
        let R = 0;
        for (let i = 0; i < now.data.length; i += 4) {
          if (now.data[i] === 5 && now.data[i + 1] === 6 && now.data[i + 2] === 13) continue;
          const p = i >> 2, d = Math.hypot((p % W) - W / 2, Math.floor(p / W) - H / 2);
          if (d > R) R = d;
        }
        let inside = 0, rim = 0, max = 0;
        for (let i = 0; i < now.data.length; i += 4) {
          const d = Math.max(Math.abs(now.data[i]! - old.data[i]!), Math.abs(now.data[i + 1]! - old.data[i + 1]!), Math.abs(now.data[i + 2]! - old.data[i + 2]!));
          if (!d) continue;
          const p = i >> 2;
          if (Math.hypot((p % W) - W / 2, Math.floor(p / W) - H / 2) < 0.97 * R) inside++; else rim++;
          if (d > max) max = d;
        }
        return { sumNow: now.sum, sumOld: old.sum, inside, rim, max, area: Math.PI * R * R };
      });
      const msg = `${browserName} (${path}) ${layer}: ${r.inside} inside and ${r.rim} limb pixels differ (max ${r.max}/255), pixelSum ${r.sumNow} against ${r.sumOld}`;
      expect(r.inside, msg).toBe(0);
      expect(r.rim, msg).toBeLessThanOrEqual(Math.ceil(3e-5 * r.area));
      if (path === 'former') expect(r.sumNow, msg).toBe(r.sumOld);
      seen.add(r.sumNow);
    }
  }
  expect(seen.size, 'the views differ from each other').toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

// The batch projector of the label planner (Globe.projectSampler) computes with three.js's own formulas, operation for operation:
// on a grid of 3000 points from several camera positions it gives the same pixel position, to the last bit, as projectLonLat.
test('globe: the batch projector equals projectLonLat bit for bit', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe);
  await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 12345 }));
  await page.locator('#globe').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await page.locator('#globe').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy, wheel] of [[0, 0, 0], [130, 55, 0], [-160, -30, 500], [60, 90, -700]] as const) {
    if (dx || dy) { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + dx, cy + dy, { steps: 6 }); await page.mouse.up(); }
    if (wheel) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, wheel); await page.waitForTimeout(200); }
    await page.evaluate(() => window.__globe!.pixelSum()); // a draw, so the camera matrices are those of the picture
    const r = await page.evaluate(() => window.__globe!.projectionDiffs());
    expect(r.points).toBeGreaterThan(2500);
    expect(r.visible, 'some points are visible').toBeGreaterThan(200);
    expect(r.differing).toBe(0);
  }
});
