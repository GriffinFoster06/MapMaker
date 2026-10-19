// Terrain edits on the elevation layer (design note 16 §3.2, §3.3; Phase 5b). Original shell code, no upstream.
//
// The stage applies its edits to the elevation it computed, before anything downstream (climate, drainage) reads it, so
// the world re-simulates around the edit. Each edit has a region (geometry, rasterised to per-cell weights w) and an op:
//   raise, lower      value ± amount·w                                    amount in metres
//   smooth            value → value + strength·w·(neighbour mean − value), `iterations` passes
//   flatten           value → value + w·(target − value); target = the region's weighted mean, or `to` metres
//   terrace           value → value + w·(round(value/step)·step − value)  step in metres
//   noise             value + amplitude·w·simplex(position·frequency)     seeded by the edit id, so it replays exactly
//   set               value → value + w·(to − value)
//   land, sea         raise to at least `height` m, or lower to at most −`depth` m (paint land or sea)
//   hotspot (seed)    a Gaussian dome of `height` m at the path's first point, σ = radius/3
//   ridge (seed)      a ridge of `height` m (negative: a trench) along the path, half-width = radius, modulated by noise
// Modes: `pin` writes the result; `soft` moves the value `weight` of the way towards it; `seed` writes the result of a
// seed op (hotspot, ridge), which the stage then simulates from: climate and drainage follow the new relief.
// Hotspot and ridge seeds are additive reliefs, not a re-run of orogen's tectonics: the plate partition and the
// reference-scale structure are unchanged (decision 5b-3); real plate-boundary re-simulation arrives with Phase 6b.
import { type Edit, type SphereMesh, SpatialIndex, dmath } from '@mapmaker/core';
import { SimplexNoise } from '../port';
import { elevToHeightKm } from '../port';
import { metresToRaw, rawToMetres } from '../structured/detail';
import { rasterise } from './region';

export const TERRAIN_OPS = ['raise', 'lower', 'smooth', 'flatten', 'terrace', 'noise', 'set', 'land', 'sea', 'hotspot', 'ridge'] as const;
export type TerrainOp = (typeof TERRAIN_OPS)[number];

const num = (e: Edit, k: string, d: number): number => { const v = e.payload[k]; return typeof v === 'number' && Number.isFinite(v) ? v : d; };

/** True for an edit that targets the canonical elevation layer on the world mesh. */
export const isElevationEdit = (e: Edit): boolean => e.target.kind === 'layer' && e.target.id === 'elevation';

/**
 * Applies the elevation edits in log order to `elevM` (metres) and `raw` (orogen raw units), in place. Only edited cells
 * change; each one is set so that raw and metres stay the pointwise map of each other (F2). Returns the changed cells and their raw
 * values before the edits (for the lapse-rate adjustment of the downscaled climate).
 */
