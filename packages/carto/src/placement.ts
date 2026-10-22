// Label planning for a view (Phase 5c; design note 18 §3.3). Original code around the label-spread port. For one view and one
// style it decides which named features get a label, measures each label with the font tables, hands the lot to the solver
// and returns the placed texts. A run is a pure function of the data, the view and the style, so a label plan is the same
// whenever and wherever it is computed (the exact export in the worker, the interactive overlay on the page).
import { dmath } from '@mapmaker/core';
import { geodesicPoint } from '@mapmaker/projection';
import type { CartoData, CartoFeature } from './data';
import { REGION_LAND, REGION_WATER } from './data';
import { type LabelMask, OUTSIDE, buildMask, cellAt, tally } from './label-mask';
import { ASCENT, DESCENT, INK_RUN_LENGTH, INK_VERTICAL_TRIM, advances, measureText, textWidth } from './font-metrics';
import { type LabelBounds, type LabelRequest, type Measurement, type PathGeometry, isPathTextUpright, spreadLabels } from './label-spread';
import type { LabelFont, LabelKind, Style } from './style';

/** What a label plan needs of a view: its size, the forward projection and its inverse (a ProjectionView, or the globe's camera). */
export interface Projector {
  width: number;
  height: number;
  /** Pixel position of a longitude and latitude (degrees), or null when it is not on the map. */
  forward(lon: number, lat: number): [number, number] | null;
  /** Longitude and latitude (degrees) under a pixel, or null where there is no map (beyond the outline, the far side of the globe). */
  invert(x: number, y: number): [number, number] | null;
  /** Allocation-free `invert` for batches (see `MaskView`). */
  invertInto?(x: number, y: number, out: Float64Array): boolean;
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
export function projectPath(p: Projector, flat: number[]): [number, number][] | null {
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
  /** A view of a sphere (the globe, an orthographic map): labels are kept off the limb, fade towards it and shrink with the foreshortening. */
  limb?: boolean;
  /** The view's mask, built beforehand with `buildMaskSliced` at `maskCell(view.width)`; default built here in one go. The plan is the same either way. */
  mask?: LabelMask;
}

/** The side of a mask cell in pixels for a view of this width. */
export function maskCell(width: number): number { return Math.max(3, 4 * (width / 1000)); }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Size steps tried, largest first, until a name fits its ground: area names shrink and tighten before they are dropped. */
const LADDER: Record<LabelKind, number[]> = { continent: [1, 0.88, 0.76, 0.66], ocean: [1, 0.88, 0.76, 0.66], sea: [1, 0.88, 0.76], island: [1], range: [1, 0.88, 0.76], river: [1, 0.9] };
/** Smallest text drawn at all, pixels at a 1000 px wide view (scaled with the view). */
const MIN_SIZE = 5.2;
/** How much of its ink a name needs on its own ground. */
const OWN_FRACTION = { continent: 0.72, ocean: 0.95, sea: 0.9 };
/** The longest turn (radians) allowed along the text of a path label, and the steepest slope (radians from horizontal). */
const MAX_TURN = 1.6, MAX_SLOPE = 1.55;

/** Size factor of an area name from the room it has (the diameter of the largest circle inside its visible ground, pixels). */
function sizeFactor(kind: LabelKind, diameter: number, width: number): number {
  const r = diameter / (0.3 * width);
  if (kind === 'continent') return clamp(0.8 + 0.55 * r, 0.85, 1.55);
  if (kind === 'ocean') return clamp(0.85 + 0.6 * r, 0.9, 1.7);
  if (kind === 'sea') return clamp(0.9 + 0.6 * r, 0.9, 1.3);
  return 1;
}

interface Window { pts: [number, number][]; centre: number }

/**
 * The best stretch of a path to write `textLen` pixels of text on: the path is resampled and smoothed (a river is the chain of
 * mesh cells it flows through, far too jagged to set type on), then the stretch with the least turning that stays on allowed
 * ground wins, and a little of the path around it is kept so the solver can slide the text. `centre` is where the text is
 * centred in the returned stretch, percent.
 */
export function pathWindow(run: [number, number][], textLen: number, size: number, unit: number, allowed: (x: number, y: number) => boolean, extend = false): Window | null {
  // A range's name may overhang the ends of its spine (the way atlases set them): the spine is continued straight at both ends.
  if (extend && run.length > 1) {
    const base = new Polyline(run).getTotalLength(), over = Math.min(0.55 * textLen, Math.max(0, 1.05 * textLen - base) / 2 + 0.1 * textLen);
    const tail = (a: [number, number], b: [number, number]): [number, number] => { const d = dmath.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [b[0] + ((b[0] - a[0]) / d) * over, b[1] + ((b[1] - a[1]) / d) * over]; };
    const k = Math.max(1, Math.floor(run.length / 4));
    run = [tail(run[Math.min(run.length - 1, k)]!, run[0]!), ...run, tail(run[Math.max(0, run.length - 1 - k)]!, run[run.length - 1]!)];
  }
  const line = new Polyline(run), L = line.getTotalLength();
  if (L < 1.12 * textLen) return null;
  const st = Math.max(1.5 * unit, size * 0.3), n = Math.ceil(L / st) + 1;
  let pts: [number, number][] = [];
  for (let k = 0; k < n; k++) { const q = line.getPointAtLength((L * k) / (n - 1)); pts.push([q.x, q.y]); }
  const half = Math.max(1, Math.round((1.6 * size) / st));
  for (let pass = 0; pass < 3; pass++) {
    const prev = pts;
    pts = prev.map((_, k) => {
      const lo = Math.max(0, k - half), hi = Math.min(n - 1, k + half);
      let sx = 0, sy = 0;
      for (let j = lo; j <= hi; j++) { sx += prev[j]![0]; sy += prev[j]![1]; }
      return [sx / (hi - lo + 1), sy / (hi - lo + 1)];
    });
  }
  const bad = pts.map(([x, y]) => !allowed(x, y));
  const h: number[] = [];
  for (let k = 0; k + 1 < n; k++) h.push(dmath.atan2(pts[k + 1]![1] - pts[k]![1], pts[k + 1]![0] - pts[k]![0]));
  const turn = (a: number, b: number) => { let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
  let smoothed = 0;
  for (let k = 1; k < n; k++) smoothed += dmath.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]);
  const seg = smoothed / (n - 1) || st, M = Math.ceil((1.1 * textLen) / seg);
  if (M >= n - 1) return null;
  let best = -1, bestScore = Infinity;
  for (let s = 0; s + M < n; s++) {
    let ok = true, tot = 0;
    for (let k = s; k <= s + M && ok; k++) if (bad[k]) ok = false;
    for (let k = s; k < s + M && ok; k++) {
      if (Math.abs(h[k]!) > MAX_SLOPE) ok = false;
      if (k > s) tot += turn(h[k - 1]!, h[k]!);
    }
    if (!ok || tot > MAX_TURN) continue;
    const score = tot + (0.6 * Math.abs(s + M / 2 - (n - 1) / 2)) / (n - 1);
    if (score < bestScore - 1e-9) { bestScore = score; best = s; }
  }
  if (best < 0) return null;
  const ext = Math.round(0.35 * M);
  let lo = best, hi = best + M;
  while (lo > Math.max(0, best - ext) && !bad[lo - 1]) lo--;
  while (hi < Math.min(n - 1, best + M + ext) && !bad[hi + 1]) hi++;
  return { pts: pts.slice(lo, hi + 1), centre: ((best + M / 2 - lo) / (hi - lo)) * 100 };
}

