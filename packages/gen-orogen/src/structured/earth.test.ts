// Phase 6 M5 (decision P12): the Earth option starts from real elevation; the default world is unchanged.
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { type World } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { type OrogenParams, createOrogenWorld, orogenStages } from '../index';
import { loadEarthGridNode } from '../earth-node';
import { EARTH_GRID_H, EARTH_GRID_W, earthGrid, sampleEarthMetres, setEarthGrid } from './earth';
import { STRUCTURED } from './layers';
import { structuredStages } from './stages';

const N = 5000, seed = 12345;

async function run(variant: string, params: Partial<OrogenParams>): Promise<World> {
  const w = createOrogenWorld({ N, seed, ...params });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant, strict: false });
  return w;
}
const hashOf = (w: World): string => {
  const a = w.layers.get('global', 'elevation') as Float32Array;
  return createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
};

// Orogen frame: +y north, lon 0 at +z, east toward +x.
const pt = (latDeg: number, lonDeg: number): number[] => {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
};

describe('Earth option', () => {
  beforeAll(() => loadEarthGridNode());

  it('the derived grid has the sizes and landmarks of Earth', () => {
    expect(earthGrid().length).toBe(EARTH_GRID_W * EARTH_GRID_H);
    const at = (lat: number, lon: number): number => sampleEarthMetres(pt(lat, lon), 1)[0]!;
    expect(at(27.99, 86.93)).toBeGreaterThan(5000); // Himalaya (5' mean, well under the 8.8 km peak)
    expect(at(0, -30)).toBeLessThan(-2000); // mid Atlantic
    expect(at(-80, 0)).toBeGreaterThan(0); // Antarctica
    expect(at(49, 10)).toBeGreaterThan(0); // Europe
    expect(at(0, -160)).toBeLessThan(-2000); // Pacific
    // Global land share of the 5' grid (cos-lat weighted) against Natural Earth's 0.2877 area share.
    let land = 0, tot = 0;
    for (let y = 0; y < EARTH_GRID_H; y++) {
      const w = Math.cos(((0.5 - (y + 0.5) / EARTH_GRID_H) * Math.PI));
      for (let x = 0; x < EARTH_GRID_W; x++) { tot += w; if (earthGrid()[y * EARTH_GRID_W + x]! > 0) land += w; }
    }
    expect(land / tot).toBeGreaterThan(0.28);
    expect(land / tot).toBeLessThan(0.295);
  });

  it('refuses without a grid, on the parity pipeline, and with another planet', async () => {
    setEarthGrid(undefined);
    expect(() => sampleEarthMetres([0, 0, 1], 1)).toThrow(/Earth grid/);
    loadEarthGridNode();
    await expect(run('parity', { earth: true })).rejects.toThrow(/structured pipeline/);
    await expect(run(STRUCTURED, { earth: true, planet: { radius_m: 3.2e6 } })).rejects.toThrow(/Earth option/);
  }, 600_000);

  it('generates Earth deterministically, with Earth\'s land share, and leaves the default world unchanged', async () => {
    const base = hashOf(await run(STRUCTURED, {}));
    const a = await run(STRUCTURED, { earth: true });
    expect(hashOf(a)).toBe(hashOf(await run(STRUCTURED, { earth: true })));
    expect(hashOf(a)).not.toBe(base);
    const el = a.layers.get('global', 'elevation') as Float32Array;
    const area = a.meshes.get('global')!.mesh.cellArea_sr;
    let land = 0, tot = 0;
    for (let i = 0; i < el.length; i++) { tot += area[i]!; if (el[i]! > 0) land += area[i]!; }
    expect(land / tot).toBeGreaterThan(0.27);
    expect(land / tot).toBeLessThan(0.30);
    expect(Math.max(...el)).toBeGreaterThan(3000);
    // The default world's hash is the same as before the option existed (key absent).
    expect(hashOf(await run(STRUCTURED, {}))).toBe(base);
  }, 600_000);
});
