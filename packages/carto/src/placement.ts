// Label planning for a view (Phase 5c; design note 18 §3.3). Original code around the label-spread port. For one view and one
// style it decides which named features get a label, measures each label with the font tables, hands the lot to the solver
// and returns the placed texts. A run is a pure function of the data, the view and the style, so a label plan is the same
// whenever and wherever it is computed (the exact export in the worker, the interactive overlay on the page).
import { dmath } from '@mapmaker/core';
import { geodesicPoint } from '@mapmaker/projection';
import type { CartoData, CartoFeature } from './data';
import { ASCENT, DESCENT, INK_RUN_LENGTH, INK_VERTICAL_TRIM, advances, measureText, textWidth } from './font-metrics';
import { type LabelBounds, type LabelRequest, type Measurement, type PathGeometry, isPathTextUpright, spreadLabels } from './label-spread';
import type { LabelFont, LabelKind, Style } from './style';

/** What a label plan needs of a view: its size and the forward projection (a ProjectionView, or the globe's camera). */
export interface Projector {
  width: number;
  height: number;
  /** Pixel position of a longitude and latitude (degrees), or null when it is not on the map. */
  forward(lon: number, lat: number): [number, number] | null;
}

export interface PlacedText {
  id: string;
  kind: LabelKind;
  text: string;
  /** Pixels. */
  size: number;
  tracking: number;
  italic: boolean;
  fill: string;
  halo: string;
  haloWidth: number;
  opacity: number;
  /** Point labels: the baseline-left corner of the text. */
  x?: number;
  y?: number;
  /** Path labels: the path in pixels (SVG path data) and the centre of the text along it, percent. */
  pathD?: string;
  startOffset?: number;
}

export interface LabelPlan {
  labels: PlacedText[];
  /** Features considered, features that qualified for this view, and the solver's overlaps before and after. */
  stats: { considered: number; shown: number; initialOverlaps: number; remainingOverlaps: number };
}

const PRIORITY: Record<LabelKind, number> = { continent: 0, ocean: 1, sea: 2, range: 3, river: 4, island: 5 };

