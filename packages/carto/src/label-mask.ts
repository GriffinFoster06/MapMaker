// A screen-space picture of what lies under each part of a view, for label placement (labels stay on their own ground and
// inside the map). Original code. The view's `invert` is asked for the geographic position under the centre of every cell of a
// coarse grid (a few pixels per cell), and the regions raster of the data (data.ts `RegionGrid`) gives the ground there. From that
// come the clearance of each cell (pixels to the nearest cell of another region, or to the view's edge) and its distance to the
// map's outline. Both are measured in the view's own pixels, so they are right for any projection, zoom and for the globe.
import type { RegionGrid } from './data';
import type { LabelBounds } from './label-spread';

/** A cell outside the map (beyond the outline, or the far side of the globe). */
export const OUTSIDE = -3;

export interface LabelMask {
  cell: number;
  /** Pixel position of the top-left corner of cell (0, 0): at most 0, so the grid is aligned to the map (see `buildMask`). */
  ox: number;
  oy: number;
  cols: number;
  rows: number;
  /** Per cell: a feature index (≥ 0), `REGION_WATER`, `REGION_LAND` or `OUTSIDE`. */
  region: Int16Array;
  /** Pixels from the cell centre to the nearest cell of another region, or to the edge of the view. */
  clear: Float32Array;
  /** Pixels from the cell centre to the nearest `OUTSIDE` cell (1e9 when the view has none). */
  edge: Float32Array;
}

export interface MaskView {
  width: number;
  height: number;
  forward(lon: number, lat: number): [number, number] | null;
  invert(x: number, y: number): [number, number] | null;
  /** Same as `invert` without allocating: writes longitude and latitude to `out[0..1]` and returns whether the pixel is on the map. Optional; `buildMask` prefers it. */
  invertInto?(x: number, y: number, out: Float64Array): boolean;
}

/** Map points tried, in order, as the grid's anchor: the first that is on the view. */
const ANCHORS: [number, number][] = [[0, 0], [90, 0], [-90, 0], [180, 0], [0, 60], [0, -60], [45, 30], [-45, -30]];

const SQRT2 = 1.4142135623730951, FAR = 1e9;

/** Two-pass chamfer distance transform (weights 1 and √2, in pixels) from the seeded cells of `d`, which hold their start distance. */
function chamfer(d: Float32Array, cols: number, rows: number, cell: number): void {
  const a = cell, b = cell * SQRT2;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    let v = d[i]!;
    if (x > 0) v = Math.min(v, d[i - 1]! + a);
    if (y > 0) {
      v = Math.min(v, d[i - cols]! + a);
      if (x > 0) v = Math.min(v, d[i - cols - 1]! + b);
      if (x < cols - 1) v = Math.min(v, d[i - cols + 1]! + b);
    }
    d[i] = v;
  }
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) {
    const i = y * cols + x;
    let v = d[i]!;
    if (x < cols - 1) v = Math.min(v, d[i + 1]! + a);
    if (y < rows - 1) {
      v = Math.min(v, d[i + cols]! + a);
      if (x < cols - 1) v = Math.min(v, d[i + cols + 1]! + b);
      if (x > 0) v = Math.min(v, d[i + cols - 1]! + b);
    }
    d[i] = v;
  }
}

/** The region under a geographic position (degrees). */
export function regionAt(g: RegionGrid, lon: number, lat: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360), i = Math.min(g.w - 1, Math.floor((wrapped / 360) * g.w));
  const j = Math.min(g.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * g.h)));
  return g.id[j * g.w + i]!;
}

/**
 * The mask of a view. The grid is aligned to the map, not to the screen: a fixed point of the map (the first of `ANCHORS` that is
 * in view) sits on a cell corner, so when the view is panned the whole grid moves with the map, every cell keeps its contents,
 * and what is computed from the mask (the roomiest spot of a region) moves by exactly the pan instead of hopping from cell to
 * cell. A zoom or a rotation changes the grid, as it changes the map.
 */
export function buildMask(view: MaskView, regions: RegionGrid, cell: number): LabelMask {
  const g = maskGrid(view, cell), region = new Int16Array(g.cols * g.rows), out = new Float64Array(2);
  fillRows(view, regions, cell, g, region, 0, g.rows, out);
  return finishMask(cell, g, region);
}

/** What `buildMaskSliced` needs from its caller. */
export interface MaskSlicing {
  /** Longest stretch of rows computed before `yieldNow` (milliseconds of main-thread time). */
  sliceMs: number;
  /** Lets other work run (a macrotask turn). */
  yieldNow(): Promise<void>;
  /** True when the plan is no longer wanted (the view moved on): the mask is abandoned and null returned. */
  cancelled(): boolean;
  now(): number;
}

/**
 * `buildMask` in slices of rows. The slicing only decides when the work is paused, never what is computed, so the result is
 * identical to `buildMask`'s (tested). The caller must abandon the plan when the view changes (`cancelled`, checked between slices).
 */
