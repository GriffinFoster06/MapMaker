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
import type { GeoProjection, GeoRawProjection } from 'd3-geo';
import * as d3geo from 'd3-geo';
import * as d3proj from 'd3-geo-projection';
import { dmath } from '@mapmaker/core';

export type PoleClass = 'point' | 'line' | 'cusp' | 'excluded';

/** The d3 modules a registry is built from: the stock packages, or the dmath-backed copies of the exact path (exact.ts). */
export interface D3Modules {
  geo: typeof d3geo;
  proj: typeof d3proj;
}

export interface ProjectionSpec {
  id: string;
  label: string;
  /** The d3 modules `create` and `raw` come from; the view takes its rotation and distance from the same ones. */
  d3: D3Modules;
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
  /**
   * Conic projections (Phase 5c): the two standard parallels (degrees) are a view parameter. `rawAt` is the raw
   * projection for a pair, in radians (`raw` is `rawAt` at the default pair). `bounded: false` means the map is
   * unbounded on the side away from the apex (Lambert conformal): the view cuts it `cutDeg` degrees short of that pole.
   */
  conic?: { defaultParallels: [number, number]; rawAt: (phi0: number, phi1: number) => GeoRawProjection; bounded: boolean; cutDeg?: number };
}

/** Mercator's latitude limit, where its square map ends: atan(sinh π) ≈ 85.0511°. */
export const MERCATOR_MAX_LAT = dmath.atan(dmath.sinh(Math.PI));

const RAD = Math.PI / 180;
/** Default standard parallels of the conics, degrees. */
export const CONIC_DEFAULT: [number, number] = [30, 60];
/** The Lambert conformal conic's pole opposite the apex is at infinity; the map stops this many degrees short of it. */
export const LCC_CUT_DEG = 30;

/** The registry over a set of d3 modules. */
export function buildRegistry(d3: D3Modules): readonly ProjectionSpec[] {
  const { geo: g, proj: q } = d3;
  const spec = (s: Omit<ProjectionSpec, 'd3'>): ProjectionSpec => ({ ...s, d3 });
  return [
    spec({ id: 'equirectangular', label: 'Equirectangular', create: g.geoEquirectangular, raw: g.geoEquirectangularRaw, poleClass: 'line', poleLimit: { h: 1, k: Infinity }, gpu: true }),
    spec({ id: 'mercator', label: 'Mercator', create: g.geoMercator, raw: g.geoMercatorRaw, poleClass: 'excluded', conformal: true, maxRawLat: MERCATOR_MAX_LAT, gpu: true }),
    spec({
      id: 'transverseMercator', label: 'Transverse Mercator', create: g.geoTransverseMercator, raw: g.geoTransverseMercatorRaw, poleClass: 'excluded',
      conformal: true, maxRawLat: MERCATOR_MAX_LAT, rawRotation: ([a, b, c]) => [a, b, c + 90],
    }),
    spec({ id: 'equalEarth', label: 'Equal Earth', create: g.geoEqualEarth, raw: g.geoEqualEarthRaw, poleClass: 'line', equalArea: true, gpu: true }),
    spec({ id: 'naturalEarth1', label: 'Natural Earth', create: g.geoNaturalEarth1, raw: g.geoNaturalEarth1Raw, poleClass: 'line', gpu: true }),
    spec({ id: 'robinson', label: 'Robinson', create: q.geoRobinson, raw: q.geoRobinsonRaw, poleClass: 'line', rawScale: 0.8487, gpu: true }),
    spec({ id: 'winkel3', label: 'Winkel tripel', create: q.geoWinkel3, raw: q.geoWinkel3Raw, poleClass: 'line' }),
    spec({ id: 'eckert4', label: 'Eckert IV', create: q.geoEckert4, raw: q.geoEckert4Raw, poleClass: 'line', equalArea: true }),
    spec({ id: 'mollweide', label: 'Mollweide', create: q.geoMollweide, raw: q.geoMollweideRaw, poleClass: 'cusp', equalArea: true, gpu: true }),
    spec({ id: 'sinusoidal', label: 'Sinusoidal', create: q.geoSinusoidal, raw: q.geoSinusoidalRaw, poleClass: 'cusp', equalArea: true }),
    spec({ id: 'hammer', label: 'Hammer', create: q.geoHammer, raw: q.geoHammerRaw(2), poleClass: 'cusp', equalArea: true }),
    spec({ id: 'orthographic', label: 'Orthographic', create: g.geoOrthographic, raw: g.geoOrthographicRaw, poleClass: 'point', gpu: true }),
    spec({ id: 'stereographic', label: 'Stereographic', create: g.geoStereographic, raw: g.geoStereographicRaw, poleClass: 'point', conformal: true, rawScale: 2, gpu: true }),
    spec({ id: 'azimuthalEqualArea', label: 'Azimuthal equal-area', create: g.geoAzimuthalEqualArea, raw: g.geoAzimuthalEqualAreaRaw, poleClass: 'point', equalArea: true, gpu: true }),
    spec({ id: 'azimuthalEquidistant', label: 'Azimuthal equidistant', create: g.geoAzimuthalEquidistant, raw: g.geoAzimuthalEquidistantRaw, poleClass: 'point', gpu: true }),
    spec({ id: 'gnomonic', label: 'Gnomonic', create: g.geoGnomonic, raw: g.geoGnomonicRaw, poleClass: 'point' }),
    // Conics (Phase 5c, decision 5c-1). With two standard parallels both poles of the equal-area and equidistant maps
    // are arcs (line class); the conformal's apex is a point where meridians arrive at different angles (cusp class)
    // and its other pole is at infinity (the view cuts it).
    spec({
      id: 'conicEqualArea', label: 'Albers (conic equal-area)', create: g.geoConicEqualArea, raw: g.geoConicEqualAreaRaw(CONIC_DEFAULT[0] * RAD, CONIC_DEFAULT[1] * RAD),
      poleClass: 'line', equalArea: true, conic: { defaultParallels: CONIC_DEFAULT, rawAt: g.geoConicEqualAreaRaw, bounded: true },
    }),
    spec({
      id: 'conicConformal', label: 'Lambert conformal conic', create: g.geoConicConformal, raw: g.geoConicConformalRaw(CONIC_DEFAULT[0] * RAD, CONIC_DEFAULT[1] * RAD),
      poleClass: 'cusp', conformal: true, conic: { defaultParallels: CONIC_DEFAULT, rawAt: g.geoConicConformalRaw, bounded: false, cutDeg: LCC_CUT_DEG },
    }),
    spec({
      id: 'conicEquidistant', label: 'Conic equidistant', create: g.geoConicEquidistant, raw: g.geoConicEquidistantRaw(CONIC_DEFAULT[0] * RAD, CONIC_DEFAULT[1] * RAD),
      poleClass: 'line', conic: { defaultParallels: CONIC_DEFAULT, rawAt: g.geoConicEquidistantRaw, bounded: true },
    }),
  ];
}

/** The registry over the stock d3 modules (native math): interactive display. */
export const PROJECTIONS: readonly ProjectionSpec[] = buildRegistry({ geo: d3geo, proj: d3proj });

export function projectionSpec(id: string, registry: readonly ProjectionSpec[] = PROJECTIONS): ProjectionSpec {
  const s = registry.find((p) => p.id === id);
  if (!s) throw new Error(`unknown projection: ${id}`);
  return s;
}
