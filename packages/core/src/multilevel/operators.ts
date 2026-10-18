// Provenance: original code (design note 14 §3.4–3.6), after the multigrid transfer operators of Briggs, Henson &
// McCormick, "A Multigrid Tutorial" (2000), and spectral nudging (von Storch et al. 2000) for anchoring.
// Transfer operators between a coarse mesh L0 (the reference) and a fine mesh L1 (fidelity N):
//   R  restriction: area-weighted mean of the L1 cells whose centres lie in each L0 Voronoi cell (spike 1c);
//   P  prolongation: barycentric interpolation on the L0 Delaunay triangulation;
//   C  correction: a continuous fine field whose restriction is exactly the given coarse field (R∘C = I).
// C deviates from note 14 §3.4, which iterated x ← x + P(δ − R(x)) to convergence. On the jittered L0 mesh R∘P is
// ill-conditioned (cells whose children take little weight from their own vertex), so that iteration diverges for
// rough δ (measured at N = 50k: residual 1e3 → 4e6 in 30 steps), and CG or Tikhonov solves of (R∘P)y = δ amplify
// δ by 10–1e17. Here P iterations are taken only while they reduce the residual, and the remainder is carried by
// per-cell bumps that vanish on the Voronoi boundary, so the result is exact, continuous and bounded.
import { dmath } from '../dmath';
import type { SphereMesh } from '../mesh/sphere-mesh';
import { SpatialIndex } from '../mesh/spatial-index';

export interface CorrectionOptions {
  /** Cap on residual-reducing P iterations before the exact bump step. Default 16. */
  maxIter?: number;
  /** Filled on return: P iterations accepted, and max |residual| (relative, for the multiplicative anchor) carried by bumps. */
  stats?: { iterations: number; finalStep: number };
}

/** Bump ramp: each bisector factor reaches 1 at this fraction of the way from the Voronoi edge to the site. */
const BUMP_RAMP = 0.5;

const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Unnormalised bump of L0 cell c at x: Π_q smoothstep(t_q / BUMP_RAMP) over c's Delaunay neighbours q, where
 * t_q = (|x − q|² − |x − c|²) / |c − q|² is 0 on the Euclidean c|q bisector (the boundary parentOf uses; L0 points
 * are f32-rounded, so not exactly unit) and 1 at c. In [0, 1]; 0 on c's Voronoi boundary.
 */
export function bumpShape(coarse: SphereMesh, c: number, x: number, y: number, z: number): number {
  const q = coarse.points, { adjOffset, adjList } = coarse;
  const cx = q[3 * c]!, cy = q[3 * c + 1]!, cz = q[3 * c + 2]!;
  const dc = (x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz);
  let v = 1;
  for (let k = adjOffset[c]!; k < adjOffset[c + 1]!; k++) {
    const nb = adjList[k]!;
    const qx = q[3 * nb]!, qy = q[3 * nb + 1]!, qz = q[3 * nb + 2]!;
    const dq = (x - qx) * (x - qx) + (y - qy) * (y - qy) + (z - qz) * (z - qz);
    const t = (dq - dc) / ((cx - qx) * (cx - qx) + (cy - qy) * (cy - qy) + (cz - qz) * (cz - qz));
    v *= smoothstep(t / BUMP_RAMP);
  }
  return v;
}

const triple = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) =>
  ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);

/**
 * Links a fine mesh to the reference mesh and provides R, P and C between them.
 * L0 cells with no L1 centre inside (possible when N < N_ref) have no restriction: R gives NaN there, and C and
 * the anchors leave them unconstrained.
 */
