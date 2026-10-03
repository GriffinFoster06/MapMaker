// Provenance: ported from npm alea@1.0.1 (MIT, Copyright (C) 2010 Johannes Baagøe), the version Azgaar pins.
// See PROVENANCE.md. Arithmetic is unchanged; the four state words are exposed for serialization (§3.5).
import type { RngStream, SerializedStream } from './types';

function makeMash(): (data: string) => number {
  let n = 0xefc8249d;
  return (data) => {
    data = data.toString();
    for (let i = 0; i < data.length; i++) {
      n += data.charCodeAt(i);
      let h = 0.02519603282416938 * n;
      n = h >>> 0;
      h -= n;
      h *= n;
      n = h >>> 0;
      h -= n;
      n += h * 0x100000000; // 2^32
    }
    return (n >>> 0) * 2.3283064365386963e-10; // 2^-32
  };
}

export class Alea implements RngStream {
  readonly algo = 'alea' as const;
  draws = 0;
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private c = 1;

  constructor(readonly name: string, ...args: (string | number)[]) {
    if (args.length === 0) throw new Error('Alea needs an explicit seed (no clock seeding)');
    const mash = makeMash();
    this.s0 = mash(' ');
    this.s1 = mash(' ');
    this.s2 = mash(' ');
    for (const a of args) {
      this.s0 -= mash(String(a));
      if (this.s0 < 0) this.s0 += 1;
      this.s1 -= mash(String(a));
      if (this.s1 < 0) this.s1 += 1;
      this.s2 -= mash(String(a));
      if (this.s2 < 0) this.s2 += 1;
    }
  }

  next(): number {
    const t = 2091639 * this.s0 + this.c * 2.3283064365386963e-10; // 2^-32
    this.s0 = this.s1;
    this.s1 = this.s2;
    this.c = t | 0;
    this.draws++;
    return (this.s2 = t - this.c);
  }

  uint32(): number {
    return this.next() * 0x100000000;
  }

  exportState(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.c];
  }

  importState(i: ArrayLike<number>): void {
    this.s0 = +i[0]! || 0;
    this.s1 = +i[1]! || 0;
    this.s2 = +i[2]! || 0;
    this.c = +i[3]! || 0;
  }

  serialize(): SerializedStream {
    return { name: this.name, algo: this.algo, state: this.exportState(), draws: this.draws };
  }

  static restore(d: SerializedStream): Alea {
    const r = new Alea(d.name, 0);
    r.importState(d.state);
    r.draws = d.draws;
    return r;
  }
}
