import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import AleaPkg from 'alea';
import { Alea } from './alea';
import { counterU32, counterUnit } from './counter';
import { OrogenLcg } from './orogen-lcg';
import { RngService, deriveWords } from './service';
import { Sfc32 } from './sfc32';
import { SplitMix64 } from './splitmix64';

const ROOT = resolve(__dirname, '../../../..');
const OROGEN_RNG = resolve(ROOT, 'upstream/orogen/js/rng.js');
const AZGAAR_COAST = resolve(ROOT, 'upstream/Azgaars-Fantasy-Map-Generator/src/generators/coastline-generator.ts');

describe('orogen-lcg (extracted from orogen rng.js)', () => {
  it('matches known values', () => {
    // Golden values from orogen makeRng(12345) at cc2662b.
    const r = new OrogenLcg('t', 12345);
    expect([r.next(), r.next(), r.next()]).toEqual(GOLDEN_LCG_12345);
  });

  it.skipIf(!existsSync(OROGEN_RNG))('matches upstream makeRng for 10^6 draws', async () => {
    const { makeRng } = await import(OROGEN_RNG);
    for (const seed of [12345, 777, 0, 4242.5]) {
      const a = makeRng(seed), b = new OrogenLcg('t', seed);
      for (let i = 0; i < 1_000_000; i++) if (a() !== b.next()) throw new Error(`diverged at ${i} for seed ${seed}`);
    }
  });

  it('serializes and restores mid-stream', () => {
    const r = new OrogenLcg('t', 5);
    for (let i = 0; i < 100; i++) r.next();
    const c = OrogenLcg.restore(r.serialize());
    for (let i = 0; i < 50; i++) expect(c.next()).toBe(r.next());
    expect(c.draws).toBe(r.draws);
  });
});

describe('alea (ported from npm alea@1.0.1)', () => {
  it('matches the npm package, including state export', () => {
    for (const seed of ['hello', '12345', 'Azgaar seed']) {
      const ref = (AleaPkg as unknown as (s: string) => { (): number; exportState(): number[]; importState(i: number[]): void })(seed);
      const mine = new Alea('t', seed);
      for (let i = 0; i < 100_000; i++) if (ref() !== mine.next()) throw new Error(`diverged at ${i}`);
      expect(mine.exportState()).toEqual(ref.exportState());
    }
  });

  it('round-trips state', () => {
    const a = new Alea('t', 'x');
    for (let i = 0; i < 1000; i++) a.next();
    const b = Alea.restore(a.serialize());
    for (let i = 0; i < 1000; i++) expect(b.next()).toBe(a.next());
  });

  it('refuses clock seeding', () => {
    expect(() => new Alea('t')).toThrow();
  });
});

// Independent BigInt transcription of PractRand's sfc32 raw32 (Chris Doty-Humphrey, public domain).
function sfc32Reference(a0: number, b0: number, c0: number, d0: number, n: number): number[] {
  const M = 0xffffffffn;
  let a = BigInt(a0) & M, b = BigInt(b0) & M, c = BigInt(c0) & M, counter = BigInt(d0) & M;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const tmp = (a + b + counter) & M;
    counter = (counter + 1n) & M;
    a = b ^ (b >> 9n);
    b = (c + (c << 3n)) & M;
    c = ((((c << 21n) & M) | (c >> 11n)) + tmp) & M;
    out.push(Number(tmp));
  }
  return out;
}

describe('sfc32 (original, from the PractRand reference)', () => {
  it('matches an independent BigInt transcription of the reference', () => {
    const s = new Sfc32('t', 0x9e3779b9, 0x243f6a88, 0xb7e15162, 1, false);
    const ref = sfc32Reference(0x9e3779b9, 0x243f6a88, 0xb7e15162, 1, 100_000);
    for (let i = 0; i < ref.length; i++) if (s.uint32() !== ref[i]) throw new Error(`diverged at ${i}`);
  });

  it('known answers', () => {
    const s = new Sfc32('t', 0, 0, 0, 1, false);
    expect(Array.from({ length: 5 }, () => s.uint32())).toEqual(sfc32Reference(0, 0, 0, 1, 5));
  });

  it('round-trips state and has a flat-ish distribution', () => {
    const s = new Sfc32('t', 1, 2, 3, 4);
    for (let i = 0; i < 77; i++) s.next();
    const r = Sfc32.restore(s.serialize());
    for (let i = 0; i < 100; i++) expect(r.next()).toBe(s.next());
    const bins = new Array(16).fill(0);
    for (let i = 0; i < 160_000; i++) bins[Math.floor(s.next() * 16)]++;
    for (const b of bins) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });
});

