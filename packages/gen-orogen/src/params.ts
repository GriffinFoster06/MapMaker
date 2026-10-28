// orogen generation parameters (the slider values of planet-worker.js `generate`). Original shell code.
import type { World } from '@mapmaker/core';
import { type MappingResult, type PlanetInput, mapPlanet } from '@mapmaker/planet';
import { CLIMATE_DEFAULTS, resetClimateParams, setClimateParams } from '../vendor/js/climate-config.js';
import { PEAK_COMPRESS_POWER } from '../vendor/js/terrain-config.js';

export interface OrogenParams {
  seed: number;
  N: number;
  P: number;
  jitter: number;
  nMag: number;
  numContinents: number;
  smoothing: number;
  hydraulicErosion: number;
  thermalErosion: number;
  ridgeSharpening: number;
  glacialErosion: number;
  terrainWarp: number;
  continentSizeVariety: number;
  temperatureOffset: number;
  precipitationOffset: number;
  landCoverage: number;
  /** Keep orogen's ~40 debug fields as private layers (parity and probe turn this on; they cost ~160 B per cell). */
  debugLayers: boolean;
  /**
   * Physical planet inputs (design note 10), stored inside this param so that a world without them hashes exactly as
   * before. Absent or empty means Earth. Only the structured pipeline accepts a non-Earth planet.
   */
  planet?: Partial<PlanetInput>;
}

/**
 * orogen's slider defaults at cc2662b (index.html), as used by spike 1a, except where a default was verifiably wrong
 * against Earth (decision P6, docs/earth-tests/DEFAULTS_SWEEP.md): `landCoverage` 0.31 (orogen 0.3) for Earth's land
 * fraction and `temperatureOffset` −3 (orogen 0) for Earth's global mean surface temperature of 14 to 15 °C.
 */
export const OROGEN_DEFAULTS: OrogenParams = {
  seed: 241774, N: 20000, P: 80, jitter: 0.75, nMag: 0.4, numContinents: 4, smoothing: 0.1, hydraulicErosion: 0.5,
  thermalErosion: 0.1, ridgeSharpening: 0.5, glacialErosion: 0.5, terrainWarp: 0.75, continentSizeVariety: 0.35,
  temperatureOffset: -3, precipitationOffset: 0, landCoverage: 0.31, debugLayers: false,
};

/** World param key holding a partial OrogenParams. Every orogen stage hashes it. */
export const PARAM_KEY = 'orogen';
export const STAGE_PARAMS = [PARAM_KEY];

/** orogen hard-codes the Earth radius (F3); the adapter accepts only that. */
export const OROGEN_RADIUS_M = 6_371_000;

/** What a non-Earth planet changes in the structured pipeline (design note 10). */
export interface PlanetContext {
  radiusKm: number;
  peakCompressPower: number;
  /** Climate constants that differ from orogen's defaults. */
  climate: Record<string, number>;
  mapping: MappingResult;
}

const planetCache = new Map<string, PlanetContext>();

/** The planet context for these params, or null for Earth (nothing changes, so Earth runs are untouched). */
export function planetContext(p: Pick<OrogenParams, 'planet'>): PlanetContext | null {
  const pl = p.planet;
  if (!pl || Object.keys(pl).length === 0) return null;
  const key = JSON.stringify(pl);
  let c = planetCache.get(key);
  if (!c) {
    const mapping = mapPlanet(pl, CLIMATE_DEFAULTS as Readonly<Record<string, number>>);
    const climate: Record<string, number> = {};
    for (const [k, v] of Object.entries(mapping.climateConstants)) if (!Object.is(v, (CLIMATE_DEFAULTS as Record<string, number>)[k])) climate[k] = v;
    c = { radiusKm: mapping.inputs.radius_m / 1000, peakCompressPower: mapping.terrainConstants['PEAK_COMPRESS_POWER'] ?? PEAK_COMPRESS_POWER, climate, mapping };
    planetCache.set(key, c);
  }
  return c;
}

/** The vendored (parity) pipeline cannot represent another planet: refuse it instead of silently using Earth. */
export function assertEarthPlanet(p: Pick<OrogenParams, 'planet'>): void {
  const c = planetContext(p);
  if (c && (c.radiusKm !== OROGEN_RADIUS_M / 1000 || c.peakCompressPower !== PEAK_COMPRESS_POWER || Object.keys(c.climate).length > 0)) {
    throw new Error('the parity pipeline hard-codes Earth (R = 6371 km, F3); a non-Earth planet needs the structured pipeline');
  }
}

/**
 * Records what the mapping did in world.planet.mapping (saved in planet.json): the inputs, ratios, validity and notes
 * (the app's "climate outside model validity" badge reads them), the constants that differ from Earth's, and the report
 * entries that changed. Earth removes the record.
 */
export function recordPlanet(world: World, c: PlanetContext | null): void {
  if (!c) {
    delete world.planet['mapping'];
    return;
  }
  const m = c.mapping;
  world.planet['mapping'] = {
    inputs: m.inputs, ratios: m.ratios, validity: m.validity, notes: m.notes, landCoverage: m.landCoverage,
    climateConstants: c.climate, terrainConstants: m.terrainConstants,
    report: m.report.filter((e) => e.value !== e.earthValue),
  };
}

/** Runs fn with the planet's climate constants set in the vendored CLIMATE object, restoring the defaults afterwards. */
export function withPlanetClimate<T>(c: PlanetContext | null, fn: () => T): T {
  if (!c || Object.keys(c.climate).length === 0) return fn();
  setClimateParams(c.climate);
  try {
    return fn();
  } finally {
    resetClimateParams();
  }
}

export function readParams(world: World): OrogenParams {
  const out: OrogenParams = { ...OROGEN_DEFAULTS, ...(world.params[PARAM_KEY] as Partial<OrogenParams> | undefined) };
  // The radius that counts is orogen.planet.radius_m (hashed with the stages); world.planet.radius_m may only agree with it.
  const r = world.planet['radius_m'];
  const effective = out.planet?.radius_m ?? OROGEN_RADIUS_M;
  if (r !== undefined && r !== effective) {
    throw new Error(`planet.radius_m = ${String(r)} disagrees with the radius the generator uses (${String(effective)} m; set orogen.planet.radius_m)`);
  }
  // Parameter edits (note 16 §2: target { kind: 'param', key: 'orogen.<name>' }, op 'set', payload.value) in log order.
  for (const e of world.edits.active()) {
    if (e.target.kind !== 'param' || e.op !== 'set' || !e.target.key.startsWith(`${PARAM_KEY}.`)) continue;
    const k = e.target.key.slice(PARAM_KEY.length + 1) as keyof OrogenParams;
    const v = e.payload['value'];
    if (k in OROGEN_DEFAULTS && k !== 'debugLayers' && typeof v === 'number' && Number.isFinite(v)) (out[k] as number) = v;
  }
  return out;
}
