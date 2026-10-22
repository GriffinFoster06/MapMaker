import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { hashWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const N = 20000, SEED = 4242;

// Stubs a native dialog in the main process so the test can answer it.
const answerSave = (app: ElectronApplication, filePath: string) => app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never; }, filePath);
const answerOpen = (app: ElectronApplication, filePath: string) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never; }, filePath);

// Launches the built desktop app, generates a small world, checks its World hash equals Node's, then saves it through the
// native dialog, loads a different world, and loads the file back.
test('desktop app: isolated, worker engine, World hash equals Node, native save and load', async () => {
  test.setTimeout(180_000);
  // DESKTOP_EXE: test an installed/packaged build (apps/desktop/release/...) instead of the dev bundle.
  const exe = process.env['DESKTOP_EXE'];
  const app = await electron.launch({ ...(exe ? { executablePath: exe } : { args: [APP] }), env: { ...process.env, MAPMAKER_NO_UPDATE_CHECK: '1', MAPMAKER_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => !!window.__globe && !!window.__flat);

    // The same environment as the web app: cross-origin isolation, SharedArrayBuffer, and the secure window settings.
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
    expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined');
    expect(await page.evaluate(() => Object.keys(window.mapmakerDesktop ?? {}).sort())).toEqual(['info', 'openWorld', 'saveFile']);

    const { stats } = await page.evaluate(([n, seed]) => window.__globe!.generate({ N: n!, seed: seed! }), [N, SEED]);
    const hash = await page.evaluate(() => window.__flat!.worldHash());
    // Isolated, so the per-cell kernels ran in the engine worker's pool (decision PK1), and the hash below still equals Node's serial one.
    expect(stats.kernelWorkers).toBeGreaterThan(0);
    expect(stats.kernelCalls).toBeGreaterThan(0);

    const w = createOrogenWorld({ N, seed: SEED });
    await runPipeline(w, [...orogenStages, ...structuredStages], { strict: false, variant: STRUCTURED });
    expect(hash).toBe(await hashWorld(w));

    const dir = mkdtempSync(join(tmpdir(), 'mapmaker-desktop-'));
    const file = join(dir, 'smoke.mapmaker');
    await answerSave(app, file);
    await page.click('#saveWorld');
    await expect(page.locator('#status')).toContainText('saved', { timeout: 60_000 });
    expect(readFileSync(file).subarray(0, 2).toString()).toBe('PK');

    await page.evaluate(() => window.__globe!.generate({ N: 20000, seed: 99 }));
    expect(await page.evaluate(() => window.__flat!.worldHash())).not.toBe(hash);
    await answerOpen(app, file);
    await page.click('#loadWorld');
    await expect(page.locator('#status')).toContainText('loaded 20,001 cells', { timeout: 60_000 });
    expect(await page.evaluate(() => window.__flat!.worldHash())).toBe(hash);

    // A cancelled export writes nothing.
    const png = join(dir, 'never.png');
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = (async () => ({ canceled: true, filePath: '' })) as never; });
    expect(await page.evaluate(() => window.mapmakerDesktop!.saveFile('png', 'x.png', new Uint8Array([1])))).toBeNull();
    await answerSave(app, png);
    expect(await page.evaluate(() => window.mapmakerDesktop!.saveFile('png', 'x.png', new Uint8Array([1, 2, 3])))).toBe(png);
    expect([...readFileSync(png)]).toEqual([1, 2, 3]);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
