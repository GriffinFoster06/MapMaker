// Hillshade by QGIS's renderer formula (Phase 5c, decision W4; design note 18 §4).
//
// Provenance: the shading arithmetic is ported from upstream/QGIS/src/core/raster/qgshillshaderenderer.cpp at 901db8d
// (GPL-2.0-or-later), lines 433 to 489 of the CPU path: the single-direction "fast formula" and the weighted four-direction
// formula of USGS OF 92-422 as GDAL DEM has it. Differences, all deliberate:
//   - the 3 × 3 Horn stencil needs a regular grid; this world is a sphere mesh, so the two derivatives ∂z/∂east and ∂z/∂north
//     come from a weighted least-squares plane through a cell and its neighbours in the cell's own tangent plane, distances
//     in sphere metres (design note 18: "cell size in sphere metres"). On a regular grid that plane fit and Horn's stencil
//     agree to first order; the tests pin the formula, not the stencil;
//   - double precision where QGIS casts to float;
//   - the result is returned as a fraction of 255 (QGIS clamps its gray to 0..255 and writes it as a channel).
// QGIS's `lightAngle` is used as the complement of the sun's altitude: its code sets zenith = 90° − lightAngle and puts that
// where the GDAL formula has the altitude (`sin_altRadians_mul_254 = 254 · sin(zenith)`), so a QGIS angle of 45° is 45° and
// a larger angle gives a lower sun. This port keeps QGIS's meaning, so its numbers equal QGIS's for the same settings.
import { type SphereMesh, dmath } from '@mapmaker/core';

export interface HillshadeParams {
  /** Light azimuth, degrees clockwise from north (QGIS default 315). */
  azimuthDeg: number;
  /** QGIS "light angle" (its altitude control, default 45; see the note above). */
  lightAngleDeg: number;
  /** Vertical exaggeration (QGIS z factor, default 1). */
  zFactor: number;
  /** The weighted four-direction shading (225°, 270°, 315°, 360°). */
  multiDirectional: boolean;
}

export const QGIS_HILLSHADE_DEFAULT: HillshadeParams = { azimuthDeg: 315, lightAngleDeg: 45, zFactor: 1, multiDirectional: false };

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The precomputed constants of the renderer (the `*_mul_254` and `*_mul_127` values of qgshillshaderenderer.cpp:151-169). */
function constants(p: HillshadeParams) {
  const zenithRad = Math.max(0, 90 - p.lightAngleDeg) * RAD;
  const azimuthRad = -1 * p.azimuthDeg * RAD;
  const cosZenith = dmath.cos(zenithRad), sinZenith = dmath.sin(zenithRad);
  const cosAltMulZ = cosZenith * p.zFactor;
  return {
    sinAlt254: 254 * sinZenith,
    cosAz254: 254 * dmath.cos(azimuthRad) * cosAltMulZ,
    sinAz254: 254 * dmath.sin(azimuthRad) * cosAltMulZ,
    squareZ: p.zFactor * p.zFactor,
    sinAlt127: 127 * sinZenith,
    // 127 · cos(225°) = −32.87001872802012 in the source
    cos225Az127: -32.87001872802012 * cosAltMulZ,
    cosAlt127: 127 * cosAltMulZ,
  };
}

/**
 * The gray value (0 to 255) QGIS gives a cell whose Horn derivatives are `derX` (∂z/∂east, increasing eastward) and `derY`
 * (∂z/∂north), both in metres per metre.
 */
export function hillshadeGray(derX: number, derY: number, p: HillshadeParams = QGIS_HILLSHADE_DEFAULT): number {
  const c = constants(p);
  if (!p.multiDirectional) {
    // qgshillshaderenderer.cpp:435-440
    return clamp((c.sinAlt254 - (derY * c.cosAz254 - derX * c.sinAz254)) / Math.sqrt(1 + c.squareZ * (derX * derX + derY * derY)), 0, 255);
  }
  // qgshillshaderenderer.cpp:441-472
  const xx = derX * derX, yy = derY * derY, xxPlusYy = xx + yy;
  if (xxPlusYy === 0) return clamp(1 + c.sinAlt254, 0, 255);
  const pos = (v: number) => (v <= 0 ? 0 : v);
  const val225 = pos(c.sinAlt127 + (derX - derY) * c.cos225Az127);
  const val270 = pos(c.sinAlt127 - derX * c.cosAlt127);
  const val315 = pos(c.sinAlt127 + (derX + derY) * c.cos225Az127);
  const val360 = pos(c.sinAlt127 - derY * c.cosAlt127);
  const w225 = 0.5 * xxPlusYy - derX * derY, w270 = xx, w315 = xxPlusYy - w225, w360 = yy;
  const cang127 = ((w225 * val225 + w270 * val270 + w315 * val315 + w360 * val360) / xxPlusYy) / (1 + c.squareZ * xxPlusYy);
  return clamp(1 + cang127, 0, 255);
}

