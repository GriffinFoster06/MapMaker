/* global window, document, performance, requestAnimationFrame, WebGL2RenderingContext, devicePixelRatio, self */
// Graphics status and frame rate of the desktop app (docs/RELEASING.md, "Check the graphics and frame rate").
// Launches the built desktop app (npm run desktop:build first; DESKTOP_EXE=<path to MapMaker.app/Contents/MacOS/MapMaker>
// tests an installed build), prints the GPU status, generates a world and drags the globe, then prints the frame figures.
// Usage: scripts/node24.sh npm run desktop:perf            (N=200000 cells by default; N=1000000 for a bigger world)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { _electron as electron } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.env['N'] ?? 200_000), MOVES = 180;
const exe = process.env['DESKTOP_EXE'];
const app = await electron.launch({ ...(exe ? { executablePath: exe } : { args: [resolve(root, 'apps/desktop')] }), env: { ...process.env, MAPMAKER_NO_UPDATE_CHECK: '1' } });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);

  const gpu = await app.evaluate(({ app: a }) => a.getGPUFeatureStatus());
  const gl = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    const ext = g?.getExtension('WEBGL_debug_renderer_info');
    const c = document.getElementById('globe');
    return { renderer: g && ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio, css: [c.clientWidth, c.clientHeight], buffer: [c.width, c.height], isolated: self.crossOriginIsolated };
  });
  const software = !gl.renderer || /swiftshader|llvmpipe|software|basic render/i.test(gl.renderer);
  console.log(`WebGL renderer   ${gl.renderer ?? 'none'}  ->  ${software ? 'SOFTWARE (slow)' : 'hardware'}`);
  console.log(`GPU status       webgl=${gpu['webgl']} gpu_compositing=${gpu['gpu_compositing']} rasterization=${gpu['rasterization']} skia_graphite=${gpu['skia_graphite']}`);
  console.log(`Globe canvas     ${gl.css.join('x')} CSS px at device pixel ratio ${gl.dpr} = ${gl.buffer.join('x')} buffer px; cross-origin isolated: ${gl.isolated}`);

  const gen = await page.evaluate((n) => window.__globe.generate({ N: n, seed: 12345 }), N);
  console.log(`Generation       ${N.toLocaleString('en')} cells in ${(gen.totalMs / 1000).toFixed(2)} s`);

  // Count the GL draw calls and the animation-frame intervals while a drag moves the globe.
  await page.evaluate(() => {
    window.__perf = { draws: 0, sync: false, cost: [], frames: [], stop: false };
    const p = window.__perf, proto = WebGL2RenderingContext.prototype;
    for (const m of ['drawElements', 'drawElementsInstanced']) {
      const orig = proto[m];
      proto[m] = function (...a) {
        p.draws++;
        if (!p.sync) return orig.apply(this, a);
        const t = performance.now(), r = orig.apply(this, a);
        this.readPixels(0, 0, 1, 1, this.RGBA, this.UNSIGNED_BYTE, new Uint8Array(4)); // waits for the GPU to finish the draw
        p.cost.push(performance.now() - t);
        return r;
      };
    }
  });
  await page.locator('#globe').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await page.locator('#globe').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const drag = async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < MOVES; i++) await page.mouse.move(cx + 140 * Math.sin(i / 30), cy + 80 * Math.cos(i / 30));
    await page.mouse.up();
  };
  await page.evaluate(() => { const p = window.__perf; let last = performance.now(); p.t0 = last; const tick = (t) => { p.frames.push(t - last); last = t; if (!p.stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await drag();
  await page.evaluate(() => { window.__perf.stop = true; window.__perf.sync = true; });
  await drag(); // second drag: each draw waits for the GPU, giving the cost per frame
  const r = await page.evaluate(() => {
    const p = window.__perf, f = p.frames.slice(2).sort((a, b) => a - b), c = p.cost.slice().sort((a, b) => a - b), q = (a, x) => a[Math.floor((a.length - 1) * x)];
    return { draws: p.draws, animFps: 1000 / q(f, 0.5), p95Ms: q(f, 0.95), costMedian: q(c, 0.5), costP95: q(c, 0.95) };
  });
  console.log(`Globe drag       ${2 * MOVES} pointer moves (two drags) -> ${r.draws} draw calls (about one per move is healthy; far fewer means frames are being dropped)`);
  console.log(`Frame rate       animation frames ${r.animFps.toFixed(0)} per second, slowest 5% over ${r.p95Ms.toFixed(1)} ms`);
  console.log(`Cost per frame   ${r.costMedian.toFixed(1)} ms median, ${r.costP95.toFixed(1)} ms slowest 5% (draw plus GPU, at ${N.toLocaleString('en')} cells)`);
  console.log('A frame cost under about 8 ms keeps a 120 Hz display smooth; under about 16 ms, a 60 Hz display.');
} finally {
  await app.close();
}
