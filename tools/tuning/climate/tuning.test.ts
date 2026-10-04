// The tuning harness against the shell (ARCHITECTURE §7 Phase 4a). Needs the Köppen ground truth (downloaded at tuning
// time, Q8): run tools/tuning/climate/fetch-kottek.sh. The stock comparison also needs upstream/orogen (nightly job).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS modules, not type-checked
import { buildEarthContext } from './lib/earth-context.mjs';
// @ts-expect-error plain JS modules, not type-checked
import { evaluateParams } from './lib/score.mjs';
import baseline from './baseline.json';

const ROOT = resolve(__dirname, '../../..');
const DATA = resolve(__dirname, 'data/ascii/Koeppen-Geiger-ASCII.txt');
const HAVE_DATA = existsSync(DATA);
const HAVE_UPSTREAM = existsSync(resolve(ROOT, 'upstream/orogen/tuning/climate/lib/score.mjs'));
const SCALARS = ['objective', 'gradedAcc', 'exactAcc', 'majorAcc', 'macroF1', 'groupBalance', 'watchlistF1', 'scored'] as const;

describe.skipIf(!HAVE_DATA)('Earth tuning harness on the shell', () => {
  it.each(Object.keys(baseline.runs))('reproduces the committed baseline exactly at N=%s (these equal the spike 1a stock-harness numbers)', async (n) => {
    const ctx = await buildEarthContext({ N: Number(n), seed: 1234 });
    const { metrics } = await evaluateParams(ctx, {});
    const want = (baseline.runs as Record<string, Record<string, number>>)[n]!;
    for (const k of SCALARS) expect(metrics[k], k).toBe(want[k]);
    expect(ctx.maskStats).toEqual((baseline.runs as Record<string, { maskStats: unknown }>)[n]!.maskStats);
  }, 120_000);

  it('a climate parameter override changes the score, and the next evaluation without it restores the baseline', async () => {
    const ctx = await buildEarthContext({ N: 40000, seed: 1234 });
    const a = (await evaluateParams(ctx, {})).metrics.objective;
    const b = (await evaluateParams(ctx, { HEUR_CONT_DRYNESS: 0.2 })).metrics.objective;
    const c = (await evaluateParams(ctx, {})).metrics.objective;
    expect(b).not.toBe(a);
    expect(c).toBe(a);
  }, 120_000);
});

// upstream/ is read-only: the stock harness runs from a copy inside the repo (so node_modules resolves) under .tools/.
describe.skipIf(!HAVE_DATA || !HAVE_UPSTREAM)('shell harness equals the stock harness from upstream/orogen', () => {
  const copy = resolve(ROOT, `.tools/stock-orogen-${process.pid}`);
  afterAll(() => rmSync(copy, { recursive: true, force: true }));

  it.each([40000, 160000])('same metrics, full confusion matrix and region truth at N=%i', async (N) => {
    mkdirSync(copy, { recursive: true });
    cpSync(resolve(ROOT, 'upstream/orogen'), copy, { recursive: true, filter: (p) => !p.includes('/.git') });
    mkdirSync(resolve(copy, 'tuning/climate/data/ascii'), { recursive: true });
    cpSync(DATA, resolve(copy, 'tuning/climate/data/ascii/Koeppen-Geiger-ASCII.txt'));
    const stockCtx = await import(/* @vite-ignore */ pathToFileURL(resolve(copy, 'tuning/climate/lib/earth-context.mjs')).href);
    const stockScore = await import(/* @vite-ignore */ pathToFileURL(resolve(copy, 'tuning/climate/lib/score.mjs')).href);
    const a = stockCtx.buildEarthContext({ N, seed: 1234 });
    const sa = stockScore.evaluateParams(a, {});
    const b = await buildEarthContext({ N, seed: 1234 });
    const sb = await evaluateParams(b, {});
    expect(Buffer.from(b.r_elevation.buffer).equals(Buffer.from(a.r_elevation.buffer))).toBe(true);
    expect(Buffer.from(b.r_truth.buffer).equals(Buffer.from(a.r_truth.buffer))).toBe(true);
    const { evalMs: _x, ...ma } = sa.metrics; const { evalMs: _y, ...mb } = sb.metrics;
    void _x; void _y;
    expect(mb).toEqual(ma);
    expect(Buffer.from(sb.r_koppen.buffer).equals(Buffer.from(sa.r_koppen.buffer))).toBe(true);
  }, 300_000);
});
