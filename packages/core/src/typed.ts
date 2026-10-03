// Typed-array helpers shared by layers, entities, timeline and save. Raw chunks are little-endian.

export type Dtype = 'f32' | 'f64' | 'i32' | 'u32' | 'u16' | 'u8';
export type TypedArray = Float32Array | Float64Array | Int32Array | Uint32Array | Uint16Array | Uint8Array;

if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw new Error('big-endian hosts are not supported');

export const DTYPES: readonly Dtype[] = ['f32', 'f64', 'i32', 'u32', 'u16', 'u8'];

export function makeArray(dtype: Dtype, n: number): TypedArray {
  switch (dtype) {
    case 'f32': return new Float32Array(n);
    case 'f64': return new Float64Array(n);
    case 'i32': return new Int32Array(n);
    case 'u32': return new Uint32Array(n);
    case 'u16': return new Uint16Array(n);
    case 'u8': return new Uint8Array(n);
  }
}

export function dtypeOf(a: TypedArray): Dtype {
  if (a instanceof Float32Array) return 'f32';
  if (a instanceof Float64Array) return 'f64';
  if (a instanceof Int32Array) return 'i32';
  if (a instanceof Uint32Array) return 'u32';
  if (a instanceof Uint16Array) return 'u16';
  return 'u8';
}

export function arrayFromBytes(dtype: Dtype, bytes: Uint8Array): TypedArray {
  // Copy: the source may be a view into a zip buffer with unaligned byteOffset.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const b = copy.buffer;
  switch (dtype) {
    case 'f32': return new Float32Array(b);
    case 'f64': return new Float64Array(b);
    case 'i32': return new Int32Array(b);
    case 'u32': return new Uint32Array(b);
    case 'u16': return new Uint16Array(b);
    case 'u8': return new Uint8Array(b);
  }
}

export function bytesOf(a: TypedArray): Uint8Array {
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

/** JSON with sorted keys, for hashing. Rejects non-finite numbers. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('non-finite number in JSON');
    return JSON.stringify(v) ?? 'null';
  }
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}
