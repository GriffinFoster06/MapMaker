// The orogen pipeline as shell stages (ARCHITECTURE §4 stages 1-5 and 8). Original shell code; every vendored call
// keeps orogen's argument order and order of execution (planet-worker.js handleGenerate).
//
// Stage ids: `mesh` is canonical (fdlibm). Every `orogen.*` stage is `parity`: it runs the verbatim orogen code, which
// calls Math.* directly, inside dmath.withMode('native').
import { type World, OrogenLcg, SphereMesh, dmath } from '@mapmaker/core';
import type { Stage, StageContext } from '@mapmaker/engine';
import { DEBUG_FIELDS, STAGE, debugId, isRequiredDebug, registerOrogenLayers, writesOf } from './layers';
import { STAGE_PARAMS, readParams } from './params';
import { computeDetailDampenField, computeOrogenicField, runPostProcessing } from './orchestration';
import { computeTectonics, dropScratch, getScratch, newNoise, peekScratch } from './scratch';
import {
  KOPPEN_CLASSES, assignElevation, classifyKoppen, computeOceanCurrents, computePrecipitation, computeTemperature, computeWind, elevToHeightKm,
} from './vendor';

export const OROGEN_STAGE_VERSION = '1';
const MESH_ID = 'global';

const native = <T>(fn: () => T): T => dmath.withMode('native', fn);

/** Copy into a declared layer (allocating on first write). */
function put(ctx: StageContext, layerId: string, src: ArrayLike<number>, array = 0): void {
  const dst = ctx.writeLayer(layerId)[array]!;
  if (dst.length !== src.length) throw new Error(`layer ${layerId}: expected ${dst.length} values, got ${src.length}`);
  (dst as unknown as { set(a: ArrayLike<number>): void }).set(src);
}
const read = (ctx: StageContext, layerId: string, array = 0) => ctx.layer(layerId)[array] as Float32Array;

function putDebug(ctx: StageContext, p: { debugLayers: boolean }, name: string, src: ArrayLike<number> | undefined): void {
  if (!src) return;
  if (!p.debugLayers && !isRequiredDebug(name)) return;
  put(ctx, debugId(name), src);
}

const meshStage: Stage = {
  id: STAGE.mesh,
  version: OROGEN_STAGE_VERSION,
  mesh: MESH_ID,
  reads: [],
  writes: [],
  params: STAGE_PARAMS,
  run(ctx) {
    const { world } = ctx;
    const p = readParams(world);
    // F4: orogen's integer seed drives a Park-Miller stream, adopted so its state is saved with the world.
    const rng = new OrogenLcg('orogen.mesh', p.seed);
    world.rng.adopt(rng);
    // Canonical stage, fdlibm mode. At Float32 the points and topology equal the native-mode build (probe, parity test).
    const mesh = SphereMesh.build({ N: p.N, jitter: p.jitter, rng: () => rng.next(), precision: 'f32' });
    for (const key of world.layers.keys()) if (key.startsWith(`${MESH_ID}/`)) world.layers.delete(MESH_ID, key.slice(MESH_ID.length + 1));
    world.meshes.delete(MESH_ID);
    world.addMesh({ id: MESH_ID, mesh });
    dropScratch(world);
  },
};

const tectonicsStage: Stage = {
  id: STAGE.tectonics,
  version: OROGEN_STAGE_VERSION,
  parity: true,
  mesh: MESH_ID,
  reads: [],
  writes: [...writesOf(STAGE.tectonics), 'table:plates'],
  params: STAGE_PARAMS,
  run(ctx) {
    const { world } = ctx;
    const p = readParams(world);
    const s = getScratch(world);
    const tect = native(() => computeTectonics(s, p));
    s.tect = tect;

    put(ctx, 'plate', tect.r_plate);
    world.entities.delete('plates');
    const plates = ctx.table('plates', {
      name: 'plates', timeAxis: 'geo',
      columns: { plateId: 'i32', oceanic: 'u8', density: 'f32', poleX: 'f64', poleY: 'f64', poleZ: 'f64', omega: 'f64' },
    });
    for (const id of tect.plateSeeds) {
      const v = tect.plateVec[id]!;
      // Euler pole in the canonical frame (F1): X = z_o, Y = x_o, Z = y_o. validFrom 0 Myr: the present-day snapshot.
      plates.add({ plateId: id, oceanic: tect.plateIsOcean.has(id) ? 1 : 0, density: tect.plateDensity[id]!, poleX: v.pole[2], poleY: v.pole[0], poleZ: v.pole[1], omega: v.omega }, 0);
    }
    for (const [name, arr] of Object.entries(tect.physicsDebug)) putDebug(ctx, p, name, arr);
  },
};