/** The path moved sideways by `d` pixels (positive: towards the top of text reading left to right), along its smoothed normals. */
function offsetPath(pts: [number, number][], d: number): [number, number][] {
  return pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)]!, b = pts[Math.min(pts.length - 1, k + 1)]!, th = dmath.atan2(b[1] - a[1], b[0] - a[0]);
    return [p[0] + d * dmath.sin(th), p[1] - d * dmath.cos(th)];
  });
}

export function planLabels(data: CartoData, view: Projector, style: Style, opts: PlanOptions = {}): LabelPlan {
  const W = view.width, H = view.height, unit = W / 1000, cell = maskCell(W);
  const bounds = opts.bounds ?? { x1: 0, y1: 0, x2: W, y2: H };
  const maxLabels = opts.maxLabels ?? Math.max(10, Math.min(160, Math.round((70 * W * H) / (1000 * 600))));
  const maxRivers = Math.max(3, Math.round(0.35 * maxLabels));
  const mask = opts.mask ?? buildMask(view, data.regions, cell);
  const R = Math.min(W, H) / 2, e0 = opts.limb ? 0.035 * R : 0, e1 = opts.limb ? 0.16 * R : 1;
  /** The least distance to the outline a name's ink must keep, pixels. */
  const margin = e0 + 1.5 * cell;
  const fade = (edge: number): number => (opts.limb ? clamp((edge - e0) / (e1 - e0), 0, 1) : 1);

  const obstacles = opts.obstacles ?? [], inset = 3 * unit, gap = 2 * unit;
  /** Whether an ink box lies inside the drawing area (with a small inset) and clear of the fixed boxes (scale bar, legend). */
  const placeable = (b: LabelBounds): boolean => {
    if (b.x1 < bounds.x1 + inset || b.x2 > bounds.x2 - inset || b.y1 < bounds.y1 + inset || b.y2 > bounds.y2 - inset) return false;
    for (const o of obstacles) if (b.x2 > o.x1 - gap && b.x1 < o.x2 + gap && b.y2 > o.y1 - gap && b.y1 < o.y2 + gap) return false;
    return true;
  };

  const features = data.features, landFeature = features.map((f) => f.kind === 'continent' || f.kind === 'island');
  // The visible pole of inaccessibility of every named area: the cell of its ground farthest from the ground's edge.
  const bestCell = new Int32Array(features.length).fill(-1);
  for (let i = 0; i < mask.region.length; i++) {
    const r = mask.region[i]!;
    if (r < 0) continue;
    const b = bestCell[r]!;
    if (b < 0 || mask.clear[i]! > mask.clear[b]!) bestCell[r] = i;
  }
  const centreOf = (i: number): [number, number] => [mask.ox + ((i % mask.cols) + 0.5) * cell, mask.oy + (Math.floor(i / mask.cols) + 0.5) * cell];

  type Meta = { f: CartoFeature; font: LabelFont; text: string; size: number; tracking: number; fade: number; line?: Polyline };
  const requests: LabelRequest[] = [], meta = new Map<string, Meta>(), byId = new Map<string, LabelRequest>();
  const order = features.map((f, i) => ({ f, i })).sort((a, b) => PRIORITY[a.f.kind] - PRIORITY[b.f.kind] || b.f.area - a.f.area || a.i - b.i);
  let considered = 0, rivers = 0;
  /** Ink of the area names placed so far (they come first in priority): path labels keep clear of them. */
  const reserved: LabelBounds[] = [];

  // Groups of the cells under a name: 0 outside, 1 own ground, 2 unnamed water, 3 unnamed land, 4 another landmass, 5 another sea.
  const groupsFor = (own: number) => (r: number): number => (r === OUTSIDE ? 0 : r === own ? 1 : r === REGION_WATER ? 2 : r === REGION_LAND ? 3 : landFeature[r] ? 4 : 5);

  for (const { f, i: fi } of order) {
    considered++;
    if (requests.length >= maxLabels) break;
    const font = style.labels.fonts[f.kind], ladder = LADDER[f.kind];
    const baseSize = font.size * unit;
    if (baseSize < 4) continue; // too small to read

    if (f.path) {
      if (f.kind === 'river' && (f.area < (opts.riverMinArea ?? 0) || rivers >= maxRivers)) continue;
      const run = projectPath(view, f.path);
      if (!run) continue;
      const allowed = (x: number, y: number): boolean => {
        for (const r of reserved) if (x > r.x1 - 0.7 * baseSize && x < r.x2 + 0.7 * baseSize && y > r.y1 - 0.7 * baseSize && y < r.y2 + 0.7 * baseSize) return false;
        if (!placeable({ x1: x - unit, y1: y - 1.3 * baseSize, x2: x + unit, y2: y + 0.5 * baseSize })) return false;
        const c = cellAt(mask, x, y);
        const r = mask.region[c]!;
        // A range lies on land; a river may run on into the sea.
        return r !== OUTSIDE && mask.edge[c]! >= margin + 1.3 * baseSize && (f.kind !== 'range' || r === REGION_LAND || (r >= 0 && landFeature[r]!));
      };
      // The full name at each size, then (a range, when the full name cannot be set at any size) the abbreviated one ("Zanor Mts."),
      // the way atlases shorten names on small maps.
      const full = display(f, font), short = f.kind === 'range' && full.includes(' ') ? `${full.slice(0, full.lastIndexOf(' '))} ${font.upper ? 'MTS.' : 'Mts.'}` : full;
      let done = false;
      for (const text of short === full ? [full] : [full, short]) {
        for (const step of ladder) {
          const size = baseSize * step;
          if (size < MIN_SIZE * unit) break;
          const tracking = font.tracking * size, w = textWidth(text, { size, tracking });
          const win = pathWindow(run, w, size, unit, allowed, f.kind === 'range' && text === full);
          if (!win) continue;
          // Rivers: the name floats just above the line; ranges: centred on the ridge.
          const line = new Polyline(offsetPath(win.pts, f.kind === 'river' ? 0.4 * size : -0.33 * size));
          const mid = line.getPointAtLength((line.getTotalLength() * win.centre) / 100);
          const g = fade(mask.edge[cellAt(mask, mid.x, mid.y)]!);
          if (g < 0.12) break;
          meta.set(f.id, { f, font, text, size, tracking, fade: g, line });
          const req: LabelRequest = { type: 'path', id: f.id, path: line, startOffset: win.centre, measure: (off) => measureOnPath(line, text, size, tracking, off) };
          requests.push(req); byId.set(f.id, req);
          if (f.kind === 'river') rivers++;
          reserved.push(...measureOnPath(line, text, size, tracking, win.centre).inkBounds);
          done = true;
          break;
        }
        if (done) break;
      }
      continue;
    }

    const own = fi, groupOf = groupsFor(own);
    let ax: number, ay: number, clearPx: number, edgePx: number;
    if (f.kind === 'island') {
      const xy = view.forward(f.lon, f.lat);
      if (!xy || xy[0] < bounds.x1 || xy[0] > bounds.x2 || xy[1] < bounds.y1 || xy[1] > bounds.y2) continue;
      const c = cellAt(mask, xy[0], xy[1]);
      if (mask.region[c] === OUTSIDE || mask.edge[c]! < margin) continue;
      [ax, ay] = xy; clearPx = 0; edgePx = mask.edge[c]!;
      // Only islands that are not dwarfed by their own name: the name is set when the island is at least half as wide as it.
      const diameter = pixelDiameter(view, f, ax, ay), probe = measureText(display(f, font), { size: baseSize, tracking: font.tracking * baseSize }).width;
      if (diameter < Math.max(10 * unit, 0.45 * probe)) continue;
    } else {
      const bc = bestCell[own]!;
      if (bc < 0) continue; // none of its ground is in view
      clearPx = mask.clear[bc]!;
      [ax, ay] = centreOf(bc);
      // The centre of the roomiest part, not one grid cell of it: the cells within 10% of the best clearance near the best cell are
      // averaged, so the anchor moves smoothly when the view is panned instead of hopping from cell to cell.
      let sx = 0, sy = 0, sn = 0;
      const bx = bc % mask.cols, by = Math.floor(bc / mask.cols), reach = Math.ceil((0.5 * clearPx) / cell) + 1;
      for (let y = Math.max(0, by - reach); y <= Math.min(mask.rows - 1, by + reach); y++) for (let x = Math.max(0, bx - reach); x <= Math.min(mask.cols - 1, bx + reach); x++) {
        const i = y * mask.cols + x;
        if (mask.region[i] === own && mask.clear[i]! >= 0.9 * clearPx) { sx += mask.ox + (x + 0.5) * cell; sy += mask.oy + (y + 0.5) * cell; sn++; }
      }
      if (sn) { const cx = sx / sn, cy = sy / sn, ci = cellAt(mask, cx, cy); if (mask.region[ci] === own) [ax, ay] = [cx, cy]; }
      // The feature's own anchor (a mesh pole of inaccessibility) is more exact than the cell when it is in view and about as roomy.
      const xy = view.forward(f.lon, f.lat);
      if (xy) { const c = cellAt(mask, xy[0], xy[1]); if (mask.region[c] === own && mask.clear[c]! >= 0.85 * clearPx && xy[0] >= bounds.x1 && xy[0] <= bounds.x2 && xy[1] >= bounds.y1 && xy[1] <= bounds.y2) { [ax, ay] = xy; clearPx = Math.max(clearPx, mask.clear[c]!); } }
      edgePx = mask.edge[cellAt(mask, ax, ay)]!;
    }
    const g = fade(edgePx);
    if (g < 0.12) continue;
    const factor = sizeFactor(f.kind, 2 * clearPx, W) * (0.8 + 0.2 * g);
    const accept = (c: { bounds: LabelBounds; inkBounds: LabelBounds[] }): boolean => {
      const t = tally(mask, c.inkBounds, groupOf, 6), n = t.counts;
      if (!t.total || n[0]! > 0 || t.minEdge < margin || !c.inkBounds.every(placeable)) return false;
      // Names placed before this one (continents, then oceans) keep their room.
      if (f.kind !== 'continent') for (const b of c.inkBounds) for (const r of reserved) if (b.x2 > r.x1 - gap && b.x1 < r.x2 + gap && b.y2 > r.y1 - gap && b.y1 < r.y2 + gap) return false;
      if (f.kind === 'continent') return n[1]! >= OWN_FRACTION.continent * t.total;
      if (f.kind === 'ocean') return n[3]! + n[4]! <= 0.03 * t.total && n[1]! + n[2]! + n[5]! >= OWN_FRACTION.ocean * t.total;
      if (f.kind === 'sea') return n[1]! >= OWN_FRACTION.sea * t.total;
      return n[3]! + n[4]! <= 0.12 * t.total; // an island's name may cover the island but not another landmass
    };
    for (const step of ladder) {
      const size = baseSize * factor * step;
      if (size < MIN_SIZE * unit) break;
      const tracking = font.tracking * size * (step === 1 ? 1 : step > 0.8 ? 0.8 : 0.55), text = display(f, font);
      const m = measureText(text, { size, tracking });
      // Centred on the anchor: the text box's middle (half way between the ascent line and the descent line) at the anchor. If that
      // spot is not allowed (a fixed box, a bay), the nearest allowed spot on the solver's own rings of offsets is the starting point.
      const cx = ax - m.width / 2, cy = ay + ((ASCENT - DESCENT) / 2) * size, rowH = m.bounds.y2 - m.bounds.y1;
      const at = (dx: number, dy: number) => {
        const t = (b: LabelBounds): LabelBounds => ({ x1: b.x1 + dx, y1: b.y1 + dy, x2: b.x2 + dx, y2: b.y2 + dy });
        return { bounds: t(m.bounds), inkBounds: m.ink.map(t) };
      };
      let found = at(cx, cy);
      if (!accept(found)) {
        let ok: typeof found | undefined;
        for (const mult of [0.4, 0.8, 1.2, 1.8, 2.5, 3.5]) {
          for (let k = 0; k < 12 && !ok; k++) {
            const cand = at(cx + dmath.cos((k * Math.PI) / 6) * rowH * mult, cy + dmath.sin((k * Math.PI) / 6) * rowH * mult);
            if (accept(cand)) ok = cand;
          }
          if (ok) break;
        }
        if (!ok) continue;
        found = ok;
      }
      const box = found.bounds, ink = found.inkBounds;
      meta.set(f.id, { f, font, text, size, tracking, fade: g });
      const req: LabelRequest = { type: 'point', id: f.id, bounds: box, inkBounds: ink, accept };
      requests.push(req); byId.set(f.id, req);
      if (f.kind !== 'island') reserved.push(...ink);
      break;
    }
  }

  const result = spreadLabels(requests, opts.obstacles ?? [], { bounds, scale: 1 }, opts.seed ?? `${data.seed}|${style.id}`);
  const labels: PlacedText[] = [];
  for (const p of result.labels) {
    const m = meta.get(p.id)!;
    if (p.type === 'path') {
      // The solver may be left with only invalid offsets (text longer than the path there, or running backwards): such a label is dropped.
      const ms = measureOnPath(m.line!, m.text, m.size, m.tracking, p.placement.startOffset ?? 50);
      if (!ms.upright || ms.bounds.x2 - ms.bounds.x1 <= 1.5) continue;
    }
    const base = { id: p.id, kind: m.f.kind, text: m.text, size: m.size, tracking: m.tracking, italic: !!m.font.italic, fill: m.font.fill, halo: m.font.halo, haloWidth: m.font.halo_w * m.size, opacity: Math.round((m.font.opacity ?? 1) * m.fade * 100) / 100 };
    if (p.type === 'path') labels.push({ ...base, pathD: m.line!.d(), startOffset: p.placement.startOffset ?? 50 });
    else {
      const req = byId.get(p.id) as Extract<LabelRequest, { type: 'point' }>;
      // The candidate's bounds are the request's bounds moved by (dx, dy); the baseline-left corner moves with them.
      labels.push({ ...base, x: req.bounds.x1 + (p.placement.dx ?? 0), y: req.bounds.y2 - DESCENT * m.size + (p.placement.dy ?? 0) });
    }
  }
  return { labels, stats: { considered, shown: requests.length, initialOverlaps: result.initialOverlaps, remainingOverlaps: result.remainingOverlaps } };
}

/** The ink boxes of a placed label (pixels), as the solver saw them: glyph runs of three, rotated onto the path for path labels. */
export function inkOf(l: PlacedText): LabelBounds[] {
  if (l.pathD) {
    const pts = [...l.pathD.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
    return measureOnPath(new Polyline(pts), l.text, l.size, l.tracking, l.startOffset ?? 50).inkBounds;
  }
  const m = measureText(l.text, { size: l.size, tracking: l.tracking });
  return m.ink.map((b) => ({ x1: b.x1 + l.x!, y1: b.y1 + l.y!, x2: b.x2 + l.x!, y2: b.y2 + l.y! }));
}
