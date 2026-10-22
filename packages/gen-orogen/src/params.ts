// orogen generation parameters (the slider values of planet-worker.js `generate`). Original shell code.
import type { World } from '@mapmaker/core';

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
}

/**
 * orogen's slider defaults at cc2662b (index.html), as used by spike 1a, except where a default was verifiably wrong
 * against Earth (decision P6, docs/earth-tests/DEFAULTS_SWEEP.md): `landCoverage` 0.31 (orogen 0.3) for Earth's land
 * fraction and `temperatureOffset` −3 (orogen 0) for Earth's global mean surface temperature of 14 to 15 °C.
 */
export const OROGEN_DEFAULTS: OrogenParams = {
  seed: 12345, N: 20000, P: 80, jitter: 0.75, nMag: 0.4, numContinents: 4, smoothing: 0.1, hydraulicErosion: 0.5,
  thermalErosion: 0.1, ridgeSharpening: 0.5, glacialErosion: 0.5, terrainWarp: 0.75, continentSizeVariety: 0.35,
  temperatureOffset: -3, precipitationOffset: 0, landCoverage: 0.31, debugLayers: false,
};

/** World param key holding a partial OrogenParams. Every orogen stage hashes it. */
export const PARAM_KEY = 'orogen';
export const STAGE_PARAMS = [PARAM_KEY];

/** orogen hard-codes the Earth radius (F3); the adapter accepts only that. */
export const OROGEN_RADIUS_M = 6_371_000;

export function readParams(world: World): OrogenParams {
  const r = world.planet['radius_m'];
  if (r !== undefined && r !== OROGEN_RADIUS_M) {
    throw new Error(`orogen hard-codes R = 6371 km (F3); planet.radius_m = ${String(r)} is not supported until the radius is threaded through (gap 11)`);
  }
  const out: OrogenParams = { ...OROGEN_DEFAULTS, ...(world.params[PARAM_KEY] as Partial<OrogenParams> | undefined) };
  // Parameter edits (note 16 §2: target { kind: 'param', key: 'orogen.<name>' }, op 'set', payload.value) in log order.
  for (const e of world.edits.active()) {
    if (e.target.kind !== 'param' || e.op !== 'set' || !e.target.key.startsWith(`${PARAM_KEY}.`)) continue;
    const k = e.target.key.slice(PARAM_KEY.length + 1) as keyof OrogenParams;
    const v = e.payload['value'];
    if (k in OROGEN_DEFAULTS && k !== 'debugLayers' && typeof v === 'number' && Number.isFinite(v)) (out[k] as number) = v;
  }
  return out;
}
