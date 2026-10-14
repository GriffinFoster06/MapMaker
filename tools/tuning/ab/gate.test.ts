import { describe, expect, it } from 'vitest';
import { METRICS, gate } from './gate.mjs';

const entry = (over: Record<string, number> = {}) => ({ ...Object.fromEntries(Object.keys(METRICS).map((k) => [k, 0.5])), ...over });
const file = (m: Record<string, number>) => ({ seeds: { 1: { vsFinal: { 1000000: { 50000: m } } } } });

describe('Q7 regression gate', () => {
  it('passes identical results', () => {
    expect(gate(file(entry()), file(entry()))).toEqual({ regressions: [], improvements: [], missing: [] });
  });
  it('fails on a regression in either direction of goodness', () => {
    expect(gate(file(entry({ landIoU: 0.49 })), file(entry())).regressions).toHaveLength(1);
    expect(gate(file(entry({ coastP95PreviewCells: 0.6 })), file(entry())).regressions).toHaveLength(1);
    expect(gate(file(entry({ basinsMatchedAt50: 6 })), file(entry({ basinsMatchedAt50: 7 }))).regressions).toHaveLength(1);
  });
  it('reports improvements without failing, ignores changes within tolerance, and flags missing baselines', () => {
    const r = gate(file(entry({ landIoU: 0.6, riverMouthMeanKm: 0.5 + 1e-4 })), file(entry()));
    expect(r.regressions).toEqual([]);
    expect(r.improvements).toHaveLength(1);
    expect(gate(file(entry()), { seeds: {} }).missing).toHaveLength(1);
  });
});
