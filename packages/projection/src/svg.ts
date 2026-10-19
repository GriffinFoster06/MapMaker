// SVG export of the vector path (ARCHITECTURE §3.7: "SVG export uses this path"). Original shell code. Every layer is
// sphere geometry drawn by the view's d3.geoPath; build the view with exactView for an export.
import type { MultiLineString } from 'geojson';
import { graticule, pathFor, tissot, tissotFeatures, type TissotOptions } from './vector';
import type { ProjectionView } from './view';

export interface SvgLayers {
  /** The sphere's outline (the projection's domain boundary). Default true. */
  outline?: boolean;
  /** Graticule step in degrees, or false. Default 10. */
  graticule?: number | false;
  /** Coastlines (vector.ts coastlines()). */
  coastlines?: MultiLineString;
  /** Tissot indicatrices, or false (default). */
  tissot?: TissotOptions | false;
}

const path = (d: string | null, attrs: string) => (d ? `<path d="${d}" ${attrs}/>\n` : '');

/** A standalone SVG document of the requested layers, at the view's pixel size. */
export function svgDocument(view: ProjectionView, layers: SvgLayers = {}): string {
  const p = pathFor(view);
  const rot = view.projection.rotate();
  let body = '';
  if (layers.graticule !== false) body += path(p(graticule(view, layers.graticule ?? 10)), 'fill="none" stroke="#888" stroke-width="0.5"');
  if (layers.coastlines) body += path(p(layers.coastlines), 'fill="none" stroke="#123" stroke-width="1"');
  if (layers.tissot) {
    const f = tissotFeatures(tissot(view, layers.tissot));
    body += `<g fill="#c33" fill-opacity="0.3" stroke="#a11" stroke-width="0.75">\n${f.circles.map((c) => path(p(c), '')).join('')}</g>\n`;
    body += `<g fill="none" stroke="#a11" stroke-width="0.75">\n${f.axes.map((a) => path(p(a), '')).join('')}</g>\n`;
  }
  if (layers.outline !== false) body += path(p(view.outline()), 'fill="none" stroke="#000" stroke-width="1"');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="0 0 ${view.width} ${view.height}">
<!-- MapMaker: ${view.spec.id} rotate ${rot.join(' ')} -->
${body}</svg>
`;
}
