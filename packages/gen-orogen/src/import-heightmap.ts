// Provenance: orogen tuning/climate/lib/earth-context.mjs and js/planet-worker.js (handleImportHeightmap) @ cc2662b —
// sampleBilinear, grayscaleToElevation, sampleHeightmap and deriveSyntheticPlates ported to TypeScript; the sequence
// (sample, detail noise L1 and L2, soil creep, synthetic plates) is the import page's with all sculpting sliders at 0.
// The result is written into a World as the layers the climate stages read, so the tuning harness runs orogen's climate
// through the shell's own stages.
import { EntityTable, type World, dmath } from '@mapmaker/core';
import { PLATES_SPEC } from './plates-spec';
import { OROGEN_DEFAULTS, type OrogenParams, PARAM_KEY } from './params';
import { getScratch } from './scratch';
import { DETAIL_NOISE_DAMPEN_STRENGTH, applyDetailNoise, applySoilCreep, elevToHeightKm } from './vendor';

export interface Heightmap { gray: Uint8Array; width: number; height: number }

function sampleBilinear(pixels: Uint8Array, imgW: number, imgH: number, px: number, py: number): number {
  py = Math.max(0, Math.min(py, imgH - 1));
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = (x0 + 1) % imgW;
  const y1 = Math.min(y0 + 1, imgH - 1);
  const fx = px - x0, fy = py - y0;
  const v00 = pixels[y0 * imgW + (((x0 % imgW) + imgW) % imgW)]!;
  const v10 = pixels[y0 * imgW + x1]!;
  const v01 = pixels[y1 * imgW + (((x0 % imgW) + imgW) % imgW)]!;
  const v11 = pixels[y1 * imgW + x1]!;
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

function grayscaleToElevation(v: number): number {
  if (v < 1) return -0.5;
  return Math.sqrt((v - 1) / 254);
}

/** Elevation per region from an equirectangular grayscale image, in orogen's frame (+y north, lon 0 at +z). */
export function sampleHeightmap(r_xyz: Float32Array, numRegions: number, hm: Heightmap): Float32Array {
  const r_elevation = new Float32Array(numRegions);
  for (let r = 0; r < numRegions; r++) {
    const x = r_xyz[3 * r]!, y = r_xyz[3 * r + 1]!, z = r_xyz[3 * r + 2]!;
    const lat = dmath.asin(Math.max(-1, Math.min(1, y)));
    const lon = dmath.atan2(x, z);
    const px = (lon / Math.PI + 1) * 0.5 * hm.width;
    const py = (0.5 - lat / Math.PI) * hm.height;
    r_elevation[r] = grayscaleToElevation(sampleBilinear(hm.gray, hm.width, hm.height, px, py));
  }
  return r_elevation;
}

/** One plate per connected land or ocean component, as the import path does it. */
export function deriveSyntheticPlates(adjOffset: Int32Array, adjList: Int32Array, r_elevation: Float32Array): { r_plate: Int32Array; plateSeeds: number[]; plateIsOcean: Set<number> } {
  const N = r_elevation.length;
  const r_plate = new Int32Array(N).fill(-1);
  const plateSeeds: number[] = [];
  const plateIsOcean = new Set<number>();
  for (let r = 0; r < N; r++) {
    if (r_plate[r]! >= 0) continue;
    const isOcean = r_elevation[r]! <= 0;
    r_plate[r] = r;
    plateSeeds.push(r);
    if (isOcean) plateIsOcean.add(r);
    const queue = [r];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++]!;
      const end = adjOffset[cur + 1]!;
      for (let ni = adjOffset[cur]!; ni < end; ni++) {
        const nb = adjList[ni]!;
        if (r_plate[nb]! >= 0) continue;
        if ((r_elevation[nb]! <= 0) === isOcean) { r_plate[nb] = r; queue.push(nb); }
      }
    }
  }
  return { r_plate, plateSeeds, plateIsOcean };
}

/**
 * Writes `orogen.elevRaw`, `elevation`, `plate` and the `plates` table for an imported heightmap into a world that has
 * run the `mesh` stage. The climate and Köppen stages can then run on it (`only`). Runs vendored code: native mode.
 */
export function importHeightmap(world: World, hm: Heightmap): { r_elevation: Float32Array } {
  const p: OrogenParams = { ...OROGEN_DEFAULTS, ...(world.params[PARAM_KEY] as Partial<OrogenParams> | undefined) };
  const s = getScratch(world);
  const n = s.mesh.numRegions;
  const r_elevation = dmath.withMode('native', () => {
    const e = sampleHeightmap(s.r_xyz, n, hm);
    const r_isOcean = new Uint8Array(n);
    for (let r = 0; r < n; r++) if (e[r]! <= 0) r_isOcean[r] = 1;
    applyDetailNoise(s.mesh, s.r_xyz, e, r_isOcean, p.seed, { dampenField: null, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: null });
    applyDetailNoise(s.mesh, s.r_xyz, e, r_isOcean, p.seed, {
      amplitudeKm: 0.05, frequencyMult: 2.0, warpAmpMult: 2.0, bipolar: true, biasExponent: 0.4, seedOffset: 13579,
      dampenField: null, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: null,
    });
    applySoilCreep(s.mesh, e, r_isOcean, 3, 0.1125);
    return e;
  });

  const layer = (id: string): Float32Array | Int32Array => {
    if (!world.layers.has('global', id)) world.layers.alloc('global', id, n);
    return world.layers.get('global', id) as Float32Array | Int32Array;
  };
  (layer('orogen.elevRaw') as Float32Array).set(r_elevation);
  const metres = layer('elevation') as Float32Array;
  for (let i = 0; i < n; i++) metres[i] = elevToHeightKm(r_elevation[i]!) * 1000;

  const { r_plate, plateSeeds, plateIsOcean } = deriveSyntheticPlates(s.mesh.adjOffset, s.mesh.adjList, r_elevation);
  (layer('plate') as Int32Array).set(r_plate);
  world.entities.delete('plates');
  const plates = new EntityTable(PLATES_SPEC);
  for (const id of plateSeeds) plates.add({ plateId: id, oceanic: plateIsOcean.has(id) ? 1 : 0, density: 0, poleX: 0, poleY: 0, poleZ: 0, omega: 0 }, 0);
  world.addTable(plates);
  return { r_elevation };
}
