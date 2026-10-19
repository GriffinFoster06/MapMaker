// Projection registry (ARCHITECTURE §3.7). Original shell code; the projections themselves are d3-geo 3.1.1 and
// d3-geo-projection 4.0.0, used unmodified (PROVENANCE.md, runtime dependencies).
//
// Each entry declares how its *raw* projection behaves at the raw poles, φ = ±90° in the frame after the view's
// rotation (§3.7 "Evaluation at and near the poles"):
//   point     differentiable at the pole (azimuthals, orthographic, stereographic);
//   line      the pole maps to a segment (cylindrical and pseudocylindrical with a pole line);
//   cusp      the pole maps to a point at which meridians arrive at different angles (Mollweide, sinusoidal, Hammer);
//   excluded  the pole is outside the domain (Mercator and transverse Mercator beyond |φ| ≈ 85.05°).
// Unrotated, the raw poles are the geographic poles; rotation moves them, and the rules follow the raw poles.
import {
  type GeoProjection, type GeoRawProjection,
  geoAzimuthalEqualArea, geoAzimuthalEqualAreaRaw, geoAzimuthalEquidistant, geoAzimuthalEquidistantRaw, geoEqualEarth,
  geoEqualEarthRaw, geoEquirectangular, geoEquirectangularRaw, geoGnomonic, geoGnomonicRaw, geoMercator, geoMercatorRaw,
  geoNaturalEarth1, geoNaturalEarth1Raw, geoOrthographic, geoOrthographicRaw, geoStereographic, geoStereographicRaw,
  geoTransverseMercator, geoTransverseMercatorRaw,
} from 'd3-geo';
import {
  geoEckert4, geoEckert4Raw, geoHammer, geoHammerRaw, geoMollweide, geoMollweideRaw, geoRobinson, geoRobinsonRaw,
  geoSinusoidal, geoSinusoidalRaw, geoWinkel3, geoWinkel3Raw,
} from 'd3-geo-projection';
import { dmath } from '@mapmaker/core';

export type PoleClass = 'point' | 'line' | 'cusp' | 'excluded';

export interface ProjectionSpec {
  id: string;
  label: string;
  /** A fresh d3 projection with d3's defaults (scale, clip angle, built-in rotation). */
  create: () => GeoProjection;
  /** The raw projection on the unit sphere, radians in, y up. */
  raw: GeoRawProjection;
  poleClass: PoleClass;
  /** Equal-area: the areal scale is 1 everywhere it is defined, including its limit at the poles. */
  equalArea?: boolean;
  /** Conformal: the maximum angular deformation is 0 wherever it is defined. */
  conformal?: boolean;
  /** Excluded class: the raw latitude beyond which the domain ends (radians). */
  maxRawLat?: number;
  /**
   * The rotation the d3 projection applies before its raw projection, given what projection.rotate() reports.
   * Transverse Mercator adds 90° to γ internally and reports it without (d3-geo src/projection/transverseMercator.js).
   */
  rawRotation?: (reported: [number, number, number]) => [number, number, number];
  /** Exact limits at a raw pole along any meridian, where they have closed forms (line and cusp classes). */
  poleLimit?: { h?: number; k?: number };
  /**
   * Factor that makes d3's raw projection true to the projection's published definition on the unit sphere (default
   * 1). d3's stereographic raw is half the true-scale formula (its default scale 250 compensates); d3's Robinson raw
   * omits Robinson's 0.8487 (its y table is pre-multiplied by 1.3523/0.8487, d3-geo-projection src/robinson.js).
   */
  rawScale?: number;
  /** One of the GPU shader projections (Phase 5 M4); the rest use the CPU path at reduced resolution. */
  gpu?: boolean;
}

/** Mercator's latitude limit, where its square map ends: atan(sinh π) ≈ 85.0511°. */
export const MERCATOR_MAX_LAT = dmath.atan(dmath.sinh(Math.PI));

const spec = (s: ProjectionSpec) => s;

export const PROJECTIONS: readonly ProjectionSpec[] = [
  spec({ id: 'equirectangular', label: 'Equirectangular', create: geoEquirectangular, raw: geoEquirectangularRaw, poleClass: 'line', poleLimit: { h: 1, k: Infinity }, gpu: true }),
  spec({ id: 'mercator', label: 'Mercator', create: geoMercator, raw: geoMercatorRaw, poleClass: 'excluded', conformal: true, maxRawLat: MERCATOR_MAX_LAT, gpu: true }),
  spec({
    id: 'transverseMercator', label: 'Transverse Mercator', create: geoTransverseMercator, raw: geoTransverseMercatorRaw, poleClass: 'excluded',
    conformal: true, maxRawLat: MERCATOR_MAX_LAT, rawRotation: ([a, b, c]) => [a, b, c + 90],
  }),
  spec({ id: 'equalEarth', label: 'Equal Earth', create: geoEqualEarth, raw: geoEqualEarthRaw, poleClass: 'line', equalArea: true, gpu: true }),
  spec({ id: 'naturalEarth1', label: 'Natural Earth', create: geoNaturalEarth1, raw: geoNaturalEarth1Raw, poleClass: 'line', gpu: true }),
  spec({ id: 'robinson', label: 'Robinson', create: geoRobinson, raw: geoRobinsonRaw, poleClass: 'line', rawScale: 0.8487, gpu: true }),
  spec({ id: 'winkel3', label: 'Winkel tripel', create: geoWinkel3, raw: geoWinkel3Raw, poleClass: 'line' }),
  spec({ id: 'eckert4', label: 'Eckert IV', create: geoEckert4, raw: geoEckert4Raw, poleClass: 'line', equalArea: true }),
  spec({ id: 'mollweide', label: 'Mollweide', create: geoMollweide, raw: geoMollweideRaw, poleClass: 'cusp', equalArea: true, gpu: true }),
  spec({ id: 'sinusoidal', label: 'Sinusoidal', create: geoSinusoidal, raw: geoSinusoidalRaw, poleClass: 'cusp', equalArea: true }),
  spec({ id: 'hammer', label: 'Hammer', create: geoHammer, raw: geoHammerRaw(2), poleClass: 'cusp', equalArea: true }),
  spec({ id: 'orthographic', label: 'Orthographic', create: geoOrthographic, raw: geoOrthographicRaw, poleClass: 'point', gpu: true }),
  spec({ id: 'stereographic', label: 'Stereographic', create: geoStereographic, raw: geoStereographicRaw, poleClass: 'point', conformal: true, rawScale: 2, gpu: true }),
  spec({ id: 'azimuthalEqualArea', label: 'Azimuthal equal-area', create: geoAzimuthalEqualArea, raw: geoAzimuthalEqualAreaRaw, poleClass: 'point', equalArea: true, gpu: true }),
  spec({ id: 'azimuthalEquidistant', label: 'Azimuthal equidistant', create: geoAzimuthalEquidistant, raw: geoAzimuthalEquidistantRaw, poleClass: 'point', gpu: true }),
  spec({ id: 'gnomonic', label: 'Gnomonic', create: geoGnomonic, raw: geoGnomonicRaw, poleClass: 'point' }),
];

export function projectionSpec(id: string): ProjectionSpec {
  const s = PROJECTIONS.find((p) => p.id === id);
  if (!s) throw new Error(`unknown projection: ${id}`);
  return s;
}
