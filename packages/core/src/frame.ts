// Canonical frame (ARCHITECTURE §3.1): unit sphere, right-handed.
// +Z = north pole, +X = (0°N, 0°E), +Y = (0°N, 90°E). lat = asin(z), lon = atan2(y, x).
import { dmath } from './dmath';

export const DEG = Math.PI / 180;

export type Vec3 = readonly [number, number, number];

export function lonLatToXyz(lonRad: number, latRad: number): [number, number, number] {
  const c = dmath.cos(latRad);
  return [c * dmath.cos(lonRad), c * dmath.sin(lonRad), dmath.sin(latRad)];
}

export function xyzToLonLat(x: number, y: number, z: number): { lon: number; lat: number } {
  const zc = z > 1 ? 1 : z < -1 ? -1 : z;
  return { lon: dmath.atan2(y, x), lat: dmath.asin(zc) };
}

/** Local east and north unit vectors at (lon, lat). At the poles east is +Y and north is -X / +X (a fixed pair). */
export function eastNorth(lonRad: number, latRad: number): { east: [number, number, number]; north: [number, number, number] } {
  const sl = dmath.sin(lonRad), cl = dmath.cos(lonRad), sp = dmath.sin(latRad), cp = dmath.cos(latRad);
  return { east: [-sl, cl, 0], north: [-sp * cl, -sp * sl, cp] };
}

/**
 * orogen's physics frame has +y north and lon 0 at +z (F1). Fixed cyclic permutation into the canonical frame:
 * X = z_o, Y = x_o, Z = y_o. Cyclic, so handedness is preserved.
 */
export function orogenToCanonical(o: ArrayLike<number>, out: Float64Array | Float32Array = new Float64Array(o.length)): typeof out {
  for (let i = 0; i < o.length; i += 3) {
    out[i] = o[i + 2]!;
    out[i + 1] = o[i]!;
    out[i + 2] = o[i + 1]!;
  }
  return out;
}

export function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
