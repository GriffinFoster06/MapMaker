// Structured-pipeline climate on the Earth example (Phase 4b M8, decision D7). Original shell code.
// Earth's imported elevation at N (L1) is restricted to the reference mesh L0, the ported orogen climate is solved on
// L0, and the result is downscaled to L1 by the detail pass's own code (runClimateDetail), then classified and scored
// against Kottek et al. exactly as the stock harness does. D7: the objective may be at most 0.02 below the stock
// baseline (tools/tuning/climate/baseline.json).
import { MultiLevel, buildReferenceMesh } from '@mapmaker/core';
import { deriveSyntheticPlates } from '@mapmaker/gen-orogen';
import * as port from '../../../../packages/gen-orogen/src/port/index.ts';
import { runClimateDetail } from '../../../../packages/gen-orogen/src/structured/detail.ts';
import { scoreKoppen } from './score.mjs';

/** Climate of the Earth context through the structured pipeline: L0 solve, downscale to the context's mesh, Köppen. */
export function runStructuredClimate(ctx) {
  const L1 = ctx.world.meshes.get('global').mesh;
  const { mesh: L0 } = buildReferenceMesh(ctx.seed);
  const ml = new MultiLevel(L0, L1);
  const eRef = Float32Array.from(ml.fillChildless(ml.restrict(ctx.r_elevation)));
  const omesh0 = new port.VendorSphereMesh(L0.triangles, L0.halfedges, L0.numRegions);
  const xyz0 = L0.orogenPoints();
  const { r_plate, plateIsOcean } = deriveSyntheticPlates(L0.adjOffset, L0.adjList, eRef);
  const noise = new port.SimplexNoise(ctx.seed);
  const wind = port.computeWind(omesh0, xyz0, eRef, plateIsOcean, r_plate, noise);
  const ocean = port.computeOceanCurrents(omesh0, xyz0, eRef, wind);
  const precip = port.computePrecipitation(omesh0, xyz0, eRef, wind, ocean, 0, 0.3);
  const temp = port.computeTemperature(omesh0, xyz0, eRef, wind, ocean, precip, 0);
  const ref = { climate: { wind, ocean, precip, temp }, r_xyz: xyz0 };
  const d = { ml, r_xyz: ctx.r_xyz, omesh: ctx.mesh, elevRaw: ctx.r_elevation };
  const c = runClimateDetail(ref, d);
  return { r_koppen: c.koppen };
}

export function evaluateStructured(ctx) {
  const t0 = performance.now();
  const { r_koppen } = runStructuredClimate(ctx);
  const metrics = scoreKoppen(ctx, r_koppen);
  metrics.evalMs = Math.round(performance.now() - t0);
  return { metrics, r_koppen };
}
