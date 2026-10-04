// Deterministic-math hook (ARCHITECTURE §3.5, Q3). All simulation code calls dmath.* instead of Math.*.
//
// Two modes:
//  - 'fdlibm'  the DEFAULT, set at module load in every realm (shell, workers). Uses the vendored fdlibm port in
//              ./fdlibm.ts: pure IEEE double arithmetic, bit-identical on every engine and CPU. All canonical state
//              (mesh geometry, history simulation) runs in this mode.
//  - 'native'  passes straight through to Math.*. Used only inside explicit withMode('native') blocks in the orogen
//              parity path (orogen calls Math.*). Results differ by 1-2 ULP between engines and between arm64 and x64
//              (Checkpoint 3). The stage runner rejects any non-parity stage that enters this mode (Checkpoint 3b).
//
// setMode() swaps the function properties in place, so call sites keep writing `dmath.sin(x)`. Do not destructure
// dmath at module load. The mode is per realm: every worker must set it before computing anything.
import { fdlibm } from './fdlibm';

export type DmathMode = 'native' | 'fdlibm';

interface Table {
  sin: (x: number) => number;
  cos: (x: number) => number;
  tan: (x: number) => number;
  asin: (x: number) => number;
  acos: (x: number) => number;
  atan: (x: number) => number;
  atan2: (y: number, x: number) => number;
  sinh: (x: number) => number;
  cosh: (x: number) => number;
  tanh: (x: number) => number;
  asinh: (x: number) => number;
  acosh: (x: number) => number;
  atanh: (x: number) => number;
  exp: (x: number) => number;
  expm1: (x: number) => number;
  log: (x: number) => number;
  log2: (x: number) => number;
  log10: (x: number) => number;
  log1p: (x: number) => number;
  pow: (x: number, y: number) => number;
  cbrt: (x: number) => number;
  hypot: (...v: number[]) => number;
}

const nativeTable: Table = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  exp: Math.exp, expm1: Math.expm1, log: Math.log, log2: Math.log2, log10: Math.log10, log1p: Math.log1p,
  pow: Math.pow, cbrt: Math.cbrt, hypot: Math.hypot,
};

/** n-ary hypot as a left fold of fdlibm's two-argument hypot. Defined here because fdlibm has no n-ary form. */
function fdHypot(...v: number[]): number {
  if (v.length === 0) return 0;
  let h = Math.abs(v[0]!);
  for (let i = 1; i < v.length; i++) h = fdlibm.hypot2(h, v[i]!);
  return h;
}

const fdlibmTable: Table = {
  sin: fdlibm.sin, cos: fdlibm.cos, tan: fdlibm.tan, asin: fdlibm.asin, acos: fdlibm.acos, atan: fdlibm.atan,
  atan2: fdlibm.atan2, sinh: fdlibm.sinh, cosh: fdlibm.cosh, tanh: fdlibm.tanh, asinh: fdlibm.asinh,
  acosh: fdlibm.acosh, atanh: fdlibm.atanh, exp: fdlibm.exp, expm1: fdlibm.expm1, log: fdlibm.log,
  log2: fdlibm.log2, log10: fdlibm.log10, log1p: fdlibm.log1p, pow: fdlibm.pow, cbrt: fdlibm.cbrt, hypot: fdHypot,
};

export interface DMath extends Table {
  mode: DmathMode;
  /** Number of times 'native' mode has been entered in this realm. The runner uses it to catch canonical stages that go native. */
  nativeEntries: number;
  setMode(mode: DmathMode): void;
  /** Runs fn with the given mode and restores the previous one, even if fn throws. Synchronous code only. */
  withMode<T>(mode: DmathMode, fn: () => T): T;
  /** Correctly rounded in IEEE-754, so identical in both modes; listed for one-stop use. */
  sqrt: (x: number) => number;
}

export const dmath: DMath = {
  mode: 'fdlibm',
  nativeEntries: 0,
  setMode(mode: DmathMode): void {
    if (mode !== 'native' && mode !== 'fdlibm') throw new Error(`unknown dmath mode: ${String(mode)}`);
    Object.assign(dmath, mode === 'fdlibm' ? fdlibmTable : nativeTable);
    if (mode === 'native' && dmath.mode !== 'native') dmath.nativeEntries++;
    dmath.mode = mode;
  },
  withMode<T>(mode: DmathMode, fn: () => T): T {
    const prev = dmath.mode;
    dmath.setMode(mode);
    try { return fn(); } finally { dmath.setMode(prev); }
  },
  ...fdlibmTable,
  sqrt: Math.sqrt,
};

/**
 * Called first in every worker and in the main thread. The default is already 'fdlibm'; this asserts it, so a stray
 * setMode('native') at load time fails loudly instead of silently breaking cross-engine determinism.
 */
export function initRealm(): { dmath: DmathMode } {
  if (dmath.mode !== 'fdlibm') throw new Error(`dmath must be 'fdlibm' at realm start, found '${dmath.mode}'`);
  return { dmath: dmath.mode };
}

export { fdlibm };
