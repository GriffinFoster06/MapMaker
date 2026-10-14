import { describe, expect, it } from 'vitest';
import { SphereMesh } from '../mesh/sphere-mesh';
import { OrogenLcg } from '../rng/orogen-lcg';
import { counterUnit } from '../rng/counter';
import { MultiLevel, bumpShape } from './operators';
import { N_REF, buildReferenceMesh } from './reference';

const SEED = 12345;
const L0 = buildReferenceMesh(SEED).mesh;

function fineMesh(N: number, seed = 99): SphereMesh {
  const rng = new OrogenLcg('fine', seed);
  return SphereMesh.build({ N, jitter: 0.75, rng: () => rng.next(), precision: 'f32' });
}

const levels = new Map<number, MultiLevel>();
function level(N: number): MultiLevel {
  let ml = levels.get(N);
  if (!ml) { ml = new MultiLevel(L0, fineMesh(N)); levels.set(N, ml); }
  return ml;
}

/** Rough L0 field: independent uniform values in [-1000, 1000) per cell, so every mode is present. */
const roughCoarse = (salt: number) => Float64Array.from({ length: L0.numRegions }, (_, c) => 2000 * counterUnit(salt, c) - 1000);
const roughFine = (ml: MultiLevel, salt: number) => Float64Array.from({ length: ml.n1 }, (_, i) => 2000 * counterUnit(salt, i) - 1000);
const maxAbs = (a: ArrayLike<number>, skip?: (i: number) => boolean) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (!skip?.(i)) m = Math.max(m, Math.abs(a[i]!));
  return m;
};

describe('reference mesh (L0)', () => {
  it('has N_ref + 1 cells and is a pure function of the seed', () => {
    expect(L0.numRegions).toBe(N_REF + 1);
    const again = buildReferenceMesh(SEED).mesh;
    expect(Buffer.from(again.points.buffer)).toEqual(Buffer.from(L0.points.buffer));
    expect(Buffer.from(again.triangles.buffer)).toEqual(Buffer.from(L0.triangles.buffer));
  });

  it('is orogen coarse mesh construction: OrogenLcg(seed + 137), jitter 0.75, f32', () => {
    const rng = new OrogenLcg('x', SEED + 137);
    const m = SphereMesh.build({ N: 20000, jitter: 0.75, rng: () => rng.next(), precision: 'f32' });
    expect(Buffer.from(m.points.buffer)).toEqual(Buffer.from(L0.points.buffer));
  });
});

