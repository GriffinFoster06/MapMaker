import { describe, expect, it } from 'vitest';
import baseline from './baseline.json';
import { realismGate } from './gate.mjs';

type Run = typeof baseline;
const structuredOnly = (b: Run): Run => structuredClone({ ...b, seeds: Object.fromEntries(Object.entries(b.seeds).map(([s, v]) => [s, { structured: v.structured }])) }) as Run;

describe('realism gate', () => {
  it('passes the recorded Phase 4b result, which is never flatter than stock', () => {
    expect(realismGate(structuredOnly(baseline), baseline)).toEqual({ failures: [], notes: [], missing: [] });
  });
  it('fails a flatter world and reports, but does not fail, a higher one', () => {
    const flat = structuredOnly(baseline);
    flat.seeds['1'].structured.hypsometryM.p95 = 1000;
    flat.seeds['1'].structured.slopeMPerKm.p50 = 1.0;
    const r = realismGate(flat, baseline);
    expect(r.failures.some((f: string) => f.includes('below stock'))).toBe(true);
    expect(r.failures.filter((f: string) => f.startsWith('seed 1:')).length).toBeGreaterThanOrEqual(4);
    const high = structuredOnly(baseline);
    high.seeds['777'].structured.hypsometryM.p99 += 100;
    expect(realismGate(high, baseline)).toMatchObject({ failures: [], notes: [expect.stringContaining('p99')] });
  });
  it('bounds land fraction, Hack exponent and river density, and flags missing seeds or a different N', () => {
    const odd = structuredOnly(baseline);
    odd.seeds['12345'].structured.landFrac = 0.31;
    odd.seeds['12345'].structured.hackExponent = 0.7;
    odd.seeds['12345'].structured.riverKmPer1000Km2.a1e3 = 30;
    expect(realismGate(odd, baseline).failures).toHaveLength(3);
    expect(realismGate({ ...structuredOnly(baseline), N: 1_000_000 }, baseline).missing).toHaveLength(3);
  });
});
