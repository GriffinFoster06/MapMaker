import { describe, expect, it } from 'vitest';
import { hashString, sha256 } from './hash';

describe('sha256', () => {
  it('matches the FIPS 180-2 test vector', async () => {
    expect(await hashString('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes only the bytes of a view, whatever backs it', async () => {
    const plain = new Float32Array([1.5, -2, 3e7, 0]);
    const ref = await sha256(plain);
    const sab = new Float32Array(new SharedArrayBuffer(plain.byteLength));
    sab.set(plain);
    expect(await sha256(sab)).toBe(ref);
    const big = new Float32Array(10);
    big.set(plain, 3);
    expect(await sha256(big.subarray(3, 7))).toBe(ref);
    expect(await sha256([new Uint8Array(plain.buffer, 0, 8), new Uint8Array(plain.buffer, 8)])).toBe(ref);
  });
});