export class MultiLevel {
  readonly n0: number;
  readonly n1: number;
  /** L1 cell → L0 cell whose Voronoi cell contains its centre. */
  readonly parentOf: Int32Array;
  /** Number of L1 cells per L0 cell. */
  readonly childCount: Int32Array;
  /** Σ of child L1 cell areas (sr) per L0 cell. */
  readonly parentArea: Float64Array;
  /** Per L1 cell, the three L0 vertices of the containing Delaunay triangle and their barycentric weights. */
  readonly interpCells: Int32Array;
  readonly interpWeights: Float64Array;
  private readonly fineArea: Float64Array;
  private _children?: { offset: Int32Array; list: Int32Array };
  private _bumps?: Float64Array;
  /** Reused trial iterate of `correct` (length n1). Never handed to a caller. */
  private _trial?: Float64Array;

  constructor(readonly coarse: SphereMesh, readonly fine: SphereMesh) {
    this.n0 = coarse.numRegions;
    this.n1 = fine.numRegions;
    this.fineArea = fine.cellArea_sr;
    const index = new SpatialIndex(coarse);
    const fp = fine.points;
    const parentOf = new Int32Array(this.n1);
    // Breadth-first over L1, each query starting from the parent of the L1 neighbour that reached it: the walk is
    // then a step or two. (Index order is a poor hint: consecutive Fibonacci cells are ~137° apart in longitude.)
    parentOf.fill(-1);
    const queue = new Int32Array(this.n1);
    const { adjOffset: fo, adjList: fl } = fine;
    for (let seed = 0; seed < this.n1; seed++) {
      if (parentOf[seed] !== -1) continue;
      parentOf[seed] = index.nearestCell(fp[3 * seed]!, fp[3 * seed + 1]!, fp[3 * seed + 2]!);
      let head = 0, tail = 0;
      queue[tail++] = seed;
      while (head < tail) {
        const i = queue[head++]!;
        for (let k = fo[i]!; k < fo[i + 1]!; k++) {
          const j = fl[k]!;
          if (parentOf[j] !== -1) continue;
          parentOf[j] = index.nearestCell(fp[3 * j]!, fp[3 * j + 1]!, fp[3 * j + 2]!, parentOf[i]!);
          queue[tail++] = j;
        }
      }
    }
    this.parentOf = parentOf;
    this.childCount = new Int32Array(this.n0);
    this.parentArea = new Float64Array(this.n0);
    for (let i = 0; i < this.n1; i++) {
      this.childCount[parentOf[i]!]!++;
      this.parentArea[parentOf[i]!]! += this.fineArea[i]!;
    }
    const { cells, weights } = this.buildInterpolation();
    this.interpCells = cells;
    this.interpWeights = weights;
  }

  /** R: area-weighted mean over children. NaN for an L0 cell without children. */
  restrict(fine: ArrayLike<number>): Float64Array {
    const out = new Float64Array(this.n0);
    const { parentOf, fineArea } = this;
    for (let i = 0; i < this.n1; i++) out[parentOf[i]!]! += fineArea[i]! * fine[i]!;
    for (let c = 0; c < this.n0; c++) out[c] = this.childCount[c]! > 0 ? out[c]! / this.parentArea[c]! : NaN;
    return out;
  }

  /** P: barycentric interpolation of an L0 field at every L1 centre. */
  prolong(coarse: ArrayLike<number>): Float64Array {
    return this.prolongInto(coarse, new Float64Array(this.n1));
  }

  /** P into a caller-supplied array of length n1 (same arithmetic as prolong). Returns `out`. */
  prolongInto(coarse: ArrayLike<number>, out: Float64Array): Float64Array {
    const C = this.interpCells, W = this.interpWeights;
    for (let i = 0, k = 0; i < this.n1; i++, k += 3) {
      out[i] = W[k]! * coarse[C[k]!]! + W[k + 1]! * coarse[C[k + 1]!]! + W[k + 2]! * coarse[C[k + 2]!]!;
    }
    return out;
  }

  /** Categorical prolongation: each L1 cell takes its parent's value. */
  prolongNearest<T extends { length: number; [i: number]: number }>(coarse: ArrayLike<number>, out: T): T {
    for (let i = 0; i < this.n1; i++) out[i] = coarse[this.parentOf[i]!]!;
    return out;
  }

