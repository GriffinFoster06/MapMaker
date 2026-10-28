// Provenance: ported from upstream/VPLanet src/distorb.c at dd55da7 (MIT); see PROVENANCE.md.
// Port of VPLanet LUDecomp and LUSolve (src/distorb.c:2701, :2773, MIT, commit dd55da7) on flat row-major matrices.
const TEENY = 1e-20; // distorb.h:17

export interface LU {
  size: number;
  /** The decomposed matrix (L below the diagonal with unit diagonal, U on and above it). */
  lu: Float64Array;
  rowswap: Int32Array;
}

/** Crout LU with implicit row scaling and partial pivoting, as in VPLanet. `a` is not modified. */
export function luDecompose(a: Float64Array, size: number): LU {
  const lu = Float64Array.from(a);
  const scale = new Float64Array(size);
  const rowswap = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    let big = 0.0;
    for (let j = 0; j < size; j++) {
      const v = Math.abs(lu[i * size + j]!);
      if (v > big) big = v;
    }
    if (big === 0.0) throw new Error('Singular matrix in luDecompose');
    scale[i] = 1.0 / big;
  }
  for (let j = 0; j < size; j++) {
    let scaletmp = 0.0;
    let swapi = j;
    for (let i = 0; i < size; i++) {
      let sumk = 0.0;
      const kmax = i < j ? i : j;
      for (let k = 0; k < kmax; k++) sumk += lu[i * size + k]! * lu[k * size + j]!;
      lu[i * size + j] = lu[i * size + j]! - sumk;
      if (i >= j) {
        const t = Math.abs(scale[i]! * lu[i * size + j]!);
        if (t >= scaletmp) {
          scaletmp = t;
          swapi = i;
        }
      }
    }
    if (swapi !== j) {
      for (let k = 0; k < size; k++) {
        const d = lu[swapi * size + k]!;
        lu[swapi * size + k] = lu[j * size + k]!;
        lu[j * size + k] = d;
      }
      const d = scale[j]!;
      scale[j] = scale[swapi]!;
      scale[swapi] = d;
    }
    if (lu[j * size + j] === 0) lu[j * size + j] = TEENY;
    for (let i = j + 1; i < size; i++) lu[i * size + j] = lu[i * size + j]! / lu[j * size + j]!;
    rowswap[j] = swapi;
  }
  return { size, lu, rowswap };
}

/** Solves A x = b in place (`soln` holds b on entry and x on exit). */
export function luSolve({ size, lu, rowswap }: LU, soln: Float64Array): void {
  for (let i = 0; i < size; i++) {
    const s = rowswap[i]!;
    if (s !== i) {
      const d = soln[i]!;
      soln[i] = soln[s]!;
      soln[s] = d;
    }
  }
  for (let i = 0; i < size; i++) {
    let sumj = 0.0;
    for (let j = 0; j < i; j++) sumj += lu[i * size + j]! * soln[j]!;
    soln[i] = soln[i]! - sumj;
  }
  for (let i = size - 1; i >= 0; i--) {
    let sumj = 0.0;
    for (let j = i + 1; j < size; j++) sumj += lu[i * size + j]! * soln[j]!;
    soln[i] = (soln[i]! - sumj) / lu[i * size + i]!;
  }
}

/** The inverse of the decomposed matrix, row-major (as VPLanet builds daInvMAnn, column by column). */
export function luInverse(f: LU): Float64Array {
  const n = f.size;
  const inv = new Float64Array(n * n);
  const unit = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    unit.fill(0);
    unit[i] = 1.0;
    luSolve(f, unit);
    for (let j = 0; j < n; j++) inv[j * n + i] = unit[j]!;
  }
  return inv;
}