export function applyTerrainEdits(mesh: SphereMesh, seed: number, elevM: Float32Array, raw: Float32Array, edits: readonly Edit[], index = new SpatialIndex(mesh)): AppliedEdits {
  const list = edits.filter(isElevationEdit);
  if (!list.length) return { cells: new Int32Array(0), oldRaw: new Float32Array(0) };
  const n = mesh.numRegions, p = mesh.points;
  const cur = Float64Array.from(elevM);
  const touched = new Uint8Array(n);
  for (const e of list) {
    const { cells, w } = rasterise(mesh, e.region, index);
    if (!cells.length) continue;
    const m = cells.length;
    const old = Float64Array.from(cells, (c) => cur[c]!);
    const val = Float64Array.from(old);
    const soft = e.mode === 'soft' ? e.weight ?? 1 : 1;
    switch (e.op as TerrainOp) {
      case 'raise': case 'lower': { const a = (e.op === 'raise' ? 1 : -1) * num(e, 'amount', 100); for (let i = 0; i < m; i++) val[i] = old[i]! + a * w[i]!; break; }
      case 'smooth': {
        const s = Math.min(1, Math.max(0, num(e, 'strength', 0.5)));
        for (let it = 0, iters = Math.max(1, Math.round(num(e, 'iterations', 2))); it < iters; it++) {
          const nxt = Float64Array.from(val);
          for (let i = 0; i < m; i++) {
            const c = cells[i]!;
            let sum = 0, k = 0;
            for (let j = mesh.adjOffset[c]!; j < mesh.adjOffset[c + 1]!; j++) { sum += cur[mesh.adjList[j]!]!; k++; }
            // Neighbours inside the region use their current working value, the others the layer's.
            nxt[i] = val[i]! + s * w[i]! * (sum / k - val[i]!);
          }
          for (let i = 0; i < m; i++) { val[i] = nxt[i]!; cur[cells[i]!] = nxt[i]!; }
        }
        break;
      }
      case 'flatten': case 'set': {
        let target = num(e, 'to', 0);
        if (e.op === 'flatten' && e.payload['to'] === undefined) { let sw = 0, sv = 0; for (let i = 0; i < m; i++) { sw += w[i]!; sv += w[i]! * old[i]!; } target = sv / sw; }
        for (let i = 0; i < m; i++) val[i] = old[i]! + w[i]! * (target - old[i]!);
        break;
      }
      case 'terrace': { const st = Math.max(1, num(e, 'step', 200)); for (let i = 0; i < m; i++) val[i] = old[i]! + w[i]! * (Math.round(old[i]! / st) * st - old[i]!); break; }
      case 'noise': {
        const noise = new SimplexNoise(((seed * 31 + e.id) | 0) >>> 0), f = num(e, 'frequency', 12), a = num(e, 'amplitude', 150);
        for (let i = 0; i < m; i++) { const c = cells[i]!; val[i] = old[i]! + a * w[i]! * noise.noise3D(p[3 * c]! * f, p[3 * c + 1]! * f, p[3 * c + 2]! * f); }
        break;
      }
      case 'land': { const h = num(e, 'height', 150); for (let i = 0; i < m; i++) val[i] = old[i]! + w[i]! * (Math.max(old[i]!, h) - old[i]!); break; }
      case 'sea': { const d = -num(e, 'depth', 1000); for (let i = 0; i < m; i++) val[i] = old[i]! + w[i]! * (Math.min(old[i]!, d) - old[i]!); break; }
      case 'hotspot': {
        const reg = e.region;
        if (reg?.kind !== 'brush' || reg.path.length < 3) break;
        const sigma = reg.radius / 3, h = num(e, 'height', 3000), c0 = reg.path;
        const l0 = Math.sqrt(c0[0]! * c0[0]! + c0[1]! * c0[1]! + c0[2]! * c0[2]!) || 1;
        if (!(sigma > 0)) break;
        for (let i = 0; i < m; i++) {
          const c = cells[i]!;
          const d = dmath.acos(Math.min(1, (p[3 * c]! * c0[0]! + p[3 * c + 1]! * c0[1]! + p[3 * c + 2]! * c0[2]!) / l0));
          val[i] = old[i]! + h * dmath.exp(-0.5 * (d / sigma) * (d / sigma));
        }
        break;
      }
      case 'ridge': {
        const noise = new SimplexNoise(((seed * 31 + e.id) | 0) >>> 0), h = num(e, 'height', 2500), rough = num(e, 'roughness', 0.35);
        for (let i = 0; i < m; i++) {
          const c = cells[i]!;
          // w is 1 on the centre line and falls smoothly to 0 at the rim; w² is the cross-section.
          const prof = w[i]! * w[i]!;
          val[i] = old[i]! + h * prof * (1 + rough * noise.noise3D(p[3 * c]! * 24, p[3 * c + 1]! * 24, p[3 * c + 2]! * 24));
        }
        break;
      }
      default: throw new Error(`unknown terrain op: ${e.op}`);
    }
    for (let i = 0; i < m; i++) {
      const c = cells[i]!;
      const v = soft === 1 ? val[i]! : old[i]! + soft * (val[i]! - old[i]!);
      cur[c] = v;
      touched[c] = 1;
    }
  }
  const cells: number[] = [], oldRaw: number[] = [];
  for (let c = 0; c < n; c++) {
    if (!touched[c]) continue;
    const r = Math.fround(metresToRaw(cur[c]!));
    const m2 = Math.fround(rawToMetres(r));
    if (r !== raw[c] || m2 !== elevM[c]) { cells.push(c); oldRaw.push(raw[c]!); raw[c] = r; elevM[c] = m2; }
  }
  return { cells: Int32Array.from(cells), oldRaw: Float32Array.from(oldRaw) };
}

/** Cells an edit pass changed, with their raw elevation before it. */
export interface AppliedEdits { cells: Int32Array; oldRaw: Float32Array }

// orogen's lapse rate (vendor/js/climate-config.js:47-48, vendor/js/temperature.js:875-878): on land the temperature falls by
// (3.5 + 3.4114·(1 − moisture)) °C per km of height, with the cell's normalised precipitation as the moisture proxy; the temperature
// layers are normalised, so the adjustment is divided by the 90 °C range.
const LAPSE_MOIST_C_PER_KM = 3.5, LAPSE_DRY_EXTRA_C_PER_KM = 3.4114;
// The temperature layers are normalised to [0, 1] over a fixed −45 to +45 °C range (vendor/js/temperature.js:789-791, 997).
const T_RANGE_C = 90;
const landKm = (raw: number): number => (raw > 0 ? elevToHeightKm(raw) : 0);

/**
 * The structured pipeline's downscaled temperature is anchored to the reference climate and has no local lapse term, so a
 * raised mountain would stay warm. This returns an adjustment that applies orogen's own lapse rate to the elevation change of
 * the edited cells only (nothing else changes). Pass it to `runClimateDetail`.
 */
export function lapseAdjustment(applied: AppliedEdits, raw: Float32Array): (temp: Float32Array, precip: Float32Array) => void {
  return (temp, precip) => {
    for (let i = 0; i < applied.cells.length; i++) {
      const c = applied.cells[i]!;
      const dh = landKm(raw[c]!) - landKm(applied.oldRaw[i]!);
      if (dh !== 0) temp[c] = Math.max(0, Math.min(1, temp[c]! - ((LAPSE_MOIST_C_PER_KM + LAPSE_DRY_EXTRA_C_PER_KM * (1 - precip[c]!)) * dh) / T_RANGE_C));
    }
  };
}