  /** Vector prolongation: P per Cartesian component (xyz interleaved), then projection onto each L1 tangent plane. */
  prolongVector(coarse: ArrayLike<number>): Float64Array {
    const out = new Float64Array(3 * this.n1);
    const C = this.interpCells, W = this.interpWeights, p = this.fine.points;
    for (let i = 0, k = 0; i < this.n1; i++, k += 3) {
      let vx = 0, vy = 0, vz = 0;
      for (let j = 0; j < 3; j++) {
        const c = 3 * C[k + j]!, w = W[k + j]!;
        vx += w * coarse[c]!; vy += w * coarse[c + 1]!; vz += w * coarse[c + 2]!;
      }
      const x = p[3 * i]!, y = p[3 * i + 1]!, z = p[3 * i + 2]!;
      const radial = vx * x + vy * y + vz * z;
      out[3 * i] = vx - radial * x;
      out[3 * i + 1] = vy - radial * y;
      out[3 * i + 2] = vz - radial * z;
    }
    return out;
  }

  /**
   * C: a continuous fine field x with R(x) = δ on every L0 cell that has children. x = P(y) + Σ_c r_c ψ_c, where y
   * takes the guarded iterations y ← y + (δ − R(P(y))) (accepted while both the area-weighted L2 and the max residual
   * fall), and r = δ − R(P(y)) is carried by the normalised bumps ψ_c (mean 1 over c's children, 0 on c's boundary).
   */
  correct(delta: ArrayLike<number>, opts: CorrectionOptions = {}): Float64Array {
    const maxIter = opts.maxIter ?? 16;
    const n0 = this.n0, has = this.childCount;
    const d = this.fillChildless(delta);
    const residualOf = (x: Float64Array, out: Float64Array): [number, number] => {
      const Rx = this.restrict(x);
      let l2 = 0, mx = 0;
      for (let c = 0; c < n0; c++) {
        out[c] = has[c]! > 0 ? d[c]! - Rx[c]! : 0;
        l2 += this.parentArea[c]! * out[c]! * out[c]!;
        mx = Math.max(mx, Math.abs(out[c]!));
      }
      return [l2, mx];
    };
    let y = Float64Array.from(d);
    let x = this.prolong(y);
    let r = new Float64Array(n0);
    let [l2, mx] = residualOf(x, r);
    let it = 0;
    // Trial iterates go into one scratch array of length n1 that is swapped with x on acceptance, so a call allocates
    // two fine arrays however many iterations it tries (Phase 5 M0: at 2.56M, ~187 fresh 20 MB arrays per detail
    // pass, which WebKit kept resident). The scratch is never the array returned.
    let x2 = this.trialScratch();
    for (; it < maxIter && mx > 0; it++) {
      const y2 = new Float64Array(n0);
      for (let c = 0; c < n0; c++) y2[c] = y[c]! + r[c]!;
      this.prolongInto(y2, x2);
      const r2 = new Float64Array(n0);
      const [l2b, mxb] = residualOf(x2, r2);
      if (!(l2b < l2 && mxb <= mx)) break;
      const old = x;
      y = y2; x = x2; x2 = old; r = r2; l2 = l2b; mx = mxb;
    }
    this._trial = x2;
    const psi = this.bumps;
    for (let i = 0; i < this.n1; i++) x[i]! += r[this.parentOf[i]!]! * psi[i]!;
    if (opts.stats) { opts.stats.iterations = it; opts.stats.finalStep = mx; }
    return x;
  }

  /** Removes the reference-scale component of a detail field: D − C(R(D)), whose restriction is zero. */
  zeroMeanPerParent(detail: ArrayLike<number>, opts?: CorrectionOptions): Float64Array {
    const Rd = this.restrict(detail);
    const corr = this.correct(Rd, opts);
    const out = new Float64Array(this.n1);
    for (let i = 0; i < this.n1; i++) out[i] = detail[i]! - corr[i]!;
    return out;
  }

