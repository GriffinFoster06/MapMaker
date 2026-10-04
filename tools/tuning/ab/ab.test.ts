// Q7 A/B harness (ARCHITECTURE §7 Phase 4a): the port reproduces spike 1c's committed numbers exactly, the new
// Checkpoint 2 metrics behave, and the committed baseline has the expected shape.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, not type-checked
import { runAb, weightedKS } from './ab.mjs';

const ROOT = resolve(__dirname, '../../..');
const strip = (o: unknown) => JSON.parse(JSON.stringify(o, (k, v) => (['finalBelts', 'mouthDistanceKm', 'landNative'].includes(k) ? undefined : v)));

describe('Q7 A/B harness', () => {
  it('reproduces spike 1c (seed 12345, 20k → 50k → 200k, spike reference mesh) exactly, through the shell pipeline', async () => {
    const spike = JSON.parse(readFileSync(resolve(ROOT, 'spikes/1c/results/ab-s12345.json'), 'utf8'));
    const r = await runAb({ seed: 12345, Ns: [20000, 50000, 200000], refMode: 'spike' });
    expect(strip(r.consecutive[0])).toEqual(strip(spike.consecutive[0]));
    expect(strip(r.consecutive[1])).toEqual(strip(spike.consecutive[1]));
  }, 120_000);

  it('weighted KS is 0 for equal distributions and 1 for disjoint ones', () => {
    expect(weightedKS([1, 2, 3], [1, 1, 1], [1, 2, 3], [1, 1, 1])).toBe(0);
    expect(weightedKS([1, 2], [1, 1], [10, 20], [1, 1])).toBe(1);
  });

  it('L0 mode: new metrics are finite and bounded, and a run is repeatable', async () => {
    const run = () => runAb({ seed: 7, Ns: [4000, 12000, 30000], refMode: 'L0', finals: [30000] });
    const a = await run();
    const c = a.vsFinal[30000][0];
    expect(a.refN).toBe(20001);
    expect(c.hypsometryKS.landNative).toBeGreaterThanOrEqual(0);
    expect(c.hypsometryKS.landNative).toBeLessThanOrEqual(1);
    expect(c.koppenAgreement.grid1deg).toBeGreaterThan(0);
    expect(c.majorBasins.mouthDistanceKm.matched).toBeGreaterThan(0);
    expect(Number.isFinite(c.majorBasins.mouthDistanceKm.mean)).toBe(true);
    // A run compared with itself: distance 0, KS 0, agreement 1.
    const self = await runAb({ seed: 7, Ns: [4000, 4000], refMode: 'L0', finals: [4000] });
    expect(self.consecutive[0].hypsometryKS.landNative).toBe(0);
    expect(self.consecutive[0].majorBasins.mouthDistanceKm.mean).toBe(0);
    expect(self.consecutive[0].koppenAgreement.grid1deg).toBe(1);
    const b = await run();
    expect(strip(b.vsFinal[30000])).toEqual(strip(a.vsFinal[30000]));
  }, 120_000);

  it('the committed baseline covers seeds 1, 777, 12345; previews 50k and 200k; finals 1M and 2.56M; all ten Q7 metrics', () => {
    const base = JSON.parse(readFileSync(resolve(ROOT, 'tools/tuning/ab-baseline.json'), 'utf8'));
    const keys = ['landIoU', 'coastP95PreviewCells', 'koppenAgreement', 'precipCorrelationLand', 'mountainIoU', 'hypsometryKS', 'basinsMatchedAt50', 'hypsometryKSNative', 'koppenAgreement1deg', 'riverMouthMeanKm'];
    for (const seed of ['1', '777', '12345']) for (const fin of ['1000000', '2560000']) for (const prev of ['50000', '200000']) {
      const m = base.seeds[seed].vsFinal[fin][prev];
      for (const k of keys) expect(Number.isFinite(m[k]), `${seed}/${fin}/${prev}/${k}`).toBe(true);
    }
  });
});
