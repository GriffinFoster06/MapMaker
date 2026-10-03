// Provenance: extracted from upstream/orogen/js/rng.js @ cc2662b (GPL-3.0). See PROVENANCE.md.
// Park-Miller LCG with a one-integer state. Bit-identical to orogen's makeRng; used for parity (ARCHITECTURE §3.5).
import type { RngStream, SerializedStream } from './types';

/** orogen's makeRng, with the state exposed. */
export class OrogenLcg implements RngStream {
  readonly algo = 'orogen-lcg' as const;
  draws = 0;
  private s: number;

  constructor(readonly name: string, seed: number) {
    this.s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483646) + 1;
  }

  next(): number {
    this.s = (this.s * 16807) % 2147483647;
    this.draws++;
    return (this.s - 1) / 2147483646;
  }

  uint32(): number {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }

  serialize(): SerializedStream {
    return { name: this.name, algo: this.algo, state: [this.s], draws: this.draws };
  }

  static restore(d: SerializedStream): OrogenLcg {
    const r = new OrogenLcg(d.name, 0);
    r.s = d.state[0]!;
    r.draws = d.draws;
    return r;
  }
}

/** orogen's makeRandInt. */
export function makeRandInt(rng: () => number): (n: number) => number {
  return (n) => Math.floor(rng() * n);
}