describe('splitmix64 (original, from the Vigna reference)', () => {
  it('matches the published reference vector for seed 0', () => {
    const s = new SplitMix64(0n);
    expect([s.next(), s.next(), s.next(), s.next()]).toEqual([
      0xe220a8397b1dcdafn, 0x6e789e6aa1b965f4n, 0x06c45d188009454fn, 0xf88bb8a8724c81ecn,
    ]);
  });
});

describe('counter hash (extracted from Azgaar noise())', () => {
  it('is a pure function of its key', () => {
    expect(counterU32(7, 1, 2, 3)).toBe(counterU32(7, 1, 2, 3));
    expect(counterU32(7, 1, 2, 3)).not.toBe(counterU32(7, 1, 2, 4));
    expect(counterUnit(7, 5)).toBeGreaterThanOrEqual(0);
    expect(counterUnit(7, 5)).toBeLessThan(1);
  });

  it('matches golden values', () => {
    expect(GOLDEN_COUNTER.map(([s, v]) => counterUnit(s, ...v))).toEqual(GOLDEN_COUNTER.map((g) => g[2]));
  });

  it.skipIf(!existsSync(AZGAAR_COAST))('matches the function body in upstream coastline-generator.ts', () => {
    const src = readFileSync(AZGAAR_COAST, 'utf8');
    const m = src.match(/private noise\(seed: number, \.\.\.values: number\[\]\): number \{([\s\S]*?)\n {2}\}/);
    expect(m).not.toBeNull();
    const upstream = new Function('seed', '...values', m![1]!) as (s: number, ...v: number[]) => number;
    for (let i = 0; i < 20_000; i++) {
      const seed = (i * 2654435761) | 0, v = [i, (i * 31) >> 3, i % 17];
      expect(counterUnit(seed, ...v)).toBe(upstream(seed, ...v));
    }
  });
});

describe('RngService', () => {
  const M = '0123456789abcdef0123456789abcdef';

  it('derives independent streams: adding a stream never shifts another', () => {
    const a = new RngService(M);
    const x1 = Array.from({ length: 10 }, () => a.stream('x').next());
    const b = new RngService(M);
    b.stream('y').next();
    b.stream('z').next();
    const x2 = Array.from({ length: 10 }, () => b.stream('x').next());
    expect(x2).toEqual(x1);
  });

  it('different masters and names give different streams', () => {
    expect(deriveWords(M, 'a')).not.toEqual(deriveWords(M, 'b'));
    expect(deriveWords(M, 'a')).not.toEqual(deriveWords('f'.repeat(32), 'a'));
  });

  it('serializes and restores every algorithm, continuing exactly', () => {
    const a = new RngService(M);
    a.stream('s'); a.stream('a', 'alea'); a.stream('o', 'orogen-lcg');
    for (const n of ['s', 'a', 'o']) for (let i = 0; i < 123; i++) a.stream(n, n === 's' ? 'sfc32' : n === 'a' ? 'alea' : 'orogen-lcg').next();
    const b = RngService.restore(M, JSON.parse(JSON.stringify(a.serialize())));
    for (const [n, alg] of [['s', 'sfc32'], ['a', 'alea'], ['o', 'orogen-lcg']] as const)
      for (let i = 0; i < 50; i++) expect(b.stream(n, alg).next()).toBe(a.stream(n, alg).next());
  });

  it('counter draws do not depend on call order', () => {
    const svc = new RngService(M);
    const c = svc.counter('structure');
    const fwd = [0, 1, 2, 3].map((k) => c(42, k));
    const rev = [3, 2, 1, 0].map((k) => c(42, k)).reverse();
    expect(rev).toEqual(fwd);
  });

  it('rejects malformed master seeds', () => {
    expect(() => new RngService('abc')).toThrow();
  });
});

const GOLDEN_LCG_12345: number[] = [0.01615600056588277, 0.5339092105011541, 0.41210454042265615];
const GOLDEN_COUNTER: [number, number[], number][] = [[1, [2, 3], 0.40410142415203154]];
