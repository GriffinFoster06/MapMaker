// Layer registry and per-mesh layer storage (ARCHITECTURE §3.2). Original shell code.
import { sha256 } from '../hash';
import { isUnit } from '../units';
import { type Dtype, type TypedArray, bytesOf, dtypeOf, makeArray } from '../typed';

export type LayerKind = 'scalar' | 'vector-en' | 'categorical' | 'bitset';
export type SampleRule = 'barycentric' | 'nearest' | 'none';
export type TimeVarying = false | 'geo' | 'history';

export interface LayerDescriptor {
  id: string;
  dtype: Dtype;
  unit: string;
  kind: LayerKind;
  /**
   * Producer stage per pipeline variant. Key '*' applies to every variant without its own entry.
   * Exactly one producer per layer per variant; only that stage may write it (checked by the runner).
   */
  producers: Record<string, string>;
  /** Layer ids the producer reads; used for invalidation. */
  deps: string[];
  sample: SampleRule;
  timeVarying: TimeVarying;
}

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)*$/;

/** Array ids stored for a layer: one, or two for a vector-en layer. */
export function arrayIds(d: Pick<LayerDescriptor, 'id' | 'kind'>): string[] {
  return d.kind === 'vector-en' ? [`${d.id}.east`, `${d.id}.north`] : [d.id];
}

export class LayerRegistry {
  private readonly layers = new Map<string, LayerDescriptor>();

  register(d: LayerDescriptor): void {
    if (!ID_RE.test(d.id)) throw new Error(`bad layer id: ${d.id}`);
    if (this.layers.has(d.id)) throw new Error(`layer already registered: ${d.id}`);
    if (!isUnit(d.unit)) throw new Error(`layer ${d.id}: unknown unit ${d.unit}`);
    if (Object.keys(d.producers).length === 0) throw new Error(`layer ${d.id}: no producer`);
    if (d.kind === 'categorical' && d.sample === 'barycentric') throw new Error(`layer ${d.id}: categorical layers cannot be sampled barycentrically`);
    this.layers.set(d.id, d);
  }

  get(id: string): LayerDescriptor {
    const d = this.layers.get(id);
    if (!d) throw new Error(`unknown layer: ${id}`);
    return d;
  }

  has(id: string): boolean { return this.layers.has(id); }

  list(): LayerDescriptor[] { return [...this.layers.values()].sort((a, b) => (a.id < b.id ? -1 : 1)); }

  producerFor(id: string, variant: string): string | undefined {
    const d = this.get(id);
    return d.producers[variant] ?? d.producers['*'];
  }

  /** Layers that (transitively) depend on any of `ids`. */
  dependents(ids: string[]): Set<string> {
    const out = new Set<string>();
    let frontier = new Set(ids);
    while (frontier.size) {
      const next = new Set<string>();
      for (const d of this.layers.values()) {
        if (out.has(d.id)) continue;
        if (d.deps.some((x) => frontier.has(x))) { out.add(d.id); next.add(d.id); }
      }
      frontier = next;
    }
    return out;
  }

  toJSON(): LayerDescriptor[] { return this.list(); }

  static fromJSON(list: LayerDescriptor[]): LayerRegistry {
    const r = new LayerRegistry();
    for (const d of list) r.register(d);
    return r;
  }
}

/** Per-mesh typed arrays, keyed `${meshId}/${arrayId}`. */
export class LayerStore {
  private readonly arrays = new Map<string, TypedArray>();

  constructor(readonly registry: LayerRegistry) {}

  alloc(meshId: string, layerId: string, n: number): TypedArray[] {
    const d = this.registry.get(layerId);
    return arrayIds(d).map((aid) => {
      const key = `${meshId}/${aid}`;
      if (this.arrays.has(key)) throw new Error(`already allocated: ${key}`);
      const a = makeArray(d.dtype, n);
      this.arrays.set(key, a);
      return a;
    });
  }

  set(meshId: string, arrayId: string, a: TypedArray): void {
    const layerId = [...arrayIdToLayer(this.registry, arrayId)][0];
    if (!layerId) throw new Error(`no layer for array ${arrayId}`);
    const d = this.registry.get(layerId);
    if (dtypeOf(a) !== d.dtype) throw new Error(`${arrayId}: expected ${d.dtype}, got ${dtypeOf(a)}`);
    this.arrays.set(`${meshId}/${arrayId}`, a);
  }

  get(meshId: string, arrayId: string): TypedArray {
    const a = this.arrays.get(`${meshId}/${arrayId}`);
    if (!a) throw new Error(`layer array not present: ${meshId}/${arrayId}`);
    return a;
  }

  has(meshId: string, arrayId: string): boolean { return this.arrays.has(`${meshId}/${arrayId}`); }

  delete(meshId: string, arrayId: string): void { this.arrays.delete(`${meshId}/${arrayId}`); }

  /** Sorted keys `${meshId}/${arrayId}`. */
  keys(): string[] { return [...this.arrays.keys()].sort(); }

  async hash(meshId: string, arrayId: string): Promise<string> {
    return sha256(bytesOf(this.get(meshId, arrayId)));
  }
}

function* arrayIdToLayer(reg: LayerRegistry, arrayId: string): Generator<string> {
  for (const d of reg.list()) if (arrayIds(d).includes(arrayId)) yield d.id;
}