  /** Additive anchoring (note 14 §3.5): e ← e + C(e_ref − R(e)), so R(e) = e_ref. Returns a new array. */
  anchorAdditive(fine: ArrayLike<number>, ref: ArrayLike<number>, opts?: CorrectionOptions): Float64Array {
    const Rf = this.restrict(fine);
    const delta = new Float64Array(this.n0);
    for (let c = 0; c < this.n0; c++) delta[c] = this.childCount[c]! > 0 ? ref[c]! - Rf[c]! : NaN;
    const corr = this.correct(delta, opts);
    const out = new Float64Array(this.n1);
    for (let i = 0; i < this.n1; i++) out[i] = fine[i]! + corr[i]!;
    return out;
  }

  /**
   * Multiplicative anchoring for non-negative fields (precipitation). First p ← p · P(ratio), ratio = ref / R(p) per
   * L0 cell; then, per cell, p_i ← p_i · exp(u_c ψ_i) with u_c solved so that R(p) = ref (monotone in u_c, Newton
   * with bisection). The result is ≥ 0 and continuous where ref and R(p) are positive. A cell with ref = 0 gets zero
   * children; a cell whose children are all zero but whose ref is positive gets ref as a constant.
   */
  anchorMultiplicative(fine: ArrayLike<number>, ref: ArrayLike<number>, opts: CorrectionOptions = {}): Float64Array {
    const n0 = this.n0, has = this.childCount;
    const p = Float64Array.from(fine as ArrayLike<number>);
    const R1 = this.restrict(p);
    const ratio = new Float64Array(n0);
    for (let c = 0; c < n0; c++) ratio[c] = has[c]! > 0 ? (R1[c]! > 0 ? ref[c]! / R1[c]! : 1) : NaN;
    const m = this.prolong(this.fillChildless(ratio));
    for (let i = 0; i < this.n1; i++) p[i] = p[i]! * m[i]!;
    const R2 = this.restrict(p);
    const { offset, list } = this.children;
    const psi = this.bumps, area = this.fineArea;
    let worst = 0;
    for (let c = 0; c < n0; c++) {
      if (has[c] === 0) continue;
      const target = ref[c]!;
      const A = this.parentArea[c]!;
      if (!(target > 0)) { for (let k = offset[c]!; k < offset[c + 1]!; k++) p[list[k]!] = 0; continue; }
      if (!(R2[c]! > 0)) { for (let k = offset[c]!; k < offset[c + 1]!; k++) p[list[k]!] = target; continue; }
      worst = Math.max(worst, Math.abs(target / R2[c]! - 1));
      // f(u) = Σ a_i p_i exp(u ψ_i) / A − target is increasing in u; the bump-weighted part must carry the change.
      const f = (u: number): [number, number] => {
        let v = 0, dv = 0;
        for (let k = offset[c]!; k < offset[c + 1]!; k++) {
          const i = list[k]!;
          if (p[i] === 0) continue;
          const e = area[i]! * p[i]! * dmath.exp(Math.min(709, u * psi[i]!));
          v += e; dv += e * psi[i]!;
        }
        return [v / A - target, dv / A];
      };
      let lo = -745, hi = 745, u = 0;
      let [fv, dv] = f(u);
      for (let iter = 0; iter < 200 && fv !== 0; iter++) {
        if (fv > 0) hi = u; else lo = u;
        let next = dv > 0 ? u - fv / dv : NaN;
        if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
        if (next === u || hi - lo <= 1e-15 * Math.max(1, Math.abs(u))) break;
        u = next;
        [fv, dv] = f(u);
      }
      // One exact scale removes Newton's rounding-level residual (and, if the boundary children alone exceed the
      // target so that no u reaches it, scales the cell uniformly).
      let v = 0;
      for (let k = offset[c]!; k < offset[c + 1]!; k++) {
        const i = list[k]!;
        if (p[i] === 0) continue;
        p[i] = p[i]! * dmath.exp(Math.min(709, u * psi[i]!));
        v += area[i]! * p[i]!;
      }
      const s = v > 0 ? (target * A) / v : 1;
      for (let k = offset[c]!; k < offset[c + 1]!; k++) p[list[k]!]! *= s;
    }
    if (opts.stats) { opts.stats.iterations = 0; opts.stats.finalStep = worst; }
    return p;
  }

