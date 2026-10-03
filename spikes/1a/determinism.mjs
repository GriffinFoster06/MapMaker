// Spike 1a — determinism: same params → identical array hashes
//   (a) repeated runs in one Node process, (b) a fresh Node process,
//   (c) Chromium, Firefox, WebKit via Playwright (WebKit stands in for Safari).
// Divergent arrays are compared element-wise (count, max |Δ|, max ULP).
// Usage: node determinism.mjs [N] [seed]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { runOrogen } from '../lib/orogen.mjs';
import { collectArrays, hashArrays } from '../lib/fields.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const N = +(process.argv[2] ?? 20000), seed = +(process.argv[3] ?? 12345);
const params = { N, seed };

if (process.env.CHILD) {               // (b) fresh-process mode: print hashes only
  console.log(JSON.stringify(await hashArrays(collectArrays(runOrogen(params)))));
  process.exit(0);
}

const t0 = performance.now();
const nodeArrays = collectArrays(runOrogen(params));
const nodeMs = performance.now() - t0;
const nodeHashes = await hashArrays(nodeArrays);
const again = await hashArrays(collectArrays(runOrogen(params)));
const fresh = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), String(N), String(seed)],
  { env: { ...process.env, CHILD: '1' }, maxBuffer: 1 << 26 }).toString());

const diffKeys = (a, b) => Object.keys(a).filter((k) => !b[k] || a[k].sha256 !== b[k].sha256);

function ulpCompare(a, b) {
  let nDiff = 0, maxAbs = 0, maxUlp = 0, nanMismatch = 0;
  const isF32 = a instanceof Float32Array, isF64 = a instanceof Float64Array;
  const ia = isF32 ? new Int32Array(a.buffer, a.byteOffset, a.length) : null;
  const ib = isF32 ? new Int32Array(b.buffer, b.byteOffset, b.length) : null;
  const ord = (i) => (i < 0 ? -2147483648 - i : i);
  for (let i = 0; i < a.length; i++) {
    if (Object.is(a[i], b[i])) continue;
    nDiff++;
    if (Number.isNaN(a[i]) !== Number.isNaN(b[i])) { nanMismatch++; continue; }
    maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i]));
    if (isF32) maxUlp = Math.max(maxUlp, Math.abs(ord(ia[i]) - ord(ib[i])));
  }
  return { n: a.length, nDiff, fracDiff: nDiff / a.length, maxAbs, maxUlpF32: isF32 ? maxUlp : null, nanMismatch, f64: isF64 };
}

// (c) browsers
const WWW = path.join(HERE, '..', '_data', 'www');
fs.writeFileSync(path.join(WWW, 'index.html'), '<!doctype html><meta charset=utf-8><title>1a</title>');
const server = http.createServer((req, res) => {
  const f = path.join(WWW, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

const browsers = {};
for (const [name, bt] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await bt.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url);
    const res = await page.evaluate(async (params) => {
      const w = new Worker('/worker.js', { type: 'module' });
      const msg = (pred) => new Promise((r) => { const h = (e) => { if (pred(e.data)) { w.removeEventListener('message', h); r(e.data); } }; w.addEventListener('message', h); });
      await msg((d) => d.op === 'ready');
      w.postMessage({ op: 'run', params });
      const out = await msg((d) => d.op === 'run');
      window.__w = w; window.__msg = msg;
      return out;
    }, params);
    if (res.error) throw new Error(res.error);
    const mism = diffKeys(nodeHashes, res.hashes);
    const detail = {};
    for (const key of mism) {
      const got = await page.evaluate(async (key) => {
        window.__w.postMessage({ op: 'get', key });
        const d = await window.__msg((d) => d.op === 'get' && d.key === key);
        return { type: d.type, data: Array.from(d.data, (x) => (Number.isNaN(x) ? 'NaN' : x)) };
      }, key);
      const Ctor = globalThis[got.type];
      const b = Ctor.from(got.data, (x) => (x === 'NaN' ? NaN : x));
      detail[key] = ulpCompare(nodeArrays[key], b);
    }
    browsers[name] = { version: browser.version(), ua: res.ua, ms: Math.round(res.ms), nArrays: Object.keys(res.hashes).length, mismatched: mism, detail };
  } finally { await browser.close(); }
  console.error(name, 'done');
}
server.close();

const out = {
  params, nodeVersion: process.version, nodeMs: Math.round(nodeMs), nArrays: Object.keys(nodeHashes).length,
  sameProcessRepeat: diffKeys(nodeHashes, again), freshProcess: diffKeys(nodeHashes, fresh),
  browsers, nodeHashes,
};
fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
const file = path.join(HERE, 'results', `determinism-N${N}-s${seed}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
const brief = { ...out }; delete brief.nodeHashes;
console.log(JSON.stringify(brief, null, 1));
