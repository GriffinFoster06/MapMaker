/* global window, document, performance, requestAnimationFrame, WebGL2RenderingContext, HTMLCanvasElement, Element, devicePixelRatio, Event, setTimeout */
// Where the frame time of the globe and the flat map goes (docs/checkpoints/PERFORMANCE_STUDY.md): GPU+draw cost per frame
// (a readPixels after each draw waits for the GPU), the share that scales with the triangle count, and the effect of the
// canvas settings (MSAA, preserveDrawingBuffer). Hidden window / headless browser; nothing opens in front of the user's work.
// Usage: scripts/node24.sh node scripts/perf-render.mjs <chromium|firefox|electron> <N> <out.json> [variants=base,noPDB,noAA,noAA+noPDB]
// VIEW=<w>x<h>@<dpr> sets the web browsers' viewport and pixel ratio (default 1280x800@2); the Electron window keeps its own size.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { chromium, firefox, _electron as electron } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [target, nArg, outFile, varArg] = process.argv.slice(2);
const N = Number(nArg);
const variants = (varArg ?? 'base,noPDB,noAA,noAA+noPDB').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const initFor = (variant) => `(${((v) => {
  const pm = (window.__pm = { sync: false, frac: 1, cost: [], draws: 0, svg: [], rafGaps: [], log: [] });
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl2' && this.id === 'globe') {
      attrs = { ...(attrs || {}) };
      if (v.includes('noAA')) attrs.antialias = false;
      if (v.includes('noPDB')) attrs.preserveDrawingBuffer = false;
    }
    return gc.call(this, type, attrs);
  };
  const proto = WebGL2RenderingContext.prototype;
  if (v.includes('cull')) {
    // three.js disables face culling for DoubleSide materials; with 'cull' the far side's triangles are culled instead (test of FrontSide)
    const dis = proto.disable;
    proto.disable = function (cap) { if (cap === this.CULL_FACE && this.canvas.id === 'globe') { this.enable(this.CULL_FACE); this.cullFace(this.BACK); return; } return dis.call(this, cap); };
  }
  if (v.includes('sortTris')) {
    // test of vertex-cache locality: the index buffer re-ordered by the smallest vertex id of each triangle (cells are numbered along a spiral), same triangles
    const bd = proto.bufferData;
    proto.bufferData = function (target, data, usage, ...r) {
      if (target === this.ELEMENT_ARRAY_BUFFER && data instanceof Uint32Array && data.length > 3e6) {
        const nT = data.length / 3; let maxId = 0; for (let i = 0; i < data.length; i++) if (data[i] > maxId) maxId = data[i];
        const key = new Uint32Array(nT), cnt = new Uint32Array(maxId + 2);
        for (let t = 0; t < nT; t++) { const k = Math.min(data[3 * t], data[3 * t + 1], data[3 * t + 2]); key[t] = k; cnt[k + 1]++; }
        for (let i = 0; i <= maxId; i++) cnt[i + 1] += cnt[i];
        const out = new Uint32Array(data.length);
        for (let t = 0; t < nT; t++) { const o = cnt[key[t]]++; out[3 * o] = data[3 * t]; out[3 * o + 1] = data[3 * t + 1]; out[3 * o + 2] = data[3 * t + 2]; }
        data = out;
      }
      return bd.call(this, target, data, usage, ...r);
    };
  }
  for (const m of ['drawElements', 'drawArrays']) {
    const orig = proto[m];
    proto[m] = function (...a) {
      pm.draws++;
      if (m === 'drawElements' && pm.frac !== 1 && this.canvas.id === 'globe') a[1] = Math.floor(a[1] * pm.frac / 3) * 3;
      const t = performance.now();
      const r = orig.apply(this, a);
      const cpu = performance.now() - t;
      if (pm.sync) {
        this.readPixels(0, 0, 1, 1, this.RGBA, this.UNSIGNED_BYTE, new Uint8Array(4)); // waits for the GPU
        pm.cost.push({ id: this.canvas.id, cpu, total: performance.now() - t });
      }
      return r;
    };
  }
  const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get: ih.get, set(x) { const s = performance.now(); ih.set.call(this, x); if (pm.sync) pm.svg.push({ id: this.id, ms: performance.now() - s, chars: String(x).length }); } });
}).toString()})(${JSON.stringify(variant)})`;

async function launch(variant) {
  if (target === 'electron') {
    const app = await electron.launch({ args: [resolve(root, 'apps/desktop')], env: { ...process.env, MAPMAKER_NO_UPDATE_CHECK: '1', MAPMAKER_TEST: '1' } });
    const page = await app.firstWindow();
    await page.addInitScript(initFor(variant));
    await page.reload();
    return { page, close: () => app.close() };
  }
  const kind = target === 'firefox' ? firefox : chromium;
  const browser = await kind.launch({ headless: true, ...(target === 'firefox' ? { firefoxUserPrefs: { 'webgl.force-enabled': true } } : { channel: 'chromium', args: ['--ignore-gpu-blocklist'] }) });
  const [vw, vh, dsf] = (process.env['VIEW'] ?? '1280x800@2').split(/[x@]/).map(Number);
  const page = await (await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf })).newPage();
  await page.addInitScript(initFor(variant));
  await page.goto('http://127.0.0.1:4173/');
  return { page, close: () => browser.close() };
}

