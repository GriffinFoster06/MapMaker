/* global window, document, performance, requestAnimationFrame, WebGL2RenderingContext, PerformanceObserver, MessageChannel, Worker, Element, devicePixelRatio, self, navigator, Event, setTimeout */
// Lag spikes while panning the zoomed-out globe (docs/checkpoints/PERFORMANCE_STUDY.md): a scripted stop-and-go drag with
// frame timestamps, long tasks, long animation frames and timed wrappers, in Chromium, Firefox or the Electron app, hidden
// (no window in front of the user's work). Chromium and Electron also record a Chromium trace (GC, layout, tasks).
// Usage: scripts/node24.sh node scripts/perf-pan.mjs <chromium|firefox|electron> <N> <out.json> [configs=all] [--prof]
// Needs the built web app (preview on http://127.0.0.1:4173 for the web browsers) and apps/desktop/dist for Electron.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { chromium, firefox, _electron as electron } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [target, nArg, outFile, cfgArg] = process.argv.slice(2);
const N = Number(nArg), PROF = process.argv.includes('--prof'), TRACE = process.argv.includes('--trace');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALL = ['idle', 'elev', 'elev+ov', 'styled', 'styled+labels', 'styled+labels+ov', 'ring-elev', 'ring-styled+labels'];
const configs = !cfgArg || cfgArg === 'all' || cfgArg.startsWith('--') ? ALL : cfgArg.split(',');

// ---- instrumentation, installed before the app starts ----
const INIT = () => {
  const pm = (window.__pm = { running: false, frames: [], long: [], loaf: [], timers: [], raf: [], msgs: [], gl: [], svg: [], pointer: 0, t0: 0, cnt: { timers: 0, raf: 0, msgs: 0, svg: 0, draws: 0, uploads: 0 } });
  const ch = new MessageChannel();
  const waiters = [];
  ch.port1.onmessage = () => { const w = waiters.shift(); if (w) w(performance.now()); };
  const taskEnd = (cb) => { waiters.push(cb); ch.port2.postMessage(0); }; // runs as a new task: after the current one and its microtasks
  // timers: the span of the callback including the microtasks it queued
  const st = window.setTimeout;
  window.setTimeout = function (f, d, ...a) {
    if (typeof f !== 'function') return st.call(window, f, d, ...a);
    return st.call(window, function (...x) {
      const s = performance.now();
      const r = f.apply(this, x);
      const sync = performance.now() - s;
      if (pm.running) pm.cnt.timers++;
      if (pm.running) taskEnd((e) => { if (e - s > 2) pm.timers.push({ t: s, delay: d ?? 0, syncMs: sync, spanMs: e - s, fn: f.name || String(f).slice(0, 60) }); });
      return r;
    }, d, ...a);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => raf((t) => { const s = performance.now(); if (pm.running) pm.cnt.raf++; f(t); const d = performance.now() - s; if (pm.running && d > 1) pm.raf.push({ t: s, ms: d }); });
  // worker messages (the engine worker's replies handled on the page)
  const wrapMsg = (h) => function (ev) {
    const s = performance.now();
    const r = h.call(this, ev);
    const sync = performance.now() - s;
    if (pm.running) pm.cnt.msgs++;
    if (pm.running) taskEnd((e) => { pm.msgs.push({ t: s, queuedMs: s - ev.timeStamp, syncMs: sync, spanMs: e - s, type: ev.data && ev.data.type ? String(ev.data.type) : typeof ev.data }); });
    return r;
  };
  const od = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage');
  if (od && od.set) Object.defineProperty(Worker.prototype, 'onmessage', { configurable: true, get: od.get, set(h) { od.set.call(this, h ? wrapMsg(h) : h); } });
  const ael = Worker.prototype.addEventListener;
  Worker.prototype.addEventListener = function (t, h, o) { return ael.call(this, t, t === 'message' && typeof h === 'function' ? wrapMsg(h) : h, o); };
  // GL calls that can cost CPU time on the main thread
  for (const m of ['bufferData', 'bufferSubData', 'drawElements', 'texImage2D', 'texSubImage2D', 'readPixels']) {
    const o = WebGL2RenderingContext.prototype[m];
    WebGL2RenderingContext.prototype[m] = function (...a) { const s = performance.now(); const r = o.apply(this, a); const d = performance.now() - s; if (pm.running) { if (m === 'drawElements') pm.cnt.draws++; else if (m.startsWith('buffer')) pm.cnt.uploads++; } if (pm.running && d > 0.3) pm.gl.push({ t: s, fn: m, ms: d, bytes: a[1] && a[1].byteLength ? a[1].byteLength : 0 }); return r; };
  }
  // the label SVG write
  const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get: ih.get, set(v) { const s = performance.now(); ih.set.call(this, v); const d = performance.now() - s; if (pm.running) pm.cnt.svg++; if (pm.running && d > 0.3) pm.svg.push({ t: s, ms: d, chars: String(v).length, id: this.id }); } });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) pm.long.push({ t: e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: false });
  } catch { /* not supported (Firefox) */ }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) pm.loaf.push({ t: e.startTime, ms: e.duration, blockingMs: e.blockingDuration, renderStart: e.renderStart, styleStart: e.styleAndLayoutStart, scripts: (e.scripts || []).map((s) => ({ invoker: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, url: (s.sourceURL || '').split('/').pop(), pos: s.sourceCharPosition, ms: s.duration, forced: s.forcedStyleAndLayoutDuration, pause: s.pauseDuration })) }); }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* not supported */ }
  const tick = (t) => { if (!pm.running) return; pm.frames.push(t); raf(tick); };
  pm.start = () => { pm.running = true; pm.frames = []; pm.long = []; pm.loaf = []; pm.timers = []; pm.raf = []; pm.msgs = []; pm.gl = []; pm.svg = []; pm.cnt = { timers: 0, raf: 0, msgs: 0, svg: 0, draws: 0, uploads: 0 }; pm.t0 = performance.now(); raf(tick); };
  pm.stop = () => { pm.running = false; return { frames: pm.frames, long: pm.long, loaf: pm.loaf, timers: pm.timers, raf: pm.raf, msgs: pm.msgs, gl: pm.gl, svg: pm.svg, cnt: pm.cnt, t0: pm.t0, t1: performance.now() }; };
  // The marker busy-waits 40 ms under a known name and leaves a User Timing mark: the trace and the CPU profile are aligned with performance.now() by it.
  window.__marker__ = function __marker__() { const t = performance.now(); performance.mark('pm-marker'); while (performance.now() - t < 40); return t; };
};

