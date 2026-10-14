// World settings (orogen's generation sliders, exposed in the app): every setting reaches the generated world in both
// pipelines, and sending the defaults explicitly reproduces the default world bit for bit.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type World } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { OROGEN_DEFAULTS, type OrogenParams, createOrogenWorld, orogenStages } from '../index';
import { STRUCTURED } from './layers';
import { structuredStages } from './stages';

const N = 5000, seed = 12345;
const SLIDERS = (Object.keys(OROGEN_DEFAULTS) as (keyof OrogenParams)[]).filter((k) => !['seed', 'N', 'debugLayers'].includes(k));
/** A value inside orogen's slider range that differs clearly from the default. */
const MOVED: Record<string, number> = {
  jitter: 0.2, P: 30, numContinents: 1, nMag: 0.1, continentSizeVariety: 1, landCoverage: 0.6, terrainWarp: 0,
  smoothing: 0.8, glacialErosion: 0, hydraulicErosion: 1, thermalErosion: 0.8, ridgeSharpening: 0, temperatureOffset: -10,
  precipitationOffset: 0.8,
};

/** Hash of every layer on the world's own mesh (the output a user sees). */
function outputHash(w: World): string {
  const h = createHash('sha256');
  for (const k of w.layers.keys().filter((x) => x.startsWith('global/')).sort()) {
    const [mesh, id] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
    const a = w.layers.get(mesh, id) as ArrayBufferView;
    h.update(k).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  return h.digest('hex');
}

async function run(variant: string, params: Partial<OrogenParams>): Promise<World> {
  const w = createOrogenWorld({ N, seed, ...params });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant, strict: false });
  return w;
}

describe('world settings reach the generator', () => {
  it('MOVED covers every slider', () => {
    expect(Object.keys(MOVED).sort()).toEqual([...SLIDERS].sort());
  });

  for (const variant of [STRUCTURED, 'parity']) {
    it(`${variant}: explicit defaults reproduce the default world, and every moved slider changes it`, async () => {
      const base = outputHash(await run(variant, {}));
      expect(outputHash(await run(variant, Object.fromEntries(SLIDERS.map((k) => [k, OROGEN_DEFAULTS[k]]))))).toBe(base);
      const unchanged: string[] = [];
      for (const k of SLIDERS) if (outputHash(await run(variant, { [k]: MOVED[k] })) === base) unchanged.push(k);
      expect(unchanged).toEqual([]);
    }, 600_000);
  }

  it('land coverage moves the land fraction in the structured pipeline', async () => {
    const land = async (landCoverage: number) => {
      const w = await run(STRUCTURED, { landCoverage });
      const e = w.layers.get('global', 'elevation') as Float32Array;
      return e.filter((v) => v > 0).length / e.length;
    };
    const [lo, hi] = [await land(0.15), await land(0.6)];
    expect(hi).toBeGreaterThan(lo + 0.2);
  }, 120_000);
});
