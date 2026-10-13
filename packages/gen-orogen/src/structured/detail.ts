// The detail pass of the structured pipeline (design note 14 §3.4–3.5, Phase 4b M4). Original shell code.
//
// At fidelity N (mesh L1) the detail pass:
//  1. runs orogen's elevation and fast erosion at N through the ports, with the plate partition projected from the
//     same coarse plates and the phasor kernels chosen on L0 (so ridges are the same function of position at every N);
//  2. keeps only the part of that field below the reference scale: D = F − C(R(F)), so R(D) = 0;
//  3. assembles e = P(e_ref) + D, locks the land/sea sign where the reference is firmly land or sea, and anchors
//     e ← e + C(e_ref − R(e)) so that R(e) = e_ref (I1).
// All of this is in orogen's raw elevation units, where structure was decided. Metres (F2) are a pointwise map of the
// result. Anchoring in metres was measured to lose 4–5 points of land fraction: orogen's height map is linear to
// −5 km at sea but quartic near the coast, so cell means in metres are dominated by ocean depth.
import { type Drainage, MinHeap, MultiLevel, type SphereMesh } from '@mapmaker/core';
import { CLIMATE } from '../../vendor/js/climate-config.js';
import type { OrogenParams } from '../params';
import * as port from '../port';
import { computeDetailDampenField, computeOrogenicField, runPostProcessing } from '../orchestration';
import { type OMesh, type OrogenLib, type Scratch, type Tectonics, computeTectonics } from '../scratch';
import type { ReferenceState } from './reference';

const lib = port as unknown as OrogenLib;

/** Sea-level sign floor (raw units): a locked cell is moved at least this far to the reference's side of sea level. */
export const SIGN_LOCK_FLOOR = 1e-4;
/** Rounds of sign lock followed by smooth anchoring, before the exact sign-safe step. */
export const SIGN_LOCK_ROUNDS = 8;

/** orogen raw elevation → metres (F2). */
export const rawToMetres = (e: number): number => port.elevToHeightKm(e) * 1000;

/**
 * Inverse of rawToMetres for the orogen stages that still take raw elevation (Köppen's sea test, lapse terms).
 * Sea: linear. Land: bisection on the monotone quintic, clamped to its 6 km ceiling (raw 1).
 */