// ---- launch ----
let app = null, browser = null, page, closeAll;
const URL = 'http://127.0.0.1:4173/';
if (target === 'electron') {
  app = await electron.launch({ args: [resolve(root, 'apps/desktop')], env: { ...process.env, MAPMAKER_NO_UPDATE_CHECK: '1', MAPMAKER_TEST: '1' } });
  page = await app.firstWindow();
  // The init script must run before the app: reload once with it installed.
  await page.addInitScript(INIT);
  await page.reload();
  closeAll = () => app.close();
} else {
  const kind = target === 'firefox' ? firefox : chromium;
  browser = await kind.launch({
    headless: true,
    // Playwright's default headless Chromium is a shell build with SwiftShader (software GL) on macOS; channel 'chromium' is the real hardware-GL build.
    ...(target === 'firefox' ? {} : { channel: 'chromium' }),
    ...(target === 'firefox' ? { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } } : { args: ['--enable-precise-memory-info', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] }),
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  page = await ctx.newPage();
  await page.addInitScript(INIT);
  await page.goto(URL);
  closeAll = () => browser.close();
}
const out = { target, N, node: process.version, configs: {} };
try {
  await page.waitForFunction(() => !!window.__globe && !!window.__flat, null, { timeout: 60000 });
  out.env = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    const c = document.getElementById('globe');
    return { renderer: g && e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio, canvas: [c.width, c.height], isolated: self.crossOriginIsolated, ua: navigator.userAgent, cores: navigator.hardwareConcurrency };
  });
  console.error(`[${target} ${N}]`, out.env.renderer, `dpr ${out.env.dpr}`, `canvas ${out.env.canvas}`);
  const gen = await page.evaluate((n) => window.__globe.generate({ N: n, seed: 12345, variant: 'structured' }), N);
  out.generate = { totalMs: Math.round(gen.totalMs), stages: gen.stages };
  console.error(`generated ${N} in ${(gen.totalMs / 1000).toFixed(1)} s`);

  // zoom fully out (OrbitControls maxDistance), then centre the pointer on the globe
  await page.locator('#globe').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await page.locator('#globe').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 120); await sleep(8); }
  await sleep(500);
  const layerIds = await page.evaluate(() => window.__globe.layers);
  out.layerIds = layerIds;
  const elevId = layerIds.find((l) => /elev/i.test(l)) ?? layerIds[0];

  const setOverlays = (on) => page.evaluate((v) => {
    for (const id of ['ovGraticule', 'ovCoast', 'ovTissot', 'ovRivers', 'ovFurniture']) { const el = document.getElementById(id); if (el.checked !== v) { el.checked = v; el.dispatchEvent(new Event('change')); } }
  }, on);
  const setLabels = (on) => page.evaluate((v) => { const el = document.getElementById('ovLabels'); el.checked = v; el.dispatchEvent(new Event('change')); }, on);
  const setTool = (id) => page.evaluate((v) => { const s = document.getElementById('tool'); s.value = v; s.dispatchEvent(new Event('change')); }, id);

  // marker for aligning the trace and the CPU profile with performance.now()
  const marker = async () => page.evaluate(() => window.__marker__());

  async function script(hover) {
    // stop-and-go: segments of dragging separated by rests of different lengths (the label plan fires 140 ms after a rest)
    const rests = [120, 170, 260, 600, 150, 400];
    let n = 0;
    for (let seg = 0; seg < rests.length; seg++) {
      const dir = seg % 2 ? -1 : 1;
      if (!hover) { await page.mouse.move(cx - dir * 150, cy + 20 * dir); await page.mouse.down(); }
      for (let i = 0; i <= 90; i++) {
        const u = i / 90;
        await page.mouse.move(cx - dir * 150 + dir * 300 * u, cy + 20 * dir + 90 * Math.sin(u * Math.PI * (1 + (seg % 3))) * (seg % 2 ? 1 : -1));
        n++;
        await sleep(7);
      }
      if (!hover) await page.mouse.up();
      await sleep(rests[seg]);
    }
    return n;
  }

  for (const name of configs) {
    const styled = name.startsWith('styled') || name.endsWith('styled+labels');
    const labels = name.includes('labels'), ov = name.includes('+ov'), ring = name.startsWith('ring');
    const flatCfg = name.startsWith('flat') && name !== 'flat-switch' && !name.startsWith('flat-pan');
    const flatPan = name.startsWith('flat-pan'), flatSwitch = name === 'flat-switch';
    await setTool('');
    await setOverlays(ov || (flatCfg && name !== 'flat-plain') || flatPan);
    await page.evaluate((id) => window.__globe.setLayer(id), styled || name === 'flat-styled' || name === 'flat-pan-styled' ? 'styled' : elevId);
    await setLabels(labels || name === 'flat-styled' || name === 'flat-pan-styled');
    if (flatCfg) await page.evaluate(() => { const s = document.getElementById('viewMode'); s.value = 'flat'; s.dispatchEvent(new Event('change')); });
    await sleep(1500); // let the first label plan and any colour upload finish
    // trace / profile
    let cdp = null, traceFile = null, profile = null;
    if (TRACE && target !== 'firefox') {
      const cats = 'devtools.timeline,v8,disabled-by-default-v8.gc,blink.user_timing,gpu,cc';
      if (app) await app.evaluate(({ contentTracing }, c) => contentTracing.startRecording({ included_categories: c.split(','), excluded_categories: [] }), cats);
      else await browser.startTracing(page, { categories: cats.split(',') });
    }
    if (PROF && target !== 'firefox') {
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
      await cdp.send('Profiler.start');
    }
    const mk = await marker();
    await sleep(100);
    await page.evaluate(() => window.__pm.start());
    let moves = 0;
    let switches = null;
    if (name === 'idle') await sleep(5000);
    else if (flatSwitch) {
      // The first switch from the globe to the flat map: the world's textures are prepared and uploaded (the page stalls meanwhile).
      switches = await page.evaluate(async () => {
        const t = performance.now(), s = document.getElementById('viewMode');
        s.value = 'flat'; s.dispatchEvent(new Event('change'));
        const st = document.getElementById('mapStatus');
        while (!/GPU$|CPU at/.test(st.textContent)) await new Promise((r) => setTimeout(r, 20));
        const ms = performance.now() - t;
        await new Promise((r) => setTimeout(r, 500));
        s.value = 'globe'; s.dispatchEvent(new Event('change'));
        return [{ id: 'first-flat', ms }];
      });
    }
    else if (flatPan) {
      // Zoom in 4x with the wheel, then drag-pan the flat map (stop and go, as the globe script); the overlays are on.
      await page.evaluate(() => { const s = document.getElementById('viewMode'); s.value = 'flat'; s.dispatchEvent(new Event('change')); });
      await page.evaluate(() => document.getElementById('mapReset').click());
      await sleep(1500);
      const mb = await page.locator('#map').boundingBox();
      const mx = mb.x + mb.width / 2, my2 = mb.y + mb.height / 2;
      await page.mouse.move(mx, my2);
      for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -120); await sleep(30); }
      await sleep(1200);
      await page.evaluate(() => window.__pm.start());
      const rests2 = [150, 300, 150, 500];
      for (let seg = 0; seg < rests2.length; seg++) {
        const dir = seg % 2 ? -1 : 1;
        await page.mouse.move(mx - dir * 150, my2); await page.mouse.down();
        for (let i = 0; i <= 90; i++) { await page.mouse.move(mx - dir * 150 + dir * 300 * (i / 90), my2 + 40 * Math.sin((i / 90) * Math.PI * 2)); moves++; await sleep(7); }
        await page.mouse.up();
        await sleep(rests2[seg]);
      }
    }
    else if (flatCfg) {
      // rotation sweep inside the page, one change per animation frame (the flat map redraws on every change)
      await page.evaluate(async () => {
        const lam = document.getElementById('rotLambda');
        for (let i = 0; i < 200; i++) { lam.value = String(-180 + (i * 2.4) % 360); lam.dispatchEvent(new Event('input')); await new Promise((r) => requestAnimationFrame(r)); }
      });
    }
    else if (name === 'switch') {
      // layer switches: the colour buffer rewrite (and the carto data on the first styled paint) on the page's main thread
      switches = await page.evaluate(async (elev) => {
        const r = [];
        for (const id of ['styled', elev, 'styled', 'koppen', elev]) { const t = performance.now(); await window.__globe.setLayer(id); r.push({ id, ms: performance.now() - t }); await new Promise((x) => setTimeout(x, 900)); }
        return r;
      }, elevId);
    }
    else {
      if (ring) await setTool('raise');
      await page.mouse.move(cx, cy);
      moves = await script(ring);
    }
    await sleep(700);
    const data = await page.evaluate(() => window.__pm.stop());
    if (PROF && cdp) { profile = (await cdp.send('Profiler.stop')).profile; await cdp.detach(); }
    if (TRACE && target !== 'firefox') {
      const tf = resolve(root, `docs/perf-study/raw/trace-${target}-${N}-${name.replace(/\+/g, '_')}.json`);
      mkdirSync(dirname(tf), { recursive: true });
      if (app) {
        await app.evaluate(({ contentTracing }, f) => contentTracing.stopRecording(f), tf);
      } else {
        const buf = await browser.stopTracing();
        writeFileSync(tf, buf);
      }
      traceFile = tf;
    }
    if (profile) { const pf = resolve(root, `docs/perf-study/raw/prof-${target}-${N}-${name.replace(/\+/g, '_')}.json`); mkdirSync(dirname(pf), { recursive: true }); writeFileSync(pf, JSON.stringify(profile)); data.profileFile = pf; }
    if (flatCfg || flatPan) await page.evaluate(() => { const s = document.getElementById('viewMode'); s.value = 'globe'; s.dispatchEvent(new Event('change')); });
    data.switches = switches; data.marker = mk; data.moves = moves; data.traceFile = traceFile;
    out.configs[name] = data;
    const f = data.frames, gaps = f.slice(1).map((t, i) => t - f[i]).slice(1).sort((a, b) => a - b), q = (x) => gaps[Math.floor((gaps.length - 1) * x)] ?? 0;
    console.error(`  ${name.padEnd(20)} frames ${f.length} gap p50 ${q(0.5).toFixed(1)} p95 ${q(0.95).toFixed(1)} p99 ${q(0.99).toFixed(1)} max ${(gaps.at(-1) ?? 0).toFixed(1)}  >25ms ${gaps.filter((g) => g > 25).length}  longtasks ${data.long.length} loaf ${data.loaf.length}`);
  }
} finally {
  mkdirSync(dirname(resolve(outFile)), { recursive: true });
  writeFileSync(resolve(outFile), JSON.stringify(out));
  await closeAll();
}
