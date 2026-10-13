// Stages of the structured pipeline (design note 14; Phase 4b). Original shell code.
// `ref.pass` (pass R) builds the reference mesh L0 and runs the reference pass on it. Canonical: dmath fdlibm only.
import { REF_MESH_ID, type World } from '@mapmaker/core';
import type { Stage, StageContext } from '@mapmaker/engine';
import { STAGE_PARAMS, readParams } from '../params';
import { PLATES_SPEC } from '../plates-spec';
import { elevToHeightKm } from '../port';
import { REF_DEBUG_FIELDS, REF_MESH, REF_STAGE, REF_WRITES, STRUCTURED } from './layers';
import { type ReferenceState, runReferencePass } from './reference';

export const STRUCTURED_STAGE_VERSION = '1';

if (REF_MESH !== REF_MESH_ID) throw new Error('reference mesh id mismatch');

const cache = new WeakMap<World, ReferenceState>();

/**
 * The reference pass's in-memory state (tectonics objects, mesh views). Recomputed from the params when absent, e.g.
 * after a load: the pass is deterministic, so the recomputation equals the stored `ref.*` layers.
 */
export function referenceState(world: World): ReferenceState {
  let s = cache.get(world);
  if (!s) { s = runReferencePass(readParams(world)); cache.set(world, s); }
  return s;
}

function put(ctx: StageContext, layerId: string, src: ArrayLike<number>, array = 0): void {
  const dst = ctx.writeLayer(layerId)[array]!;
  if (dst.length !== src.length) throw new Error(`layer ${layerId}: expected ${dst.length} values, got ${src.length}`);
  (dst as unknown as { set(a: ArrayLike<number>): void }).set(src);
}

const refStage: Stage = {
  id: REF_STAGE,
  version: STRUCTURED_STAGE_VERSION,
  variants: [STRUCTURED],
  pass: 'R',
  mesh: REF_MESH,
  reads: [],
  writes: REF_WRITES(),
  params: STAGE_PARAMS,
  run(ctx) {
    const { world } = ctx;
    ctx.progress(0, 'Reference world (tectonics, elevation, climate, drainage)');
    const r = runReferencePass(readParams(world));
    cache.set(world, r);
    for (const key of world.layers.keys()) if (key.startsWith(`${REF_MESH}/`)) world.layers.delete(REF_MESH, key.slice(REF_MESH.length + 1));
    world.meshes.delete(REF_MESH);
    world.addMesh({ id: REF_MESH, mesh: r.mesh });

    put(ctx, 'ref.plate', r.tect.r_plate);
    world.entities.delete('plates');
    const plates = ctx.table('plates', PLATES_SPEC);
    for (const id of r.tect.plateSeeds) {
      const v = r.tect.plateVec[id]!;
      plates.add({ plateId: id, oceanic: r.tect.plateIsOcean.has(id) ? 1 : 0, density: r.tect.plateDensity[id]!, poleX: v.pole[2], poleY: v.pole[0], poleZ: v.pole[1], omega: v.omega }, 0);
    }
    put(ctx, 'ref.elevPre', r.elevPre);
    put(ctx, 'ref.elevRaw', r.elevRaw);
    const m = ctx.writeLayer('ref.elevation')[0] as Float32Array;
    for (let i = 0; i < m.length; i++) m[i] = elevToHeightKm(r.elevRaw[i]!) * 1000;
    put(ctx, 'ref.stress', r.stress);
    put(ctx, 'ref.erosionDelta', r.erosionDelta);
    const { wind, ocean, precip, temp } = r.climate;
    for (const season of ['summer', 'winter'] as const) {
      put(ctx, `ref.wind.${season}`, wind[`r_wind_east_${season}`], 0);
      put(ctx, `ref.wind.${season}`, wind[`r_wind_north_${season}`], 1);
      put(ctx, `ref.current.${season}`, ocean[`r_ocean_current_east_${season}`], 0);
      put(ctx, `ref.current.${season}`, ocean[`r_ocean_current_north_${season}`], 1);
      put(ctx, `ref.temp.${season}`, temp[`r_temperature_${season}`]);
      put(ctx, `ref.precip.${season}`, precip[`r_precip_${season}`]);
      put(ctx, `ref.pressure.${season}`, wind[`r_pressure_${season}`]);
      put(ctx, `ref.oceanSpeed.${season}`, ocean[`r_ocean_speed_${season}`]);
      put(ctx, `ref.oceanWarmth.${season}`, ocean[`r_ocean_warmth_${season}`]);
    }
    put(ctx, 'ref.westness', precip.r_westness);
    put(ctx, 'ref.koppen', r.koppen);
    put(ctx, 'ref.receiver', r.drainage.receiver);
    put(ctx, 'ref.outlet', r.drainage.outlet);
    const area = ctx.writeLayer('ref.drainageArea')[0] as Float64Array;
    for (let i = 0; i < area.length; i++) area[i] = r.drainage.drainageArea[i]! * 1e6; // km² → m²
    put(ctx, 'ref.basin', r.basins.basin);
    put(ctx, 'ref.divideBand', r.basins.divideBand);
    for (const n of REF_DEBUG_FIELDS) { const a = r.debug[n]; if (a) put(ctx, `ref.debug.${n}`, a); }
    ctx.progress(1);
  },
};

/** Structured-pipeline stages, in order. The detail pass (Phase 4b M4) follows the reference pass. */
export const structuredStages: Stage[] = [refStage];