export async function buildMaskSliced(view: MaskView, regions: RegionGrid, cell: number, s: MaskSlicing): Promise<LabelMask | null> {
  const g = maskGrid(view, cell), region = new Int16Array(g.cols * g.rows), out = new Float64Array(2);
  let y = 0, t0 = s.now();
  while (y < g.rows) {
    const y1 = Math.min(g.rows, y + 4); // a few rows between clock reads (a row is some 100 cells)
    fillRows(view, regions, cell, g, region, y, y1, out);
    y = y1;
    if (y < g.rows && s.now() - t0 >= s.sliceMs) {
      await s.yieldNow();
      if (s.cancelled()) return null;
      t0 = s.now();
    }
  }
  // The distance transforms are two linear passes (1 to 2 ms): a slice of their own.
  await s.yieldNow();
  if (s.cancelled()) return null;
  return finishMask(cell, g, region);
}

interface MaskGrid { ox: number; oy: number; cols: number; rows: number }

function maskGrid(view: MaskView, cell: number): MaskGrid {
  let ox = 0, oy = 0;
  for (const [lon, lat] of ANCHORS) {
    const xy = view.forward(lon, lat);
    if (xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1])) { ox = (((xy[0] % cell) + cell) % cell) - cell; oy = (((xy[1] % cell) + cell) % cell) - cell; break; }
  }
  const cols = Math.max(1, Math.ceil((view.width - ox) / cell)), rows = Math.max(1, Math.ceil((view.height - oy) / cell));
  return { ox, oy, cols, rows };
}

function fillRows(view: MaskView, regions: RegionGrid, cell: number, g: MaskGrid, region: Int16Array, y0: number, y1: number, out: Float64Array): void {
  const { ox, oy, cols } = g;
  for (let y = y0; y < y1; y++) for (let x = 0; x < cols; x++) {
    const px = ox + (x + 0.5) * cell, py = oy + (y + 0.5) * cell;
    if (view.invertInto) region[y * cols + x] = view.invertInto(px, py, out) ? regionAt(regions, out[0]!, out[1]!) : OUTSIDE;
    else {
      const ll = view.invert(px, py);
      region[y * cols + x] = ll ? regionAt(regions, ll[0], ll[1]) : OUTSIDE;
    }
  }
}

function finishMask(cell: number, g: MaskGrid, region: Int16Array): LabelMask {
  const { ox, oy, cols, rows } = g;
  const clear = new Float32Array(cols * rows).fill(FAR), edge = new Float32Array(cols * rows).fill(FAR);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x, r = region[i]!;
    if (r === OUTSIDE) edge[i] = 0;
    const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1 || region[i - 1]! !== r || region[i + 1]! !== r || region[i - cols]! !== r || region[i + cols]! !== r;
    // Neighbour reads at the array's border wrap or run off the array, which `border` already covers.
    if (border) clear[i] = 0.5 * cell;
  }
  chamfer(clear, cols, rows, cell);
  chamfer(edge, cols, rows, cell);
  return { cell, ox, oy, cols, rows, region, clear, edge };
}

/** The mask cells whose centres lie inside `b`, as an inclusive column and row range (empty when `x0 > x1`). */
function range(m: LabelMask, b: LabelBounds): { x0: number; x1: number; y0: number; y1: number } {
  const c = m.cell;
  return {
    x0: Math.max(0, Math.ceil((b.x1 - m.ox) / c - 0.5)), x1: Math.min(m.cols - 1, Math.floor((b.x2 - m.ox) / c - 0.5)),
    y0: Math.max(0, Math.ceil((b.y1 - m.oy) / c - 0.5)), y1: Math.min(m.rows - 1, Math.floor((b.y2 - m.oy) / c - 0.5)),
  };
}

/**
 * What lies under `boxes` (the ink boxes of one label): the number of mask cells whose centres fall inside, per group (`groupOf`
 * maps a region to a group number below `groups`), and the smallest distance to the map's outline among them. A box smaller
 * than a cell still samples the cell under its centre.
 */
export function tally(m: LabelMask, boxes: LabelBounds[], groupOf: (region: number) => number, groups: number): { total: number; counts: number[]; minEdge: number } {
  const counts = new Array<number>(groups).fill(0);
  let total = 0, minEdge = FAR;
  for (const b of boxes) {
    const r = range(m, b);
    if (r.x0 > r.x1) r.x0 = r.x1 = Math.min(m.cols - 1, Math.max(0, Math.floor(((b.x1 + b.x2) / 2 - m.ox) / m.cell)));
    if (r.y0 > r.y1) r.y0 = r.y1 = Math.min(m.rows - 1, Math.max(0, Math.floor(((b.y1 + b.y2) / 2 - m.oy) / m.cell)));
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const i = y * m.cols + x;
      counts[groupOf(m.region[i]!)]!++;
      total++;
      if (m.edge[i]! < minEdge) minEdge = m.edge[i]!;
    }
  }
  return { total, counts, minEdge };
}

/** The region id and the edge distance at a pixel (clamped into the view). */
export function cellAt(m: LabelMask, x: number, y: number): number {
  return Math.min(m.rows - 1, Math.max(0, Math.floor((y - m.oy) / m.cell))) * m.cols + Math.min(m.cols - 1, Math.max(0, Math.floor((x - m.ox) / m.cell)));
}