const q = (a, x) => { const s = a.slice().sort((p, r) => p - r); return s[Math.floor((s.length - 1) * x)] ?? 0; };
const stat = (a) => ({ n: a.length, median: +q(a, 0.5).toFixed(2), p95: +q(a, 0.95).toFixed(2), max: +Math.max(0, ...a).toFixed(2) });
const out = { target, N, variants: {} };
for (const variant of variants) {
  const { page, close } = await launch(variant);
  try {
    await page.waitForFunction(() => !!window.__globe && !!window.__flat, null, { timeout: 60000 });
    if (!out.env) out.env = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); const c = document.getElementById('globe'); return { renderer: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio, canvas: [c.width, c.height] }; });
    await page.evaluate((n) => window.__globe.generate({ N: n, seed: 12345, variant: 'structured' }), N);
    const res = { globe: {}, flat: {} };
    await page.locator('#globe').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = await page.locator('#globe').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const drag = async (moves = 120) => { await page.mouse.move(cx, cy); await page.mouse.down(); for (let i = 0; i < moves; i++) { await page.mouse.move(cx + 140 * Math.sin(i / 20), cy + 70 * Math.cos(i / 20)); await sleep(9); } await page.mouse.up(); };
    const measure = async (frac) => {
      await page.evaluate((f) => { const p = window.__pm; p.frac = f; p.sync = true; p.cost = []; p.draws = 0; }, frac);
      await drag();
      const c = await page.evaluate(() => { const p = window.__pm; p.sync = false; p.frac = 1; return p.cost.filter((x) => x.id === 'globe'); });
      return { total: stat(c.map((x) => x.total)), cpu: stat(c.map((x) => x.cpu)) };
    };
    // default view, then fully zoomed out
    res.globe.nearFull = await measure(1);
    for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 120); await sleep(8); }
    await sleep(400);
    for (const f of [1, 0.5, 0.25, 0]) res.globe[`out_frac${f}`] = await measure(f);
    res.globe.pixelSum = await page.evaluate(() => window.__globe.pixelSum());
    res.globe.lit = await page.evaluate(() => window.__globe.litFraction());
    // flat map: rotation sweep driven inside the page (one change per animation frame), GPU cost per draw and the overlay write
    await page.evaluate(() => { const s = document.getElementById('viewMode'); s.value = 'flat'; s.dispatchEvent(new Event('change')); });
    await sleep(1200);
    const flatRun = async (label, layer, overlays) => {
      await page.evaluate(async ([ly, ov]) => {
        await window.__globe.setLayer(ly);
        for (const id of ['ovGraticule', 'ovCoast']) { const e = document.getElementById(id); e.checked = ov; e.dispatchEvent(new Event('change')); }
      }, [layer, overlays]);
      await sleep(1500);
      return page.evaluate(async () => {
        const p = window.__pm; p.sync = true; p.cost = []; p.svg = []; p.draws = 0;
        const lam = document.getElementById('rotLambda'), gaps = [];
        let last = performance.now();
        for (let i = 0; i < 150; i++) {
          lam.value = String(-180 + (i * 2.4) % 360); lam.dispatchEvent(new Event('input'));
          await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); gaps.push(t - last); last = t;
        }
        await new Promise((r) => setTimeout(r, 400));
        p.sync = false;
        return { gaps, cost: p.cost.filter((x) => x.id === 'mapGpu'), svg: p.svg.filter((x) => x.id === 'mapSvg'), draws: p.draws };
      });
    };
    for (const [label, layer, ov] of [['elev', 'elevation', false], ['elev+ov', 'elevation', true], ['styled+ov', 'styled', true]]) {
      const r = await flatRun(label, layer, ov);
      res.flat[label] = { gap: stat(r.gaps.slice(2)), gpuDraw: stat(r.cost.map((x) => x.total)), gpuCpu: stat(r.cost.map((x) => x.cpu)), svgWrite: stat(r.svg.map((x) => x.ms)), svgChars: Math.round(q(r.svg.map((x) => x.chars), 0.5)), draws: r.draws };
    }
    out.variants[variant] = res;
    console.error(variant, 'globe out full', JSON.stringify(res.globe.out_frac1.total), 'flat elev', JSON.stringify(res.flat['elev'].gpuDraw));
  } finally { await close(); }
}
mkdirSync(dirname(resolve(outFile)), { recursive: true });
writeFileSync(resolve(outFile), JSON.stringify(out, null, 1));
