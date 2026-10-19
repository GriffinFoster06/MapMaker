// The d3-dmath alias (alias/d3-dmath.mjs): the exact path's copy of d3 differs from stock d3 only in its libm.
//   1. The shims export what d3's math.js modules export, with identical constants and functions within 1 ULP.
//   2. The exact copy calls dmath and the stock packages do not.
//   3. With dmath in 'native' mode, the exact path is bit-identical to stock d3 (so nothing but libm changed).
//   4. In 'fdlibm' mode (the default), results agree with stock d3 within the stated ULP tolerances below.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dmath } from '@mapmaker/core';
import { PROJECTIONS, ProjectionView } from '../index';
import { EXACT_PROJECTIONS, exactView } from './index';
import * as geoShim from './geo-math';
import * as projShim from './projection-math';

const require = createRequire(import.meta.url);
const stockMath = async (pkg: string) => (await import(/* @vite-ignore */ join(dirname(require.resolve(pkg)), 'math.js'))) as Record<string, unknown>;

/** Units in the last place of max(|a|, |b|, floor): the floor is the magnitude scale of the quantity (180° or the extent). */
const ulp = (x: number) => {
  const f = new Float64Array([Math.abs(x)]), u = new BigInt64Array(f.buffer);
  u[0]! += 1n;
  return f[0]! - Math.abs(x);
};
const ulps = (a: number, b: number, floor: number) => Math.abs(a - b) / ulp(Math.max(Math.abs(a), Math.abs(b), floor));

/**
 * Tolerances of the exact path against stock d3 (fdlibm vs the engine's libm), in ULPs of the quantity's scale:
 * degrees in ULPs of 180, pixels in ULPs of the larger extent. Measured maxima on Node 24 over the grids below:
 * forward ≤ 5, inverse ≤ 17, except Hammer's inverse at 103 (its invert is ill-conditioned next to the outline).
 */
const FORWARD_ULPS = 8;
const INVERSE_ULPS = 32;
// conicConformal (Phase 5c): its inverse takes pow(f / r, 1 / n), which multiplies the relative error of pow by 1 / n
// (n ≈ 0.7 at the default parallels); measured 80 ULPs against stock d3 in the 'fdlibm' mode, a new projection's tolerance.
const INVERSE_ULPS_BY_ID: Record<string, number> = { hammer: 128, conicConformal: 128 };

const W = 512, H = 256;
const ROTATIONS: [number, number, number][] = [[0, 0, 0], [17, -23, 5], [-140, 60, -30]];

describe('d3-dmath alias', () => {
  it('the shims export exactly what d3-geo and d3-geo-projection math.js export, with the same values', async () => {
    const inputs = [-3.5, -1, -0.3, 0, 1e-9, 0.25, 0.7, 1, 1.5, 2.9, 40];
    for (const [pkg, shim] of [['d3-geo', geoShim], ['d3-geo-projection', projShim]] as const) {
      const stock = await stockMath(pkg);
      expect(Object.keys(shim).sort(), pkg).toEqual(Object.keys(stock).sort());
      for (const [k, v] of Object.entries(stock)) {
        const s = (shim as Record<string, unknown>)[k];
        if (typeof v === 'number') { expect(s, `${pkg} ${k}`).toBe(v); continue; }
        const f = v as (...a: number[]) => number, g = s as (...a: number[]) => number;
        for (const x of inputs) for (const y of [0.5, 2]) {
          const a = f(x, y), b = g(x, y);
          if (Number.isNaN(a)) { expect(b, `${pkg} ${k}(${x})`).toBeNaN(); continue; }
          expect(a === b || ulps(a, b, 0) <= 1, `${pkg} ${k}(${x}, ${y}): ${a} vs ${b}`).toBe(true);
        }
      }
    }
  });

  it('the exact copy calls dmath; the stock packages do not', () => {
    const counted = <T>(fn: () => T): number => {
      const orig = dmath.sin;
      let n = 0;
      (dmath as { sin: (x: number) => number }).sin = (x) => { n++; return orig(x); };
      try { fn(); } finally { (dmath as { sin: (x: number) => number }).sin = orig; }
      return n;
    };
    for (const id of ['equalEarth', 'mollweide']) {
      expect(counted(() => exactView({ projection: id, width: W, height: H }).invert(100, 100)), id).toBeGreaterThan(0);
      expect(counted(() => new ProjectionView({ projection: id, width: W, height: H }).invert(100, 100)), id).toBe(0);
    }
    expect(EXACT_PROJECTIONS[0]!.create).not.toBe(PROJECTIONS[0]!.create);
  });

  it("with dmath in 'native' mode the exact path is bit-identical to stock d3", () => {
    dmath.withMode('native', () => {
      for (const s of PROJECTIONS) for (const rotate of ROTATIONS) {
        const v = new ProjectionView({ projection: s.id, width: W, height: H, rotate });
        const e = exactView({ projection: s.id, width: W, height: H, rotate });
        for (let j = 0; j < H; j += 5) for (let i = 0; i < W; i += 5) {
          expect(e.invert(i + 0.5, j + 0.5), s.id).toEqual(v.invert(i + 0.5, j + 0.5));
          const lon = -180 + (360 * (i + 0.5)) / W, lat = -90 + (180 * (j + 0.5)) / H;
          expect(e.forward(lon, lat), s.id).toEqual(v.forward(lon, lat));
        }
      }
    });
  });

  it("in 'fdlibm' mode it agrees with stock d3 within the stated ULP tolerances, with the same domain", () => {
    for (const s of PROJECTIONS) for (const rotate of ROTATIONS) {
      const v = new ProjectionView({ projection: s.id, width: W, height: H, rotate });
      const e = exactView({ projection: s.id, width: W, height: H, rotate });
      let inv = 0, fwd = 0;
      for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) {
        const a = v.invert(i + 0.5, j + 0.5), b = e.invert(i + 0.5, j + 0.5);
        expect(!a, `${s.id} pixel ${i},${j}`).toBe(!b);
        if (a && b) inv = Math.max(inv, ulps(a[0], b[0], 180), ulps(a[1], b[1], 180));
        const lon = -180 + (360 * (i + 0.5)) / W, lat = -90 + (180 * (j + 0.5)) / H;
        const p = v.forward(lon, lat), q = e.forward(lon, lat);
        if (p && q) fwd = Math.max(fwd, ulps(p[0], q[0], W), ulps(p[1], q[1], W));
      }
      expect(inv, `${s.id} inverse ${rotate}`).toBeLessThanOrEqual(INVERSE_ULPS_BY_ID[s.id] ?? INVERSE_ULPS);
      expect(fwd, `${s.id} forward ${rotate}`).toBeLessThanOrEqual(FORWARD_ULPS);
    }
  });
});
