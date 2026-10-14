// Provenance: ported from upstream/orogen/js/plate-physics.js @ cc2662b (GPL-3.0). See PROVENANCE.md.
// Mechanical changes: Math.pow/acos/cos/sin → dmath; types added; unused SimplexNoise/SUPER_PLATE_PHYSICS_MULT imports dropped. Arithmetic and order unchanged.
// Physically-motivated plate motion biasing.
// Modifies Euler poles and angular velocities to reflect slab pull,
// continental drag, ridge push, size-velocity scaling, and mantle flow.

import { dmath } from '@mapmaker/core';
import { makeRng } from './rng';
import type { Xyz } from './types';
import {
  CONTINENTAL_DRAG_FACTOR, OCEAN_DRAG_FACTOR,
  SIZE_VEL_POWER, SIZE_VEL_MIN_FACTOR, SIZE_VEL_MAX_FACTOR,
  MANTLE_CELLS, MANTLE_POLE_BLEND, MANTLE_ROTATION_STRENGTH,
  MANTLE_DOMINANT_STRENGTH, MANTLE_MINOR_STRENGTH,
  MANTLE_SPEED_ALIGN_STRENGTH,
  SLAB_PULL_POLE_BLEND,
  RIDGE_PUSH_POLE_BLEND,
} from '../../vendor/js/terrain-config.js';

export type Vec3 = [number, number, number];

/** plate id → Euler pole (unit vector) and signed angular velocity. */
export interface PlateVec { pole: Vec3; omega: number }

/** Per-plate diagnostics. The optional keys are added (in this order of steps) only when the step applies. */
export interface PlateDebug {
  omegaBefore: number;
  continentalDrag: number;
  sizeVelFactor: number;
  omegaAfter: number;
  mantleAlignment?: number;
  slabPullStrength?: number;
  ridgePushStrength?: number;
}

/** The mesh fields applyPlatePhysics reads (orogen's SphereMesh, coarse or hi-res). */
export interface PhysicsMesh { numRegions: number; adjOffset: ArrayLike<number>; adjList: ArrayLike<number> }

interface MantleCell { pos: Vec3; radialSign: number; rotSign: number; strength: number }

// ── Helpers ──

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function len(a: Vec3): number { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }

function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
}

function scale(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }

function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function velocityAt(pole: Vec3, omega: number, pos: Vec3): Vec3 {
  return scale(cross(pole, pos), omega);
}

/**
 * Bias an Euler pole so that velocity at `centroid` gains alignment with `desiredDir`.
 * Returns the new pole (unit vector). Preserves the rotation sense of omega.
 */
function biasPole(pole: Vec3, omega: number, centroid: Vec3, desiredDir: Vec3, blend: number): Vec3 {
  // Current velocity at centroid
  const vCur = velocityAt(pole, omega, centroid);
  // Blend desired direction into current velocity
  const vTarget = normalize(add(vCur, scale(desiredDir, blend * len(vCur) + 0.01)));
  // Back-solve: pole must be perpendicular to centroid and produce velocity aligned with vTarget
  const candidate = normalize(cross(centroid, vTarget));
  if (len(cross(centroid, vTarget)) < 1e-10) return pole; // degenerate — skip

  // Blend old pole toward candidate
  let newPole = normalize(lerp3(pole, candidate, blend));

  // Preserve rotation direction: if pole flipped, negate it (omega sign stays)
  if (dot(newPole, pole) < 0) {
    newPole = scale(newPole, -1);
  }
  return newPole;
}

// ── Main entry point ──

/**
 * Apply all five physics-based modifications to plateVec (mutated in place).
 * Returns per-plate diagnostic values for debug visualization.
 *
 * @param plateVec - { plateId: { pole: [x,y,z], omega: number } }
 * @param plateSeeds - set of plate seed region IDs
 * @param plateIsOcean - set of plate IDs that are ocean
 * @param r_plate - per-region plate assignment (coarse mesh)
 * @param mesh - coarse mesh { numRegions, adjOffset, adjList }
 * @param r_xyz - coarse mesh positions
 * @param seed
 * @returns {{ plateDebug: Object, mantleField: Float32Array }}
 */
