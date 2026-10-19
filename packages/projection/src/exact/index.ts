// The exact path (ARCHITECTURE §3.7): the projection registry over dmath-backed copies of d3-geo and
// d3-geo-projection, for the CPU inverse sampler and every export. Importing this module needs the d3-dmath alias
// (alias/d3-dmath.mjs: the Vite plugin, or the Node loader hook for tsx scripts). Interactive display uses the stock
// registry (PROJECTIONS), with native math.
import * as geo from 'virtual:d3-geo-dmath';
import * as proj from 'virtual:d3-geo-projection-dmath';
import { buildRegistry, type ProjectionSpec } from '../registry';
import { type DistortionQuantity, distortionRaster, distortionRgba } from '../overlay';
import { type HeightMapping, type HeightmapExport, type HeightmapOptions, encodePngRgba8, heightmapPng } from '../png';
import { type SvgLayers, svgDocument } from '../svg';
import type { MeshSampler } from '../sampler';
import { ProjectionView, type ViewOptions } from '../view';

export const EXACT_PROJECTIONS: readonly ProjectionSpec[] = buildRegistry({ geo, proj });

/**
 * Resampling tolerance of exported vector geometry, pixels. d3's default (√0.5 px) leaves boundary chords up to about
 * half a pixel off the curve; measured on a Tissot circle split by Hammer's antimeridian, the projected area was 3.7%
 * short at √0.5 px and 0.2% at 0.05 px.
 */
export const EXPORT_PRECISION_PX = 0.05;

/** A ProjectionView over the exact registry, with the export resampling tolerance. */
export const exactView = (opts: Omit<ViewOptions, 'registry'>) => new ProjectionView({ precision: EXPORT_PRECISION_PX, ...opts, registry: EXACT_PROJECTIONS });

/** The 16-bit heightmap export (png.ts), always through an exact view. */
export function exportHeightmap(opts: Omit<ViewOptions, 'registry'>, sampler: MeshSampler, elevationM: ArrayLike<number>, mapping: HeightMapping, png: HeightmapOptions = {}): HeightmapExport {
  return heightmapPng(exactView(opts), sampler, elevationM, mapping, png);
}

/** SVG of the vector layers (graticule, coastlines, Tissot indicatrices, outline), through an exact view. */
export function exportSvg(opts: Omit<ViewOptions, 'registry'>, layers: SvgLayers = {}): string {
  return svgDocument(exactView(opts), layers);
}

/** A distortion overlay as an 8-bit RGBA PNG (overlay.ts ramps), through an exact view. */
export function exportDistortionPng(opts: Omit<ViewOptions, 'registry'>, quantity: DistortionQuantity): Uint8Array {
  const view = exactView(opts);
  const r = distortionRaster(view, quantity);
  return encodePngRgba8(view.width, view.height, distortionRgba(r), [
    ['Software', 'MapMaker'],
    ['MapMaker.layer', `distortion.${quantity}`],
    ['MapMaker.projection', `${view.spec.id} rotate ${view.projection.rotate().join(' ')}`],
  ]);
}
