import { expect, test } from '@playwright/test';

// ARCHITECTURE §3.7: GitHub Pages cannot set COOP/COEP headers. Default is transferable ArrayBuffers; the
// coi-serviceworker shim is an optional upgrade to SharedArrayBuffer.
test('without the shim: not isolated, transferable buffers work', async ({ page }) => {
  await page.goto('./');
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);
  const moved = await page.evaluate(async () => {
    const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>{const a=new Float64Array(e.data);postMessage(a.reduce((s,x)=>s+x,0))}'])));
    const buf = new Float64Array([1, 2, 3, 4]).buffer;
    const out = new Promise<number>((r) => { w.onmessage = (e) => r(e.data as number); });
    w.postMessage(buf, [buf]);
    const sum = await out;
    return { sum, detached: buf.byteLength === 0 };
  });
  expect(moved).toEqual({ sum: 10, detached: true });
});

test('with the shim: page becomes cross-origin isolated and SharedArrayBuffer works in a worker', async ({ page, browserName }, info) => {
  await page.goto('./?coi');
  let isolated = false;
  try {
    await page.waitForFunction(() => self.crossOriginIsolated === true, null, { timeout: 20_000 });
    isolated = true;
  } catch { /* recorded below */ }
  info.annotations.push({ type: 'crossOriginIsolated-with-shim', description: `${browserName}: ${isolated}` });
  expect(isolated, `${browserName} did not become isolated with the shim`).toBe(true);
  const sab = await page.evaluate(async () => {
    const sab = new SharedArrayBuffer(8);
    const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>{const a=new Int32Array(e.data);Atomics.store(a,0,42);postMessage(1)}'])));
    await new Promise<void>((r) => { w.onmessage = () => r(); w.postMessage(sab); });
    return Atomics.load(new Int32Array(sab), 0);
  });
  expect(sab).toBe(42);
});
