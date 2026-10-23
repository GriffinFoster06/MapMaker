// Stage A of the default-seed search: the continent layout of a seed, from the reference pass cut short after the
// reference erosion (the land/water assignment of the fixed 20k reference mesh L0; the climate, Köppen and drainage
// that follow do not change it). Same calls, in the same order, as runReferencePass up to elevRaw. Original code.
import { buildReferenceMesh } from '@mapmaker/core';
import { OROGEN_DEFAULTS } from '@mapmaker/gen-orogen';
import * as port from '@mapmaker/gen-orogen/port/index';
import { computeDetailDampenField, computeOrogenicField, runPostProcessing } from '@mapmaker/gen-orogen/orchestration';
import { computeTectonics } from '@mapmaker/gen-orogen/scratch';

const lib = port;

/** Raw reference elevation (orogen units, land > 0) and the reference mesh for `seed` at the default parameters. */
export function referenceLayout(seed, params = {}) {
  const p = { ...OROGEN_DEFAULTS, ...params, seed };
  const { mesh } = buildReferenceMesh(p.seed);
  const omesh = new port.VendorSphereMesh(mesh.triangles, mesh.halfedges, mesh.numRegions);
  const r_xyz = mesh.orogenPoints();
  const s = { mesh: omesh, r_xyz, neighborDist: port.computeNeighborDist(omesh, r_xyz) };
  const tect = computeTectonics(s, p, lib);
  const noise = new port.SimplexNoise(p.seed);
  const res = port.assignElevation(omesh, r_xyz, tect.plateIsOcean, tect.r_plate, tect.plateVec, tect.plateSeeds, noise, p.nMag, p.seed, 5, tect.plateDensity, tect.superPlateData, tect.r_mantleField, { onFields: () => {} });
  const debug = res.debugLayers;
  const elevRaw = new Float32Array(res.r_elevation);
  runPostProcessing(omesh, r_xyz, elevRaw, p, s.neighborDist, p.seed, debug['hotspot'],
    computeDetailDampenField(debug['cratonWeight'], debug['basinWeight']), computeOrogenicField(debug['orogenicPower']), lib);
  return { mesh, elevRaw };
}
