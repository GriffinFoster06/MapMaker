import { describe, expect, it } from 'vitest';
// The JS original this module ports (Phase 1 spike code, original to MapMaker). Untyped JavaScript.
// @ts-expect-error -- no declaration file for the spike helper
import { adjacency, basins } from '../../../../tools/tuning/ab/sphere.mjs';
import { SphereMesh } from '../mesh/sphere-mesh';
import { OrogenLcg } from '../rng/orogen-lcg';
import { counterUnit } from '../rng/counter';
import { majorBasins, priorityFlood } from './priority-flood';

function world(N: number, seed: number) {
  const rng = new OrogenLcg('t', seed);
  const mesh = SphereMesh.build({ N, jitter: 0.75, rng: () => rng.next(), precision: 'f32' });
  const p = mesh.points;
  // Smooth continents plus rough relief, with flat plateaus and pits so depressions and ties occur.
  const elev = Float32Array.from({ length: mesh.numRegions }, (_, r) => {
    const x = p[3 * r]!, y = p[3 * r + 1]!, z = p[3 * r + 2]!;
    const v = Math.sin(3 * x + 1) * Math.cos(2 * y) + 0.6 * Math.sin(5 * z) + 0.3 * (counterUnit(seed, r) - 0.5);
    return Math.round(v * 20) / 20;
  });
  return { mesh, elev };
}

describe('priorityFlood', () => {
  for (const [N, seed] of [[5000, 1], [40000, 7]] as const) {
    it(`outlets equal the spike basins() exactly, N=${N}`, () => {
      const { mesh, elev } = world(N, seed);
      const d = priorityFlood(elev, mesh.adjOffset, mesh.adjList, mesh.cellArea_sr);
      const adj = adjacency(mesh.triangles, mesh.halfedges, mesh.numRegions);
      const ref = basins(elev, adj, mesh.numRegions) as Int32Array;
      expect(Buffer.from(d.outlet.buffer)).toEqual(Buffer.from(ref.buffer));
    });

    it(`receivers are neighbours, order is topological, drainage area is conserved, N=${N}`, () => {
      const { mesh, elev } = world(N, seed);
      const area = mesh.cellArea_sr;
      const d = priorityFlood(elev, mesh.adjOffset, mesh.adjList, area);
      const pos = new Int32Array(mesh.numRegions).fill(-1);
      d.order.forEach((r, j) => { pos[r] = j; });
      let land = 0, atOutlets = 0;
      for (let r = 0; r < mesh.numRegions; r++) {
        if (elev[r]! <= 0) { expect(d.receiver[r]).toBe(-1); expect(d.drainageArea[r]).toBe(0); continue; }
        land += area[r]!;
        const rc = d.receiver[r]!;
        if (rc < 0) { expect(d.outlet[r]).toBe(r); atOutlets += d.drainageArea[r]!; continue; }
        const nbs = Array.from(mesh.adjList.subarray(mesh.adjOffset[r]!, mesh.adjOffset[r + 1]!));
        expect(nbs).toContain(rc);
        expect(pos[rc]!).toBeLessThan(pos[r]!);
        expect(d.outlet[r]).toBe(d.outlet[rc]);
        expect(d.drainageArea[rc]!).toBeGreaterThan(d.drainageArea[r]!);
      }
      expect(atOutlets).toBeCloseTo(land, 10);
    });
  }

  it('major basins and divide band', () => {
    const { mesh, elev } = world(40000, 7);
    const d = priorityFlood(elev, mesh.adjOffset, mesh.adjList, mesh.cellArea_sr);
    const minArea = 0.01; // sr
    const { basin, divideBand } = majorBasins(d, mesh.adjOffset, mesh.adjList, minArea);
    const ids = new Set<number>();
    let band = 0;
    for (let r = 0; r < mesh.numRegions; r++) {
      if (basin[r]! >= 0) { ids.add(basin[r]!); expect(d.drainageArea[basin[r]!]!).toBeGreaterThanOrEqual(minArea); }
      else if (d.outlet[r]! >= 0) expect(d.drainageArea[d.outlet[r]!]!).toBeLessThan(minArea);
      if (divideBand[r]) {
        band++;
        const nbs = Array.from(mesh.adjList.subarray(mesh.adjOffset[r]!, mesh.adjOffset[r + 1]!));
        expect(nbs.some((nb) => d.outlet[nb]! >= 0 && basin[nb] !== basin[r])).toBe(true);
      }
    }
    expect(ids.size).toBeGreaterThan(3);
    expect(band).toBeGreaterThan(0);
  });
});