describe.each([5000, 50000, 200000])('MultiLevel L0 → L1 at N=%i', (N) => {
  it('parentOf is the nearest L0 centre (brute force on a sample)', () => {
    const ml = level(N);
    const fp = ml.fine.points, q = L0.points;
    for (let i = 0; i < ml.n1; i += Math.max(1, (ml.n1 / 400) | 0)) {
      let bd = Infinity;
      for (let c = 0; c < L0.numRegions; c++) {
        const dx = fp[3 * i]! - q[3 * c]!, dy = fp[3 * i + 1]! - q[3 * c + 1]!, dz = fp[3 * i + 2]! - q[3 * c + 2]!;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) bd = d;
      }
      const p = ml.parentOf[i]!;
      const dp = (fp[3 * i]! - q[3 * p]!) ** 2 + (fp[3 * i + 1]! - q[3 * p + 1]!) ** 2 + (fp[3 * i + 2]! - q[3 * p + 2]!) ** 2;
      expect(dp).toBeLessThanOrEqual(bd);
    }
  });

  it('interpolation weights are convex and reproduce the point on the triangle plane', () => {
    const ml = level(N);
    const W = ml.interpWeights, C = ml.interpCells, q = L0.points, p = ml.fine.points;
    for (let i = 0; i < ml.n1; i++) {
      const w0 = W[3 * i]!, w1 = W[3 * i + 1]!, w2 = W[3 * i + 2]!;
      expect(Math.min(w0, w1, w2)).toBeGreaterThanOrEqual(0);
      expect(Math.abs(w0 + w1 + w2 - 1)).toBeLessThan(1e-12);
      // Σ w_v v lies on the ray through x (gnomonic barycentric coordinates).
      let vx = 0, vy = 0, vz = 0;
      for (let j = 0; j < 3; j++) {
        const c = 3 * C[3 * i + j]!, w = W[3 * i + j]!;
        vx += w * q[c]!; vy += w * q[c + 1]!; vz += w * q[c + 2]!;
      }
      const x = p[3 * i]!, y = p[3 * i + 1]!, z = p[3 * i + 2]!;
      const cx = vy * z - vz * y, cy = vz * x - vx * z, cz = vx * y - vy * x;
      expect(Math.hypot(cx, cy, cz)).toBeLessThan(1e-12);
    }
  });

  it('P is exact on constants and second-order on linear functions', () => {
    const ml = level(N);
    expect(maxAbs(ml.prolong(new Float64Array(L0.numRegions).fill(7.25)).map((v) => v - 7.25))).toBeLessThan(1e-12);
    // f(v) = a·v. Interpolation on the chord plane is exact; the sphere's curvature gives an O(h²) error.
    const a = [0.3, -0.5, 0.81];
    const q = L0.points;
    const f0 = Float64Array.from({ length: L0.numRegions }, (_, c) => a[0]! * q[3 * c]! + a[1]! * q[3 * c + 1]! + a[2]! * q[3 * c + 2]!);
    const Pf = ml.prolong(f0);
    const p = ml.fine.points;
    const h = Math.PI / Math.sqrt(N_REF); // L0 spacing on the unit sphere
    let worst = 0;
    for (let i = 0; i < ml.n1; i++) worst = Math.max(worst, Math.abs(Pf[i]! - (a[0]! * p[3 * i]! + a[1]! * p[3 * i + 1]! + a[2]! * p[3 * i + 2]!)));
    expect(worst).toBeLessThan(2 * h * h);
  });

  it('R conserves area-weighted mass and preserves constants', () => {
    const ml = level(N);
    const f = roughFine(ml, 3);
    const Rf = ml.restrict(f);
    let fineMass = 0, coarseMass = 0;
    const a = ml.fine.cellArea_sr;
    for (let i = 0; i < ml.n1; i++) fineMass += a[i]! * f[i]!;
    for (let c = 0; c < ml.n0; c++) if (ml.childCount[c]! > 0) coarseMass += ml.parentArea[c]! * Rf[c]!;
    expect(Math.abs(fineMass - coarseMass)).toBeLessThan(1e-9 * maxAbs(f));
    const R1 = ml.restrict(new Float64Array(ml.n1).fill(-3.5));
    for (let c = 0; c < ml.n0; c++) if (ml.childCount[c]! > 0) expect(R1[c]).toBeCloseTo(-3.5, 12);
    let total = 0;
    for (let c = 0; c < ml.n0; c++) total += ml.parentArea[c]!;
    expect(total).toBeCloseTo(4 * Math.PI, 7);
  });

  it('R∘C = I on every L0 cell with children', () => {
    const ml = level(N);
    const delta = roughCoarse(5);
    const x = ml.correct(delta);
    const back = ml.restrict(x);
    let worst = 0;
    for (let c = 0; c < ml.n0; c++) if (ml.childCount[c]! > 0) worst = Math.max(worst, Math.abs(back[c]! - delta[c]!));
    expect(worst).toBeLessThan(1e-9);
    // C is stable even for white noise at the reference scale, its worst case.
    expect(maxAbs(x)).toBeLessThan(8 * maxAbs(delta));
  });

  it('C is exact on constants and nearly all smooth P for smooth δ', () => {
    const ml = level(N);
    const k = ml.correct(new Float64Array(ml.n0).fill(42));
    expect(maxAbs(k.map((v) => v - 42))).toBeLessThan(1e-9);
    const q = L0.points;
    const smooth = Float64Array.from({ length: ml.n0 }, (_, c) => 1000 * Math.sin(3 * q[3 * c]!) * Math.cos(2 * q[3 * c + 2]!));
    const stats = { iterations: 0, finalStep: 0 };
    const x = ml.correct(smooth, { stats });
    // The bump part carries only the interpolation residual: ≤ 7% of δ at low N, ≤ 1% from 200k up (measured 6.7%, 0.9%).
    expect(stats.finalStep).toBeLessThan((N >= 200000 ? 0.01 : 0.07) * 1000);
    expect(maxAbs(x)).toBeLessThan(1.01 * maxAbs(smooth));
  });

  it('bumps are non-negative with mean 1 per parent', () => {
    const ml = level(N);
    const psi = ml.bumps, a = ml.fine.cellArea_sr;
    const mean = new Float64Array(ml.n0);
    for (let i = 0; i < ml.n1; i++) {
      expect(psi[i]).toBeGreaterThanOrEqual(0);
      mean[ml.parentOf[i]!]! += a[i]! * psi[i]!;
    }
    for (let c = 0; c < ml.n0; c++) if (ml.childCount[c]! > 0) expect(mean[c]! / ml.parentArea[c]!).toBeCloseTo(1, 12);
  });

  it('zero-mean detail: R(D − C(R(D))) = 0', () => {
    const ml = level(N);
    const D = ml.zeroMeanPerParent(roughFine(ml, 7));
    expect(maxAbs(ml.restrict(D), (c) => ml.childCount[c] === 0)).toBeLessThan(1e-9);
  });

  it('additive anchoring restores the reference and is idempotent', () => {
    const ml = level(N);
    const ref = roughCoarse(11);
    const e = ml.prolong(roughCoarse(13));
    const fine = roughFine(ml, 17);
    for (let i = 0; i < ml.n1; i++) e[i]! += 0.2 * fine[i]!;
    const anchored = ml.anchorAdditive(e, ref);
    const back = ml.restrict(anchored);
    let worst = 0;
    for (let c = 0; c < ml.n0; c++) if (ml.childCount[c]! > 0) worst = Math.max(worst, Math.abs(back[c]! - ref[c]!));
    expect(worst).toBeLessThan(1e-9); // I1 requires ≤ 0.01 m
    const again = ml.anchorAdditive(anchored, ref);
    expect(maxAbs(again.map((v, i) => v - anchored[i]!))).toBeLessThan(1e-9);
  });

  it('multiplicative anchoring keeps the field non-negative and restores the reference', () => {
    const ml = level(N);
    const ref = Float64Array.from({ length: ml.n0 }, (_, c) => (c % 97 === 0 ? 0 : 3000 * counterUnit(19, c)));
    const p = Float64Array.from({ length: ml.n1 }, (_, i) => (i % 31 === 0 ? 0 : 2000 * counterUnit(23, i)));
    const anchored = ml.anchorMultiplicative(p, ref);
    for (let i = 0; i < ml.n1; i++) expect(anchored[i]).toBeGreaterThanOrEqual(0);
    const back = ml.restrict(anchored);
    for (let c = 0; c < ml.n0; c++) {
      if (ml.childCount[c] === 0) continue;
      expect(Math.abs(back[c]! - ref[c]!)).toBeLessThanOrEqual(1e-5 * Math.max(ref[c]!, 1e-9)); // I1: relative 1e-5
    }
  });

  it('vector prolongation is tangent to the sphere', () => {
    const ml = level(N);
    const q = L0.points;
    // A rigid rotation field ω × v at L0: tangent everywhere, smooth.
    const w = [0.2, 0.9, -0.4];
    const v0 = new Float64Array(3 * ml.n0);
    for (let c = 0; c < ml.n0; c++) {
      const x = q[3 * c]!, y = q[3 * c + 1]!, z = q[3 * c + 2]!;
      v0[3 * c] = w[1]! * z - w[2]! * y; v0[3 * c + 1] = w[2]! * x - w[0]! * z; v0[3 * c + 2] = w[0]! * y - w[1]! * x;
    }
    const v1 = ml.prolongVector(v0);
    const p = ml.fine.points;
    const h = Math.PI / Math.sqrt(N_REF);
    let radial = 0, err = 0;
    for (let i = 0; i < ml.n1; i++) {
      const x = p[3 * i]!, y = p[3 * i + 1]!, z = p[3 * i + 2]!;
      radial = Math.max(radial, Math.abs(v1[3 * i]! * x + v1[3 * i + 1]! * y + v1[3 * i + 2]! * z));
      const ex = w[1]! * z - w[2]! * y, ey = w[2]! * x - w[0]! * z, ez = w[0]! * y - w[1]! * x;
      err = Math.max(err, Math.hypot(v1[3 * i]! - ex, v1[3 * i + 1]! - ey, v1[3 * i + 2]! - ez));
    }
    expect(radial).toBeLessThan(1e-12);
    expect(err).toBeLessThan(2 * h * h);
  });
});

