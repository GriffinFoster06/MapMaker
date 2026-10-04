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

/** orogen's slider defaults at cc2662b (index.html), as used by spike 1a. */
export const OROGEN_DEFAULTS: OrogenParams = {
  seed: 12345, N: 20000, P: 80, jitter: 0.75, nMag: 0.4, numContinents: 4, smoothing: 0.1, hydraulicErosion: 0.5,
  thermalErosion: 0.1, ridgeSharpening: 0.5, glacialErosion: 0.5, terrainWarp: 0.75, continentSizeVariety: 0.35,
  temperatureOffset: 0, precipitationOffset: 0, landCoverage: 0.3, debugLayers: false,
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
  return { ...OROGEN_DEFAULTS, ...(world.params[PARAM_KEY] as Partial<OrogenParams> | undefined) };
}