const elevationStage: Stage = {
  id: STAGE.elevation,
  version: OROGEN_STAGE_VERSION,
  parity: true,
  mesh: MESH_ID,
  reads: ['plate', 'table:plates'],
  writes: writesOf(STAGE.elevation),
  params: STAGE_PARAMS,
  run(ctx) {
    const { world } = ctx;
    const p = readParams(world);
    const s = getScratch(world);
    // assignElevation reads the tectonics objects; take them once, so a re-run recomputes them from the seed.
    let tect = s.tect;
    s.tect = undefined;
    if (!tect) tect = native(() => computeTectonics(s, p));
    const stored = read(ctx, 'plate') as unknown as Int32Array;
    for (let i = 0; i < stored.length; i++) if (stored[i] !== tect.r_plate[i]) throw new Error('plate layer differs from the recomputed partition');
    const noise = newNoise(p.seed);
    const res = native(() => assignElevation(s.mesh, s.r_xyz, tect.plateIsOcean, tect.r_plate, tect.plateVec, tect.plateSeeds, noise, p.nMag, p.seed, 5, tect.plateDensity, tect.superPlateData, tect.r_mantleField));
    put(ctx, 'orogen.elevPre', res.r_elevation);
    put(ctx, 'stress', res.r_stress);
    const dl = res.debugLayers as Record<string, Float32Array>;
    for (const g of DEBUG_FIELDS) if (g.stage === STAGE.elevation) for (const n of g.names) putDebug(ctx, p, n, dl[n]);
  },
};

const erosionStage: Stage = {
  id: STAGE.erosion,
  version: OROGEN_STAGE_VERSION,
  parity: true,
  mesh: MESH_ID,
  reads: ['orogen.elevPre', 'orogen.debug.hotspot', 'orogen.debug.cratonWeight', 'orogen.debug.basinWeight', 'orogen.debug.orogenicPower'],
  writes: writesOf(STAGE.erosion),
  params: STAGE_PARAMS,
  run(ctx) {
    const { world } = ctx;
    const p = readParams(world);
    const s = getScratch(world);
    const r_elevation = new Float32Array(read(ctx, 'orogen.elevPre'));
    const r_dampen = computeDetailDampenField(read(ctx, debugId('cratonWeight')), read(ctx, debugId('basinWeight')));
    const r_orogenic = computeOrogenicField(read(ctx, debugId('orogenicPower')));
    const delta = native(() => runPostProcessing(s.mesh, s.r_xyz, r_elevation, p, s.neighborDist, p.seed, read(ctx, debugId('hotspot')), r_dampen, r_orogenic));
    put(ctx, 'orogen.elevRaw', r_elevation);
    // F2: canonical metres. elevToHeightKm is pure arithmetic (no libm), so this is exact in any dmath mode.
    const m = ctx.writeLayer('elevation')[0] as Float32Array;
    for (let i = 0; i < m.length; i++) m[i] = elevToHeightKm(r_elevation[i]!) * 1000;
    putDebug(ctx, p, 'erosionDelta', delta);
  },
};

