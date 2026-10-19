// Golden images per theme (Phase 5c tests): the styled raster of the 20k world (seed 12345, structured pipeline) in
// Robinson at 192 × 104, compared with a committed PNG under a per-pixel tolerance. The exact path is deterministic, so the
// tolerance is a guard against platform differences in zlib or the PNG container only; it is not meant to absorb changes of
// style or shading: a theme change is an intended change, and regenerating its golden is stated in the commit.
// Regenerate with UPDATE_GOLDEN=1 (never to make a failing test pass without explaining the cause).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzlibSync } from 'fflate';
import { beforeAll, describe, expect, test } from 'vitest';
import type { World } from '@mapmaker/core';
import { biomeColor } from '@mapmaker/gen-orogen/palettes';
import { cartoKernels } from './kernels';
import { THEMES, THEME_IDS } from './style';
import { testWorld } from './test-world';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden');
const W = 192, H = 104;
/** Largest allowed difference of any channel of any pixel, and of the mean over the image (0 to 255). */
const MAX_PIXEL = 2, MAX_MEAN = 0.05;

/** Decodes the 8-bit RGBA PNGs this project writes (colour type 6, filter 0, one or more IDAT chunks). */
function decode(png: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20);
  expect([png[24], png[25]]).toEqual([8, 6]);
  const idat: Uint8Array[] = [];
  for (let o = 8; o < png.length;) {
    const len = dv.getUint32(o), type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (type === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const z = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  idat.reduce((off, c) => { z.set(c, off); return off + c.length; }, 0);
  const raw = unzlibSync(z), rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) { expect(raw[y * (1 + 4 * w)]).toBe(0); rgba.set(raw.subarray(y * (1 + 4 * w) + 1, (y + 1) * (1 + 4 * w)), y * 4 * w); }
  return { w, h, rgba };
}

let world: World;
const kernels = cartoKernels({ biome: { color: biomeColor as never, rawElevation: 'detail.elevRaw' } });
beforeAll(async () => { world = await testWorld(); }, 120_000);

describe('golden images', () => {
  for (const id of THEME_IDS) {
    test(`${id}: the styled raster matches its golden within the pixel tolerance`, () => {
      const png = kernels['carto.png'](world, { view: { projection: 'robinson', width: W, height: H }, style: THEMES[id]! });
      const file = join(DIR, `${id}.png`);
      if (process.env['UPDATE_GOLDEN'] === '1') { mkdirSync(DIR, { recursive: true }); writeFileSync(file, png); }
      expect(existsSync(file), `missing golden ${file}; generate with UPDATE_GOLDEN=1`).toBe(true);
      const got = decode(png), want = decode(new Uint8Array(readFileSync(file)));
      expect([got.w, got.h]).toEqual([want.w, want.h]);
      let max = 0, sum = 0;
      for (let i = 0; i < got.rgba.length; i++) { const d = Math.abs(got.rgba[i]! - want.rgba[i]!); max = Math.max(max, d); sum += d; }
      expect(max, `${id} max channel difference`).toBeLessThanOrEqual(MAX_PIXEL);
      expect(sum / got.rgba.length, `${id} mean difference`).toBeLessThanOrEqual(MAX_MEAN);
    });
  }
});
