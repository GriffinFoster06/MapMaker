// ProjectionView (ARCHITECTURE §3.7): a d3 projection fitted to an output size, with the domain check the raster
// path needs. Original shell code around d3-geo. Projection is a view: nothing here reads or writes a World.
//
// Coordinates: longitude and latitude in degrees (d3's convention, east and north positive); pixels with x right and
// y down, the centre of pixel (i, j) at (i + 0.5, j + 0.5). `rotate` is d3's [λ, φ, γ] rotation in degrees.
import type { GeoPermissibleObjects, GeoProjection, GeoRawProjection, GeoRotation } from 'd3-geo';
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
  /** Conic projections: the two standard parallels in degrees (default: the projection's own pair). Ignored otherwise. */
  parallels?: [number, number];
}

/** Round-trip tolerance of the domain check, in pixels (§3.7 raster path, step 2). */
export const ROUND_TRIP_PX = 0.5;

const RAD = Math.PI / 180;

/** Standard parallels are kept within ±90° (d3 accepts any value; the formulas do not). */
export function clampParallels(p: readonly [number, number]): [number, number] {
  const c = (v: number) => Math.min(89.9, Math.max(-89.9, Number.isFinite(v) ? v : 0));
  return [c(p[0]), c(p[1])];
}

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
  /** Standard parallels in effect (degrees) for a conic, else null. */
  readonly parallels: [number, number] | null;
  /** The raw projection in effect (radians in, y up): `spec.raw`, or the conic's for this view's parallels. */
  readonly raw: GeoRawProjection;
  /** Raw-frame latitude range (degrees) of a conic that is unbounded on one side, else null. */
  private readonly latBand: [number, number] | null;
  private readonly outlineGeometry: GeoPermissibleObjects;

  constructor(opts: ViewOptions) {
    this.spec = projectionSpec(opts.projection, opts.registry);
    this.width = opts.width;
    this.height = opts.height;
    const p = this.spec.create();
    if (opts.rotate) p.rotate(opts.rotate);
    if (opts.precision !== undefined) p.precision(opts.precision);
    const conic = this.spec.conic;
    let par = conic ? clampParallels(opts.parallels ?? conic.defaultParallels) : null;
    // Lambert conformal with parallels summing to 0 is Mercator, whose map is a strip with no apex; nudge to a cone.
    if (conic && !conic.bounded && par && Math.abs(par[0] + par[1]) < 0.01) par = [par[0], par[0] + 0.01 > 89.9 ? par[1] : par[1] + 0.01];
    this.parallels = par;
    this.raw = conic ? conic.rawAt(this.parallels![0] * RAD, this.parallels![1] * RAD) : this.spec.raw;
    let latBand: [number, number] | null = null;
    let outline: GeoPermissibleObjects = { type: 'Sphere' };
    if (conic) {
      (p as unknown as { parallels(v: [number, number]): GeoProjection }).parallels(this.parallels!);
      if (!conic.bounded) {
        // Lambert conformal: the far pole is at infinity, so the domain is the cap about the apex (decision 5c-1).
        const cut = conic.cutDeg ?? 30;
        const north = this.parallels![0] + this.parallels![1] > 0;
        latBand = north ? [-90 + cut, 90] : [-90, 90 - cut];
        const rot = this.spec.d3.geo.geoRotation(this.spec.rawRotation ? this.spec.rawRotation(p.rotate() as [number, number, number]) : (p.rotate() as [number, number, number]));
        const centre = rot.invert([0, north ? 90 : -90]);
        outline = this.spec.d3.geo.geoCircle().center(centre).radius(180 - cut).precision(1)();
        // Vector geometry beyond the cut projects far outside the map; clip to the image (a little outside).
        p.clipExtent([[-2, -2], [opts.width + 2, opts.height + 2]]);
      }
    }
    this.latBand = latBand;
    this.outlineGeometry = outline;
    p.fitExtent([[0, 0], [opts.width, opts.height]], outline as never);
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

  /**
   * Whether changing only `pan` shifts every projected vector coordinate by exactly that pan. False for the unbounded conics,
   * whose paths are clipped to the image (a little outside), so what is kept depends on the pan.
   */
  get panInvariant(): boolean { return this.latBand === null; }

  /** Whether a geographic point lies in the projection's domain (clip circle, excluded latitudes). */
  inDomain(lon: number, lat: number): boolean {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return false;
    if (this.clipAngle !== null && this.spec.d3.geo.geoDistance([lon, lat], this.centre) > this.clipAngle * RAD) return false;
    if (this.spec.maxRawLat !== undefined) {
      const [, rlat] = this.toRaw([lon, lat]);
      if (Math.abs(rlat) * RAD > this.spec.maxRawLat) return false;
    }
    if (this.latBand) {
      const [, rlat] = this.toRaw([lon, lat]);
      if (rlat < this.latBand[0] || rlat > this.latBand[1]) return false;
    }
    return true;
  }

  /** The projection's outline as geometry for d3.geoPath: the sphere, or the cut cap of an unbounded conic. */
  outline(): GeoPermissibleObjects { return this.outlineGeometry; }

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
