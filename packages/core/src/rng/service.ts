// RNG service (ARCHITECTURE §3.5): named streams derived from a 128-bit master seed.
import { Alea } from './alea';
import { counterU32 } from './counter';
import { OrogenLcg } from './orogen-lcg';
import { Sfc32 } from './sfc32';
import { SplitMix64, fnv1a64 } from './splitmix64';
import type { RngAlgo, RngStream, SerializedStream } from './types';

export type MasterSeed = string; // 32 hex characters (128 bits)

export function isMasterSeed(s: string): boolean {
  return /^[0-9a-f]{32}$/.test(s);
}

/** Four uint32 words derived from (masterSeed, name). Adding a stream never shifts another stream. */
export function deriveWords(master: MasterSeed, name: string): [number, number, number, number] {
  if (!isMasterSeed(master)) throw new Error('master seed must be 32 lowercase hex characters');
  const sm = new SplitMix64(fnv1a64(`${master}:${name}`));
  const a = sm.next(), b = sm.next();
  return [Number(a & 0xffffffffn), Number(a >> 32n), Number(b & 0xffffffffn), Number(b >> 32n)];
}

export class RngService {
  private readonly streams = new Map<string, RngStream>();

  constructor(readonly master: MasterSeed) {
    if (!isMasterSeed(master)) throw new Error('master seed must be 32 lowercase hex characters');
  }

  /** The stream called `name`, created on first use. The default algorithm is sfc32. */
  stream(name: string, algo: RngAlgo = 'sfc32'): RngStream {
    const have = this.streams.get(name);
    if (have) {
      if (have.algo !== algo) throw new Error(`stream ${name} already exists as ${have.algo}`);
      return have;
    }
    const [a, b, c, d] = deriveWords(this.master, name);
    let s: RngStream;
    if (algo === 'sfc32') s = new Sfc32(name, a, b, c, d);
    else if (algo === 'alea') s = new Alea(name, `${this.master}:${name}`);
    else s = new OrogenLcg(name, a);
    this.streams.set(name, s);
    return s;
  }

  /** Seed for counter-based draws: counterU32(seed, refCellId | tick, entityId, k). */
  counterSeed(name: string): number {
    return deriveWords(this.master, `counter:${name}`)[0];
  }

  counter(name: string): (...key: number[]) => number {
    const seed = this.counterSeed(name);
    return (...key) => counterU32(seed, ...key);
  }

  /** Register a stream created elsewhere (parity mode seeds orogen-lcg from the legacy integer seed). */
  adopt(stream: RngStream): void {
    this.streams.set(stream.name, stream);
  }

  serialize(): SerializedStream[] {
    return [...this.streams.values()].map((s) => s.serialize()).sort((x, y) => (x.name < y.name ? -1 : 1));
  }

  static restore(master: MasterSeed, streams: SerializedStream[]): RngService {
    const svc = new RngService(master);
    for (const d of streams) {
      svc.streams.set(d.name, d.algo === 'sfc32' ? Sfc32.restore(d) : d.algo === 'alea' ? Alea.restore(d) : OrogenLcg.restore(d));
    }
    return svc;
  }
}
