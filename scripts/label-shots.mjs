/* global window, document */
// Renders the label matrix of the desktop app, hidden (MAPMAKER_TEST=1; nothing opens on screen), and measures it.
// Usage: scripts/node24.sh node scripts/label-shots.mjs <outDir> [set]   (sets: matrix (default), quick)
// Writes <outDir>/NN-<name>.png (the map or globe region, through webContents.capturePage) and <outDir>/report.json
// (per shot: label count, overlapping pairs, clipped labels, per-kind counts, the text of every label).
// Needs `npm run desktop:build` first. Set RECORD=<name> to also save a video to docs/feedback/<name>/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { launchSession } from '../apps/desktop/e2e/session.ts';

const out = resolve(process.argv[2] ?? 'label-shots'), set = process.argv[3] ?? 'matrix';
mkdirSync(out, { recursive: true });
const s = await launchSession(process.env['RECORD'] ? { record: process.env['RECORD'] } : {});
const { page } = s;
const report = [];
let n = 0;

const settle = (ms = 700) => page.waitForTimeout(ms);
const generate = async (N, seed) => { await page.evaluate(([a, b]) => window.__globe.generate({ N: a, seed: b }), [N, seed]); };

// Measures the labels currently in `sel` (an <svg> of the map or the globe): overlaps between label boxes and labels leaving the view.
const measure = (sel, boxSel) => page.evaluate(([svgSel, wrapSel]) => {
  const wrap = document.querySelector(wrapSel).getBoundingClientRect();
  const els = [...document.querySelectorAll(`${svgSel} .carto-label`)];
  const items = els.map((e) => { const r = e.getBoundingClientRect(); return { kind: [...e.classList].find((c) => c.startsWith('carto-') && c !== 'carto-label')?.slice(6), text: e.textContent, x1: r.left - wrap.left, y1: r.top - wrap.top, x2: r.right - wrap.left, y2: r.bottom - wrap.top, op: Number(e.getAttribute('opacity') ?? 1) }; });
  let overlaps = 0; const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j], w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    if (w > 1 && h > 1) { overlaps++; pairs.push([a.text, b.text]); }
  }
  const clipped = items.filter((a) => a.x1 < -1 || a.y1 < -1 || a.x2 > wrap.width + 1 || a.y2 > wrap.height + 1).map((a) => a.text);
  const kinds = {}; for (const a of items) kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
  return { count: items.length, overlaps, pairs: pairs.slice(0, 8), clipped, kinds, texts: items.map((a) => `${a.kind}:${a.text}`) };
}, [sel, boxSel]);

const shot = async (name, boxSel, svgSel) => {
  await page.locator(boxSel).evaluate((el) => el.scrollIntoView({ block: 'center' })); await settle(150);
  const rect = await page.locator(boxSel).boundingBox();
  const png = await s.shot(name, rect);
  const file = `${String(++n).padStart(2, '0')}-${name}.png`;
  writeFileSync(resolve(out, file), png);
  const m = await measure(svgSel, boxSel);
  report.push({ file, name, ...m });
  console.log(`${file}  labels ${m.count}  overlaps ${m.overlaps}  clipped ${m.clipped.length}  ${JSON.stringify(m.kinds)}`);
};

const wheelAt = async (boxSel, dy) => { const b = await page.locator(boxSel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, dy); };
const zoomTo = async (z) => { await page.click('#mapReset'); await settle(300); if (z > 1) { await wheelAt('#map', -Math.log(z) / 0.0015); } await settle(900); };
const flat = async (projection, theme, labels = true) => {
  await page.selectOption('#viewMode', 'flat'); await page.selectOption('#projection', projection); await page.selectOption('#styleSel', theme);
  const cb = page.locator('#ovLabels'); if ((await cb.isChecked()) !== labels) await cb.click();
  await settle(900); await page.evaluate(() => window.__flat.ui.rendered());
};
const globeDrag = async (dx, dy) => { const b = await page.locator('#globe').boundingBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; await page.mouse.move(cx, cy); await page.mouse.down(); for (let i = 1; i <= 20; i++) await page.mouse.move(cx + (dx * i) / 20, cy + (dy * i) / 20); await page.mouse.up(); await settle(1200); };

try {
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  await page.selectOption('#layer', 'styled').catch(() => {});
  await generate(200_000, 12345);
  await page.selectOption('#layer', 'styled'); await settle(1500);
  await page.evaluate(() => document.querySelector('#settings')?.removeAttribute('open'));
  await page.evaluate(() => document.querySelector('#editor')?.removeAttribute('open'));

  const F = ['#map', '#mapSvg'];
  if (set === 'quick') {
    await flat('robinson', 'atlas'); await zoomTo(1); await shot('flat-robinson-atlas-z1-200k', ...F);
  } else {
    // Projections at zoom 1, atlas, 200k.
    for (const pr of ['equirectangular', 'robinson', 'orthographic']) { await flat(pr, 'atlas'); await zoomTo(1); await shot(`flat-${pr}-atlas-z1-200k`, ...F); }
    // Zoom 2, 4, 8 on Robinson.
    await flat('robinson', 'atlas');
    for (const z of [2, 4, 8]) { await zoomTo(z); await shot(`flat-robinson-atlas-z${z}-200k`, ...F); }
    // Themes at zoom 1 and labels off.
    for (const th of ['physical', 'parchment', 'political']) { await flat('robinson', th); await zoomTo(1); await shot(`flat-robinson-${th}-z1-200k`, ...F); }
    await flat('robinson', 'atlas', false); await zoomTo(1); await shot('flat-robinson-atlas-z1-nolabels-200k', ...F);
    // Globe at two rotations, then labels off.
    await flat('robinson', 'atlas', true);
    await page.selectOption('#viewMode', 'globe'); await settle(2000);
    const G = ['#globeWrap', '#globeLabels'];
    await shot('globe-atlas-rot0-200k', ...G);
    await globeDrag(260, -60); await shot('globe-atlas-rot1-200k', ...G);
    await globeDrag(-420, 90); await shot('globe-atlas-rot2-200k', ...G);
    // 1M cells.
    await generate(1_000_000, 777);
    await page.selectOption('#layer', 'styled'); await settle(2500);
    await shot('globe-atlas-1M', ...G);
    await flat('robinson', 'atlas'); await zoomTo(1); await shot('flat-robinson-atlas-z1-1M', ...F);
    await zoomTo(4); await shot('flat-robinson-atlas-z4-1M', ...F);
  }
} finally {
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
  await s.close();
}