/** A polyline in pixels as an SVG-like path (length, point at length). */
class Polyline implements PathGeometry {
  readonly cum: number[] = [0];
  constructor(readonly pts: [number, number][]) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1]! + dmath.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  }
  getTotalLength(): number { return this.cum[this.cum.length - 1]!; }
  getPointAtLength(d: number): { x: number; y: number } {
    const L = this.getTotalLength(), s = Math.min(L, Math.max(0, d)), c = this.cum;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m]! <= s) lo = m; else hi = m; }
    const seg = c[hi]! - c[lo]!, t = seg > 0 ? (s - c[lo]!) / seg : 0, a = this.pts[lo]!, b = this.pts[hi]!;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
  }
  d(): string { return this.pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p[0] * 100) / 100} ${Math.round(p[1] * 100) / 100}`).join(''); }
}

const union = (a: LabelBounds, b: LabelBounds): LabelBounds => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) });

/** The text of a label in its font's case. */
const display = (f: CartoFeature, font: LabelFont): string => (font.upper ? f.name.toUpperCase() : f.name);

/** Pixel size of an area feature near its anchor: the longer of its east and north extents (twice the angular radius). */
function pixelDiameter(p: Projector, f: CartoFeature, ax: number, ay: number): number {
  let best = 0;
  for (const theta of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const q = geodesicPoint(f.lon, f.lat, theta, Math.min(f.radius, Math.PI / 2 - 1e-6));
    const xy = p.forward(q[0], q[1]);
    if (xy) best = Math.max(best, 2 * dmath.hypot(xy[0] - ax, xy[1] - ay));
  }
  return best;
}

/** The longest run of a path's points that project without jumps, in pixels, oriented left to right. */
function projectPath(p: Projector, flat: number[]): [number, number][] | null {
  const runs: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const xy = p.forward(flat[i]!, flat[i + 1]!);
    const last = cur[cur.length - 1];
    if (!xy || (last && dmath.hypot(xy[0] - last[0], xy[1] - last[1]) > p.width / 4)) { if (cur.length > 1) runs.push(cur); cur = xy ? [xy] : []; } else cur.push(xy);
  }
  if (cur.length > 1) runs.push(cur);
  if (!runs.length) return null;
  const len = (r: [number, number][]) => new Polyline(r).getTotalLength();
  const best = runs.reduce((a, b) => (len(b) > len(a) ? b : a));
  return best[0]![0] > best[best.length - 1]![0] ? best.slice().reverse() : best;
}

/** Measures `text` laid along `line` centred at `startOffset` percent: glyph boxes rotated onto the path, in runs of three. */
function measureOnPath(line: Polyline, text: string, size: number, tracking: number, startOffset: number): Measurement {
  const adv = advances(text, { size, tracking }), chars = [...text], textLen = adv.reduce((s, a) => s + a, 0), L = line.getTotalLength();
  const centre = (L * startOffset) / 100, start = centre - textLen / 2;
  const upright = isPathTextUpright(line, textLen, startOffset);
  const none: Measurement = { bounds: { x1: 0, y1: 0, x2: 1, y2: 1 }, inkBounds: [{ x1: 0, y1: 0, x2: 1, y2: 1 }], textLength: textLen, pathLength: L, upright: false };
  if (!L || start < 0 || start + textLen > L) return none;
  const lineH = (ASCENT + DESCENT) * size, trim = lineH * INK_VERTICAL_TRIM;
  const top = -ASCENT * size + trim, bottom = DESCENT * size - trim;
  const ink: LabelBounds[] = [];
  let run: LabelBounds | undefined, count = 0, s = start;
  for (let i = 0; i < chars.length; i++) {
    const a = adv[i]!, w = a - tracking;
    if (/\s/u.test(chars[i]!)) { if (run) ink.push(run); run = undefined; count = 0; s += a; continue; }
    const p0 = line.getPointAtLength(s), p1 = line.getPointAtLength(s + w), th = dmath.atan2(p1.y - p0.y, p1.x - p0.x);
    const c = dmath.cos(th), sn = dmath.sin(th);
    let g: LabelBounds | undefined;
    for (const [lx, ly] of [[0, top], [w, top], [0, bottom], [w, bottom]] as const) {
      const x = p0.x + lx * c - ly * sn, y = p0.y + lx * sn + ly * c;
      g = g ? union(g, { x1: x, y1: y, x2: x, y2: y }) : { x1: x, y1: y, x2: x, y2: y };
    }
    run = run ? union(run, g!) : g;
    if (++count >= INK_RUN_LENGTH) { ink.push(run!); run = undefined; count = 0; }
    s += a;
  }
  if (run) ink.push(run);
  const good = ink.filter((b) => b.x2 > b.x1 && b.y2 > b.y1);
  return { bounds: good.reduce(union), inkBounds: good, textLength: textLen, pathLength: L, upright };
}

export interface PlanOptions {
  /** Seed for the solver; default the data's name seed and the style id. */
  seed?: string;
  /** At most this many labels (most important first); default scales with the view's area. */
  maxLabels?: number;
  /** Fixed boxes to avoid: the scale bar, the legend. */
  obstacles?: LabelBounds[];
  /** Drawing area in pixels; default the whole view. */
  bounds?: LabelBounds;
  /** Rivers draining less than this (steradians) are not drawn, so not labelled (overlay.ts riverThreshold). */
  riverMinArea?: number;
}

export function planLabels(data: CartoData, view: Projector, style: Style, opts: PlanOptions = {}): LabelPlan {
  const W = view.width, H = view.height, unit = W / 1000;
  const bounds = opts.bounds ?? { x1: 0, y1: 0, x2: W, y2: H };
  const maxLabels = opts.maxLabels ?? Math.max(10, Math.min(160, Math.round((70 * W * H) / (1000 * 600))));
  const requests: LabelRequest[] = [], meta = new Map<string, { f: CartoFeature; font: LabelFont; text: string; size: number; tracking: number; line?: Polyline }>();
  const order = data.features.slice().sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.area - a.area);
  let considered = 0;
  for (const f of order) {
    considered++;
    if (requests.length >= maxLabels) break;
    const font = style.labels.fonts[f.kind], size = font.size * unit, tracking = font.tracking * size;
    if (size < 4) continue; // too small to read
    const text = display(f, font), w = textWidth(text, { size, tracking });
    if (f.path) {
      if (f.kind === 'river' && f.area < (opts.riverMinArea ?? 0)) continue;
      const px = projectPath(view, f.path);
      if (!px) continue;
      const line = new Polyline(px);
      if (line.getTotalLength() < 1.25 * w) continue;
      if (!px.some(([x, y]) => x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2)) continue;
      meta.set(f.id, { f, font, text, size, tracking, line });
      requests.push({ type: 'path', id: f.id, path: line, startOffset: 50, measure: (off) => measureOnPath(line, text, size, tracking, off) });
      continue;
    }
    const xy = view.forward(f.lon, f.lat);
    if (!xy || xy[0] < bounds.x1 || xy[0] > bounds.x2 || xy[1] < bounds.y1 || xy[1] > bounds.y2) continue;
    const diameter = pixelDiameter(view, f, xy[0], xy[1]);
    const fits = f.kind === 'ocean' || f.kind === 'sea' ? 2.6 * diameter >= w : f.kind === 'island' ? diameter >= Math.max(10 * unit, 0.45 * w) : 2.4 * diameter >= w;
    if (!fits) continue;
    const m = measureText(text, { size, tracking });
    // Centred on the anchor: the text box's middle (half way between the ascent line and the descent line) at the anchor.
    const dx = xy[0] - m.width / 2, dy = xy[1] + ((ASCENT - DESCENT) / 2) * size;
    const t = (b: LabelBounds): LabelBounds => ({ x1: b.x1 + dx, y1: b.y1 + dy, x2: b.x2 + dx, y2: b.y2 + dy });
    meta.set(f.id, { f, font, text, size, tracking });
    requests.push({ type: 'point', id: f.id, bounds: t(m.bounds), inkBounds: m.ink.map(t) });
  }

  const result = spreadLabels(requests, opts.obstacles ?? [], { bounds, scale: 1 }, opts.seed ?? `${data.seed}|${style.id}`);
  const labels: PlacedText[] = [];
  for (const p of result.labels) {
    const m = meta.get(p.id)!, base = { id: p.id, kind: m.f.kind, text: m.text, size: m.size, tracking: m.tracking, italic: !!m.font.italic, fill: m.font.fill, halo: m.font.halo, haloWidth: m.font.halo_w * m.size, opacity: m.font.opacity ?? 1 };
    if (p.type === 'path') labels.push({ ...base, pathD: m.line!.d(), startOffset: p.placement.startOffset ?? 50 });
    else {
      const req = requests.find((r) => r.id === p.id) as Extract<LabelRequest, { type: 'point' }>;
      // The candidate's bounds are the request's bounds moved by (dx, dy); the baseline-left corner moves with them.
      labels.push({ ...base, x: req.bounds.x1 + (p.placement.dx ?? 0), y: req.bounds.y2 - DESCENT * m.size + (p.placement.dy ?? 0) });
    }
  }
  return { labels, stats: { considered, shown: requests.length, initialOverlaps: result.initialOverlaps, remainingOverlaps: result.remainingOverlaps } };
}