export function metresToRaw(m: number): number {
  if (m <= 0) return m / 10000;
  if (m >= 6000) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (rawToMetres(mid) < m) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface ElevationDetail {
  ml: MultiLevel;
  omesh: OMesh;
  r_xyz: Float32Array;
  tect: Tectonics;
  /** orogen's own world at N (raw units), before the reference-scale part is replaced. */
  native: Float64Array;
  /** The sub-reference detail D (raw units), R(D) = 0. */
  detail: Float64Array;
  /** Final elevation, raw units (Float64 and the Float32 layer value) and metres. */
  elevation: Float64Array;
  elevRaw: Float32Array;
  elevation_m: Float32Array;
  stress: Float32Array;
  debug: Record<string, Float32Array>;
  /** Cells whose sign disagrees with a firmly signed reference parent after the last round (diagnostic). */
  signViolations: number;
}

export function runElevationDetail(L1: SphereMesh, ref: ReferenceState, p: OrogenParams): ElevationDetail {
  const omesh = new port.VendorSphereMesh(L1.triangles, L1.halfedges, L1.numRegions) as OMesh;
  const r_xyz = L1.orogenPoints() as Float32Array;
  const s: Scratch = { mesh: omesh, r_xyz, neighborDist: port.computeNeighborDist(omesh, r_xyz) };

  const tect = computeTectonics(s, p, lib);
  const noise = new port.SimplexNoise(p.seed);
  const res = port.assignElevation(omesh, r_xyz, tect.plateIsOcean, tect.r_plate, tect.plateVec, tect.plateSeeds, noise, p.nMag, p.seed, 5,
    tect.plateDensity, tect.superPlateData, tect.r_mantleField, { phasorKernels: ref.structure.phasorKernels });
  const debug = res.debugLayers as Record<string, Float32Array>;
  const F = new Float32Array(res.r_elevation as Float32Array);
  runPostProcessing(omesh, r_xyz, F, p, s.neighborDist, p.seed, debug['hotspot'],
    computeDetailDampenField(debug['cratonWeight'], debug['basinWeight']), computeOrogenicField(debug['orogenicPower']), lib);

  const ml = new MultiLevel(ref.mesh, L1);
  const n1 = L1.numRegions, n0 = ref.mesh.numRegions;
  const native = Float64Array.from(F);
  const refE = Float64Array.from(ref.elevRaw);
  const detail = ml.zeroMeanPerParent(native);

  // Sign lock margin per L0 cell: the largest detail excursion among its children. Where the reference is further
  // from sea level than that, detail alone cannot legitimately flip land and sea (note 14 §3.5).
  const margin = new Float64Array(n0);
  for (let i = 0; i < n1; i++) { const c = ml.parentOf[i]!; margin[c] = Math.max(margin[c]!, Math.abs(detail[i]!)); }
  const locked = (c: number) => ml.childCount[c]! > 0 && Math.abs(refE[c]!) > margin[c]!;

  let e = ml.prolong(refE);
  for (let i = 0; i < n1; i++) e[i]! += detail[i]!;
  let signViolations = 0;
  for (let round = 0; round < SIGN_LOCK_ROUNDS; round++) {
    for (let i = 0; i < n1; i++) {
      const c = ml.parentOf[i]!;
      if (!locked(c)) continue;
      if (refE[c]! > 0 && e[i]! <= 0) e[i] = SIGN_LOCK_FLOOR;
      else if (refE[c]! <= 0 && e[i]! > 0) e[i] = -SIGN_LOCK_FLOOR;
    }
    e = ml.anchorAdditive(e, refE);
  }
  // Lock once more, then remove the remaining residual exactly with a step that cannot cross sea level in locked
  // cells: each parent's residual goes to its children in proportion to how far they can move before reaching the
  // sign floor (unlimited away from sea level). R(e) = e_ref holds again, and no locked cell changes sign.
  for (let i = 0; i < n1; i++) {
    const c = ml.parentOf[i]!;
    if (!locked(c)) continue;
    if (refE[c]! > 0 && e[i]! <= 0) e[i] = SIGN_LOCK_FLOOR;
    else if (refE[c]! <= 0 && e[i]! > 0) e[i] = -SIGN_LOCK_FLOOR;
  }
  {
    const Re = ml.restrict(e);
    const area = L1.cellArea_sr;
    const delta = new Float64Array(n0);
    for (let c = 0; c < n0; c++) if (ml.childCount[c]! > 0) delta[c] = refE[c]! - Re[c]!;
    // Room of each child in the direction of its parent's residual. Unlocked parents: every child moves equally.
    const room = new Float64Array(n1), roomSum = new Float64Array(n0);
    for (let i = 0; i < n1; i++) {
      const c = ml.parentOf[i]!, d = delta[c]!;
      let r = 1;
      if (locked(c)) {
        const land = refE[c]! > 0;
        if (land && d < 0) r = Math.max(0, e[i]! - SIGN_LOCK_FLOOR);
        else if (!land && d > 0) r = Math.max(0, -SIGN_LOCK_FLOOR - e[i]!);
      }
      room[i] = r;
      roomSum[c]! += area[i]! * r;
    }
    for (let i = 0; i < n1; i++) {
      const c = ml.parentOf[i]!;
      if (roomSum[c]! > 0) e[i]! += (delta[c]! * ml.parentArea[c]! * room[i]!) / roomSum[c]!;
    }
  }
  for (let i = 0; i < n1; i++) {
    const c = ml.parentOf[i]!;
    if (locked(c) && (refE[c]! > 0) !== (e[i]! > 0)) signViolations++;
  }

  const elevRaw = Float32Array.from(e);
  const elevation_m = Float32Array.from(elevRaw, rawToMetres);
  return { ml, omesh, r_xyz, tect, native, detail, elevation: e, elevRaw, elevation_m, stress: res.r_stress as Float32Array, debug, signViolations };
}

// ─────────────────────────────────────────────────────────────────────────
//  Climate downscaling (design note 14 §3.6)
// ─────────────────────────────────────────────────────────────────────────

/** orogen's east and north unit vectors at an orogen-frame point (wind.ts: east = norm(z, 0, −x), north = p × east). */
function basis(x: number, y: number, z: number): [number, number, number, number, number, number] {
  let ex = z, ez = -x;
  let elen = Math.sqrt(ex * ex + ez * ez);
  if (elen < 1e-10) { ex = 1; ez = 0; elen = 1; }
  ex /= elen; ez /= elen;
  let nx = -y * ez, ny = z * ex - x * ez, nz = y * ex;
  const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= nlen; ny /= nlen; nz /= nlen;
  return [ex, 0, ez, nx, ny, nz];
}

/**
 * Tangent vector field given by east/north components on L0 → east/north components on L1: rebuilt in 3D, prolonged
 * in the canonical frame (F1: X = z_o, Y = x_o, Z = y_o), re-projected onto each L1 tangent plane.
 */
export function prolongEastNorth(ml: MultiLevel, ref_xyz: ArrayLike<number>, fine_xyz: ArrayLike<number>, east: ArrayLike<number>, north: ArrayLike<number>): [Float32Array, Float32Array] {
  const n0 = ml.n0, n1 = ml.n1;
  const v0 = new Float64Array(3 * n0);
  for (let c = 0; c < n0; c++) {
    const [ex, ey, ez, nx, ny, nz] = basis(ref_xyz[3 * c]!, ref_xyz[3 * c + 1]!, ref_xyz[3 * c + 2]!);
    const vx = east[c]! * ex + north[c]! * nx, vy = east[c]! * ey + north[c]! * ny, vz = east[c]! * ez + north[c]! * nz;
    v0[3 * c] = vz; v0[3 * c + 1] = vx; v0[3 * c + 2] = vy;
  }
  const v1 = ml.prolongVector(v0);
  const outE = new Float32Array(n1), outN = new Float32Array(n1);
  for (let i = 0; i < n1; i++) {
    const vx = v1[3 * i + 1]!, vy = v1[3 * i + 2]!, vz = v1[3 * i]!;
    const [ex, ey, ez, nx, ny, nz] = basis(fine_xyz[3 * i]!, fine_xyz[3 * i + 1]!, fine_xyz[3 * i + 2]!);
    outE[i] = vx * ex + vy * ey + vz * ez;
    outN[i] = vx * nx + vy * ny + vz * nz;
  }
  return [outE, outN];
}

export interface SeasonClimate {
  windEast: Float32Array; windNorth: Float32Array;
  currentEast: Float32Array; currentNorth: Float32Array;
  pressure: Float32Array; temp: Float32Array; precip: Float32Array;
}

export interface ClimateDetail {
  summer: SeasonClimate;
  winter: SeasonClimate;
  westness: Float32Array;
  koppen: Uint8Array;
}

/**
 * Climate at N from the reference climate:
 * - wind, currents and pressure: prolonged (vectors in 3D, re-projected);
 * - temperature: T = P(T_ref) + Γ·(P(h_ref) − h), orogen's moisture-dependent lapse rate Γ (temperature.ts) on land,
 *   then anchored additively so R(T) = T_ref;
 * - precipitation (orogen's 0–1 moisture index): prolonged and anchored multiplicatively (stays ≥ 0, R(P) = P_ref).
 *   The sub-reference orographic term (Smith–Barstad 2004) is not applied yet: Phase 4b M9 decides on it.
 * - Köppen: orogen's classifier per L1 cell from the downscaled fields.
 */
export function runClimateDetail(ref: ReferenceState, d: ElevationDetail): ClimateDetail {
  const { ml } = d;
  const { wind, ocean, precip, temp } = ref.climate;
  const n1 = ml.n1;
  const hRef = ml.prolong(Float64Array.from(ref.elevRaw, (e) => (e > 0 ? port.elevToHeightKm(e) : 0)));
  const season = (name: 'summer' | 'winter'): SeasonClimate => {
    const [windEast, windNorth] = prolongEastNorth(ml, ref.r_xyz, d.r_xyz, wind[`r_wind_east_${name}`], wind[`r_wind_north_${name}`]);
    const [currentEast, currentNorth] = prolongEastNorth(ml, ref.r_xyz, d.r_xyz, ocean[`r_ocean_current_east_${name}`], ocean[`r_ocean_current_north_${name}`]);
    const pressure = Float32Array.from(ml.prolong(wind[`r_pressure_${name}`]));
    const pRef = precip[`r_precip_${name}`];
    const precipN = Float32Array.from(ml.anchorMultiplicative(ml.prolong(pRef), pRef));
    const tRef = temp[`r_temperature_${name}`];
    const t = ml.prolong(tRef);
    for (let i = 0; i < n1; i++) {
      const e = d.elevRaw[i]!;
      if (e <= 0) continue;
      const moisture = precipN[i]!;
      const lapse = CLIMATE.TEMP_MOIST_LAPSE_C_PER_KM + CLIMATE.TEMP_DRY_LAPSE_EXTRA_C_PER_KM * (1 - moisture);
      t[i]! += lapse * (hRef[i]! - port.elevToHeightKm(e));
    }
    const tempN = Float32Array.from(ml.anchorAdditive(t, tRef));
    return { windEast, windNorth, currentEast, currentNorth, pressure, temp: tempN, precip: precipN };
  };
  const summer = season('summer'), winter = season('winter');
  const westness = Float32Array.from(ml.prolong(precip.r_westness));
  const koppen = port.classifyKoppen(d.omesh, d.elevRaw,
    { r_temperature_summer: summer.temp, r_temperature_winter: winter.temp },
    { r_precip_summer: summer.precip, r_precip_winter: winter.precip, r_westness: westness }) as Uint8Array;
  return { summer, winter, westness, koppen };
}

// ─────────────────────────────────────────────────────────────────────────
//  Constrained drainage (design note 14 §3.7)
// ─────────────────────────────────────────────────────────────────────────

export interface DrainageDetail extends Drainage {
  /** L0 major-basin id (the L0 outlet cell) of each L1 land cell's basin; −1 for minor basins and sea. */
  basin: Int32Array;
}

/**
 * Priority flood at N that keeps the major basins decided on L0. A flood front carries the major basin of its outlet's
 * parent; it may enter a cell only if that cell's parent belongs to the same major basin, to no major basin, or to
 * the L0 divide band. Land the constrained flood cannot reach (rare) is then flooded without the constraint.
 */
export function runDrainageDetail(ref: ReferenceState, d: ElevationDetail, L1: SphereMesh): DrainageDetail {
  const { ml, elevRaw: elev } = d;
  const { adjOffset, adjList } = L1;
  const n = elev.length;
  const pBasin = (i: number) => ref.basins.basin[ml.parentOf[i]!]!;
  const pBand = (i: number) => ref.basins.divideBand[ml.parentOf[i]!]! === 1;
  const receiver = new Int32Array(n).fill(-1), outlet = new Int32Array(n).fill(-1), label = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const order = new Int32Array(n);
  let m = 0;
  const heap = new MinHeap(adjList.length + n);
  for (let r = 0; r < n; r++) if (elev[r]! <= 0) seen[r] = 1;
  for (let r = 0; r < n; r++) {
    if (elev[r]! <= 0) continue;
    for (let k = adjOffset[r]!; k < adjOffset[r + 1]!; k++) {
      if (elev[adjList[k]!]! <= 0) { outlet[r] = r; label[r] = pBasin(r); seen[r] = 1; heap.push(elev[r]!, r); break; }
    }
  }
  const allowed = (from: number, to: number) => { const b = pBasin(to); return b === label[from] || b === -1 || pBand(to); };
  const flood = (constrained: boolean) => {
    while (heap.n) {
      const r = heap.pop();
      order[m++] = r;
      for (let k = adjOffset[r]!; k < adjOffset[r + 1]!; k++) {
        const nb = adjList[k]!;
        if (seen[nb] || (constrained && !allowed(r, nb))) continue;
        seen[nb] = 1; outlet[nb] = outlet[r]!; label[nb] = label[r]!; receiver[nb] = r;
        heap.push(Math.max(elev[nb]!, elev[r]!), nb);
      }
    }
  };
  flood(true);
  // Unconstrained completion: unreached land next to a flooded cell joins that cell's basin, then the flood goes on.
  for (let j = 0, mm = m; j < mm; j++) {
    const r = order[j]!;
    for (let k = adjOffset[r]!; k < adjOffset[r + 1]!; k++) {
      const nb = adjList[k]!;
      if (seen[nb]) continue;
      seen[nb] = 1; outlet[nb] = outlet[r]!; label[nb] = label[r]!; receiver[nb] = r;
      heap.push(Math.max(elev[nb]!, elev[r]!), nb);
    }
  }
  flood(false);
  const area = L1.cellArea_sr;
  const drainageArea = new Float64Array(n);
  for (let j = 0; j < m; j++) drainageArea[order[j]!] = area[order[j]!]! * 6371 * 6371;
  for (let j = m - 1; j >= 0; j--) { const r = order[j]!, dn = receiver[r]!; if (dn >= 0) drainageArea[dn]! += drainageArea[r]!; }
  return { receiver, outlet, drainageArea, order: order.slice(0, m), basin: label };
}
