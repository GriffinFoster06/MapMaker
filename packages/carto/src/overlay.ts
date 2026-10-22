// The vector layers of a styled map as SVG (Phase 5c; design note 18 §3.1, "vector path"): graticule, rivers, coastline,
// outline, labels, scale bar and legend, in the pixel space of one view. Original code around d3.geoPath. A pure function
// of the view, the data, the style and the label plan: the interactive overlay calls it with a stock view on the page, the
// exports with an exact view in the worker, and both draw the same geometry through the view's own d3 (design note 18).
import type { MultiLineString } from 'geojson';
import { dmath } from '@mapmaker/core';
import { type ProjectionView, graticule, pathFor } from '@mapmaker/projection';
import { type CartoData, RIVER_MIN_SR, type RiverChain } from './data';
import { buildLut, lutColor, linearToSrgb } from './colour';
import type { LabelPlan } from './placement';
import type { LabelBounds } from './label-spread';
import { esc, r2 } from './svg-util';
import { type Style } from './style';

export const FONT_FAMILY = 'Helvetica, Arial, sans-serif';

export interface OverlayOptions {
  graticule: boolean;
  coast: boolean;
  rivers: boolean;
  outline: boolean;
  /** The placed labels, or null for none. */
  labels: LabelPlan | null;
  scaleBar: boolean;
  legend: boolean;
}

export const OVERLAY_ALL: OverlayOptions = { graticule: true, coast: true, rivers: true, outline: true, labels: null, scaleBar: true, legend: true };

/** View scale (pixels per unit of the raw projection) of a 1000 px wide world map: the reference the river threshold is tied to. */
const REFERENCE_SCALE = 160;

/**
 * The smallest drainage area (steradians) a river must have to be drawn in a view: the style's value at the reference scale,
 * shrinking with the square of the view's scale, so a zoomed or larger map shows more of the network (never below what
 * the data holds).
 */
export function riverThreshold(style: Style, viewScale: number): number {
  const k = REFERENCE_SCALE / Math.max(viewScale, 1e-6);
  return Math.max(RIVER_MIN_SR, style.rivers.minAreaSr * k * k);
}

const LEGEND_OCEAN = [-6000, -3000, -1000, -200];
const LEGEND_LAND = [100, 500, 1000, 2000, 3500, 5500];

/** The boxes (pixels) the scale bar and the legend occupy, so labels can avoid them. */
export function furnitureLayout(width: number, height: number, style: Style, o: Pick<OverlayOptions, 'scaleBar' | 'legend'>): { scale: LabelBounds | null; legend: LabelBounds | null } {
  const u = width / 1000, pad = 12 * u;
  const scale = o.scaleBar && style.furniture.scaleBar ? { x1: width - pad - 150 * u, y1: height - pad - 26 * u, x2: width - pad, y2: height - pad } : null;
  const rows = LEGEND_OCEAN.length + LEGEND_LAND.length, h = (rows * 10 + 18) * u;
  const legend = o.legend && style.furniture.legend && style.landMode === 'elevation' ? { x1: pad, y1: height - pad - h, x2: pad + 100 * u, y2: height - pad } : null;
  return { scale, legend };
}

const cssRgb = (lin: ArrayLike<number>): string => `rgb(${[0, 1, 2].map((i) => Math.round(Math.min(1, Math.max(0, linearToSrgb(lin[i]!))) * 255)).join(',')})`;

/** Metres per pixel along the horizontal through the view's centre (or the first row of the view that is on the map). */
function metresPerPixel(view: ProjectionView, radius_m: number): number | null {
  const W = view.width, H = view.height;
  for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const a = view.invert(W / 2 - 50, H * fy), b = view.invert(W / 2 + 50, H * fy);
    if (!a || !b) continue;
    const ra = (a[0] * Math.PI) / 180, fa = (a[1] * Math.PI) / 180, rb = (b[0] * Math.PI) / 180, fb = (b[1] * Math.PI) / 180;
    const dot = dmath.cos(fa) * dmath.cos(fb) * dmath.cos(ra - rb) + dmath.sin(fa) * dmath.sin(fb);
    const d = dmath.acos(Math.min(1, Math.max(-1, dot))) * radius_m;
    if (d > 0) return d / 100;
  }
  return null;
}