const climateStage: Stage = {
  id: STAGE.climate,
  version: OROGEN_STAGE_VERSION,
  parity: true,
  mesh: MESH_ID,
  reads: ['orogen.elevRaw', 'plate', 'table:plates'],
  writes: writesOf(STAGE.climate),
  params: STAGE_PARAMS,
  run(ctx) {
    const { world } = ctx;
    const p = readParams(world);
    const s = getScratch(world);
    const r_elevation = read(ctx, 'orogen.elevRaw');
    const r_plate = read(ctx, 'plate') as unknown as Int32Array;
    const plates = ctx.table('plates');
    const plateIsOcean = new Set<number>();
    const ids = plates.column('plateId'), oc = plates.column('oceanic');
    for (let i = 0; i < ids.length; i++) if (oc[i]) plateIsOcean.add(ids[i]!);
    const noise = newNoise(p.seed);

    const wind = native(() => computeWind(s.mesh, s.r_xyz, r_elevation, plateIsOcean, r_plate, noise));
    const ocean = native(() => computeOceanCurrents(s.mesh, s.r_xyz, r_elevation, wind));
    const precip = native(() => computePrecipitation(s.mesh, s.r_xyz, r_elevation, wind, ocean, p.precipitationOffset, p.landCoverage));
    const temp = native(() => computeTemperature(s.mesh, s.r_xyz, r_elevation, wind, ocean, precip, p.temperatureOffset));

    s.climate = { itczLons: wind.itczLons, itczLatsSummer: wind.itczLatsSummer, itczLatsWinter: wind.itczLatsWinter };
    for (const season of ['summer', 'winter'] as const) {
      put(ctx, `wind.${season}`, wind[`r_wind_east_${season}`], 0);
      put(ctx, `wind.${season}`, wind[`r_wind_north_${season}`], 1);
      put(ctx, `current.${season}`, ocean[`r_ocean_current_east_${season}`], 0);
      put(ctx, `current.${season}`, ocean[`r_ocean_current_north_${season}`], 1);
      put(ctx, `temp.${season}`, temp[`r_temperature_${season}`]);
      put(ctx, `precip.${season}`, precip[`r_precip_${season}`]);
      put(ctx, `pressure.${season}`, wind[`r_pressure_${season}`]);
      put(ctx, `orogen.oceanSpeed.${season}`, ocean[`r_ocean_speed_${season}`]);
      put(ctx, `orogen.oceanWarmth.${season}`, ocean[`r_ocean_warmth_${season}`]);
    }
    put(ctx, 'orogen.westness', precip.r_westness);
    putDebug(ctx, p, 'windSpeedSummer', wind.r_wind_speed_summer);
    putDebug(ctx, p, 'windSpeedWinter', wind.r_wind_speed_winter);
    putDebug(ctx, p, 'continentality', wind.r_continentality);
    putDebug(ctx, p, 'rainShadowSummer', precip.r_rainshadow_summer);
    putDebug(ctx, p, 'rainShadowWinter', precip.r_rainshadow_winter);
    putDebug(ctx, p, 'tempContinentality', temp.r_tempContinentality);
  },
};

const koppenStage: Stage = {
  id: STAGE.koppen,
  version: OROGEN_STAGE_VERSION,
  parity: true,
  mesh: MESH_ID,
  reads: ['orogen.elevRaw', 'temp.summer', 'temp.winter', 'precip.summer', 'precip.winter', 'orogen.westness'],
  writes: ['koppen'],
  params: STAGE_PARAMS,
  run(ctx) {
    const s = getScratch(ctx.world);
    const r_koppen = native(() => classifyKoppen(
      s.mesh, read(ctx, 'orogen.elevRaw'),
      { r_temperature_summer: read(ctx, 'temp.summer'), r_temperature_winter: read(ctx, 'temp.winter') },
      { r_precip_summer: read(ctx, 'precip.summer'), r_precip_winter: read(ctx, 'precip.winter'), r_westness: read(ctx, 'orogen.westness') },
    ));
    put(ctx, 'koppen', r_koppen);
  },
};

/** The six stages in pipeline order. Register the layers with registerOrogenLayers() first. */
export const orogenStages: Stage[] = [meshStage, tectonicsStage, elevationStage, erosionStage, climateStage, koppenStage];

/** Koppen class codes by orogen class id (0 = ocean). The canonical `enum:koppen` layer stores these ids as they are. */
export const KOPPEN_CODES: string[] = KOPPEN_CLASSES.map((c) => c.code);

export function prepareWorld(world: World): void {
  registerOrogenLayers(world);
}

export { peekScratch };
