// ProjectionView (ARCHITECTURE §3.7): a d3 projection fitted to an output size, with the domain check the raster
// path needs. Original shell code around d3-geo. Projection is a view: nothing here reads or writes a World.
//
// Coordinates: longitude and latitude in degrees (d3's convention, east and north positive); pixels with x right and
// y down, the centre of pixel (i, j) at (i + 0.5, j + 0.5). `rotate` is d3's [λ, φ, γ] rotation in degrees.
import type { GeoProjection, GeoRotation } from 'd3-geo';
import { dmath } from '@mapmaker/core';
import { type ProjectionSpec, projectionSpec } from './registry';

export interface ViewOptions {
  projection: string;
  width: number;
  height: number;
  rotate?: [number, number, number];
  /** The registry to take the projection from: PROJECTIONS (stock d3, the default) or EXACT_PROJECTIONS (exact.ts). */
  registry?: readonly ProjectionSpec[];
  /**
   * d3's adaptive-resampling tolerance for the vector path, in pixels (projection.precision); default d3's √0.5.
   * Exact views use EXPORT_PRECISION_PX. It affects only drawn geometry, never invert or a projected point.
   */
  precision?: number;
  /**
   * Zoom about the image centre after fitting (default 1), then a pan in pixels (default [0, 0]): scale k·zoom and
   * translate c + (t − c)·zoom + pan, with c the image centre. The interactive map's zoom and drag.
   */
  zoom?: number;
  pan?: [number, number];
}

/** Round-trip tolerance of the domain check, in pixels (§3.7 raster path, step 2). */
export const ROUND_TRIP_PX = 0.5;

const RAD = Math.PI / 180;

export class ProjectionView {
  readonly spec: ProjectionSpec;
  readonly width: number;
  readonly height: number;
  /** The fitted d3 projection. Treat as read-only: changing it desynchronises the domain rules below. */
  readonly projection: GeoProjection;
  /** Geographic → raw-frame rotation (degrees), the one the d3 projection applies before its raw projection. */
  readonly toRaw: GeoRotation;
  /** Clip angle in degrees, or null. */
  readonly clipAngle: number | null;
  /** Projection scale k: pixels per unit of the raw projection. */
  readonly scale: number;
  /** The geographic point at the raw origin (the clip circle's centre). */
  private readonly centre: [number, number];

  constructor(opts: ViewOptions) {
    this.spec = projectionSpec(opts.projection, opts.registry);
    this.width = opts.width;
    this.height = opts.height;
    const p = this.spec.create();
    if (opts.rotate) p.rotate(opts.rotate);
    if (opts.precision !== undefined) p.precision(opts.precision);
    p.fitExtent([[0, 0], [opts.width, opts.height]], { type: 'Sphere' });
    if ((opts.zoom ?? 1) !== 1 || opts.pan) {
      const z = opts.zoom ?? 1, [px, py] = opts.pan ?? [0, 0], [tx, ty] = p.translate(), cx = opts.width / 2, cy = opts.height / 2;
      p.scale(p.scale() * z).translate([cx + (tx - cx) * z + px, cy + (ty - cy) * z + py]);
    }
    this.projection = p;
    this.scale = p.scale();
    const reported = p.rotate() as [number, number, number];
    this.toRaw = this.spec.d3.geo.geoRotation(this.spec.rawRotation ? this.spec.rawRotation(reported) : reported);
    const clip = p.clipAngle();
    this.clipAngle = clip ? clip : null;
    this.centre = this.toRaw.invert([0, 0]) as [number, number];
  }

  /** Whether a geographic point lies in the projection's domain (clip circle, excluded latitudes). */
  inDomain(lon: number, lat: number): boolean {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return false;
    if (this.clipAngle !== null && this.spec.d3.geo.geoDistance([lon, lat], this.centre) > this.clipAngle * RAD) return false;
    if (this.spec.maxRawLat !== undefined) {
      const [, rlat] = this.toRaw([lon, lat]);
      if (Math.abs(rlat) * RAD > this.spec.maxRawLat) return false;
    }
    return true;
  }

  /** Pixel position of a geographic point, or null outside the domain. */
  forward(lon: number, lat: number): [number, number] | null {
    if (!this.inDomain(lon, lat)) return null;
    const xy = this.projection([lon, lat]);
    return xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1]) ? xy : null;
  }

  /**
   * Geographic point under a pixel position, or null outside the domain (§3.7 raster path, steps 1–2): d3 `invert`,
   * then the domain rules, then the forward projection must return within ROUND_TRIP_PX, since d3 `invert` can give
   * in-range values for points outside a projection's outline.
   */
  invert(x: number, y: number): [number, number] | null {
    const ll = this.projection.invert?.([x, y]);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return null;
    if (!this.inDomain(ll[0], ll[1])) return null;
    const xy = this.projection(ll);
    if (!xy || !(dmath.hypot(xy[0] - x, xy[1] - y) <= ROUND_TRIP_PX)) return null;
    return ll;
  }
}
