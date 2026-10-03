// Spike 1a — Azgaar save (.map) round-trip and same-seed determinism.
// Runs against `npm run preview` of the Azgaar work copy (spikes/_work/azgaar).
// 1. Generate seed S, save → s1. Load s1, save → s2. Diff s1/s2 and pack digests.
// 2. Generate seed S in a fresh page → s3. Diff s1/s3 (same-seed determinism).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AZ = path.join(HERE, '..', '_work', 'azgaar');
const SEED = process.argv[2] ?? 'mapmaker-1a';
const PORT = 4173;

const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: AZ, stdio: 'ignore' });
for (let i = 0; i < 60; i++) {   // wait until the preview server answers
  try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

const digest = () => {
  const c = pack.cells;
  const h = (a) => { let x = 2166136261; for (let i = 0; i < a.length; i++) { x ^= (a[i] ?? 0) & 0xffff; x = Math.imul(x, 16777619); } return (x >>> 0).toString(16); };
  const keys = ['h', 'f', 't', 'biome', 'pop', 'r', 'fl', 'burg', 'culture', 'state', 'religion', 'province', 'routes'];
  const d = {};
  for (const k of keys) if (c[k] && typeof c[k].length === 'number') d['cells.' + k] = h(Array.from(c[k], (v) => (typeof v === 'number' ? Math.round(v * 1000) : 0)));
  for (const t of ['burgs', 'states', 'cultures', 'religions', 'provinces', 'rivers', 'features', 'markers']) if (pack[t]) d['n.' + t] = pack[t].length;
  d['names.burgs'] = h(Array.from((pack.burgs || []).map((b) => b?.name || '').join('|'), (ch) => ch.charCodeAt(0)));
  return d;
};
const mapCount = () => window.mapHistory?.length ?? 0;

const browser = await chromium.launch();
const out = { seed: SEED };
try {
  const fresh = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${PORT}/?seed=${encodeURIComponent(SEED)}&width=1280&height=720`);
    await page.waitForFunction(mapCount, undefined, { timeout: 180000 });
    return page;
  };
  const page = await fresh();
  const d1 = await page.evaluate(digest);
  const s1 = await page.evaluate(() => Services.Save.prepareMapData());
  const n0 = await page.evaluate(mapCount);
  await page.evaluate((data) => Services.Load.uploadMap(new File([data], 'rt.map')), s1);
  await page.waitForFunction((n) => (window.mapHistory?.length ?? 0) > n, n0, { timeout: 180000 });
  const d2 = await page.evaluate(digest);
  const s2 = await page.evaluate(() => Services.Save.prepareMapData());
  const page3 = await fresh();
  const d3 = await page3.evaluate(digest);
  const s3 = await page3.evaluate(() => Services.Save.prepareMapData());

  const lines = (s) => s.split('\r\n');
  const diffLines = (a, b) => { const A = lines(a), B = lines(b), d = []; for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) d.push({ line: i, lenA: A[i]?.length ?? null, lenB: B[i]?.length ?? null, headA: A[i]?.slice(0, 80), headB: B[i]?.slice(0, 80) }); return d; };
  const diffObj = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
  out.mapBytes = s1.length; out.mapLines = lines(s1).length;
  out.roundTrip = { mapLinesDiffering: diffLines(s1, s2), packDigestDiffering: diffObj(d1, d2) };
  out.sameSeedFreshPage = { mapLinesDiffering: diffLines(s1, s3).map((d) => ({ line: d.line, headA: d.headA, headB: d.headB })), packDigestDiffering: diffObj(d1, d3) };
  out.digest = d1;
  out.containsRngState = /alea|prngState|rngState/i.test(s1);
  out.firstLine = lines(s1)[0].slice(0, 200);
} finally {
  await browser.close();
  server.kill();
}
fs.writeFileSync(path.join(HERE, 'results', 'azgaar-roundtrip.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
