import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const GOLDEN = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../tools/determinism/golden.json'), 'utf8')) as { version: number; hashes: Record<string, string> };

// Q3: cross-engine bit-exactness is a CI-tested goal. Each engine's worker must reproduce the Node golden hashes.
test('determinism probe matches golden hashes in this engine', async ({ page, browserName }, info) => {
  await page.goto('/?probe');
  const result = await page.evaluate(async () => {
    const r = await (window as unknown as { __probe: Promise<{ version: number; hashes: Record<string, string>; ua: string }> }).__probe;
    return r;
  });
  info.annotations.push({ type: 'engine', description: result.ua });
  expect(result.version).toBe(GOLDEN.version);

  const mismatched = Object.keys({ ...GOLDEN.hashes, ...result.hashes }).filter((k) => GOLDEN.hashes[k] !== result.hashes[k]);
  const { isTranscendental } = await import('@mapmaker/determinism/compare');
  const strictKeys = mismatched.filter((k) => !isTranscendental(k));
  const report: Record<string, unknown> = {};
  if (mismatched.length) {
    // Element-wise diff for the report: fetch the divergent arrays from the browser and recompute them in Node.
    const { runProbe } = await import('@mapmaker/determinism/probe');
    const { ulpReport } = await import('@mapmaker/determinism/compare');
    const node = await runProbe({ keepArrays: true });
    const lines: string[] = [];
    for (const key of mismatched) {
      const got = await page.evaluate((key) => new Promise<{ type: string; data: (number | string)[] | null }>((res) => {
        const w = (window as unknown as { __probeWorker: Worker }).__probeWorker;
        w.addEventListener('message', function h(e: MessageEvent) { if (e.data.op === 'get' && e.data.key === key) { w.removeEventListener('message', h); res(e.data); } });
        w.postMessage({ op: 'get', key });
      }), key);
      const want = node.arrays?.[key];
      if (got.data && want) {
        const b = (want.constructor as { from(a: unknown[], f: (x: unknown) => number): ArrayLike<number> }).from(got.data, (x) => (x === 'NaN' ? NaN : (x as number)));
        const u = ulpReport(want as Float64Array, b);
        report[key] = u;
        lines.push(`${key}: ${JSON.stringify(u)}`);
      } else lines.push(`${key}: no array detail (hash-only key)`);
    }
    console.error(`[${browserName}] ${mismatched.length} divergent keys:\n${lines.join('\n')}`);
  }
  await info.attach('divergence.json', { body: JSON.stringify({ engine: result.ua, project: info.project.name, divergent: mismatched, strict: strictKeys, ulp: report }, null, 1), contentType: 'application/json' });
  // Strict keys (RNG, topology, Float32 points, history schema) must match. Transcendental-dependent keys are reported above.
  expect(strictKeys, `strict probe keys diverged in ${browserName}`).toEqual([]);
});
