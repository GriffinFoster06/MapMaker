// Type declarations for the parts of d3-geo-projection 4.0.0 used here (the package ships none and there is no
// @types package). Signatures follow its src/*.js; the projection objects are ordinary d3-geo projections.
declare module 'd3-geo-projection' {
  import type { GeoProjection, GeoRawProjection } from 'd3-geo';
  export function geoMollweide(): GeoProjection;
  export const geoMollweideRaw: GeoRawProjection;
  export function geoRobinson(): GeoProjection;
  export const geoRobinsonRaw: GeoRawProjection;
  export function geoWinkel3(): GeoProjection;
  export const geoWinkel3Raw: GeoRawProjection;
  export function geoEckert4(): GeoProjection;
  export const geoEckert4Raw: GeoRawProjection;
  export function geoSinusoidal(): GeoProjection;
  export const geoSinusoidalRaw: GeoRawProjection;
  export function geoHammer(): GeoProjection;
  export function geoHammerRaw(A: number, B?: number): GeoRawProjection;
}
