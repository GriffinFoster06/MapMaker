import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs tools
import { coastStraightness, landmasses } from './shape.mjs';
// @ts-expect-error plain .mjs tools
import { CAP, TERMS, objective } from './metrics.mjs';
// @ts-expect-error plain .mjs tools
import { lhs } from './sweep.mjs';
import { SETTINGS } from '../../../apps/web/src/settings';

const W = 720, H = 360;
function raster(f: (i: number, j: number) => boolean) {
  const grid = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) grid[j * W + i] = f(i, j) ? 1 : 0;
  return { grid, W, H };
}

describe('earthlike shape metrics', () => {
  it('a lat/lon rectangle fills its bounding box and its coast is straight and axis-aligned', () => {
    const r = raster((i, j) => i >= 100 && i < 220 && j >= 100 && j < 180);
    const [lm] = landmasses(r, 1e5);
    expect(lm.boxFill).toBeCloseTo(1, 6);
    const c = coastStraightness(r);
    expect(c.straight).toBeGreaterThan(0.8);
    expect(c.axisStraight).toBeGreaterThan(0.8);
  });
  it('a disc fills about pi/4 of its box and is not axis-aligned', () => {
    const r = raster((i, j) => (i - 300) ** 2 + (j - 180) ** 2 < 60 ** 2);
    const [lm] = landmasses(r, 1e5);
    expect(lm.boxFill).toBeGreaterThan(0.7);
    expect(lm.boxFill).toBeLessThan(0.85);
    expect(coastStraightness(r).axisStraight).toBeLessThan(0.3);
  });
  it('erosion separates two blobs joined by a thin isthmus; a landmass wrapping the antimeridian is one', () => {
    const joined = raster((i, j) => (i >= 100 && i < 160 && j >= 100 && j < 160) || (i >= 170 && i < 230 && j >= 100 && j < 160) || (i >= 160 && i < 170 && j === 130));
    expect(landmasses(joined, 1e4, 0)).toHaveLength(1);
    expect(landmasses(joined, 1e4, 2)).toHaveLength(2);
    const wrap = raster((i, j) => (i >= 700 || i < 20) && j >= 100 && j < 160);
    expect(landmasses(wrap, 1e4)).toHaveLength(1);
  });
});

describe('earthlike sweep', () => {
  it('latin hypercube: one point per stratum in every dimension, snapped to the slider step, deterministic', () => {
    const n = 40, a = lhs(n, 5) as Record<string, number>[];
    expect(lhs(n, 5)).toEqual(a);
    for (const s of SETTINGS) {
      const strata = new Set(a.map((p) => Math.min(n - 1, Math.floor(((p[s.key]! - s.min) / (s.max - s.min)) * n))));
      // snapping to the step can move a point across a stratum edge for coarse sliders, so only fine sliders must be exact
      if ((s.max - s.min) / s.step >= 4 * n) expect(strata.size).toBe(n);
      for (const p of a) {
        expect(p[s.key]).toBeGreaterThanOrEqual(s.min);
        expect(p[s.key]).toBeLessThanOrEqual(s.max);
        expect(Math.abs((p[s.key]! - s.min) / s.step - Math.round((p[s.key]! - s.min) / s.step))).toBeLessThan(1e-6);
      }
    }
  });
  it('objective: zero distance gives 0, one tolerance on every term gives 1, large distances are capped', () => {
    const zero = Object.fromEntries(Object.keys(TERMS).map((k) => [k, 0]));
    expect(objective(zero).objective).toBe(0);
    expect(objective(Object.fromEntries(Object.entries(TERMS).map(([k, t]) => [k, (t as { tol: number }).tol]))).objective).toBeCloseTo(1, 12);
    expect(objective(Object.fromEntries(Object.keys(TERMS).map((k) => [k, 1e9]))).objective).toBe(CAP);
  });
});

describe('earthlike degenerate worlds', () => {
  it('a world with no land scores the cap on every term, never a good score', async () => {
    // @ts-expect-error plain .mjs tools
    const { termDistances } = await import('./metrics.mjs');
    const E = { landFrac: 0.31 };
    const d = termDistances({ landFrac: 0, koppen: null }, E);
    expect(objective(d).objective).toBe(CAP);
  });
});