describe('bumpShape', () => {
  it('is 1 at the site, 0 on every Voronoi edge (bisector midpoint) and in [0, 1] between', () => {
    const q = L0.points;
    for (let c = 0; c < L0.numRegions; c += 37) {
      expect(bumpShape(L0, c, q[3 * c]!, q[3 * c + 1]!, q[3 * c + 2]!)).toBeCloseTo(1, 12);
      for (let k = L0.adjOffset[c]!; k < L0.adjOffset[c + 1]!; k++) {
        const nb = L0.adjList[k]!;
        // The chord midpoint lies on the Euclidean bisector, the boundary parentOf uses.
        const mx = (q[3 * c]! + q[3 * nb]!) / 2, my = (q[3 * c + 1]! + q[3 * nb + 1]!) / 2, mz = (q[3 * c + 2]! + q[3 * nb + 2]!) / 2;
        expect(bumpShape(L0, c, mx, my, mz)).toBeLessThan(1e-20);
        const f = 0.7; // 70% of the way from the edge midpoint back to the site
        const px = f * q[3 * c]! + (1 - f) * mx, py = f * q[3 * c + 1]! + (1 - f) * my, pz = f * q[3 * c + 2]! + (1 - f) * mz;
        const pl = Math.hypot(px, py, pz);
        const v = bumpShape(L0, c, px / pl, py / pl, pz / pl);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('MultiLevel coverage', () => {
  it('childless L0 cells: rare at 200k, common at 5k; R reports NaN there and fillChildless defines them', () => {
    expect(Array.from(level(200000).childCount).filter((n) => n === 0).length).toBeLessThanOrEqual(5);
    const ml5 = level(5000);
    const empty = Array.from(ml5.childCount).filter((n) => n === 0).length;
    expect(empty).toBeGreaterThan(0);
    const Rf = ml5.restrict(new Float64Array(ml5.n1).fill(1));
    for (let c = 0; c < ml5.n0; c++) expect(Number.isNaN(Rf[c]!)).toBe(ml5.childCount[c] === 0);
    const filled = ml5.fillChildless(Rf);
    expect(Array.from(filled).every((v) => v === 1)).toBe(true);
  });

  it('operators are deterministic (bit-identical across constructions)', () => {
    const a = new MultiLevel(L0, fineMesh(50000));
    const b = level(50000);
    expect(Buffer.from(a.parentOf.buffer)).toEqual(Buffer.from(b.parentOf.buffer));
    expect(Buffer.from(a.interpWeights.buffer)).toEqual(Buffer.from(b.interpWeights.buffer));
    const d = roughCoarse(29);
    expect(Buffer.from(a.correct(d).buffer)).toEqual(Buffer.from(b.correct(d).buffer));
  });
});
