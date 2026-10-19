// GPU path helpers (lookup.ts, uniforms.ts, glsl.ts) in Node. The shaders themselves are tested in the browsers
// (apps/web/e2e/gpu.spec.ts: inverse against d3 invert, lookup against the CPU sampler).
import { describe, expect, it } from 'vitest';
import { OrogenLcg, SphereMesh, TriangleLocator, dmath } from '@mapmaker/core';
import {
  GPU_PROJECTION_IDS, PROJECTIONS, ProjectionView, buildCubeLookup, cubeResolution, cubeTexel, flatTextureWidth, mapFragmentShader,
  mapUniforms, texelDirection, unitVector,
} from '../index';

const rng = new OrogenLcg('mesh', 4);
const M = SphereMesh.build({ N: 5000, jitter: 0.75, rng: () => rng.next(), precision: 'f64' });

describe('cube lookup', () => {
  it('texel centres map back to their texel; every face and the face seams are covered', () => {
    for (const R of [8, 37]) for (let face = 0; face < 6; face++) for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const [x, y, z] = texelDirection(face, i, j, R);
      expect(cubeTexel(x, y, z, R)).toEqual({ face, i, j });
    }
    // Directions exactly on a face seam (|x| = |y|) go to the first face by the tie rule, as in SpatialIndex.
    expect(cubeTexel(1, 1, 0.2, 10).face).toBe(0);
    expect(cubeTexel(0, 0, -1, 10).face).toBe(5);
  });

  it('each texel holds a triangle containing its centre direction, with at least one texel per triangle', () => {
    const { R, cube } = buildCubeLookup(M);
    expect(R).toBe(cubeResolution(M.numTriangles));
    expect(6 * R * R).toBeGreaterThanOrEqual(M.numTriangles);
    const loc = new TriangleLocator(M), w = new Float64Array(3);
    for (let face = 0; face < 6; face++) for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const [dx, dy, dz] = texelDirection(face, i, j, R), s = 1 / Math.hypot(dx, dy, dz);
      const t = cube[(Math.floor(face / 3) * R + j) * 3 * R + (face % 3) * R + i]!;
      expect(loc.bary(t, dx * s, dy * s, dz * s, w)).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it('flat textures: width at most the GPU limit, enough rows, null when the array does not fit', () => {
    expect(flatTextureWidth(10, 4096)).toEqual({ width: 10, height: 1 });
    expect(flatTextureWidth(15_360_000, 16384)).toEqual({ width: 16384, height: 938 });
    expect(flatTextureWidth(15_360_000, 2048)).toBeNull();
  });
});

describe('mapUniforms', () => {
  it('the rotation takes raw-frame vectors to the canonical vectors of toRaw.invert, for any rotation', () => {
    for (const rotate of [[0, 0, 0], [-30, -40, 20], [0, -90, 0], [170, 10, -60]] as [number, number, number][]) {
      const v = new ProjectionView({ projection: 'orthographic', width: 300, height: 300, rotate });
      const u = mapUniforms(v), p = new Float64Array(3), q = new Float64Array(3);
      for (const raw of [[10, 20], [-120, -45], [179, 89]] as [number, number][]) {
        unitVector(raw[0], raw[1], p);
        const g = [0, 1, 2].map((r) => u.rot[r]! * p[0]! + u.rot[3 + r]! * p[1]! + u.rot[6 + r]! * p[2]!);
        unitVector(...(v.toRaw.invert(raw) as [number, number]), q);
        for (let k = 0; k < 3; k++) expect(g[k]).toBeCloseTo(q[k]!, 12);
      }
      expect(u.vecRot).toBe(rotate[1] !== 0 || rotate[2] !== 0);
    }
  });

  it('clip angle, Mercator limit and the d3 scale/translate come from the view', () => {
    const o = mapUniforms(new ProjectionView({ projection: 'orthographic', width: 200, height: 200 }));
    expect(o.cosClip).toBeCloseTo(dmath.cos((90 + 1e-6) * Math.PI / 180), 15);
    const m = mapUniforms(new ProjectionView({ projection: 'mercator', width: 200, height: 200, zoom: 4, pan: [10, -5] }));
    expect(m.maxLat).toBeCloseTo(85.0511287798 * Math.PI / 180, 10);
    expect(m.cosClip).toBeNull();
    const v = new ProjectionView({ projection: 'mercator', width: 200, height: 200 });
    expect(m.k).toBeCloseTo(4 * v.scale, 9);
    expect(m.tx).toBeCloseTo(100 + (v.projection.translate()[0] - 100) * 4 + 10, 9);
  });

  it('the shader set is decision 5-5, flagged gpu in the registry; other projections have no shader', () => {
    expect([...GPU_PROJECTION_IDS].sort()).toEqual(PROJECTIONS.filter((p) => p.gpu).map((p) => p.id).sort());
    for (const id of GPU_PROJECTION_IDS) for (const debug of [false, true]) expect(mapFragmentShader(id, debug)).toContain(`#define PROJ ${GPU_PROJECTION_IDS.indexOf(id)}`);
    expect(() => mapFragmentShader('winkel3' as never)).toThrow();
    expect(() => mapUniforms(new ProjectionView({ projection: 'hammer', width: 10, height: 10 }))).toThrow();
  });
});

describe('ProjectionView zoom and pan', () => {
  it('scale k·zoom about the image centre, then the pan; the centre pixel shows the same point at any zoom without pan', () => {
    const a = new ProjectionView({ projection: 'robinson', width: 400, height: 200 });
    const b = new ProjectionView({ projection: 'robinson', width: 400, height: 200, zoom: 8 });
    const ca = a.invert(200, 100)!, cb = b.invert(200, 100)!;
    expect(cb[0]).toBeCloseTo(ca[0], 9); expect(cb[1]).toBeCloseTo(ca[1], 9);
    const p = a.forward(30, 40)!, c = new ProjectionView({ projection: 'robinson', width: 400, height: 200, zoom: 8, pan: [-(p[0] - 200) * 8, -(p[1] - 100) * 8] });
    const at = c.invert(200, 100)!;
    expect(at[0]).toBeCloseTo(30, 6); expect(at[1]).toBeCloseTo(40, 6);
  });
});