/** The gray value on flat ground (both derivatives 0), the reference a theme divides by to get a brightness factor. */
export const flatGray = (p: HillshadeParams = QGIS_HILLSHADE_DEFAULT): number => hillshadeGray(0, 0, p);

/**
 * ∂z/∂east and ∂z/∂north (metres per metre) at every cell of `mesh` for elevations `elev` (metres), from the plane
 * z = z₀ + gₑ·e + gₙ·n fitted by least squares over the cell's neighbours, weighting each by 1/d² so near neighbours count
 * more (as the inner ring of Horn's stencil does). e and n are metres along the local east and north unit vectors of the
 * canonical frame at the cell (+Z north), at the sphere's radius.
 */
export function cellDerivatives(mesh: SphereMesh, elev: ArrayLike<number>, radius_m: number): { derX: Float32Array; derY: Float32Array } {
  const n = mesh.numRegions, P = mesh.points, off = mesh.adjOffset, adj = mesh.adjList;
  const derX = new Float32Array(n), derY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[3 * i]!, y = P[3 * i + 1]!, z = P[3 * i + 2]!;
    const h = Math.sqrt(x * x + y * y);
    // East = (−y, x, 0)/h, north = (−z·x/h, −z·y/h, h) (at a pole the east direction is arbitrary but fixed: +Y).
    const ex = h > 1e-12 ? -y / h : 0, ey = h > 1e-12 ? x / h : 1, ez = 0;
    const nx = h > 1e-12 ? (-z * x) / h : -z, ny = h > 1e-12 ? (-z * y) / h : 0, nz = h > 1e-12 ? h : 0;
    let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
    for (let k = off[i]!; k < off[i + 1]!; k++) {
      const j = adj[k]!;
      const dx = P[3 * j]! - x, dy = P[3 * j + 1]! - y, dz = P[3 * j + 2]! - z;
      const e = (dx * ex + dy * ey + dz * ez) * radius_m, nn = (dx * nx + dy * ny + dz * nz) * radius_m;
      const w = 1 / (e * e + nn * nn || 1);
      const dh = elev[j]! - elev[i]!;
      sxx += w * e * e; sxy += w * e * nn; syy += w * nn * nn; sxz += w * e * dh; syz += w * nn * dh;
    }
    const det = sxx * syy - sxy * sxy;
    if (Math.abs(det) > 1e-30 * (sxx * syy + 1e-300)) {
      derX[i] = (syy * sxz - sxy * syz) / det;
      derY[i] = (sxx * syz - sxy * sxz) / det;
    }
  }
  return { derX, derY };
}

/**
 * Per-cell hillshade as a fraction of 255. Sea cells (elevation at or below 0) take the flat-ground value, so the ocean is
 * not shaded by the shape of the sea floor unless `seaFlat` is false.
 */
export function cellHillshade(mesh: SphereMesh, elev: ArrayLike<number>, radius_m: number, p: HillshadeParams = QGIS_HILLSHADE_DEFAULT, opts: { seaFlat?: boolean } = {}): Float32Array {
  const { derX, derY } = cellDerivatives(mesh, elev, radius_m);
  const out = new Float32Array(mesh.numRegions), flat = flatGray(p);
  const seaFlat = opts.seaFlat ?? true;
  for (let i = 0; i < out.length; i++) {
    out[i] = (seaFlat && elev[i]! <= 0 ? flat : hillshadeGray(derX[i]!, derY[i]!, p)) / 255;
  }
  return out;
}
