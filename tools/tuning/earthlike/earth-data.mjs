// Independent Earth data for the Earth-likeness targets (decision P6): NOAA ETOPO 2022 surface elevation (60 arc-second
// GeoTIFF) and Natural Earth 10m land polygons, both public domain, downloaded by fetch-earth.sh into data/ (git-ignored).
// Original code: a minimal GeoTIFF reader (classic TIFF, tiles or strips, no compression / LZW / Deflate, horizontal or
// floating-point predictor, 32-bit float samples), an even-odd scanline rasteriser for the polygons, and the
// aggregation of both to a 5 arc-minute grid that is cached in data/ (earth-5m.bin) for the per-mesh targets.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA = process.env.EARTH_DATA ?? path.join(HERE, 'data');
export const ETOPO = path.join(DATA, 'ETOPO_2022_v1_60s_N90W180_surface.tif');
export const NE_LAND = ['ne_10m_land.geojson', 'ne_10m_minor_islands.geojson'].map((f) => path.join(DATA, f));

// ---------------------------------------------------------------------------------------------------- GeoTIFF reader

function lzwDecode(src, outLen) {
  const out = new Uint8Array(outLen);
  let op = 0, bitPos = 0, width = 9;
  const dict = [];
  for (let i = 0; i < 256; i++) dict.push(Uint8Array.of(i));
  const read = () => {
    let v = 0;
    for (let i = 0; i < width; i++) { const b = bitPos >> 3, s = 7 - (bitPos & 7); v = (v << 1) | ((src[b] >> s) & 1); bitPos++; }
    return v;
  };
  let prev = null;
  while (bitPos + width <= src.length * 8) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { dict.length = 258; width = 9; prev = null; continue; }
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) { entry = new Uint8Array(prev.length + 1); entry.set(prev); entry[prev.length] = prev[0]; } else throw new Error('LZW: bad code');
    if (op + entry.length > outLen) { out.set(entry.subarray(0, outLen - op), op); op = outLen; break; }
    out.set(entry, op); op += entry.length;
    if (prev) { const e = new Uint8Array(prev.length + 1); e.set(prev); e[prev.length] = entry[0]; dict.push(e); }
    if (dict.length === 256) dict.length = 258;
    if (dict.length + 1 >= (1 << width) && width < 12) width++;
    prev = entry;
  }
  return out;
}

/** Reads a single-band float32 GeoTIFF into a Float32Array (row-major, north row first). */
export function readFloatTiff(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(8); fs.readSync(fd, head, 0, 8, 0);
  const le = head.toString('latin1', 0, 2) === 'II';
  const u16 = (b, o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)), u32 = (b, o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  if (u16(head, 2) !== 42) throw new Error('not a classic TIFF (BigTIFF is not supported)');
  const ifd = u32(head, 4);
  const cnt = Buffer.alloc(2); fs.readSync(fd, cnt, 0, 2, ifd);
  const n = u16(cnt, 0), ent = Buffer.alloc(12 * n); fs.readSync(fd, ent, 0, 12 * n, ifd + 2);
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8 };
  const tags = {};
  for (let i = 0; i < n; i++) {
    const o = 12 * i, tag = u16(ent, o), type = u16(ent, o + 2), count = u32(ent, o + 4), bytes = (SIZE[type] ?? 1) * count;
    let buf = ent.subarray(o + 8, o + 12);
    if (bytes > 4) { buf = Buffer.alloc(bytes); fs.readSync(fd, buf, 0, bytes, u32(ent, o + 8)); }
    const vals = [];
    if (type === 3) for (let k = 0; k < count; k++) vals.push(u16(buf, 2 * k));
    else if (type === 4) for (let k = 0; k < count; k++) vals.push(u32(buf, 4 * k));
    else if (type === 12) for (let k = 0; k < count; k++) vals.push(le ? buf.readDoubleLE(8 * k) : buf.readDoubleBE(8 * k));
    else if (type === 2) vals.push(buf.toString('latin1', 0, count).replace(/\0$/, ''));
    tags[tag] = vals;
  }
  const W = tags[256][0], H = tags[257][0], comp = tags[259]?.[0] ?? 1, pred = tags[317]?.[0] ?? 1;
  if ((tags[258]?.[0] ?? 32) !== 32 || (tags[339]?.[0] ?? 3) !== 3 || (tags[277]?.[0] ?? 1) !== 1) throw new Error('expected one float32 sample per pixel');
  const tiled = !!tags[322];
  const tw = tiled ? tags[322][0] : W, th = tiled ? tags[323][0] : (tags[278]?.[0] ?? H);
  const offs = tiled ? tags[324] : tags[273], lens = tiled ? tags[325] : tags[279];
  const across = Math.ceil(W / tw), out = new Float32Array(W * H);
  const blockBytes = tw * th * 4;
  for (let b = 0; b < offs.length; b++) {
    const raw = Buffer.alloc(lens[b]); fs.readSync(fd, raw, 0, lens[b], offs[b]);
    const rows = tiled ? th : Math.min(th, H - b * th);
    let bytes;
    if (comp === 1) bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
    else if (comp === 8 || comp === 32946) bytes = zlib.inflateSync(raw);
    else if (comp === 5) bytes = lzwDecode(raw, tw * rows * 4);
    else throw new Error(`TIFF compression ${comp} is not supported`);
    let f;
    if (pred === 3) { // floating-point predictor: byte differences per row, then bytes regrouped (MSB plane first)
      f = new Float32Array(tw * rows);
      const dv = new DataView(f.buffer), rowB = tw * 4, tmp = new Uint8Array(rowB);
      for (let r = 0; r < rows; r++) {
        const row = bytes.subarray(r * rowB, (r + 1) * rowB);
        tmp.set(row);
        for (let i = 1; i < rowB; i++) tmp[i] = (tmp[i] + tmp[i - 1]) & 255;
        for (let i = 0; i < tw; i++) {
          // planes: byte 0 = most significant (big-endian order within the predictor's layout)
          const v = (tmp[i] << 24) | (tmp[tw + i] << 16) | (tmp[2 * tw + i] << 8) | tmp[3 * tw + i];
          dv.setUint32(4 * (r * tw + i), v >>> 0, true);
        }
      }
    } else {
      const copy = new Uint8Array(blockBytes); copy.set(bytes.subarray(0, Math.min(bytes.length, blockBytes)));
      f = new Float32Array(copy.buffer, 0, tw * rows);
      if (!le) { const dv = new DataView(copy.buffer); for (let i = 0; i < tw * rows; i++) f[i] = dv.getFloat32(4 * i, false); }
      if (pred === 2) throw new Error('horizontal predictor on float data is not supported');
    }
    const bx = tiled ? (b % across) * tw : 0, by = tiled ? Math.floor(b / across) * th : b * th;
    for (let r = 0; r < rows && by + r < H; r++) {
      const w = Math.min(tw, W - bx);
      out.set(f.subarray(r * tw, r * tw + w), (by + r) * W + bx);
    }
  }
  fs.closeSync(fd);
  const nodata = tags[42113] ? Number(tags[42113][0]) : null;
  return { W, H, data: out, nodata, tiePoint: tags[33922], scale: tags[33550] };
}

