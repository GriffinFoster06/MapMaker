// The reference pass of the structured pipeline (design note 14 §3.1, Phase 4b M3). Original shell code.
//
// Every structural decision is made once, on the fixed reference mesh L0 (orogen's 20k coarse mesh, seed + 137),
// with fixed parameters: tectonics, elevation, reference erosion, climate for both seasons, Köppen and the major
// drainage. Nothing here reads the fidelity N, so the result is identical at every N (invariant I2) by construction.
// It runs orogen's own sequence (planet-worker.js handleGenerate) through the TypeScript ports in dmath fdlibm, which
// in Node equal stock orogen bit for bit (port-parity.test.ts); on L0 the pass is therefore stock orogen run on the
// reference mesh.
import { type Drainage, type MajorBasins, type SphereMesh, buildReferenceMesh, majorBasins, priorityFlood } from '@mapmaker/core';
import { type OrogenParams, type PlanetContext, planetContext, withPlanetClimate } from '../params';
import * as port from '../port';
import type { ElevationStructure, StageFields } from '../port/elevation';
import { computeDetailDampenField, computeOrogenicField, runPostProcessing } from '../orchestration';
import { type OMesh, type OrogenLib, type Scratch, type Tectonics, computeTectonics } from '../scratch';

/** Major basins drain at least this area (design note 14 §3.7). */
export const A_MAJOR_KM2 = 2e5;

export interface ReferenceClimate {
  wind: ReturnType<typeof port.computeWind>;
  ocean: ReturnType<typeof port.computeOceanCurrents>;
  precip: ReturnType<typeof port.computePrecipitation>;
  temp: ReturnType<typeof port.computeTemperature>;
}

export interface ReferenceState {
  /** L0 in the canonical frame. */
  mesh: SphereMesh;
  /** The same mesh as orogen's SphereMesh, and its points in orogen's frame (Float32). */
  omesh: OMesh;
  r_xyz: Float32Array;
  tect: Tectonics;
  /** Structural placements made on L0 and reused by the detail pass at every N (phasor kernels). */
  structure: ElevationStructure;
  /** orogen's stage 1–3 fields on L0 (stress, distances, terrain classes); the detail pass prolongs them to N. */
  fields: StageFields;
  /** orogen raw elevation before and after the reference erosion. */
  elevPre: Float32Array;
  elevRaw: Float32Array;
  stress: Float32Array;
  /** orogen's elevation debug fields at L0 (the detail pass reads its classification fields). */
  debug: Record<string, Float32Array>;
  erosionDelta: Float32Array;
  climate: ReferenceClimate;
  koppen: Uint8Array;
  drainage: Drainage;
  basins: MajorBasins;
  /** The non-Earth planet this pass ran with, or null for Earth. */
  planet: PlanetContext | null;
}

const lib = port as unknown as OrogenLib;

export function runReferencePass(p: OrogenParams): ReferenceState {
  const { mesh } = buildReferenceMesh(p.seed);
  const omesh = new port.VendorSphereMesh(mesh.triangles, mesh.halfedges, mesh.numRegions) as OMesh;
  const planet = planetContext(p);
  if (planet) {
    omesh.radiusKm = planet.radiusKm;
    omesh.peakCompressPower = planet.peakCompressPower;
  }
  const r_xyz = mesh.orogenPoints() as Float32Array;
  const s: Scratch = { mesh: omesh, r_xyz, neighborDist: port.computeNeighborDist(omesh, r_xyz) };

  const tect = computeTectonics(s, p, lib);
  const noise = new port.SimplexNoise(p.seed);
  let fields: StageFields | undefined;
  const structure: ElevationStructure = { onFields: (f) => { fields = f; } };
  const res = port.assignElevation(omesh, r_xyz, tect.plateIsOcean, tect.r_plate, tect.plateVec, tect.plateSeeds, noise, p.nMag, p.seed, 5, tect.plateDensity, tect.superPlateData, tect.r_mantleField, structure);
  const debug = res.debugLayers as Record<string, Float32Array>;
  const elevPre = res.r_elevation as Float32Array;

  const elevRaw = new Float32Array(elevPre);
  const erosionDelta = runPostProcessing(omesh, r_xyz, elevRaw, p, s.neighborDist, p.seed, debug['hotspot'],
    computeDetailDampenField(debug['cratonWeight'], debug['basinWeight']), computeOrogenicField(debug['orogenicPower']), lib);

  const climateNoise = new port.SimplexNoise(p.seed);
  const { wind, ocean, precip, temp, koppen } = withPlanetClimate(planet, () => {
    const wind = port.computeWind(omesh, r_xyz, elevRaw, tect.plateIsOcean, tect.r_plate, climateNoise);
    const ocean = port.computeOceanCurrents(omesh, r_xyz, elevRaw, wind);
    const precip = port.computePrecipitation(omesh, r_xyz, elevRaw, wind, ocean, p.precipitationOffset, p.landCoverage);
    const temp = port.computeTemperature(omesh, r_xyz, elevRaw, wind, ocean, precip, p.temperatureOffset);
    const koppen = port.classifyKoppen(omesh, elevRaw,
      { r_temperature_summer: temp.r_temperature_summer, r_temperature_winter: temp.r_temperature_winter },
      { r_precip_summer: precip.r_precip_summer, r_precip_winter: precip.r_precip_winter, r_westness: precip.r_westness }) as Uint8Array;
    return { wind, ocean, precip, temp, koppen };
  });

  const rKm = omesh.radiusKm ?? 6371;
  const areaKm2 = Float64Array.from(mesh.cellArea_sr, (a) => a * rKm * rKm);
  const drainage = priorityFlood(elevRaw, mesh.adjOffset, mesh.adjList, areaKm2);
  const basins = majorBasins(drainage, mesh.adjOffset, mesh.adjList, A_MAJOR_KM2);

  return { mesh, omesh, r_xyz, tect, structure, fields: fields!, elevPre, elevRaw, stress: res.r_stress as Float32Array, debug, erosionDelta, climate: { wind, ocean, precip, temp }, koppen, drainage, basins, planet };
}
