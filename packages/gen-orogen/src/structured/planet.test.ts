// Phase 6 M2 (design note 10): the planet reaches the structured pipeline (radius, gravity, climate constants), and
// Earth values reproduce the default world bit for bit.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type World } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { type OrogenParams, createOrogenWorld, orogenStages } from '../index';
import { STRUCTURED } from './layers';
import { structuredStages } from './stages';

const N = 5000, seed = 12345;

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

const MARS = { radius_m: 3.3895e6, mass_kg: 6.417e23, rotationPeriod_s: 88642.66, obliquity_deg: 25.19, eccentricity: 0.0934, semiMajorAxis_AU: 1.5237, surfacePressure_Pa: 610, meanMolarMass: 43.34 };

describe('planet inputs in the structured pipeline', () => {
  it('Earth values reproduce the default world bit for bit; another planet changes it and stays finite', async () => {
    const base = outputHash(await run(STRUCTURED, {}));
    expect(outputHash(await run(STRUCTURED, { planet: { radius_m: 6.371e6, obliquity_deg: 23.44 } }))).toBe(base);

    const small = await run(STRUCTURED, { planet: { radius_m: 3.2e6 } });
    expect(outputHash(small)).not.toBe(base);
    const mars = await run(STRUCTURED, { planet: MARS });
    expect(outputHash(mars)).not.toBe(base);
    expect(outputHash(mars)).not.toBe(outputHash(small));
    const rec = mars.planet['mapping'] as { validity: string; notes: string[]; climateConstants: Record<string, number> };
    expect(rec.validity).toBe('unsupported'); // a 6 hPa atmosphere is outside the model (note 10 §3.4)
    expect(rec.notes.length).toBeGreaterThan(0);
    expect(Object.keys(rec.climateConstants)).toContain('TEMP_PEAK_C');
    expect(JSON.parse(JSON.stringify(mars.planet))).toEqual(mars.planet); // survives planet.json
    expect((await run(STRUCTURED, {})).planet['mapping']).toBeUndefined();
    for (const w of [small, mars]) {
      for (const k of w.layers.keys().filter((x) => x.startsWith('global/'))) {
        const a = w.layers.get('global', k.slice(7)) as unknown as ArrayLike<number>;
        if (!(a instanceof Float32Array || a instanceof Float64Array)) continue;
        for (let i = 0; i < a.length; i += 97) if (!Number.isFinite(a[i]!)) throw new Error(`${k}[${i}] is not finite`);
      }
    }
  }, 600_000);

  it('the parity pipeline refuses a non-Earth planet and accepts Earth', async () => {
    await expect(run('parity', { planet: { radius_m: 3.2e6 } })).rejects.toThrow(/parity pipeline hard-codes Earth/);
    const base = outputHash(await run('parity', {}));
    expect(outputHash(await run('parity', { planet: { radius_m: 6.371e6 } }))).toBe(base);
  }, 600_000);
});
