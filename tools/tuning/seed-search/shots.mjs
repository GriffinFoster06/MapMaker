/* global window, document, Image */
// Renders the shortlisted seeds in the desktop app, hidden (MAPMAKER_TEST=1; nothing opens on screen): one flat map
// (Robinson, atlas style, labels off) and one globe (initial view) per seed at the default parameters, N = 200k, and a
// contact sheet. Same view and style for every seed.
//   scripts/node24.sh node tools/tuning/seed-search/shots.mjs <outDir> <seed,seed,...>
// Needs `npm run desktop:build` first. Writes <outDir>/seed-<seed>-flat.png, -globe.png and contact-sheet.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { launchSession } from '../../../apps/desktop/e2e/session.ts';

const out = resolve(process.argv[2]), seeds = process.argv[3].split(',').map(Number);
mkdirSync(out, { recursive: true });
const s = await launchSession();
const { page } = s;
const settle = (ms) => page.waitForTimeout(ms);
const shots = [];
try {
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  await page.evaluate(() => { document.querySelector('#settings')?.removeAttribute('open'); document.querySelector('#editor')?.removeAttribute('open'); });
  for (const seed of seeds) {
    await page.evaluate(([n, sd]) => window.__globe.generate({ N: n, seed: sd }), [200_000, seed]);
    await page.selectOption('#layer', 'styled');
    await page.selectOption('#viewMode', 'flat'); await page.selectOption('#projection', 'robinson'); await page.selectOption('#styleSel', 'atlas');
    const cb = page.locator('#ovLabels'); if (await cb.isChecked()) await cb.click();
    await page.click('#mapReset'); await settle(1500); await page.evaluate(() => window.__flat.ui.rendered());
    const box = async (sel) => { await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' })); await settle(150); return page.locator(sel).boundingBox(); };
    const flat = await s.shot(`seed-${seed}-flat`, await box('#map'));
    await page.selectOption('#viewMode', 'globe'); await settle(2000);
    const globe = await s.shot(`seed-${seed}-globe`, await box('#globeWrap'));
    writeFileSync(resolve(out, `seed-${seed}-flat.png`), flat); writeFileSync(resolve(out, `seed-${seed}-globe.png`), globe);
    shots.push({ seed, flat: flat.toString('base64'), globe: globe.toString('base64') });
    console.log(`seed ${seed} done`);
  }
  // Contact sheet: two columns of (flat, globe) pairs per seed, drawn on a canvas in the page.
  const sheet = await page.evaluate(async (items) => {
    const load = (b) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${b}`; });
    const cols = 3, cw = 560, fh = 280, gh = 280, pad = 12, th = 26, rows = Math.ceil(items.length / cols), cellH = th + fh + gh + pad;
    const c = document.createElement('canvas'); c.width = cols * (cw + pad) + pad; c.height = rows * cellH + pad;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = 'bold 18px Helvetica, Arial, sans-serif';
    for (let k = 0; k < items.length; k++) {
      const x = pad + (k % cols) * (cw + pad), y = pad + Math.floor(k / cols) * cellH;
      g.fillText(`#${k + 1}  seed ${items[k].seed}`, x, y + 18);
      for (const [j, key, h] of [[0, 'flat', fh], [1, 'globe', gh]]) {
        const im = await load(items[k][key]), sc = Math.min(cw / im.width, h / im.height), w = im.width * sc, hh = im.height * sc;
        g.drawImage(im, x + (cw - w) / 2, y + th + (j ? fh : 0) + (h - hh) / 2, w, hh);
      }
    }
    return c.toDataURL('image/png').split(',')[1];
  }, shots);
  writeFileSync(resolve(out, 'contact-sheet.png'), Buffer.from(sheet, 'base64'));
} finally {
  await s.close();
}
