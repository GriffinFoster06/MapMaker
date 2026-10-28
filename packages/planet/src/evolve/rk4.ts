// Provenance: ported from upstream/VPLanet src/evolve.c at dd55da7 (MIT); see PROVENANCE.md.
// Port of VPLanet's RungeKutta4Step (src/evolve.c:403), fdGetTimeStep (:138) and AssignDt (:125) on a flat state
// vector. Modules (DistOrb, DistRot, EqTide, ...) supply only derivatives, so every secular module runs on this.
const HUGE = 1e100; // vplanet.h dHUGE

/**
 * How a variable is advanced and how it limits the time step (the `iaType` of VPLanet's update structure).
 * - `rate`: x' = f (type 1). Time scale |x / f|, skipped when x or f is 0.
 * - `rate-abs`: x' = f where x is a sine-like quantity (type 2). Time scale |1 / f|, or the `scale` callback.
 * - `explicit`: the callback returns the new value of x, not a derivative (type 0). Time scale |x / ((x - new) / dt)|.
 * - `sinusoid`: explicit and sinusoidal (type 3). Time scale |dt / (x - new)|.
 * - `timed`: explicit, a function of age only (type 10). Limits the step to the time until the next output.
 * - `passive`: integrated as a rate but never limits the step (type 5, derived quantities such as lost energy).
 */
export type VarKind = 'rate' | 'rate-abs' | 'explicit' | 'sinusoid' | 'timed' | 'passive';

export interface OdeVar {
  kind: VarKind;
  /** Optional time scale for `rate-abs` variables, given the state and the derivative (e.g. DistOrb's sin(obliquity) / f). */
  scale?: (state: Float64Array, deriv: number) => number;
}

export interface OdeSystem {
  vars: OdeVar[];
  /** Fill `out` with the derivative (or new value for the explicit kinds) of every variable at `state` and time `t`. */
  derivatives(state: Float64Array, t: number, out: Float64Array): void;
}

export interface StepOptions {
  /** Fixed step (VPLanet `dTimeStep`) when `eta` is not given, and the step used by explicit variables on the first step. */
  dt: number;
  /** Variable-step safety factor (VPLanet `dEta`). When set, the step is eta times the smallest time scale. */
  eta?: number;
  /** Time until the next output (VPLanet `dNextOutput - dTime`); the step never exceeds it when eta is set. */
  untilOutput?: number;
  /** +1 forward, -1 backward (VPLanet `bDoForward`). */
  dir?: 1 | -1;
}

const isExplicit = (k: VarKind): boolean => k === 'explicit' || k === 'sinusoid' || k === 'timed';

/** The smallest time scale over all variables (fdGetTimeStep). `first` is VPLanet's `bFirstStep`. */
export function timeScale(sys: OdeSystem, state: Float64Array, d: Float64Array, dt: number, first: boolean, untilOutput = HUGE): number {
  let min = HUGE;
  let firstLeft = first;
  for (let i = 0; i < sys.vars.length; i++) {
    const v = sys.vars[i]!;
    const x = state[i]!;
    const f = d[i]!;
    switch (v.kind) {
      case 'explicit':
      case 'sinusoid':
        if (firstLeft) {
          min = dt;
          firstLeft = false;
        } else if (x !== f) {
          const m = v.kind === 'explicit' ? Math.abs(x / ((x - f) / dt)) : Math.abs(1.0 / ((x - f) / dt));
          if (m < min) min = m;
        }
        break;
      case 'timed':
        if (untilOutput < min) min = untilOutput;
        break;
      case 'rate-abs':
        if (f !== 0) {
          const m = v.scale ? v.scale(state, f) : Math.abs(1.0 / f);
          if (m < min) min = m;
        }
        break;
      case 'rate':
        if (f !== 0 && x !== 0) {
          const m = Math.abs(x / f);
          if (m < min) min = m;
        }
        break;
      case 'passive':
        break;
    }
  }
  return min;
}

/** VPLanet AssignDt: eta times the smallest time scale, but not past the next output. */
export function assignDt(min: number, untilOutput: number, eta: number): number {
  const m = eta * min;
  return untilOutput < m ? untilOutput : m;
}

/**
 * One RK4 step. Advances `state` in place and returns the step taken.
 * Explicit variables take the value from the first stage's derivative callback (the C code assigns
 * `daDeriv[0]`), and during the sub-stages they hold the value just computed so dependent equations see it.
 */
export function rk4Step(sys: OdeSystem, state: Float64Array, t: number, opt: StepOptions, first = false): number {
  const n = sys.vars.length;
  const dir = opt.dir ?? 1;
  const k: Float64Array[] = [0, 1, 2, 3].map(() => new Float64Array(n));
  const raw = new Float64Array(n);
  const tmp = Float64Array.from(state);
  const dirOf = (kind: VarKind): number => (kind === 'rate' || kind === 'rate-abs' || kind === 'passive' ? dir : 1);

  sys.derivatives(state, t, raw);
  for (let i = 0; i < n; i++) k[0]![i] = raw[i]! * dirOf(sys.vars[i]!.kind);

  let dt = opt.dt;
  if (opt.eta !== undefined) {
    dt = assignDt(timeScale(sys, state, raw, opt.dt, first, opt.untilOutput ?? HUGE), opt.untilOutput ?? HUGE, opt.eta);
  }

  const stage = (prev: Float64Array, frac: number, out: Float64Array, tt: number): void => {
    for (let i = 0; i < n; i++) {
      tmp[i] = isExplicit(sys.vars[i]!.kind) ? prev[i]! : state[i]! + frac * dt * prev[i]!;
    }
    sys.derivatives(tmp, tt, raw);
    for (let i = 0; i < n; i++) out[i] = raw[i]! * dirOf(sys.vars[i]!.kind);
  };
  stage(k[0]!, 0.5, k[1]!, t + 0.5 * dt * dir);
  stage(k[1]!, 0.5, k[2]!, t + 0.5 * dt * dir);
  stage(k[2]!, 1.0, k[3]!, t + dt * dir);

  for (let i = 0; i < n; i++) {
    if (isExplicit(sys.vars[i]!.kind)) state[i] = k[0]![i]!;
    else state[i] = state[i]! + (1 / 6) * (k[0]![i]! + 2 * k[1]![i]! + 2 * k[2]![i]! + k[3]![i]!) * dt;
  }
  return dt;
}

/** Integrate to `tEnd` (years or any unit), returning the time reached. Steps are fixed unless `eta` is set. */
export function integrate(sys: OdeSystem, state: Float64Array, t0: number, tEnd: number, opt: Omit<StepOptions, 'untilOutput'>): number {
  let t = t0;
  let first = true;
  while (t < tEnd) {
    const left = tEnd - t;
    // A fixed step is clamped to the time left so the end time is hit exactly, as the output cadence does in VPLanet.
    const dt = rk4Step(sys, state, t, { ...opt, dt: opt.eta === undefined ? Math.min(opt.dt, left) : opt.dt, untilOutput: left }, first);
    first = false;
    t += dt;
    if (!(dt > 0)) throw new Error('rk4: non-positive time step');
  }
  return t;
}
