import { describe, expect, it } from 'vitest';
import { compareHashes, isTranscendental, splitMismatches, ulpReport } from './compare';
import { runProbe } from './probe';

describe('compare', () => {
  it('reports missing, extra and changed keys', () => {
    expect(compareHashes({ a: '1', b: '2', c: '3' }, { a: '1', b: '9', d: '4' }).map((m) => m.key)).toEqual(['b', 'c', 'd']);
  });
  it('counts differing elements and ULP distance', () => {
    const a = new Float64Array([1, 2, 3]), b = new Float64Array([1, 2, 3]);
    b[1] = 2 + Number.EPSILON * 2; // 1 ulp at 2
    expect(ulpReport(a, b)).toMatchObject({ n: 3, nDiff: 1, maxUlp: 1, firstIndex: 1 });
  });
});

describe('strict vs transcendental-dependent keys', () => {
  it('classifies keys', () => {
    for (const k of ['dmath.sin', 'mesh.20000.f64.points', 'mesh.20000.f32.area', 'mesh.20000.f32.circ']) expect(isTranscendental(k)).toBe(true);
    for (const k of ['mesh.20000.f32.points', 'mesh.20000.f32.triangles', 'rng.sfc32', 'rng.counter', 'history.world']) expect(isTranscendental(k)).toBe(false);
    // fdlibm-mode keys are never report-only, even where the native-mode twin is.
    for (const k of ['fd.dmath.sin', 'fd.mesh.20000.f64.points', 'fd.mesh.1000000.f64.area', 'fd.mesh.20000.f32.circ', 'fd.history.world']) expect(isTranscendental(k)).toBe(false);
    // orogen output is strict (identical on every OS and engine in CI, Checkpoint 4a).
    for (const k of ['orogen.20000.r_elevation', 'orogen.200000.debug.koppen', 'orogen.20000.canon.points']) expect(isTranscendental(k)).toBe(false);
    const { strict, soft } = splitMismatches([{ key: 'dmath.exp' }, { key: 'rng.alea' }]);
    expect([strict.map((x) => x.key), soft.map((x) => x.key)]).toEqual([['rng.alea'], ['dmath.exp']]);
  });
});

describe('probe', () => {
  it('is stable across repeated runs in one process', async () => {
    const a = await runProbe(), b = await runProbe();
    expect(a.hashes).toEqual(b.hashes);
    expect(Object.keys(a.hashes).length).toBeGreaterThan(60);
  });
});
