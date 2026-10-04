import type { TypedArray } from '@mapmaker/core';

export interface Mismatch { key: string; expected?: string; actual?: string }

export function compareHashes(actual: Record<string, string>, golden: Record<string, string>): Mismatch[] {
  const out: Mismatch[] = [];
  for (const k of new Set([...Object.keys(actual), ...Object.keys(golden)])) {
    if (actual[k] !== golden[k]) {
      const m: Mismatch = { key: k };
      if (golden[k] !== undefined) m.expected = golden[k];
      if (actual[k] !== undefined) m.actual = actual[k];
      out.push(m);
    }
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * Keys whose value depends on libm transcendental results in Float64 (dmath sweeps, Float64 mesh points, and areas or
 * circumcentres derived from atan2/sqrt on them). Spike 1a saw no divergence only because orogen rounds to Float32;
 * the Phase 3 probe found 1-2 ULP differences between engines here. Everything else is strict.
 */
export function isTranscendental(key: string): boolean {
  return key.startsWith('dmath.') || /^mesh\.\d+\.f64\./.test(key) || /\.(area|circ)$/.test(key);
}

export function splitMismatches(m: Mismatch[]): { strict: Mismatch[]; soft: Mismatch[] } {
  return { strict: m.filter((x) => !isTranscendental(x.key)), soft: m.filter((x) => isTranscendental(x.key)) };
}

export interface UlpReport { n: number; nDiff: number; maxAbs: number; maxUlp: number | null; firstIndex: number }

/** Element-wise comparison (spike 1a's ulpCompare). ULP distance is computed for Float32 and Float64. */
export function ulpReport(a: ArrayLike<number> & { buffer?: ArrayBufferLike }, b: ArrayLike<number>): UlpReport {
  let nDiff = 0, maxAbs = 0, first = -1;
  const f64 = a instanceof Float64Array;
  const ord = (x: number): bigint => {
    const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
    const bits = dv.getBigInt64(0);
    return bits < 0n ? -9223372036854775808n - bits : bits;
  };
  let maxUlp = 0n;
  for (let i = 0; i < a.length; i++) {
    if (Object.is(a[i], b[i])) continue;
    nDiff++;
    if (first < 0) first = i;
    maxAbs = Math.max(maxAbs, Math.abs(a[i]! - b[i]!));
    if (f64) { const d = ord(a[i]!) - ord(b[i]!); const ad = d < 0n ? -d : d; if (ad > maxUlp) maxUlp = ad; }
  }
  return { n: a.length, nDiff, maxAbs, maxUlp: f64 ? Number(maxUlp) : null, firstIndex: first };
}

export function formatReport(m: Mismatch[], arrays?: { actual: Record<string, TypedArray>; expected: Record<string, TypedArray> }): string {
  if (!m.length) return 'all probe hashes match';
  return m.map((x) => {
    let line = `MISMATCH ${x.key}: expected ${x.expected?.slice(0, 12) ?? '-'} got ${x.actual?.slice(0, 12) ?? '-'}`;
    const a = arrays?.actual[x.key], e = arrays?.expected[x.key];
    if (a && e) line += ' ' + JSON.stringify(ulpReport(a as Float64Array, e as Float64Array));
    return line;
  }).join('\n');
}
