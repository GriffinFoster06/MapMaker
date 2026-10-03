// Provenance: the mixer is extracted from Azgaar coastline-generator.ts `noise()` @ 3d94b80 (MIT).
// See PROVENANCE.md. Counter-based draws (ARCHITECTURE §3.5): a draw is a pure function of its key, so it
// does not depend on draw order, worker scheduling or N.

/** uint32 hash of (seed, ...values). Values are truncated to int32, so keep ids and ticks below 2^31. */
export function counterU32(seed: number, ...values: number[]): number {
  let h = seed | 0;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x5bd1e995);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Uniform in [0, 1). Same value as Azgaar's noise(seed, ...values). */
export function counterUnit(seed: number, ...values: number[]): number {
  return counterU32(seed, ...values) / 4294967296;
}
