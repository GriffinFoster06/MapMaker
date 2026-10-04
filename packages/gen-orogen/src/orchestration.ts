// Provenance: orogen js/planet-worker.js @ cc2662b — computeTriangleElevations, computeDetailDampenField,
// computeOrogenicField and runPostProcessing, ported to TypeScript. `handleGenerate`'s call sequence is split across
// the shell's stages (stages.ts). Per-step timing (performance.now) is dropped; the arithmetic and call order are unchanged.
import {
  DETAIL_NOISE_DAMPEN_STRENGTH, applyDetailNoise, applySoilCreep, erodeComposite, sharpenRidges, smoothElevation, warpTerrain,
} from './vendor';
import type { OrogenParams } from './params';
import type { OMesh } from './scratch';

export function computeTriangleElevations(mesh: OMesh, r_elevation: Float32Array): Float32Array {
  const t_elevation = new Float32Array(mesh.numTriangles);
  for (let t = 0; t < mesh.numTriangles; t++) {
    const s0 = 3 * t;
    const a = mesh.s_begin_r(s0), b = mesh.s_begin_r(s0 + 1), c = mesh.s_begin_r(s0 + 2);
    t_elevation[t] = (r_elevation[a]! + r_elevation[b]! + r_elevation[c]!) / 3;
  }
  return t_elevation;
}

/** Combined craton/basin dampen field for detail noise (1 = max dampen). */
export function computeDetailDampenField(cw: Float32Array | undefined, bw: Float32Array | undefined): Float32Array | null {
  if (!cw || !bw) return null;
  const N = cw.length;
  const r_dampen = new Float32Array(N);
  for (let r = 0; r < N; r++) {
    const a = cw[r]!, b = bw[r]!;
    r_dampen[r] = a > b ? a : b;
  }
  return r_dampen;
}

/** Orogenic power as a [0, 1] amplitude multiplier (stored as raw − 0.5, so add 0.5 and clamp). */
export function computeOrogenicField(op: Float32Array | undefined): Float32Array | null {
  if (!op) return null;
  const N = op.length;
  const r_oro = new Float32Array(N);
  for (let r = 0; r < N; r++) {
    const v = op[r]! + 0.5;
    r_oro[r] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return r_oro;
}

type Sliders = Pick<OrogenParams, 'smoothing' | 'glacialErosion' | 'hydraulicErosion' | 'thermalErosion' | 'ridgeSharpening' | 'terrainWarp'>;

/** Terrain post-processing: mutates r_elevation in place and returns the erosion delta layer. */
export function runPostProcessing(
  mesh: OMesh, r_xyz: Float32Array, r_elevation: Float32Array, params: Sliders, neighborDist: Float32Array, seed: number,
  r_hotspot: Float32Array | undefined, r_dampen: Float32Array | null, r_orogenic: Float32Array | null,
): Float32Array {
  const { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp } = params;

  if (terrainWarp > 0) warpTerrain(mesh, r_elevation, r_xyz, seed, terrainWarp, r_hotspot);

  const r_isOcean = new Uint8Array(mesh.numRegions);
  for (let r = 0; r < mesh.numRegions; r++) if (r_elevation[r]! <= 0) r_isOcean[r] = 1;

  const preErosion = new Float32Array(r_elevation);

  if (smoothing > 0) {
    const smoothIters = Math.round(1 + smoothing * 4);
    const smoothStr = 0.2 + smoothing * 0.5;
    smoothElevation(mesh, r_elevation, r_isOcean, smoothIters, smoothStr);
  }

  applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
    dampenField: r_dampen ?? null, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: r_orogenic ?? null,
  });
  applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
    amplitudeKm: 0.05, frequencyMult: 2.0, warpAmpMult: 2.0, bipolar: true, biasExponent: 0.4, seedOffset: 13579,
    dampenField: r_dampen ?? null, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: r_orogenic ?? null,
  });

  if (glacialErosion > 0 || hydraulicErosion > 0 || thermalErosion > 0) {
    const gIters = Math.round(glacialErosion * 10);
    const hIters = Math.round(hydraulicErosion * 20);
    const hK = hydraulicErosion * 0.0006;
    const tIters = Math.round(thermalErosion * 10);
    const talusSlope = 1.2 - thermalErosion * 0.4;
    const kThermal = thermalErosion * 0.15;
    erodeComposite(mesh, r_elevation, r_xyz, r_isOcean, hIters, hK, 0.5, 1.0, tIters, talusSlope, kThermal, gIters, glacialErosion, neighborDist);
  }

  if (ridgeSharpening > 0) {
    const rsIters = Math.round(1 + ridgeSharpening * 3);
    const rsStr = ridgeSharpening * 0.08;
    sharpenRidges(mesh, r_elevation, r_isOcean, rsIters, rsStr);
  }

  applySoilCreep(mesh, r_elevation, r_isOcean, 3, 0.1125);

  const dl_erosionDelta = new Float32Array(mesh.numRegions);
  for (let r = 0; r < mesh.numRegions; r++) dl_erosionDelta[r] = r_elevation[r]! - preErosion[r]!;
  return dl_erosionDelta;
}