export function applyPlatePhysics(
  plateVec: Record<number, PlateVec>, plateSeeds: Iterable<number>, plateIsOcean: ReadonlySet<number>,
  r_plate: ArrayLike<number>, mesh: PhysicsMesh, r_xyz: Xyz, seed: number, blendMult = 1.0,
): { plateDebug: Record<number, PlateDebug>; mantleField: Float32Array; velDelta: Float32Array } {
  const { numRegions, adjOffset, adjList } = mesh;
  const seedArr = Array.from(plateSeeds);
  const numPlates = seedArr.length;

  // ── Step 1: Compute per-plate areas and centroids ──
  const plateArea: Record<number, number> = {};
  const plateCentroid: Record<number, Vec3> = {};
  for (const pid of seedArr) {
    plateArea[pid] = 0;
    plateCentroid[pid] = [0, 0, 0];
  }
  for (let r = 0; r < numRegions; r++) {
    const pid = r_plate[r]!;
    plateArea[pid]!++;
    plateCentroid[pid]![0] += r_xyz[3 * r]!;
    plateCentroid[pid]![1] += r_xyz[3 * r + 1]!;
    plateCentroid[pid]![2] += r_xyz[3 * r + 2]!;
  }
  for (const pid of seedArr) {
    const a = plateArea[pid] || 1;
    plateCentroid[pid] = normalize([
      plateCentroid[pid]![0] / a,
      plateCentroid[pid]![1] / a,
      plateCentroid[pid]![2] / a,
    ]);
  }
  const avgArea = numRegions / numPlates;

  // ── Step 2: Build boundary catalog ──
  // For each plate pair, collect boundary midpoints and classify
  const boundaryPoints: Record<string, Vec3[]> = {};  // key "pidA:pidB" → [positions...]
  for (let r = 0; r < numRegions; r++) {
    const pidA = r_plate[r]!;
    for (let ni = adjOffset[r]!, niEnd = adjOffset[r + 1]!; ni < niEnd; ni++) {
      const nb = adjList[ni]!;
      const pidB = r_plate[nb]!;
      if (pidA >= pidB) continue; // avoid duplicates
      if (pidA === pidB) continue;
      const key = pidA + ':' + pidB;
      if (!boundaryPoints[key]) boundaryPoints[key] = [];
      boundaryPoints[key]!.push([
        (r_xyz[3 * r]! + r_xyz[3 * nb]!) * 0.5,
        (r_xyz[3 * r + 1]! + r_xyz[3 * nb + 1]!) * 0.5,
        (r_xyz[3 * r + 2]! + r_xyz[3 * nb + 2]!) * 0.5,
      ]);
    }
  }

  // Per-plate diagnostic values
  const plateDebug: Record<number, PlateDebug> = {};
  // Store original velocity per region for before/after comparison
  const velBefore = new Float32Array(numRegions * 3);
  for (let r = 0; r < numRegions; r++) {
    const pid = r_plate[r]!;
    const pv = plateVec[pid]!;
    const x = r_xyz[3 * r]!, y = r_xyz[3 * r + 1]!, z = r_xyz[3 * r + 2]!;
    const v = velocityAt(pv.pole, pv.omega, [x, y, z]);
    velBefore[3 * r] = v[0]; velBefore[3 * r + 1] = v[1]; velBefore[3 * r + 2] = v[2];
  }
  for (const pid of seedArr) {
    plateDebug[pid] = {
      omegaBefore: Math.abs(plateVec[pid]!.omega),
      continentalDrag: 1.0,
      sizeVelFactor: 1.0,
      omegaAfter: 0,
    };
  }

  // Compute mean and stddev of land plate areas for continental drag scaling
  const landAreas: number[] = [];
  for (const pid of seedArr) {
    if (!plateIsOcean.has(pid)) landAreas.push(plateArea[pid]!);
  }
  let landMean = 0, landStdDev = 1;
  if (landAreas.length > 0) {
    landMean = landAreas.reduce((a, b) => a + b, 0) / landAreas.length;
    const variance = landAreas.reduce((s, a) => s + (a - landMean) * (a - landMean), 0) / landAreas.length;
    landStdDev = Math.sqrt(variance) || 1;
  }

  // ── Step 3: Omega scaling — continental drag + size-velocity ──
  for (const pid of seedArr) {
    // Continental drag: land plates smaller than the land-plate mean get
    // reduced drag (faster movement).  Measured in standard deviations
    // below the land-plate mean so it adapts to the planet's plate distribution.
    let dragFactor: number;
    if (plateIsOcean.has(pid)) {
      dragFactor = OCEAN_DRAG_FACTOR;
    } else {
      // How many stddevs below the land-plate mean (0 = average, 2 = very small)
      const sigmasBelow = Math.max(0, (landMean - plateArea[pid]!) / landStdDev);
      // Smoothly ramp from full drag (0 sigmas) toward ocean speed (2+ sigmas)
      const t = Math.min(1.0, sigmasBelow / 2.0);
      dragFactor = CONTINENTAL_DRAG_FACTOR + (OCEAN_DRAG_FACTOR - CONTINENTAL_DRAG_FACTOR) * t;
    }
    plateDebug[pid]!.continentalDrag = dragFactor;

    // Size-velocity: smaller plates move faster (independent of ocean/land)
    const relArea = plateArea[pid]! / avgArea;
    const sizeFactor = Math.min(SIZE_VEL_MAX_FACTOR,
      Math.max(SIZE_VEL_MIN_FACTOR, 1.0 / dmath.pow(relArea, SIZE_VEL_POWER)));
    plateDebug[pid]!.sizeVelFactor = sizeFactor;

    plateVec[pid]!.omega *= dragFactor * sizeFactor;
  }

  // ── Step 4: Mantle flow field ──
  // Place convection cells based on plate boundary geometry:
  //   - Downwelling cells at convergent boundary clusters (subduction zones)
  //   - Upwelling cells at positions farthest from downwellings (gaps)
  const mantleRng = makeRng(seed + 9999);

  // Collect all convergent boundary midpoints (using pre-physics velocities)
  const convPoints: Vec3[] = [];
  for (const key of Object.keys(boundaryPoints)) {
    const [pidAStr, pidBStr] = key.split(':');
    const pidA = +pidAStr!, pidB = +pidBStr!;
    const points = boundaryPoints[key]!;
    let convCount = 0;
    for (const pt of points) {
      const vA = velocityAt(plateVec[pidA]!.pole, plateVec[pidA]!.omega, pt);
      const vB = velocityAt(plateVec[pidB]!.pole, plateVec[pidB]!.omega, pt);
      const vRel = sub(vA, vB);
      const normal = normalize(sub(plateCentroid[pidB]!, plateCentroid[pidA]!));
      if (-dot(vRel, normal) > 0.05) convCount++;
    }
    // If majority convergent, include all boundary midpoints
    if (convCount > points.length * 0.4) {
      for (const pt of points) convPoints.push(pt);
    }
  }

  // Minimum angular separation between any two cells.
  // 1 - cos(angle) proxy; ~0.6 corresponds to ~60° separation.
  const MIN_CELL_SEP = 0.6;

  // Helper: check if a candidate is far enough from all placed cells (unused upstream; kept verbatim)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function isFarEnough(pt: Vec3, placed: Vec3[]): boolean {
    const npt = normalize(pt);
    for (const c of placed) {
      if (1 - dot(npt, c) < MIN_CELL_SEP) return false;
    }
    return true;
  }

  // Cluster convergent points into downwelling cells using farthest-point sampling
  const numDown = Math.min(Math.ceil(MANTLE_CELLS / 2), convPoints.length);
  const numUp = MANTLE_CELLS - numDown;
  const mantleCenters: MantleCell[] = [];
  const placedPositions: Vec3[] = []; // normalized positions of all placed cells

  if (convPoints.length > 0) {
    // Seed first downwelling from a random convergent point
    const first = normalize(convPoints[Math.floor(mantleRng() * convPoints.length)]!);
    placedPositions.push(first);

    // Farthest-point sampling for remaining downwelling centers,
    // rejecting candidates too close to already-placed cells
    for (let i = 1; i < numDown; i++) {
      let bestDist = -1, bestPt: Vec3 | null = null;
      for (const pt of convPoints) {
        const npt = normalize(pt);
        let minDist = Infinity;
        for (const dc of placedPositions) {
          const d = 1 - dot(npt, dc);
          if (d < minDist) minDist = d;
        }
        if (minDist >= MIN_CELL_SEP && minDist > bestDist) {
          bestDist = minDist; bestPt = npt;
        }
      }
      if (bestPt) placedPositions.push(bestPt);
    }

    for (let i = 0; i < placedPositions.length; i++) {
      const rotSign = (mantleRng() < 0.5) ? 1 : -1;
      // First downwelling is the dominant one
      const str = (i === 0) ? MANTLE_DOMINANT_STRENGTH : MANTLE_MINOR_STRENGTH;
      mantleCenters.push({ pos: placedPositions[i]!, radialSign: -1, rotSign, strength: str });
    }
  }

  // Place upwelling cells at positions farthest from all existing cells,
  // enforcing the same minimum separation.
  {
    const stride = Math.max(1, Math.floor(numRegions / 400));
    const candidates: Vec3[] = [];
    for (let r = 0; r < numRegions; r += stride) {
      candidates.push(normalize([r_xyz[3*r]!, r_xyz[3*r+1]!, r_xyz[3*r+2]!]));
    }

    for (let i = 0; i < numUp; i++) {
      let bestDist = -1, bestPt: Vec3 | null = null;
      for (const pt of candidates) {
        let minDist = Infinity;
        for (const c of placedPositions) {
          const d = 1 - dot(pt, c);
          if (d < minDist) minDist = d;
        }
        if (minDist >= MIN_CELL_SEP && minDist > bestDist) {
          bestDist = minDist; bestPt = pt;
        }
      }
      // If no candidate meets separation, take the farthest anyway
      if (!bestPt) {
        for (const pt of candidates) {
          let minDist = Infinity;
          for (const c of placedPositions) {
            const d = 1 - dot(pt, c);
            if (d < minDist) minDist = d;
          }
          if (minDist > bestDist) { bestDist = minDist; bestPt = pt; }
        }
      }
      if (bestPt) {
        placedPositions.push(bestPt);
        const rotSign = (mantleRng() < 0.5) ? 1 : -1;
        // First upwelling is the dominant one
        const str = (i === 0) ? MANTLE_DOMINANT_STRENGTH : MANTLE_MINOR_STRENGTH;
        mantleCenters.push({ pos: bestPt, radialSign: 1, rotSign, strength: str });
      }
    }
  }

  // Fallback: if no convergent boundaries found, place cells randomly
  if (mantleCenters.length === 0) {
    for (let i = 0; i < MANTLE_CELLS; i++) {
      const theta = mantleRng() * 2 * Math.PI;
      const cosP = 2 * mantleRng() - 1;
      const sinP = Math.sqrt(1 - cosP * cosP);
      const pos: Vec3 = [sinP * dmath.cos(theta), sinP * dmath.sin(theta), cosP];
      const radialSign = (i % 2 === 0) ? 1 : -1;
      const rotSign = (mantleRng() < 0.5) ? 1 : -1;
      const str = (i < 2) ? MANTLE_DOMINANT_STRENGTH : MANTLE_MINOR_STRENGTH;
      mantleCenters.push({ pos, radialSign, rotSign, strength: str });
    }
  }

  // Compute per-region mantle flow vector (tangent to sphere)
  const mantleField = new Float32Array(numRegions); // scalar magnitude for debug
  const plateMantleFlow: Record<number, Vec3> = {};
  for (const pid of seedArr) plateMantleFlow[pid] = [0, 0, 0];

  for (let r = 0; r < numRegions; r++) {
    const px = r_xyz[3 * r]!, py = r_xyz[3 * r + 1]!, pz = r_xyz[3 * r + 2]!;
    const pos: Vec3 = [px, py, pz];
    let flowX = 0, flowY = 0, flowZ = 0;

    for (const cell of mantleCenters) {
      // Radial direction: great-circle tangent from pos toward cell center
      const cp = cross(cross(pos, cell.pos), pos);
      const cpLen = len(cp);
      if (cpLen < 1e-10) continue;

      // Angular distance
      const cosAngle = dot(pos, cell.pos);
      const angle = dmath.acos(Math.max(-1, Math.min(1, cosAngle)));
      if (angle < 1e-6) continue;

      const radialX = cp[0] / cpLen, radialY = cp[1] / cpLen, radialZ = cp[2] / cpLen;

      // Rotational direction: perpendicular to radial on the sphere surface
      // tangential = cross(surfaceNormal, radialDir)
      const tanX = py * radialZ - pz * radialY;
      const tanY = pz * radialX - px * radialZ;
      const tanZ = px * radialY - py * radialX;
      const tanLen = Math.sqrt(tanX * tanX + tanY * tanY + tanZ * tanZ);
      if (tanLen < 1e-10) continue;

      // Strength falls off with distance, scaled by cell magnitude
      const strength = cell.strength / (0.5 + angle * angle);
      const radialStr = cell.radialSign * strength;
      const rotStr = cell.rotSign * MANTLE_ROTATION_STRENGTH * strength;

      flowX += radialX * radialStr + (tanX / tanLen) * rotStr;
      flowY += radialY * radialStr + (tanY / tanLen) * rotStr;
      flowZ += radialZ * radialStr + (tanZ / tanLen) * rotStr;
    }

    const flowMag = Math.sqrt(flowX * flowX + flowY * flowY + flowZ * flowZ);

    // Signed mantle field: positive = net upwelling (push away, red),
    // negative = net downwelling (pull toward, blue).
    // Determine dominant radial sign by summing weighted radial contributions.
    let radialSum = 0;
    for (const cell of mantleCenters) {
      const cosAngle = dot(pos, cell.pos);
      const angle = dmath.acos(Math.max(-1, Math.min(1, cosAngle)));
      if (angle < 1e-6) continue;
      radialSum += cell.radialSign * cell.strength / (0.5 + angle * angle);
    }
    mantleField[r] = flowMag * Math.sign(radialSum);

    // Accumulate per-plate
    const pid = r_plate[r]!;
    plateMantleFlow[pid]![0] += flowX;
    plateMantleFlow[pid]![1] += flowY;
    plateMantleFlow[pid]![2] += flowZ;
  }

  // Apply mantle flow pole bias per plate
  for (const pid of seedArr) {
    const flow = plateMantleFlow[pid]!;
    const flowLen = len(flow);
    if (flowLen < 1e-10) continue;
    const flowDir = normalize(flow);
    const centroid = plateCentroid[pid]!;

    // Project flow onto tangent plane at centroid
    const d = dot(flowDir, centroid);
    const tangent = normalize(sub(flowDir, scale(centroid, d)));
    if (len(sub(flowDir, scale(centroid, d))) < 1e-10) continue;

    plateVec[pid]!.pole = biasPole(
      plateVec[pid]!.pole, plateVec[pid]!.omega,
      centroid, tangent, Math.min(0.9, MANTLE_POLE_BLEND * blendMult)
    );
    plateDebug[pid]!.mantleAlignment = dot(
      normalize(velocityAt(plateVec[pid]!.pole, plateVec[pid]!.omega, centroid)),
      tangent
    );
  }

  // ── Step 4b: Plate speed modulation by flow alignment ──
  // Plates moving with the mantle flow get a speed boost
  for (const pid of seedArr) {
    const flow = plateMantleFlow[pid]!;
    const flowLen = len(flow);
    if (flowLen < 1e-10) continue;
    const centroid = plateCentroid[pid]!;
    const vel = velocityAt(plateVec[pid]!.pole, plateVec[pid]!.omega, centroid);
    const velLen = len(vel);
    if (velLen < 1e-10) continue;
    // Project flow onto tangent plane at centroid
    const d = dot(flow, centroid);
    const tangentFlow = sub(flow, scale(centroid, d));
    const tfLen = len(tangentFlow);
    if (tfLen < 1e-10) continue;
    const alignment = dot(normalize(vel), normalize(tangentFlow)); // [-1, +1]
    // Only boost when aligned; no penalty for counter-flow
    const speedMult = 1.0 + MANTLE_SPEED_ALIGN_STRENGTH * Math.max(0, alignment);
    plateVec[pid]!.omega *= speedMult;
  }

  // ── Step 5: Classify boundaries with updated velocities ──
  // For each plate pair, compute relative velocity at boundary midpoints
  // and identify convergent (slab pull) and divergent (ridge push) segments
  const plateConvergentBdry: Record<number, Vec3[]> = {};   // pid → [boundary midpoint positions toward subduction]
  const plateDivergentBdry: Record<number, Vec3[]> = {};    // pid → [boundary midpoint positions away from ridge]
  for (const pid of seedArr) {
    plateConvergentBdry[pid] = [];
    plateDivergentBdry[pid] = [];
  }

  for (const key of Object.keys(boundaryPoints)) {
    const [pidAStr, pidBStr] = key.split(':');
    const pidA = +pidAStr!, pidB = +pidBStr!;
    const points = boundaryPoints[key]!;

    // Sample relative velocity at boundary midpoints
    let convCount = 0, divCount = 0;
    let convCenterA: Vec3 = [0, 0, 0], convCenterB: Vec3 = [0, 0, 0];
    let divCenter: Vec3 = [0, 0, 0];

    for (const pt of points) {
      const vA = velocityAt(plateVec[pidA]!.pole, plateVec[pidA]!.omega, pt);
      const vB = velocityAt(plateVec[pidB]!.pole, plateVec[pidB]!.omega, pt);
      const vRel = sub(vA, vB);
      // Normal: direction from A centroid to B centroid at this point
      const normal = normalize(sub(plateCentroid[pidB]!, plateCentroid[pidA]!));
      const convergence = -dot(vRel, normal); // positive = converging

      if (convergence > 0.05) {
        convCount++;
        convCenterA = add(convCenterA, pt);
        convCenterB = add(convCenterB, pt);
      } else if (convergence < -0.05) {
        divCount++;
        divCenter = add(divCenter, pt);
      }
    }

    // Slab pull: oceanic plate converging toward another plate
    if (convCount > points.length * 0.3) {
      const center = scale(convCenterA, 1 / convCount);
      // Only oceanic plates get slab pull
      if (plateIsOcean.has(pidA)) plateConvergentBdry[pidA]!.push(center);
      if (plateIsOcean.has(pidB)) plateDivergentBdry[pidB]!.push(center);
    }

    // Ridge push: plates diverging
    if (divCount > points.length * 0.3) {
      const center = scale(divCenter, 1 / divCount);
      plateDivergentBdry[pidA]!.push(center);
      plateDivergentBdry[pidB]!.push(center);
    }
  }

  // ── Step 6: Apply slab pull pole bias ──
  for (const pid of seedArr) {
    if (!plateIsOcean.has(pid)) continue;
    const convPts = plateConvergentBdry[pid]!;
    if (convPts.length === 0) continue;

    // Average convergent boundary position
    let cx = 0, cy = 0, cz = 0;
    for (const pt of convPts) { cx += pt[0]; cy += pt[1]; cz += pt[2]; }
    const convCenter = normalize([cx / convPts.length, cy / convPts.length, cz / convPts.length]);

    // Direction: from centroid toward convergent boundary (plate should move toward subduction)
    const centroid = plateCentroid[pid]!;
    const pullDir = normalize(sub(convCenter, centroid));
    // Project onto tangent plane at centroid
    const d = dot(pullDir, centroid);
    const tangentPull = normalize(sub(pullDir, scale(centroid, d)));
    if (len(sub(pullDir, scale(centroid, d))) < 1e-10) continue;

    plateVec[pid]!.pole = biasPole(
      plateVec[pid]!.pole, plateVec[pid]!.omega,
      centroid, tangentPull, Math.min(0.9, SLAB_PULL_POLE_BLEND * blendMult)
    );
    plateDebug[pid]!.slabPullStrength = SLAB_PULL_POLE_BLEND;
  }

  // ── Step 7: Apply ridge push pole bias ──
  for (const pid of seedArr) {
    const divPts = plateDivergentBdry[pid]!;
    if (divPts.length === 0) continue;

    // Average divergent boundary position
    let dx = 0, dy = 0, dz = 0;
    for (const pt of divPts) { dx += pt[0]; dy += pt[1]; dz += pt[2]; }
    const divCenter = normalize([dx / divPts.length, dy / divPts.length, dz / divPts.length]);

    // Direction: from ridge toward centroid (plate pushed away from ridge)
    const centroid = plateCentroid[pid]!;
    const pushDir = normalize(sub(centroid, divCenter));
    // Project onto tangent plane
    const d = dot(pushDir, centroid);
    const tangentPush = normalize(sub(pushDir, scale(centroid, d)));
    if (len(sub(pushDir, scale(centroid, d))) < 1e-10) continue;

    plateVec[pid]!.pole = biasPole(
      plateVec[pid]!.pole, plateVec[pid]!.omega,
      centroid, tangentPush, Math.min(0.9, RIDGE_PUSH_POLE_BLEND * blendMult)
    );
    plateDebug[pid]!.ridgePushStrength = RIDGE_PUSH_POLE_BLEND;
  }

  // ── Step 8: Normalize all poles ──
  for (const pid of seedArr) {
    plateVec[pid]!.pole = normalize(plateVec[pid]!.pole);
    plateDebug[pid]!.omegaAfter = Math.abs(plateVec[pid]!.omega);
  }

  // ── Step 9: Compute per-region velocity change for debug ──
  // Compare velocity at each region before vs. after all modifications
  const velDelta = new Float32Array(numRegions); // magnitude of velocity change
  for (let r = 0; r < numRegions; r++) {
    const pid = r_plate[r]!;
    const pv = plateVec[pid]!;
    const x = r_xyz[3 * r]!, y = r_xyz[3 * r + 1]!, z = r_xyz[3 * r + 2]!;
    const vAfter = velocityAt(pv.pole, pv.omega, [x, y, z]);
    const dx = vAfter[0] - velBefore[3 * r]!;
    const dy = vAfter[1] - velBefore[3 * r + 1]!;
    const dz = vAfter[2] - velBefore[3 * r + 2]!;
    velDelta[r] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return { plateDebug, mantleField, velDelta };
}