  /**
   * Copy of an L0 field in which cells without children (whose values R cannot see, so callers may pass NaN) take
   * the mean of their already-defined Delaunay neighbours, sweeping until all are set. Keeps P smooth near them.
   */
  fillChildless(field: ArrayLike<number>): Float64Array {
    const out = Float64Array.from(field as ArrayLike<number>);
    const { adjOffset, adjList } = this.coarse;
    const defined = new Uint8Array(this.n0);
    let pending = 0;
    for (let c = 0; c < this.n0; c++) if (this.childCount[c]! > 0) defined[c] = 1; else pending++;
    while (pending > 0) {
      const ready: [number, number][] = [];
      for (let c = 0; c < this.n0; c++) {
        if (defined[c]) continue;
        let sum = 0, n = 0;
        for (let k = adjOffset[c]!; k < adjOffset[c + 1]!; k++) if (defined[adjList[k]!]) { sum += out[adjList[k]!]!; n++; }
        if (n > 0) ready.push([c, sum / n]);
      }
      if (ready.length === 0) { for (let c = 0; c < this.n0; c++) if (!defined[c]) out[c] = 0; break; }
      for (const [c, v] of ready) { out[c] = v; defined[c] = 1; pending--; }
    }
    return out;
  }

  private trialScratch(): Float64Array {
    const t = this._trial ?? new Float64Array(this.n1);
    this._trial = undefined;
    return t;
  }

  /** Children of each L0 cell in CSR form (L1 cell ids in increasing order). */
  private get children(): { offset: Int32Array; list: Int32Array } {
    if (this._children) return this._children;
    const offset = new Int32Array(this.n0 + 1);
    for (let c = 0; c < this.n0; c++) offset[c + 1] = offset[c]! + this.childCount[c]!;
    const fill = offset.slice(0, this.n0);
    const list = new Int32Array(this.n1);
    for (let i = 0; i < this.n1; i++) list[fill[this.parentOf[i]!]!++] = i;
    this._children = { offset, list };
    return this._children;
  }

  /**
   * ψ per L1 cell: its parent's bumpShape, normalised to area-weighted mean 1 over the parent's children. The shape
   * is 0 on the cell boundary, so Σ r_c ψ_c is continuous across cells for any r.
   */
  get bumps(): Float64Array {
    if (this._bumps) return this._bumps;
    const fp = this.fine.points;
    const psi = new Float64Array(this.n1);
    for (let i = 0; i < this.n1; i++) psi[i] = bumpShape(this.coarse, this.parentOf[i]!, fp[3 * i]!, fp[3 * i + 1]!, fp[3 * i + 2]!);
    const mean = new Float64Array(this.n0);
    for (let i = 0; i < this.n1; i++) mean[this.parentOf[i]!]! += this.fineArea[i]! * psi[i]!;
    for (let c = 0; c < this.n0; c++) mean[c] = mean[c]! / this.parentArea[c]!;
    // A cell whose children all sit on its boundary (ψ = 0) falls back to a constant: still exact, no longer 0 there.
    for (let i = 0; i < this.n1; i++) {
      const c = this.parentOf[i]!;
      psi[i] = mean[c]! > 0 ? psi[i]! / mean[c]! : 1;
    }
    this._bumps = psi;
    return psi;
  }

