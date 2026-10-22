import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { capture, launchSession } from './session';

const N = 20000, SEED = 4242;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// Window states the user can put the app in. The test never puts an opaque window in front of the user's work, so every state is
// reached without being drawn on screen: "hidden" is the default test mode, "shown" and "minimised" use a fully transparent window
// (setOpacity(0)), which the compositor still treats as visible and which the user cannot see.
const win = (app: ElectronApplication, fn: 'hide' | 'showInactive' | 'minimize' | 'restore' | 'setOpacity0') =>
  app.evaluate(({ BrowserWindow }, f) => { const w = BrowserWindow.getAllWindows()[0]!; if (f === 'setOpacity0') w.setOpacity(0); else (w[f] as () => void)(); }, fn);

async function pngInfo(b: Buffer) { return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; }

// Proof that screenshots do not depend on the window being visible: the same view captured hidden, shown (transparent),
// hidden again and minimised gives identical, non-blank pixels, and the page keeps animating while hidden.
test('desktop capture: identical and non-blank whether the window is hidden, shown or minimised', async () => {
  test.setTimeout(180_000);
  const s = await launchSession();
  try {
    const { app, page } = s;
    await page.waitForFunction(() => !!window.__globe && !!window.__flat);
    await page.evaluate(([n, seed]) => window.__globe!.generate({ N: n!, seed: seed! }), [N, SEED]);
    // Freeze anything animated and hide the native overlay scrollbar (OS chrome that fades in and out) so a repeated capture of the same view is bit-identical.
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}html{scrollbar-width:none}::-webkit-scrollbar{display:none}' });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    await page.locator('#globe').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const hidden = await capture(app);
    const info = await pngInfo(hidden);
    expect(info.width).toBeGreaterThan(800);
    // The native window is really hidden: the state this test claims to cover (the page itself reports "visible" because
    // backgroundThrottling is off, which is the point).
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);

    // Not blank: the globe canvas region of the capture (WebGL, the part most likely to come back black or empty) holds many colours.
    const rect = await page.locator('#globe').boundingBox();
    const innerW = await page.evaluate(() => innerWidth);
    expect(rect!.height).toBeGreaterThan(300);
    const colours = await page.evaluate(async ([b64, r, w]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const k = img.width / (w as number), box = r as { x: number; y: number; width: number; height: number };
      const c = new OffscreenCanvas(Math.round(box.width * k), Math.round(box.height * k)), g = c.getContext('2d')!;
      g.drawImage(img, box.x * k, box.y * k, box.width * k, box.height * k, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data, set = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 13) set.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      return set.size;
    }, [hidden.toString('base64'), rect, innerW] as const);
    expect(colours).toBeGreaterThan(200);

    // Visible baseline: shown (fully transparent, so nothing appears on the user's screen), then the same capture.
    await win(app, 'setOpacity0');
    await win(app, 'showInactive');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const shown = await capture(app);
    expect(sha(shown)).toBe(sha(hidden));

    await win(app, 'minimize');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    const minimised = await capture(app);
    expect(sha(minimised)).toBe(sha(hidden));

    await win(app, 'restore');
    await win(app, 'hide');
    const hiddenAgain = await capture(app);
    expect(sha(hiddenAgain)).toBe(sha(hidden));

    // Timers and animation frames keep running while the window is hidden (backgroundThrottling: false).
    const ticks = await page.evaluate(() => new Promise<number>((resolve) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(f); else resolve(n); }; requestAnimationFrame(f); }));
    expect(ticks).toBeGreaterThan(15);
  } finally {
    await s.close();
  }
});

// Recorded mode: a hidden window still yields a video and a numbered screenshot sequence for the user to watch afterwards.
test('desktop recorded mode: video and numbered screenshots are saved from a hidden window', async () => {
  test.setTimeout(180_000);
  const dir = mkdtempSync(join(tmpdir(), 'mapmaker-record-'));
  const s = await launchSession({ record: 'run', feedbackDir: dir });
  try {
    await s.page.waitForFunction(() => !!window.__globe && !!window.__flat);
    await s.page.evaluate(([n, seed]) => window.__globe!.generate({ N: n!, seed: seed! }), [N, SEED]);
    await s.shot('globe');
    await s.page.selectOption('#viewMode', 'flat');
    await s.page.waitForTimeout(500);
    await s.shot('flat');
  } finally {
    await s.close();
  }
  const files = readdirSync(join(dir, 'run')).sort();
  expect(files.filter((f) => /^\d\d-.*\.png$/.test(f))).toEqual(['01-globe.png', '02-flat.png']);
  const video = files.find((f) => f.endsWith('.webm'));
  expect(video).toBeTruthy();
  expect(statSync(join(dir, 'run', video!)).size).toBeGreaterThan(10_000);
  expect(statSync(join(dir, 'run', '01-globe.png')).size).toBeGreaterThan(20_000);
});
