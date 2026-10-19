// Per-browser memory and timing benchmark of a generation pipeline in the engine worker, through the real app path
// (generate, transfer the mesh, build the globe, paint a layer). One fresh page per tier.
//
// Memory: two figures, because browsers expose different things.
//   workingSetMB   logical bytes of mesh and layer arrays in the worker (every browser).
//   peakRssMB      peak resident memory of all processes launched from the Playwright browser install, sampled with `ps`
//                  every 100 ms (macOS and Linux; null on Windows). Includes the page, the worker and the GPU/network helpers.
//   peakRssByKindMB  the same, per process kind (content: page and its workers; gpu; network: network and utility
//                  helpers; browser: the main process; other: helpers the command line does not identify). Each kind's
//                  peak is taken separately, so they need not add up to peakRssMB.
// BENCH_MODE=worker runs the generation alone in a fresh engine worker (window.__globe.generateInWorker: no globe, no
// transfers back), so the engine worker's memory can be told apart from the page's (Phase 5 M0). Default: app.
// measureUserAgentSpecificMemory is not used: it needs cross-origin isolation (the optional ?coi shim), and the benchmark
// measures the default deployment, which has none.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { arch, platform, cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { test } from '@playwright/test';

const TIERS: Record<string, number> = { '50k': 50_000, '200k': 200_000, '500k': 500_000, '1M': 1_000_000, '2.56M': 2_560_000 };
const wanted = (process.env['BENCH_TIERS'] ?? Object.keys(TIERS).join(',')).split(',');
const OUT = resolve(process.cwd(), 'docs/benchmarks');
// Pipeline variant: `structured` (Phase 4b, the app default) or stock orogen `parity` (the Phase 4a record).
const VARIANT = process.env['BENCH_VARIANT'] ?? 'structured';
if (VARIANT !== 'structured' && VARIANT !== 'parity') throw new Error(`BENCH_VARIANT must be structured or parity, not ${VARIANT}`);
const MODE = process.env['BENCH_MODE'] ?? 'app';
if (MODE !== 'app' && MODE !== 'worker') throw new Error(`BENCH_MODE must be app or worker, not ${MODE}`);
const LABEL = (VARIANT === 'parity' ? 'phase4a' : 'phase4b') + (MODE === 'worker' ? '-worker' : '');

/** Process kind from its command line (Chromium --type flags; WebKit process names; Firefox -isForBrowser). */
function kind(cmd: string): string {
  if (/WebContent|WebKitWebProcess|--type=renderer|-isForBrowser/.test(cmd)) return 'content';
  if (/GPU|--type=gpu-process/.test(cmd)) return 'gpu';
  if (/Network|--type=utility/.test(cmd)) return 'network';
  if (/--type=|plugin-container|-contentproc|XPCServices/.test(cmd)) return 'other';
  return 'browser';
}

/** RSS (MB) of processes whose command line contains one of `needles`: the total and per kind. */
function rssMB(needles: string[]): { total: number; byKind: Record<string, number> } | null {
  if (platform() === 'win32') return null;
  try {
    const out = execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 });
    let kb = 0;
    const byKind: Record<string, number> = {};
    for (const line of out.split('\n')) {
      if (!needles.some((n) => line.includes(n))) continue;
      const m = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!m) continue;
      const v = Number(m[1]) / 1024, k = kind(m[2]!);
      kb += Number(m[1]);
      byKind[k] = (byKind[k] ?? 0) + v;
    }
    return { total: kb / 1024, byKind };
  } catch { return null; }
}

interface TierResult {
  tier: string; cells: number; ok: boolean; error?: string;
  totalMs?: number; generationMs?: number; stagesMs?: Record<string, number>;
  workingSetMB?: number; layerArrays?: number; peakRssMB?: number | null; baselineRssMB?: number | null;
  mode?: string; peakRssByKindMB?: Record<string, number> | null;
}

const results: TierResult[] = [];

test.describe.configure({ mode: 'serial' });

for (const tier of wanted) {
  test(`${VARIANT} pipeline at ${tier} cells`, async ({ browser }) => {
    const cells = TIERS[tier]!;
    // Processes of this browser install: the Playwright browser directory is in every command line.
    // Both the given and the resolved path: when the browsers directory is reached through a symlink, the main process
    // shows the given path and helper processes the real one.
    const browsers = process.env['PLAYWRIGHT_BROWSERS_PATH'];
    const needle = browsers ? [...new Set([browsers, existsSync(browsers) ? realpathSync(browsers) : browsers])] : ['ms-playwright'];
    const context = await browser.newContext();
    const page = await context.newPage();
    const r: TierResult = { tier, cells, ok: false, mode: MODE };
    let peak = 0;
    const peakByKind: Record<string, number> = {};
    const base = rssMB(needle);
    const timer = setInterval(() => {
      const v = rssMB(needle);
      if (v === null) return;
      peak = Math.max(peak, v.total);
      for (const [k, mb] of Object.entries(v.byKind)) peakByKind[k] = Math.max(peakByKind[k] ?? 0, mb);
    }, 100);
    try {
      await page.goto('./');
      await page.waitForFunction(() => !!window.__globe, null, { timeout: 30_000 });
      const run = MODE === 'worker'
        ? await page.evaluate(([N, variant]) => window.__globe!.generateInWorker({ N, seed: 12345, variant }), [cells, VARIANT] as const)
        : await page.evaluate(([N, variant]) => window.__globe!.generate({ N, seed: 12345, variant }), [cells, VARIANT] as const);
      r.ok = true;
      r.totalMs = Math.round(run.totalMs);
      if ('stages' in run) {
        r.stagesMs = Object.fromEntries(Object.entries(run.stages).map(([k, v]) => [k, Math.round(v)]));
        r.generationMs = Math.round(Object.values(run.stages).reduce((a, b) => a + b, 0));
      }
      r.workingSetMB = Math.round((run.stats.layerBytes + run.stats.meshBytes) / 1e6);
      r.layerArrays = run.stats.layerArrays;
    } catch (e) {
      r.error = (e instanceof Error ? e.message : String(e)).split('\n')[0]!;
    } finally {
      clearInterval(timer);
      r.baselineRssMB = base === null ? null : Math.round(base.total);
      r.peakRssMB = platform() === 'win32' ? null : Math.round(peak);
      r.peakRssByKindMB = platform() === 'win32' ? null : Object.fromEntries(Object.entries(peakByKind).map(([k, v]) => [k, Math.round(v)]));
      results.push(r);
      await context.close().catch(() => undefined);
    }
    console.log(JSON.stringify(r));
  });
}

// Playwright reads fixture names from the destructuring pattern, so the unused first argument must be `{}`.
// eslint-disable-next-line no-empty-pattern
test.afterAll(({}, info) => {
  mkdirSync(OUT, { recursive: true });
  const meta = {
    browser: info.project.name, variant: VARIANT, mode: MODE, platform: `${platform()} ${arch()}`, cpu: cpus()[0]?.model ?? 'unknown', cores: cpus().length,
    ramGB: Math.round(totalmem() / 2 ** 30), date: new Date().toISOString(),
  };
  writeFileSync(resolve(OUT, `${LABEL}-${info.project.name}-${platform()}.json`), JSON.stringify({ meta, results }, null, 1) + '\n');
});