  private buildInterpolation(): { cells: Int32Array; weights: Float64Array } {
    const L0 = this.coarse, q = L0.points, T = L0.triangles, H = L0.halfedges;
    const nt = L0.numTriangles;
    // Orientation of each L0 triangle seen from outside the sphere; containment tests are sign-adjusted by it.
    const orient = new Int8Array(nt);
    for (let t = 0; t < nt; t++) {
      const a = 3 * T[3 * t]!, b = 3 * T[3 * t + 1]!, c = 3 * T[3 * t + 2]!;
      orient[t] = triple(q[a]!, q[a + 1]!, q[a + 2]!, q[b]!, q[b + 1]!, q[b + 2]!, q[c]!, q[c + 1]!, q[c + 2]!) < 0 ? -1 : 1;
    }
    // Barycentric (gnomonic) coordinates of x in triangle t; the smallest one is ≥ 0 iff x lies inside.
    const bary = (t: number, x: number, y: number, z: number, w: Float64Array): number => {
      const a = 3 * T[3 * t]!, b = 3 * T[3 * t + 1]!, c = 3 * T[3 * t + 2]!;
      const s = orient[t]!;
      w[0] = s * triple(x, y, z, q[b]!, q[b + 1]!, q[b + 2]!, q[c]!, q[c + 1]!, q[c + 2]!);
      w[1] = s * triple(q[a]!, q[a + 1]!, q[a + 2]!, x, y, z, q[c]!, q[c + 1]!, q[c + 2]!);
      w[2] = s * triple(q[a]!, q[a + 1]!, q[a + 2]!, q[b]!, q[b + 1]!, q[b + 2]!, x, y, z);
      const sum = w[0]! + w[1]! + w[2]!;
      return Math.min(w[0]!, w[1]!, w[2]!) / (sum > 0 ? sum : 1);
    };
    const cells = new Int32Array(3 * this.n1);
    const weights = new Float64Array(3 * this.n1);
    const w = new Float64Array(3);
    const fp = this.fine.points;
    const { adjOffset, adjTriList } = L0;
    for (let i = 0; i < this.n1; i++) {
      const x = fp[3 * i]!, y = fp[3 * i + 1]!, z = fp[3 * i + 2]!;
      const n = this.parentOf[i]!;
      // The containing triangle is usually incident to the nearest L0 site; take the most interior candidate.
      let best = -1, bestScore = -Infinity;
      for (let k = adjOffset[n]!; k < adjOffset[n + 1]!; k++) {
        const t = adjTriList[k]!;
        const score = bary(t, x, y, z, w);
        if (score > bestScore) { bestScore = score; best = t; }
      }
      // Otherwise walk across the edge the point lies outside of (visibility walk on the Delaunay triangulation).
      for (let steps = 0; bestScore < 0 && steps < 4 * nt; steps++) {
        bary(best, x, y, z, w);
        let side = 0;
        for (let j = 1; j < 3; j++) if (w[j]! < w[side]!) side = j;
        // Weight j is opposite vertex j, i.e. edge from vertex j+1 to j+2, which is halfedge 3t + (j+1)%3.
        const opp = H[3 * best + ((side + 1) % 3)]!;
        best = (opp / 3) | 0;
        bestScore = bary(best, x, y, z, w);
      }
      if (bestScore < -1e-12) throw new Error(`MultiLevel: no containing L0 triangle for L1 cell ${i}`);
      bary(best, x, y, z, w);
      const w0 = Math.max(0, w[0]!), w1 = Math.max(0, w[1]!), w2 = Math.max(0, w[2]!);
      const s = w0 + w1 + w2;
      cells[3 * i] = T[3 * best]!; cells[3 * i + 1] = T[3 * best + 1]!; cells[3 * i + 2] = T[3 * best + 2]!;
      weights[3 * i] = w0 / s; weights[3 * i + 1] = w1 / s; weights[3 * i + 2] = w2 / s;
    }
    return { cells, weights };
  }
}
