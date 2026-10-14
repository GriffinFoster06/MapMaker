// Provenance: ported from upstream/orogen/js/rng.js @ cc2662b (GPL-3.0). See PROVENANCE.md. Arithmetic unchanged.

export function makeRng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function makeRandInt(seed: number): (n: number) => number {
  const r = makeRng(seed);
  return (n) => Math.floor(r() * n);
}
