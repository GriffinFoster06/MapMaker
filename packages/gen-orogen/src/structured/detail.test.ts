// Phase 4b M4: the detail pass (design note 14 §3.4–3.7) and invariant I1.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiLevel, OrogenLcg, SphereMesh, type World } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages } from '../index';
import { OROGEN_DEFAULTS } from '../params';
import { DETAIL_STAGE, REF_MESH, REF_STAGE, STRUCTURED } from './layers';
import { referenceState, structuredStages } from './stages';
import { runElevationDetail } from './detail';
import { runReferencePass } from './reference';

const allStages = [...orogenStages, ...structuredStages];

async function structuredWorld(N: number, seed = 12345): Promise<World> {
  const w = createOrogenWorld({ N, seed });
  await runPipeline(w, allStages, { variant: STRUCTURED, strict: true });
  return w;
}

afterEach(() => vi.restoreAllMocks());

describe('detail pass (detail.pass)', () => {
  it('runs after the reference pass in fdlibm; preview and final record the same referenceHash', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random called during generation'); });
    const a = await structuredWorld(5000), b = await structuredWorld(30000);
    for (const w of [a, b]) {
      expect(w.pipeline.completed.map((r) => r.stageId)).toEqual(['mesh', REF_STAGE, DETAIL_STAGE]);
      for (const r of w.pipeline.completed) expect(r.dmath).toEqual(['fdlibm']);
    }
    const ha = a.pipeline.completed.find((r) => r.stageId === DETAIL_STAGE)!.referenceHash;
    expect(ha).toBeDefined();
    expect(b.pipeline.completed.find((r) => r.stageId === DETAIL_STAGE)!.referenceHash).toEqual(ha);
  });

  it('I1: R(elevation), R(temperature) and R(precipitation) equal the reference at 5k, 20k, 50k and 200k', async () => {
    for (const N of [5000, 20000, 50000, 200000]) {
      const w = await structuredWorld(N);
      const ml = new MultiLevel(w.meshes.get(REF_MESH)!.mesh, w.meshes.get('global')!.mesh);
      const check = (fine: string, coarse: string, tol: (ref: number) => number) => {
        const R = ml.restrict(w.layers.get('global', fine));
        const ref = w.layers.get(REF_MESH, coarse);
        let worst = 0;
        for (let c = 0; c < ml.n0; c++) if (ml.childCount[c]! > 0) worst = Math.max(worst, Math.abs(R[c]! - ref[c]!) / tol(ref[c]!));
        return worst;
      };
      // Float32 storage bounds the achievable agreement: raw elevation ~1e-7, temperature ≤ 0.001 °C, precipitation 1e-5 relative.
      expect(check('detail.elevRaw', 'ref.elevRaw', () => 1e-6), `elevation N=${N}`).toBeLessThan(1);
      for (const s of ['summer', 'winter']) {
        expect(check(`temp.${s}`, `ref.temp.${s}`, () => 0.001), `temp.${s} N=${N}`).toBeLessThan(1);
        expect(check(`precip.${s}`, `ref.precip.${s}`, (r) => Math.max(1e-5 * Math.abs(r), 1e-9)), `precip.${s} N=${N}`).toBeLessThan(1);
      }
    }
  }, 300000);

  it('the sign lock holds: no cell under a firmly land or sea reference cell is on the other side of sea level', () => {
    const p = { ...OROGEN_DEFAULTS, seed: 777 };
    const ref = runReferencePass(p);
    for (const N of [20000, 80000]) {
      const rng = new OrogenLcg('orogen.mesh', p.seed);
      const L1 = SphereMesh.build({ N, jitter: p.jitter, rng: () => rng.next(), precision: 'f32' });
      const d = runElevationDetail(L1, ref, { ...p, N });
      expect(d.signViolations).toBe(0);
      let land = 0, refLand = 0;
      for (const e of d.elevRaw) if (e > 0) land++;
      for (const e of ref.elevRaw) if (e > 0) refLand++;
      expect(Math.abs(land / L1.numRegions - refLand / ref.elevRaw.length)).toBeLessThan(0.02);
    }
  });

  it("drainage: receivers are land neighbours draining towards the sea; most cells keep their parent's major basin", async () => {
    const w = await structuredWorld(40000, 777);
    const mesh = w.meshes.get('global')!.mesh;
    const e = w.layers.get('global', 'detail.elevRaw') as Float32Array;
    const rec = w.layers.get('global', 'receiver') as Int32Array, basin = w.layers.get('global', 'basin') as Int32Array;
    for (let r = 0; r < mesh.numRegions; r++) {
      if (e[r]! <= 0) { expect(rec[r]).toBe(-1); continue; }
      if (rec[r]! >= 0) expect(Array.from(mesh.adjList.subarray(mesh.adjOffset[r]!, mesh.adjOffset[r + 1]!))).toContain(rec[r]);
    }
    const ref = referenceState(w);
    const ml = new MultiLevel(ref.mesh, mesh);
    let ok = 0, n = 0;
    for (let i = 0; i < mesh.numRegions; i++) {
      const pc = ml.parentOf[i]!, pb = ref.basins.basin[pc]!;
      if (e[i]! > 0 && pb >= 0 && !ref.basins.divideBand[pc]) { n++; if (basin[i] === pb) ok++; }
    }
    expect(ok / n).toBeGreaterThan(0.8);
  });

  it('is deterministic: two runs give identical output hashes', async () => {
    const a = await structuredWorld(8000, 5), b = await structuredWorld(8000, 5);
    const ha = a.pipeline.completed.find((r) => r.stageId === DETAIL_STAGE)!.outputHashes;
    expect(b.pipeline.completed.find((r) => r.stageId === DETAIL_STAGE)!.outputHashes).toEqual(ha);
  });
});