/** 1, 2 or 5 times a power of ten, the largest not above `v`. */
export function niceNumber(v: number): number {
  const p = dmath.pow(10, Math.floor(dmath.log10(v))), m = v / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

function riverClasses(rivers: RiverChain[], minArea: number, classes: number): MultiLineString[] {
  const out: MultiLineString[] = Array.from({ length: classes }, () => ({ type: 'MultiLineString', coordinates: [] }));
  const span = dmath.log(80);
  const cls = (a: number) => Math.min(classes - 1, Math.max(0, Math.floor((dmath.log(a / minArea) / span) * classes)));
  for (const r of rivers) {
    let cur: [number, number][] = [], curClass = -1;
    const flush = () => { if (cur.length > 1) out[curClass]!.coordinates.push(cur); cur = []; };
    for (let k = 1; k < r.area.length; k++) {
      const a = r.area[k]!;
      if (a < minArea) { flush(); curClass = -1; continue; }
      const c = cls(a);
      if (c !== curClass) { flush(); curClass = c; cur = [[r.pts[2 * (k - 1)]!, r.pts[2 * (k - 1) + 1]!]]; }
      cur.push([r.pts[2 * k]!, r.pts[2 * k + 1]!]);
    }
    flush();
  }
  return out;
}

/** SVG elements of a label plan: point labels as text, path labels as text on a path, each with a halo (paint-order stroke). */
export function labelsSvg(plan: LabelPlan, idPrefix = 'lp'): string {
  let defs = '', body = '', n = 0;
  for (const t of plan.labels) {
    const common = `font-family="${FONT_FAMILY}" font-size="${r2(t.size)}"${t.italic ? ' font-style="italic"' : ''}${t.tracking ? ` letter-spacing="${r2(t.tracking)}"` : ''} fill="${t.fill}" stroke="${t.halo}" stroke-width="${r2(2 * t.haloWidth)}" stroke-linejoin="round" paint-order="stroke"${t.opacity < 1 ? ` opacity="${t.opacity}"` : ''}`;
    if (t.pathD) {
      const id = `${idPrefix}${n++}`;
      defs += `<path id="${id}" d="${t.pathD}"/>\n`;
      body += `<text ${common} text-anchor="middle" class="carto-label carto-${t.kind}"><textPath href="#${id}" startOffset="${r2(t.startOffset ?? 50)}%">${esc(t.text)}</textPath></text>\n`;
    } else body += `<text x="${r2(t.x!)}" y="${r2(t.y!)}" ${common} class="carto-label carto-${t.kind}">${esc(t.text)}</text>\n`;
  }
  return `<defs>\n${defs}</defs>\n<g class="carto-labels">\n${body}</g>\n`;
}

/** The overlay's SVG elements (no <svg> wrapper), in the view's pixel space. */
export function overlaySvg(view: ProjectionView, data: CartoData, style: Style, o: OverlayOptions): string {
  return overlayMapSvg(view, data, style, o) + overlayScreenSvg(view, data, style, o);
}

/**
 * The part of the overlay that lies on the map: graticule, rivers, coastline and outline, as paths through the view. Moving
 * the map by a pan shifts every coordinate by that pan (d3 does no clipping to the viewport, except for the unbounded conics),
 * so the page keeps this part while only the pan changes and moves it with a transform (where `view.panInvariant`).
 */
export function overlayMapSvg(view: ProjectionView, data: CartoData, style: Style, o: OverlayOptions): string {
  const p = pathFor(view), W = view.width, u = W / 1000;
  const line = (d: string | null, attrs: string) => (d ? `<path d="${d}" fill="none" ${attrs}/>\n` : '');
  let out = '';
  if (o.graticule) out += line(p(graticule(view, style.graticule.step)), `class="carto-graticule" stroke="${style.graticule.color}" stroke-opacity="${style.graticule.opacity}" stroke-width="${r2(style.graticule.width * u)}"`);
  if (o.rivers) {
    const classes = 5, geoms = riverClasses(data.rivers, riverThreshold(style, view.scale), classes);
    geoms.forEach((g, i) => {
      const w = (style.rivers.minWidth + ((i + 0.5) / classes) * (style.rivers.maxWidth - style.rivers.minWidth)) * u;
      out += line(g.coordinates.length ? p(g) : null, `class="carto-river" stroke="${style.rivers.color}" stroke-width="${r2(w)}" stroke-linecap="round" stroke-linejoin="round"`);
    });
  }
  if (o.coast) {
    const d = p(data.coast);
    if (style.coast.halo) out += line(d, `class="carto-coast-halo" stroke="${style.coast.halo.color}" stroke-opacity="${style.coast.halo.opacity}" stroke-width="${r2(style.coast.halo.width * u)}" stroke-linejoin="round"`);
    out += line(d, `class="carto-coast" stroke="${style.coast.color}" stroke-width="${r2(style.coast.width * u)}" stroke-linejoin="round"`);
  }
  if (o.outline) out += line(p(view.outline()), `class="carto-outline" stroke="${style.outline.color}" stroke-width="${r2(style.outline.width * u)}"`);
  return out;
}

/** The part of the overlay fixed to the screen or placed for the view: labels, scale bar and legend. */
export function overlayScreenSvg(view: ProjectionView, data: CartoData, style: Style, o: OverlayOptions): string {
  const W = view.width, H = view.height, u = W / 1000;
  let out = '';
  if (o.labels) out += labelsSvg(o.labels);

  const fur = furnitureLayout(W, H, style, o);
  if (fur.scale) {
    const mpp = metresPerPixel(view, data.radius_m);
    if (mpp) {
      const b = fur.scale, nice = niceNumber((130 * u * mpp) / 1000) * 1000, px = nice / mpp, x2 = b.x2 - 6 * u, x1 = x2 - px, y = b.y2 - 8 * u;
      const label = nice >= 1000 ? `${r2(nice / 1000)} km` : `${r2(nice)} m`;
      out += `<g class="carto-scale"><rect x="${r2(b.x1)}" y="${r2(b.y1)}" width="${r2(b.x2 - b.x1)}" height="${r2(b.y2 - b.y1)}" rx="${r2(3 * u)}" fill="${style.furniture.panel}"/>\n` +
        `<path d="M${r2(x1)} ${r2(y - 4 * u)}V${r2(y)}H${r2(x2)}V${r2(y - 4 * u)}" fill="none" stroke="${style.furniture.textColor}" stroke-width="${r2(1.2 * u)}"/>\n` +
        `<text x="${r2((x1 + x2) / 2)}" y="${r2(y - 7 * u)}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${r2(8.5 * u)}" fill="${style.furniture.textColor}">${label} (at map centre)</text></g>\n`;
    }
  }
  if (fur.legend) {
    const b = fur.legend, lut = buildLut(style), c = [0, 0, 0];
    out += `<g class="carto-legend"><rect x="${r2(b.x1)}" y="${r2(b.y1)}" width="${r2(b.x2 - b.x1)}" height="${r2(b.y2 - b.y1)}" rx="${r2(3 * u)}" fill="${style.furniture.panel}"/>\n` +
      `<text x="${r2(b.x1 + 6 * u)}" y="${r2(b.y1 + 11 * u)}" font-family="${FONT_FAMILY}" font-size="${r2(8.5 * u)}" fill="${style.furniture.textColor}">Elevation</text>\n`;
    [...LEGEND_LAND.slice().reverse(), ...LEGEND_OCEAN.slice().reverse()].forEach((m, i) => {
      lutColor(lut, m, c);
      const y = b.y1 + (16 + i * 10) * u;
      out += `<rect x="${r2(b.x1 + 6 * u)}" y="${r2(y)}" width="${r2(14 * u)}" height="${r2(8 * u)}" fill="${cssRgb(c)}"/>` +
        `<text x="${r2(b.x1 + 25 * u)}" y="${r2(y + 7 * u)}" font-family="${FONT_FAMILY}" font-size="${r2(7.5 * u)}" fill="${style.furniture.textColor}">${m < 0 ? '−' : ''}${Math.abs(m)} m</text>\n`;
    });
    out += '</g>\n';
  }
  return out;
}
