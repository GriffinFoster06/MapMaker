// Per-browser memory and timing benchmark of the orogen pipeline in the engine worker, through the real app path
// (generate, transfer the mesh, build the globe, paint a layer). One fresh page per tier.
//
// Memory: two figures, because browsers expose different things.
//   workingSetMB   logical bytes of mesh and layer arrays in the worker (every browser).
//   peakRssMB      peak resident memory of all processes launched from the Playwright browser install, sampled with `ps`
//                  every 100 ms (macOS and Linux; null on Windows). Includes the page, the worker and the GPU/network helpers.
// measureUserAgentSpecificMemory is not used: it needs cross-origin isolation (the optional ?coi shim), and the benchmark
// measures the default deployment, which has none.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, platform, cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { test } from '@playwright/test';

const TIERS: Record<string, number> = { '50k': 50_000, '200k': 200_000, '500k': 500_000, '1M': 1_000_000, '2.56M': 2_560_000 };
const wanted = (process.env['BENCH_TIERS'] ?? Object.keys(TIERS).join(',')).split(',');
const OUT = resolve(process.cwd(), 'docs/benchmarks');

/** Sum of RSS (MB) of processes whose command line contains `needle`. */
function rssMB(needle: string): number | null {
  if (platform() === 'win32') return null;
  try {
    const out = execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 });
    let kb = 0;
    for (const line of out.split('\n')) if (line.includes(needle)) kb += Number(line.trim().split(/\s+/)[0]) || 0;
    return kb / 1024;
  } catch { return null; }
}

interface TierResult {
  tier: string; cells: number; ok: boolean; error?: string;
  totalMs?: number; generationMs?: number; stagesMs?: Record<string, number>;
  workingSetMB?: number; layerArrays?: number; peakRssMB?: number | null; baselineRssMB?: number | null;
}

const results: TierResult[] = [];

test.describe.configure({ mode: 'serial' });

for (const tier of wanted) {
  test(`orogen pipeline at ${tier} cells`, async ({ browser }) => {
    const cells = TIERS[tier]!;
    // Processes of this browser install: the Playwright browser directory is in every command line.
    const needle = process.env['PLAYWRIGHT_BROWSERS_PATH'] || 'ms-playwright';
    const context = await browser.newContext();
    const page = await context.newPage();
    const r: TierResult = { tier, cells, ok: false };
    let peak = 0;
    const base = rssMB(needle);
    const timer = setInterval(() => { const v = rssMB(needle); if (v !== null) peak = Math.max(peak, v); }, 100);
    try {
      await page.goto('./');
      await page.waitForFunction(() => !!window.__globe, null, { timeout: 30_000 });
      const run = await page.evaluate((N) => window.__globe!.generate({ N, seed: 12345 }), cells);
      r.ok = true;
      r.totalMs = Math.round(run.totalMs);
      r.stagesMs = Object.fromEntries(Object.entries(run.stages).map(([k, v]) => [k, Math.round(v)]));
      r.generationMs = Math.round(Object.values(run.stages).reduce((a, b) => a + b, 0));
      r.workingSetMB = Math.round((run.stats.layerBytes + run.stats.meshBytes) / 1e6);
      r.layerArrays = run.stats.layerArrays;
    } catch (e) {
      r.error = (e instanceof Error ? e.message : String(e)).split('\n')[0]!;
    } finally {
      clearInterval(timer);
      r.baselineRssMB = base === null ? null : Math.round(base);
      r.peakRssMB = platform() === 'win32' ? null : Math.round(peak);
      results.push(r);
      await context.close().catch(() => undefined);
    }
    console.log(JSON.stringify(r));
  });
}

test.afterAll((_fixtures, info) => {
  mkdirSync(OUT, { recursive: true });
  const meta = {
    browser: info.project.name, platform: `${platform()} ${arch()}`, cpu: cpus()[0]?.model ?? 'unknown', cores: cpus().length,
    ramGB: Math.round(totalmem() / 2 ** 30), date: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, `phase4a-${info.project.name}-${platform()}.json`), JSON.stringify({ meta, results }, null, 1) + '\n');
});
