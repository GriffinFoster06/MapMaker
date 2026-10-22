import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { elevToHeightKm } from '../../../packages/gen-orogen/src/port/color-map';
// @ts-expect-error plain .mjs tools
import { G5, NE_LAND, ETOPO, earthGrid5m, rasterisePolygons, readFloatTiff } from './earth-data.mjs';
// @ts-expect-error plain .mjs tools
import { metresToRaw } from './earth-real.mjs';
// @ts-expect-error plain .mjs tools
import { SCORED, TERMS_REAL, distancesReal, objectiveReal, variants } from './objective-real.mjs';

/** A one-band float32 TIFF, tiled, Deflate with the floating-point predictor (the ETOPO layout). */
function writeTiff(W: number, H: number, data: Float32Array, tile: number): Buffer {
  const across = Math.ceil(W / tile), down = Math.ceil(H / tile), blobs: Buffer[] = [];
  for (let ty = 0; ty < down; ty++) for (let tx = 0; tx < across; tx++) {
    const rowB = tile * 4, bytes = new Uint8Array(tile * rowB);
    for (let r = 0; r < tile; r++) {
      const planes = new Uint8Array(rowB);
      for (let i = 0; i < tile; i++) {
        const x = tx * tile + i, y = ty * tile + r, v = x < W && y < H ? data[y * W + x]! : 0;
        const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, v, false);
        for (let k = 0; k < 4; k++) planes[k * tile + i] = b.getUint8(k);
      }
      for (let i = rowB - 1; i > 0; i--) planes[i] = (planes[i]! - planes[i - 1]!) & 255;
      bytes.set(planes, r * rowB);
    }
    blobs.push(zlib.deflateSync(bytes));
  }
  const n = blobs.length, tags: [number, number, number[]][] = [
    [256, 3, [W]], [257, 3, [H]], [258, 3, [32]], [259, 3, [8]], [277, 3, [1]], [317, 3, [3]],
    [322, 3, [tile]], [323, 3, [tile]], [324, 4, []], [325, 4, blobs.map((b) => b.length)], [339, 3, [3]],
  ];
  const ifdAt = 8, ifdLen = 2 + 12 * tags.length + 4, extraAt = ifdAt + ifdLen, extra = 8 * n;
  let at = extraAt + extra;
  tags[8]![2] = blobs.map((b) => { const o = at; at += b.length; return o; });
  const buf = Buffer.alloc(at);
  buf.write('II', 0, 'latin1'); buf.writeUInt16LE(42, 2); buf.writeUInt32LE(ifdAt, 4); buf.writeUInt16LE(tags.length, ifdAt);
  let ex = extraAt;
  tags.forEach(([tag, type, vals], i) => {
    const o = ifdAt + 2 + 12 * i;
    buf.writeUInt16LE(tag, o); buf.writeUInt16LE(type, o + 2); buf.writeUInt32LE(vals.length, o + 4);
    const size = type === 3 ? 2 : 4;
    if (vals.length * size <= 4) vals.forEach((v, k) => (size === 2 ? buf.writeUInt16LE(v, o + 8 + 2 * k) : buf.writeUInt32LE(v, o + 8)));
    else { buf.writeUInt32LE(ex, o + 8); vals.forEach((v, k) => buf.writeUInt32LE(v, ex + 4 * k)); ex += 4 * vals.length; }
  });
  let p = extraAt + extra; for (const b of blobs) { b.copy(buf, p); p += b.length; }
  return buf;
}

describe('earth data readers', () => {
  it('reads a tiled Deflate GeoTIFF with the floating-point predictor exactly', () => {
    const W = 37, H = 21, data = Float32Array.from({ length: W * H }, (_, i) => Math.sin(i) * 9000 - (i % 7) * 0.125);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tiff-')), 't.tif');
    fs.writeFileSync(file, writeTiff(W, H, data, 16));
    const t = readFloatTiff(file);
    expect([t.W, t.H]).toEqual([W, H]);
    expect(Array.from(t.data)).toEqual(Array.from(data));
  });
  it('rasterises polygons by even-odd fill at pixel centres, holes included', () => {
    const sq = (a: number, b: number) => [[a, a], [b, a], [b, b], [a, b], [a, a]];
    const m = rasterisePolygons([{ geometry: { type: 'Polygon', coordinates: [sq(-10, 10), sq(-5, 5)] } }], 360, 180);
    expect(m.reduce((s: number, v: number) => s + v, 0)).toBe(400 - 100);
    expect(m[(90 - 7) * 360 + 180 + 7]).toBe(1);
    expect(m[90 * 360 + 180]).toBe(0);
  });
  it('metres to raw elevation inverts elevToHeightKm on land and ocean', () => {
    for (const m of [-6000, -1, 1, 50, 448, 2000, 5800]) expect(elevToHeightKm(metresToRaw(m)) * 1000).toBeCloseTo(m, 6);
  });
});

describe('objective against independent targets', () => {
  it('scores verified terms only; a world at the targets scores 0; the variants cover each term both ways', () => {
    expect(SCORED).not.toContain('rivers');
    expect(TERMS_REAL.rivers.verified).toBe(false);
    const d = Object.fromEntries(Object.keys(TERMS_REAL).map((k) => [k, 0]));
    expect(objectiveReal(d).objective).toBe(0);
    expect(objectiveReal({ ...d, rivers: 99 }).objective).toBe(0);
    expect(objectiveReal({ ...d, meanT: 2 }).terms.meanT).toBe(2);
    expect(distancesReal({ landFrac: 0 }, { meanT: 14.5 }).meanT).toBe(4);
    expect(variants().length).toBe(1 + 4 * SCORED.length + 2 + 1);
  });
});

// Needs the downloaded data (fetch-earth.sh); golden values of the 5' grid.
describe.skipIf(!fs.existsSync(ETOPO) || !NE_LAND.every((f: string) => fs.existsSync(f)))('ETOPO 2022 and Natural Earth', () => {
  it('the 5 arc-minute grid has Natural Earth land share 0.2877 and known elevations', () => {
    const g = earthGrid5m();
    let tot = 0, land = 0;
    for (let j = 0; j < G5.H; j++) { const w = Math.cos((90 - (j + 0.5) / 12) * Math.PI / 180); for (let i = 0; i < G5.W; i++) { tot += w; land += w * g.land[j * G5.W + i]; } }
    expect(land / tot).toBeCloseTo(0.28765, 4);
    const at = (lat: number, lon: number) => g.elevLand[Math.floor((90 - lat) * 12) * G5.W + Math.floor((lon + 180) * 12)];
    expect(at(31.5, 35.5)).toBeLessThan(-300); // Dead Sea
    expect(at(28.0, 86.9)).toBeGreaterThan(5000); // Everest massif
  }, 300_000);
});
