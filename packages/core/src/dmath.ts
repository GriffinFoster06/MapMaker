// Deterministic-math hook (ARCHITECTURE §3.5, Q3). All simulation code calls dmath.* instead of Math.*.
// Currently a pass-through. Spike 1a saw bit-identical output across V8, SpiderMonkey and JavaScriptCore;
// it switches to a vendored fdlibm port only if the cross-engine CI test (incl. Windows) shows a divergence.

export const dmath = {
  mode: 'native' as 'native' | 'fdlibm',
  sin: (x: number): number => Math.sin(x),
  cos: (x: number): number => Math.cos(x),
  tan: (x: number): number => Math.tan(x),
  asin: (x: number): number => Math.asin(x),
  acos: (x: number): number => Math.acos(x),
  atan: (x: number): number => Math.atan(x),
  atan2: (y: number, x: number): number => Math.atan2(y, x),
  sinh: (x: number): number => Math.sinh(x),
  cosh: (x: number): number => Math.cosh(x),
  tanh: (x: number): number => Math.tanh(x),
  asinh: (x: number): number => Math.asinh(x),
  acosh: (x: number): number => Math.acosh(x),
  atanh: (x: number): number => Math.atanh(x),
  exp: (x: number): number => Math.exp(x),
  expm1: (x: number): number => Math.expm1(x),
  log: (x: number): number => Math.log(x),
  log2: (x: number): number => Math.log2(x),
  log10: (x: number): number => Math.log10(x),
  log1p: (x: number): number => Math.log1p(x),
  pow: (x: number, y: number): number => Math.pow(x, y),
  cbrt: (x: number): number => Math.cbrt(x),
  hypot: (...v: number[]): number => Math.hypot(...v),
  // Correctly rounded in IEEE-754, so safe to call directly; listed for one-stop use.
  sqrt: (x: number): number => Math.sqrt(x),
};

export type DMath = typeof dmath;
