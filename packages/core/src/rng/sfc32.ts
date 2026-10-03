// Provenance: original code from a published algorithm. sfc32 is Chris Doty-Humphrey's "Small Fast Counting"
// generator from PractRand (public domain). Implemented from the reference description. See PROVENANCE.md.
import type { RngStream, SerializedStream } from './types';

export class Sfc32 implements RngStream {
  readonly algo = 'sfc32' as const;
  draws = 0;
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** Four uint32 state words; 12 warm-up rounds follow the PractRand seeding convention. */
  constructor(readonly name: string, a: number, b: number, c: number, d: number, warmup = true) {
    this.a = a | 0;
    this.b = b | 0;
    this.c = c | 0;
    this.d = d | 0;
    if (warmup) {
      for (let i = 0; i < 12; i++) this.uint32();
      this.draws = 0;
    }
  }

  uint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) | 0;
    this.c = (this.c + t) | 0;
    this.draws++;
    return t >>> 0;
  }

  next(): number {
    return this.uint32() / 4294967296;
  }

  serialize(): SerializedStream {
    return { name: this.name, algo: this.algo, state: [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0], draws: this.draws };
  }

  static restore(d: SerializedStream): Sfc32 {
    const [a, b, c, dd] = d.state;
    const r = new Sfc32(d.name, a!, b!, c!, dd!, false);
    r.draws = d.draws;
    return r;
  }
}
