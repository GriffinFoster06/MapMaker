// Time-varying cell layers: a current array, keyframes every K steps, and a run-length-packed change log between
// keyframes (ARCHITECTURE §3.4). "Time" is an integer step: a history tick or a geologic step. Original shell code.
import { type Dtype, type TypedArray, makeArray, dtypeOf } from '../typed';

/** A run of identical changes on consecutive cells at one step. */
export interface ChangeRuns {
  time: Float64Array;
  cell: Int32Array;
  count: Int32Array;
  old: TypedArray;
  next: TypedArray;
}

export class TimeVaryingLayer {
  readonly dtype: Dtype;
  readonly current: TypedArray;
  /** keyframe step -> snapshot of the state at the END of that step */
  readonly keyframes = new Map<number, TypedArray>();
  private t: number[] = [];
  private c: number[] = [];
  private k: number[] = [];
  private o: number[] = [];
  private nx: number[] = [];

  /** `startStep` is the step of the initial keyframe (state before any change). */
  constructor(readonly id: string, readonly axis: 'geo' | 'history', initial: TypedArray, readonly keyframeEvery: number, readonly startStep = 0) {
    if (!Number.isInteger(keyframeEvery) || keyframeEvery < 1) throw new Error('keyframeEvery must be a positive integer');
    this.dtype = dtypeOf(initial);
    this.current = makeArray(this.dtype, initial.length);
    this.current.set(initial);
    this.keyframes.set(startStep, initial.slice());
  }

  /** Record a change made during `step`. Steps must be non-decreasing. */
  set(step: number, cell: number, value: number): void {
    const old = this.current[cell]!;
    if (old === value) return;
    const n = this.t.length;
    if (n && step < this.t[n - 1]!) throw new Error('changes must be recorded in non-decreasing step order');
    this.current[cell] = value;
    // Extend the last run when it is the same step, same old/new and the next consecutive cell.
    if (n && this.t[n - 1] === step && this.o[n - 1] === old && this.nx[n - 1] === value && this.c[n - 1]! + this.k[n - 1]! === cell) {
      this.k[n - 1]!++;
      return;
    }
    this.t.push(step); this.c.push(cell); this.k.push(1); this.o.push(old); this.nx.push(value);
  }

  /** Call when `step` is complete. Takes a keyframe when `step` is a multiple of keyframeEvery from the start. */
  endStep(step: number): void {
    if (step > this.startStep && (step - this.startStep) % this.keyframeEvery === 0) this.keyframes.set(step, this.current.slice());
  }

  /** State at the end of `step`: nearest earlier keyframe, then replay the change log forward. */
  seek(step: number): TypedArray {
    let kf = this.startStep;
    for (const s of this.keyframes.keys()) if (s <= step && s > kf) kf = s;
    const out = this.keyframes.get(kf)!.slice();
    for (let i = 0; i < this.t.length; i++) {
      const ts = this.t[i]!;
      if (ts <= kf) continue;
      if (ts > step) break;
      for (let j = 0; j < this.k[i]!; j++) out[this.c[i]! + j] = this.nx[i]!;
    }
    return out;
  }

  runs(): ChangeRuns {
    const mk = (a: number[]): TypedArray => { const r = makeArray(this.dtype, a.length); r.set(a); return r; };
    return {
      time: Float64Array.from(this.t), cell: Int32Array.from(this.c), count: Int32Array.from(this.k),
      old: mk(this.o), next: mk(this.nx),
    };
  }

  static restore(id: string, axis: 'geo' | 'history', current: TypedArray, keyframeEvery: number, startStep: number,
    keyframes: Map<number, TypedArray>, runs: ChangeRuns): TimeVaryingLayer {
    const l = new TimeVaryingLayer(id, axis, current, keyframeEvery, startStep);
    l.current.set(current);
    l.keyframes.clear();
    for (const [s, a] of keyframes) l.keyframes.set(s, a.slice());
    l.t = Array.from(runs.time); l.c = Array.from(runs.cell); l.k = Array.from(runs.count);
    l.o = Array.from(runs.old); l.nx = Array.from(runs.next);
    return l;
  }
}
