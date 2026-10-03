// Spike 1a — detail for the Azgaar round-trip diff: which cells change in
// cells.h / cells.pop after load, and what .map line 18 holds.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const AZ = path.join(HERE, '..', '_work', 'azgaar');
const PORT = 4174, SEED = process.argv[2] ?? 'mapmaker-1a';
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: AZ, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${PORT}/?seed=${SEED}&width=1280&height=720`);
  await page.waitForFunction(() => window.mapHistory?.length, undefined, { timeout: 180000 });
  const before = await page.evaluate(() => ({ h: Array.from(pack.cells.h), pop: Array.from(pack.cells.pop), gridH: Array.from(grid.cells.h) }));
  const s1 = await page.evaluate(() => Services.Save.prepareMapData());
  await page.evaluate((d) => Services.Load.uploadMap(new File([d], 'rt.map')), s1);
  await page.waitForFunction(() => window.mapHistory?.length > 1, undefined, { timeout: 180000 });
  const after = await page.evaluate(() => ({ h: Array.from(pack.cells.h), pop: Array.from(pack.cells.pop), gridH: Array.from(grid.cells.h) }));
  const diff = (a, b) => { const idx = []; let maxAbs = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { idx.push(i); maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i])); } return { n: a.length, nDiff: idx.length, maxAbs, sample: idx.slice(0, 5).map((i) => [i, a[i], b[i]]) }; };
  const L = s1.split('\r\n');
  const rng = s1.match(/.{0,40}(alea|prngState|rngState).{0,40}/i);
  console.log(JSON.stringify({ h: diff(before.h, after.h), pop: diff(before.pop, after.pop), gridH: diff(before.gridH, after.gridH),
    line18head: L[18].slice(0, 60), line18Len: L[18].length, line18Count: L[18].split(',').length, rngMatch: rng && rng[0] }, null, 1));
} finally { await browser.close(); server.kill(); }
