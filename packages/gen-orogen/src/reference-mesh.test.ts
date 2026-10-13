// Design note 14 §2: L0 is orogen's coarse mesh. buildReferenceMesh (fdlibm, canonical frame) must equal the mesh that
// vendored generateCoarsePlates builds internally (native Math, orogen frame), byte for byte after the F1 permutation.
import { describe, expect, it } from 'vitest';
import { N_REF, REF_JITTER, buildReferenceMesh, dmath } from '@mapmaker/core';
import { COARSE_JITTER, N_COARSE } from '../vendor/js/terrain-config.js';
import { generateCoarsePlates } from './vendor';

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

describe('reference mesh L0 = vendor orogen coarse mesh', () => {
  it('uses orogen N_COARSE and COARSE_JITTER', () => {
    expect(N_REF).toBe(N_COARSE);
    expect(REF_JITTER).toBe(COARSE_JITTER);
  });

  for (const seed of [12345, 777]) {
    it(`is byte-identical to generateCoarsePlates' mesh for seed ${seed}`, () => {
      const ref = dmath.withMode('native', () => generateCoarsePlates(seed, 12, 4, 0, 0.3));
      const mine = buildReferenceMesh(seed).mesh;
      expect(bytes(mine.triangles)).toEqual(bytes(ref.coarseMesh.triangles));
      expect(bytes(mine.halfedges)).toEqual(bytes(ref.coarseMesh.halfedges));
      expect(bytes(mine.adjOffset)).toEqual(bytes(ref.coarseMesh.adjOffset));
      expect(bytes(mine.adjList)).toEqual(bytes(ref.coarseMesh.adjList));
      expect(bytes(mine.orogenPoints())).toEqual(bytes(ref.coarse_xyz));
    });
  }
});