// ------------------------------------------------------------------------------------------------- polygon rasteriser

/** Even-odd fill of every ring of the GeoJSON (Multi)Polygons at pixel centres of a W x H equal-angle grid (row 0 north). */
export function rasterisePolygons(features, W, H) {
  const rows = Array.from({ length: H }, () => []);
  const toX = (lon) => ((lon + 180) / 360) * W - 0.5, toY = (lat) => ((90 - lat) / 180) * H - 0.5;
  const ring = (pts) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const x0 = toX(pts[k][0]), y0 = toY(pts[k][1]), x1 = toX(pts[k + 1][0]), y1 = toY(pts[k + 1][1]);
      if (y0 === y1) continue;
      const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
      for (let j = Math.max(0, Math.ceil(ya)); j <= Math.min(H - 1, Math.ceil(yb) - 1); j++) {
        if (j < ya || j >= yb) continue;
        rows[j].push(x0 + ((j - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
  };
  for (const f of features) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) for (const r of p) ring(r);
  }
  const mask = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const xs = Float64Array.from(rows[j]).sort();
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let i = Math.max(0, Math.ceil(xs[k])); i <= Math.min(W - 1, Math.ceil(xs[k + 1]) - 1); i++) mask[j * W + i] ^= 1;
    }
    rows[j] = null;
  }
  return mask;
}

// --------------------------------------------------------------------------------------------------- 5' aggregation

export const G5 = { W: 4320, H: 2160 };

/**
 * The 5 arc-minute grid (4320 x 2160, row 0 at 90° N): per pixel the land share of its 25 one-minute pixels (Natural
 * Earth), the mean ETOPO elevation of its land and of its ocean one-minute pixels (m; NaN where none), cached.
 */
export function earthGrid5m() {
  const cache = path.join(DATA, 'earth-5m.bin');
  const n = G5.W * G5.H;
  if (fs.existsSync(cache)) {
    const b = fs.readFileSync(cache), f = new Float32Array(b.buffer, b.byteOffset, 3 * n);
    return { ...G5, land: f.subarray(0, n), elevLand: f.subarray(n, 2 * n), elevOcean: f.subarray(2 * n, 3 * n) };
  }
  const t = readFloatTiff(ETOPO);
  if (t.W !== 21600 || t.H !== 10800) throw new Error(`unexpected ETOPO size ${t.W} x ${t.H}`);
  const features = NE_LAND.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).features);
  const mask = rasterisePolygons(features, t.W, t.H);
  const out = new Float32Array(3 * n), land = out.subarray(0, n), eL = out.subarray(n, 2 * n), eO = out.subarray(2 * n, 3 * n);
  for (let J = 0; J < G5.H; J++) for (let I = 0; I < G5.W; I++) {
    let nl = 0, sl = 0, no = 0, so = 0;
    for (let dj = 0; dj < 5; dj++) for (let di = 0; di < 5; di++) {
      const q = (5 * J + dj) * t.W + 5 * I + di, v = t.data[q];
      if (mask[q]) { nl++; sl += v; } else { no++; so += v; }
    }
    const p = J * G5.W + I;
    land[p] = nl / 25; eL[p] = nl ? sl / nl : NaN; eO[p] = no ? so / no : NaN;
  }
  fs.writeFileSync(cache, Buffer.from(out.buffer));
  return { ...G5, land, elevLand: eL, elevOcean: eO };
}
