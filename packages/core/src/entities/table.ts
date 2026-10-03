// Columnar entity tables with stable ids, validity intervals and a declared time axis (ARCHITECTURE §3.3).
import { type Dtype, type TypedArray, makeArray } from '../typed';

export type TimeAxis = 'geo' | 'history';
export interface EntityRef { table: string; id: number }

export interface TableSpec {
  name: string;
  timeAxis: TimeAxis;
  /** column name -> dtype */
  columns: Record<string, Dtype>;
  /** Agent tables change every tick and are saved under agents/. */
  agent?: boolean;
}

/** Plain-data form used by the save format. */
export interface TableChunks {
  spec: TableSpec;
  nextId: number;
  length: number;
  ids: Int32Array;
  validFrom: Float64Array;
  validTo: Float64Array;
  data: Record<string, TypedArray>;
}

export class EntityTable {
  readonly spec: TableSpec;
  private cap = 16;
  private n = 0;
  private nextId = 1;
  private ids = new Int32Array(this.cap);
  private from = new Float64Array(this.cap);
  private to = new Float64Array(this.cap);
  private cols: Record<string, TypedArray> = {};

  constructor(spec: TableSpec) {
    this.spec = { ...spec, columns: { ...spec.columns } };
    for (const [c, dt] of Object.entries(spec.columns)) this.cols[c] = makeArray(dt, this.cap);
  }

  get length(): number { return this.n; }
  get name(): string { return this.spec.name; }

  private grow(): void {
    this.cap *= 2;
    const g = <T extends TypedArray>(a: T): T => { const b = new (a.constructor as new (n: number) => T)(this.cap); b.set(a); return b; };
    this.ids = g(this.ids); this.from = g(this.from); this.to = g(this.to);
    for (const c of Object.keys(this.cols)) this.cols[c] = g(this.cols[c]!);
  }

  /** Append a row. Ids are never reused. validTo defaults to +Infinity (still valid). */
  add(row: Record<string, number>, validFrom = 0, validTo = Infinity): number {
    if (this.n === this.cap) this.grow();
    const i = this.n++;
    const id = this.nextId++;
    this.ids[i] = id; this.from[i] = validFrom; this.to[i] = validTo;
    for (const c of Object.keys(this.cols)) {
      const v = row[c];
      if (v === undefined) throw new Error(`${this.name}: missing column ${c}`);
      this.cols[c]![i] = v;
    }
    for (const c of Object.keys(row)) if (!(c in this.cols)) throw new Error(`${this.name}: unknown column ${c}`);
    return id;
  }

  /** Row index of a stable id (ids are ascending, so this is a binary search). */
  indexOf(id: number): number {
    let lo = 0, hi = this.n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, v = this.ids[mid]!;
      if (v === id) return mid;
      if (v < id) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  column(name: string): TypedArray {
    const c = this.cols[name];
    if (!c) throw new Error(`${this.name}: no column ${name}`);
    return c.subarray(0, this.n);
  }

  get(id: number, col: string): number {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`${this.name}: no id ${id}`);
    return this.cols[col]![i]!;
  }

  set(id: number, col: string, v: number): void {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`${this.name}: no id ${id}`);
    if (!(col in this.cols)) throw new Error(`${this.name}: no column ${col}`);
    this.cols[col]![i] = v;
  }

  validRange(id: number): [number, number] {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`${this.name}: no id ${id}`);
    return [this.from[i]!, this.to[i]!];
  }

  end(id: number, t: number): void {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`${this.name}: no id ${id}`);
    this.to[i] = t;
  }

  /** Ids valid at time t on this table's axis: validFrom <= t < validTo. */
  aliveAt(t: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.from[i]! <= t && t < this.to[i]!) out.push(this.ids[i]!);
    return out;
  }

  toChunks(): TableChunks {
    const n = this.n;
    const data: Record<string, TypedArray> = {};
    for (const c of Object.keys(this.cols)) data[c] = this.cols[c]!.slice(0, n);
    return { spec: this.spec, nextId: this.nextId, length: n, ids: this.ids.slice(0, n), validFrom: this.from.slice(0, n), validTo: this.to.slice(0, n), data };
  }

  static fromChunks(c: TableChunks): EntityTable {
    const t = new EntityTable(c.spec);
    while (t.cap < c.length) t.grow();
    t.n = c.length; t.nextId = c.nextId;
    t.ids.set(c.ids); t.from.set(c.validFrom); t.to.set(c.validTo);
    for (const k of Object.keys(c.data)) t.cols[k]!.set(c.data[k]!);
    return t;
  }
}
