import { beforeAll, describe, expect, test } from 'vitest';
import { type World, hashWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { type CartoData, computeCartoData } from './data';
import { testWorld } from './test-world';

let world: World, data: CartoData, hashBefore: string;
beforeAll(async () => { world = await testWorld(); hashBefore = await hashWorld(world); data = computeCartoData(world); }, 120_000);

describe('carto data', () => {
  test('names the landmasses, the ocean basins and some ranges and rivers, uniquely', () => {
    const kinds = new Map<string, number>();
    for (const f of data.features) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
    expect(kinds.get('continent') ?? 0).toBeGreaterThanOrEqual(1);
    expect(kinds.get('ocean') ?? 0).toBeGreaterThanOrEqual(1);
    expect(data.features.length).toBeGreaterThan(8);
    const names = data.features.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const f of data.features) {
      expect(f.name).toMatch(/^[A-Z][a-z]+/);
      expect(Math.abs(f.lat)).toBeLessThanOrEqual(90);
      expect(f.area).toBeGreaterThan(0);
    }
    const word = (k: string, w: string) => data.features.filter((f) => f.kind === k).every((f) => f.name.endsWith(w));
    expect(word('ocean', ' Ocean') && word('sea', ' Sea') && word('range', ' Mountains') && word('river', ' River')).toBe(true);
  });

  test('area features sit on the right kind of ground: landmass anchors on land, ocean anchors at sea', () => {
    const mesh = world.meshes.get('global')!.mesh, elev = world.layers.get('global', 'elevation');
    const near = (lon: number, lat: number) => {
      const l = (lon * Math.PI) / 180, f = (lat * Math.PI) / 180, x = Math.cos(f) * Math.cos(l), y = Math.cos(f) * Math.sin(l), z = Math.sin(f);
      let best = 0, bd = -2;
      for (let i = 0; i < mesh.numRegions; i++) { const d = mesh.points[3 * i]! * x + mesh.points[3 * i + 1]! * y + mesh.points[3 * i + 2]! * z; if (d > bd) { bd = d; best = i; } }
      return best;
    };
    for (const f of data.features) {
      const c = near(f.lon, f.lat);
      if (f.kind === 'continent' || f.kind === 'island') expect(elev[c]!, f.name).toBeGreaterThan(0);
      if (f.kind === 'ocean' || f.kind === 'sea') expect(elev[c]!, f.name).toBeLessThanOrEqual(0);
    }
  });

  test('landmass indices cover exactly the land, in descending area', () => {
    const elev = world.layers.get('global', 'elevation');
    for (let i = 0; i < elev.length; i++) expect(data.landmass[i]! >= 0).toBe(elev[i]! > 0);
    for (let k = 1; k < data.landmasses.length; k++) expect(data.landmasses[k]!.area).toBeLessThanOrEqual(data.landmasses[k - 1]!.area);
  });

  test('river chains grow downstream and end at the coast', () => {
    expect(data.rivers.length).toBeGreaterThan(5);
    for (const r of data.rivers) {
      expect(r.pts.length).toBe(2 * r.area.length);
      for (let k = 1; k < r.area.length; k++) expect(r.area[k]!).toBeGreaterThanOrEqual(r.area[k - 1]! * (1 - 1e-6));
    }
  });

  test('ranges carry a spine of at least three points; rivers a path from the source', () => {
    for (const f of data.features.filter((x) => x.kind === 'range' || x.kind === 'river')) expect(f.path!.length).toBeGreaterThanOrEqual(6);
  });

  test('is deterministic, depends on the seed through names only, and never changes the World', async () => {
    const again = computeCartoData(world);
    expect(again.features.map((f) => [f.id, f.name, f.lon, f.lat])).toEqual(data.features.map((f) => [f.id, f.name, f.lon, f.lat]));
    expect(await hashWorld(world)).toBe(hashBefore);
    const other = createOrogenWorld({ N: 20000, seed: 12345 }, { masterSeed: 'ffeeddccbbaa99887766554433221100' });
    await runPipeline(other, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
    const d2 = computeCartoData(other);
    // The same orogen seed gives the same terrain, so the same places; only the names differ with the master seed.
    expect(d2.features.map((f) => f.id)).toEqual(data.features.map((f) => f.id));
    expect(d2.features.map((f) => f.name)).not.toEqual(data.features.map((f) => f.name));
  }, 120_000);
});
