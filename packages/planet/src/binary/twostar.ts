// Original code (Phase 6a M4), written from the geometry of the problem and not ported from any upstream: VPLanet's binary.c
// gives only an orbit-averaged scalar flux (fndFluxApproxBinary :2365) and POISE takes one star (poise.c:5538), so the
// latitude-resolved insolation from two stars is new (ARCHITECTURE.md Phase 6a, design note 20 §3.1; logged in PROVENANCE.md).
//
// The insolation at a point of the surface is, for each star i with luminosity L_i at vector d_i from the planet's centre,
//   S = sum_i  L_i / (4 pi |d_i|^2) * max(0, n . d_i / |d_i|)
// with n the outward surface normal. The daily mean at a latitude is the average of S over one rotation, which also averages
// over longitude, and the stars and the planet keep moving during the day. The planet is treated as a point at the centre of
// the sphere (no atmospheric refraction, no finite stellar discs, no eclipses by the other star or by moons).
import { dmath } from '@mapmaker/core';
import { keplerEccentricAnomaly } from '../poise/insolation.js';

export type Vec3 = readonly [number, number, number];

export interface TwoStarGeometry {
  /** Luminosities of the two stars, W. */
  luminosity: readonly [number, number];
  /** Barycentric positions of the stars at time t (s), m. */
  stars(t: number): readonly [Vec3, Vec3];
  /** Barycentric position of the planet at time t (s), m. */
  planet(t: number): Vec3;
  /** Unit spin axis (north pole) in the same inertial frame. */
  spinAxis: Vec3;
  /** Unit vector in the equatorial plane marking longitude 0 at t = 0 (must be perpendicular to the spin axis). */
  meridian0: Vec3;
  /** Rotation period, s. */
  rotationPeriod: number;
}

/** Barycentric positions of a binary's two stars in its orbital plane (z = 0); `periapsis` is the longitude of pericentre. */
export function binaryStarPositions(
  m0: number, m1: number, semi: number, ecc: number, periapsis: number, meanMotion: number, meanAnomaly0: number, t: number,
): readonly [Vec3, Vec3] {
  const meanA = (((meanMotion * t + meanAnomaly0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = keplerEccentricAnomaly(meanA, ecc);
  const x = semi * (dmath.cos(E) - ecc);
  const y = semi * Math.sqrt(1 - ecc * ecc) * dmath.sin(E);
  const cw = dmath.cos(periapsis);
  const sw = dmath.sin(periapsis);
  const rx = x * cw - y * sw; // separation vector from the primary to the secondary
  const ry = x * sw + y * cw;
  const M = m0 + m1;
  return [[(-m1 / M) * rx, (-m1 / M) * ry, 0], [(m0 / M) * rx, (m0 / M) * ry, 0]];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Instantaneous insolation (W/m^2) at latitude `lat` (rad) and longitude `lon` (rad, east of meridian 0) at time t. */
export function surfaceInsolation(g: TwoStarGeometry, lat: number, lon: number, t: number): number {
  const east = cross(g.spinAxis, g.meridian0);
  const cl = dmath.cos(lat);
  const sl = dmath.sin(lat);
  const cn = dmath.cos(lon);
  const sn = dmath.sin(lon);
  const n: Vec3 = [
    cl * (cn * g.meridian0[0] + sn * east[0]) + sl * g.spinAxis[0],
    cl * (cn * g.meridian0[1] + sn * east[1]) + sl * g.spinAxis[1],
    cl * (cn * g.meridian0[2] + sn * east[2]) + sl * g.spinAxis[2],
  ];
  const p = g.planet(t);
  const s = g.stars(t);
  let total = 0;
  for (let i = 0; i < 2; i++) {
    const dx = s[i]![0] - p[0];
    const dy = s[i]![1] - p[1];
    const dz = s[i]![2] - p[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    const cosZ = (n[0] * dx + n[1] * dy + n[2] * dz) / Math.sqrt(d2);
    if (cosZ > 0) total += (g.luminosity[i]! * cosZ) / (4 * Math.PI * d2);
  }
  return total;
}

/**
 * Daily-mean insolation (W/m^2) at each latitude for the rotation that starts at `t0`. The planet's rotation advances the
 * longitude; `samples` midpoint samples per day (a few hundred keep the sunrise and sunset kinks below 1e-3).
 */
export function dailyInsolationTwoStars(g: TwoStarGeometry, lats: ArrayLike<number>, t0: number, samples = 288): Float64Array {
  const out = new Float64Array(lats.length);
  const dt = g.rotationPeriod / samples;
  for (let k = 0; k < samples; k++) {
    const t = t0 + (k + 0.5) * dt;
    const lon = (2 * Math.PI * (t - 0)) / g.rotationPeriod;
    for (let j = 0; j < lats.length; j++) out[j] = out[j]! + surfaceInsolation(g, lats[j]!, lon, t);
  }
  for (let j = 0; j < lats.length; j++) out[j] = out[j]! / samples;
  return out;
}
