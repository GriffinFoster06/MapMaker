import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dmath } from './dmath';
import { fdlibm } from './fdlibm';

// Reference vectors: unmodified netlib fdlibm 5.3 (log2: FreeBSD msun) compiled with FMA contraction off, written by
// tools/fdlibm-vectors/gen.sh. Each row is hex bit patterns "x result" or "x y result". The port must match bit for bit.
interface Vectors { sources: Record<string, string>; fns: Record<string, string[]> }
const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../../tools/fdlibm-vectors/vectors.json'), 'utf8')) as Vectors;

const buf = new Float64Array(1);
const big = new BigUint64Array(buf.buffer);
const fromHex = (h: string): number => { big[0] = BigInt('0x' + h); return buf[0]!; };
const toBits = (x: number): bigint => { buf[0] = x; return big[0]!; };
const NAN_BITS = 0x7ff8000000000000n;
const canon = (x: number): bigint => (Number.isNaN(x) ? NAN_BITS : toBits(x));

const IMPL: Record<string, (...a: number[]) => number> = { ...fdlibm, hypot: fdlibm.hypot2 } as never;

describe('fdlibm port vs reference C vectors', () => {
  it('has vectors for every transcendental dmath exposes', () => {
    const want = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'pow', 'cbrt', 'hypot'];
    expect(Object.keys(vectors.fns).sort()).toEqual(want.sort());
    for (const name of want) expect(vectors.fns[name]!.length).toBeGreaterThan(500);
  });

  for (const [name, rows] of Object.entries(vectors.fns)) {
    it(`${name}: ${rows.length} vectors are bit-identical`, () => {
      const f = IMPL[name]!;
      const bad: string[] = [];
      for (const row of rows) {
        const parts = row.split(' ');
        const want = fromHex(parts.pop()!);
        const got = f(...parts.map(fromHex));
        if (canon(got) !== canon(want)) bad.push(`${row} got ${toBits(got).toString(16)}`);
      }
      expect(bad.slice(0, 5)).toEqual([]);
    });
  }
});

describe('dmath modes', () => {
  it('starts in native mode', () => {
    expect(dmath.mode).toBe('native');
    expect(dmath.sin).toBe(Math.sin);
  });

  it('setMode / withMode swap the functions and restore on exit, even on throw', () => {
    expect(dmath.withMode('fdlibm', () => [dmath.mode, dmath.sin === fdlibm.sin])).toEqual(['fdlibm', true]);
    expect(dmath.mode).toBe('native');
    expect(() => dmath.withMode('fdlibm', () => { throw new Error('x'); })).toThrow('x');
    expect(dmath.mode).toBe('native');
    expect(dmath.sin).toBe(Math.sin);
    expect(() => dmath.setMode('bogus' as never)).toThrow(/unknown dmath mode/);
  });

  it('fdlibm mode agrees with native libm to within 2 ULP on a sweep (sanity, not a parity claim)', () => {
    const ulp = (a: number, b: number): number => {
      const ord = (x: number): bigint => { const v = toBits(x); return v >> 63n ? -(v & 0x7fffffffffffffffn) : v; };
      const d = ord(a) - ord(b);
      return Number(d < 0n ? -d : d);
    };
    const fns = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'cbrt'] as const;
    for (const name of fns) {
      let worst = 0;
      for (let i = 1; i < 2000; i++) {
        const x = name === 'asin' || name === 'acos' ? (i / 1000) - 1 : name === 'log' || name === 'log2' || name === 'log10' || name === 'log1p' ? i / 100 : (i - 1000) / 60;
        const a = (Math as unknown as Record<string, (x: number) => number>)[name]!(x);
        const b = fdlibm[name](x);
        if (Number.isNaN(a) && Number.isNaN(b)) continue;
        worst = Math.max(worst, ulp(a, b));
      }
      expect(worst, name).toBeLessThanOrEqual(2);
    }
  });

  it('n-ary hypot in fdlibm mode: 0, 1, 2 and 3 arguments', () => {
    dmath.withMode('fdlibm', () => {
      expect(dmath.hypot()).toBe(0);
      expect(dmath.hypot(-3)).toBe(3);
      expect(dmath.hypot(3, 4)).toBe(5);
      expect(dmath.hypot(2, 3, 6)).toBeCloseTo(7, 14);
      expect(dmath.hypot(Infinity, NaN)).toBe(Infinity);
      expect(dmath.hypot(1e300, 1e300)).toBe(fdlibm.hypot2(1e300, 1e300));
    });
  });
});
