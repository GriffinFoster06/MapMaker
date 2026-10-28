// The "Earth" world option (Phase 6 M5, decision P12). Original code.
// Real elevation replaces the generated elevation; plates, climate, Köppen and drainage still run from the seed.
// The grid is the derived 5 arc-minute Int16 metre grid of assets/earth-5m.i16.gz (build-earth-grid.mjs), set once
// by the host (setEarthGrid; Node: earth-node.ts, browser: fetch + DecompressionStream) because the stages are sync.
import { dmath } from '@mapmaker/core';

export const EARTH_GRID_W = 4320;
export const EARTH_GRID_H = 2160;

let grid: Int16Array | undefined;

export function setEarthGrid(g: Int16Array | undefined): void {
  if (g && g.length !== EARTH_GRID_W * EARTH_GRID_H) throw new Error(`Earth grid: expected ${EARTH_GRID_W * EARTH_GRID_H} values, got ${g.length}`);
  grid = g;
}

export function earthGrid(): Int16Array {
  if (!grid) throw new Error('the Earth option needs the Earth grid loaded first (setEarthGrid)');
  return grid;
}

/** Real elevation in metres at each point of an orogen-frame array (+y north, lon 0 at +z), bilinear in the 5' grid. */
export function sampleEarthMetres(r_xyz: ArrayLike<number>, n: number): Float32Array {
  const g = earthGrid(), W = EARTH_GRID_W, H = EARTH_GRID_H;
  const out = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    const lat = dmath.asin(Math.max(-1, Math.min(1, r_xyz[3 * r + 1]!)));
    const lon = dmath.atan2(r_xyz[3 * r]!, r_xyz[3 * r + 2]!);
    // Pixel centres sit at half-integers.
    const px = (lon / Math.PI + 1) * 0.5 * W - 0.5, py = Math.max(0, Math.min(H - 1, (0.5 - lat / Math.PI) * H - 0.5));
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const xa = ((x0 % W) + W) % W, xb = (xa + 1) % W, y1 = Math.min(y0 + 1, H - 1);
    out[r] = g[y0 * W + xa]! * (1 - fx) * (1 - fy) + g[y0 * W + xb]! * fx * (1 - fy) + g[y1 * W + xa]! * (1 - fx) * fy + g[y1 * W + xb]! * fx * fy;
  }
  return out;
}
