// SHA-256 of typed arrays through WebCrypto, identical in Node and browsers.

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export type Bytes = ArrayBufferView | ArrayBuffer;

export function toBytes(a: Bytes): Uint8Array {
  return a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

export async function sha256(data: Bytes | Uint8Array[]): Promise<string> {
  let bytes: Uint8Array;
  if (Array.isArray(data)) {
    const parts = data.map(toBytes);
    bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { bytes.set(p, o); o += p.length; }
  } else bytes = toBytes(data);
  // Copy into a fresh ArrayBuffer-backed view: SharedArrayBuffer-backed views are rejected by digest().
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return hex(await crypto.subtle.digest('SHA-256', copy));
}

export async function hashString(s: string): Promise<string> {
  return sha256(new TextEncoder().encode(s));
}

/** Hash a map of named arrays in sorted-key order. Little-endian hosts only (all supported targets). */
export async function hashArrays(arrays: Record<string, ArrayBufferView>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(arrays).sort()) out[k] = await sha256(arrays[k]!);
  return out;
}
