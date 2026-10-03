// Provenance: original code from a published algorithm. SplitMix64 by Sebastiano Vigna (public domain,
// https://prng.di.unimi.it/splitmix64.c), implemented from the reference. See PROVENANCE.md.
// Used only for seed derivation, not in hot loops, so BigInt is acceptable.

const MASK = 0xffffffffffffffffn;

export class SplitMix64 {
  constructor(private x: bigint) {
    this.x &= MASK;
  }

  next(): bigint {
    this.x = (this.x + 0x9e3779b97f4a7c15n) & MASK;
    let z = this.x;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return (z ^ (z >> 31n)) & MASK;
  }
}

/** FNV-1a, 64-bit, over UTF-8 bytes. Folds a (masterSeed, name) pair into a 64-bit SplitMix64 seed. */
export function fnv1a64(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(s)) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & MASK;
  }
  return h;
}