/**
 * Expand per-plate diagnostic values to per-region arrays for debug visualization.
 * Works on the hi-res mesh using r_plate to look up each region's plate.
 *
 * @param plateDebug - per-plate diagnostic values
 * @param mantleFieldCoarse - per-coarse-region mantle flow magnitude
 * @param velDelta - per-coarse-region total velocity change magnitude
 * @param r_plate - hi-res per-region plate assignment
 * @param numRegions - hi-res region count
 * @param coarse_r_plate - coarse per-region plate assignment
 * @param coarseNumRegions - coarse region count
 */
export function expandPlatePhysicsDebug(
  plateDebug: Record<number, PlateDebug>, mantleFieldCoarse: ArrayLike<number>, velDelta: ArrayLike<number>,
  r_plate: ArrayLike<number>, numRegions: number, coarse_r_plate: ArrayLike<number>, coarseNumRegions: number,
): {
  dl_continentalDrag: Float32Array; dl_sizeVelocity: Float32Array; dl_plateSpeed: Float32Array;
  dl_velChange: Float32Array; dl_mantleFlow: Float32Array;
} {
  const dl_continentalDrag = new Float32Array(numRegions);
  const dl_sizeVelocity = new Float32Array(numRegions);
  const dl_plateSpeed = new Float32Array(numRegions);    // combined omega after all mods
  const dl_velChange = new Float32Array(numRegions);     // total velocity change magnitude
  const dl_mantleFlow = new Float32Array(numRegions);

  // Per-plate values → per-region (hi-res)
  for (let r = 0; r < numRegions; r++) {
    const pid = r_plate[r]!;
    const d = plateDebug[pid];
    if (!d) continue;
    dl_continentalDrag[r] = d.continentalDrag;
    dl_sizeVelocity[r] = d.sizeVelFactor;
    dl_plateSpeed[r] = d.omegaAfter;
  }

  // Mantle flow and velocity delta are per-coarse-region — average per plate
  const plateMantleAvg: Record<string, number> = {};
  const plateVelDeltaMax: Record<string, number> = {};
  const plateMantleCount: Record<string, number> = {};
  for (let r = 0; r < coarseNumRegions; r++) {
    const pid = coarse_r_plate[r]!;
    if (!plateMantleAvg[pid]) {
      plateMantleAvg[pid] = 0;
      plateVelDeltaMax[pid] = 0;
      plateMantleCount[pid] = 0;
    }
    plateMantleAvg[pid]! += mantleFieldCoarse[r]!;
    if (velDelta[r]! > plateVelDeltaMax[pid]!) plateVelDeltaMax[pid] = velDelta[r]!;
    plateMantleCount[pid]!++;
  }
  for (const pid of Object.keys(plateMantleAvg)) {
    plateMantleAvg[pid]! /= plateMantleCount[pid] || 1;
  }
  for (let r = 0; r < numRegions; r++) {
    const pid = r_plate[r]!;
    dl_mantleFlow[r] = plateMantleAvg[pid] || 0;
    dl_velChange[r] = plateVelDeltaMax[pid] || 0;
  }

  return { dl_continentalDrag, dl_sizeVelocity, dl_plateSpeed, dl_velChange, dl_mantleFlow };
}
