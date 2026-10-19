// 16-bit PNG heightmap export through the exact path (ARCHITECTURE §3.7; Phase 5 decision 3).
// The encoder is ported from orogen (upstream/orogen/js/planet-mesh.js @ cc2662b, encode16BitGrayscalePNG, _pngChunk,
// _crc32; GPL-3.0): the same CRC table, chunk layout, IHDR (bit depth 16), filter-0 scanlines and big-endian samples.
// Changes: zlib compression by fflate's zlibSync (pure JS, so the bytes are identical on every engine) instead of the
// browser's CompressionStream; tEXt chunks recording the mapping; and, when some pixels lie outside the projection's
// domain, colour type 4 (grey + alpha, alpha 0 outside) instead of type 0.
//
// Mappings (orogen's two, plus a custom range): metres → t ∈ [0, 1] → round(t · 65535) as orogen quantises
// (Math.max(0, Math.min(65535, (t·65535 + 0.5) | 0))):
//   absolute  t = clamp((m + 5000) / 11000): orogen heightmapColor, −5 km → 0, 6 km → 65535;
//   land      ocean (m ≤ 0) → 0, land t = clamp(m / 6000): orogen landHeightmapColor;
//   custom    t = clamp((m − min) / (max − min)) for a range in metres.
// The mapping is applied to the sampled elevation (orogen maps per vertex and lets the GPU interpolate t; mapping
// after barycentric sampling keeps the export exact in metres and differs only where a triangle straddles a clamp).
import { zlibSync } from 'fflate';
import { sampleRaster, type MeshSampler } from './sampler';
import type { ProjectionView } from './view';

export type HeightMapping = { kind: 'absolute' } | { kind: 'land' } | { kind: 'custom'; minM: number; maxM: number };

/** The metre range that maps to 0 and 65535. */
export function mappingRange(m: HeightMapping): [number, number] {
  return m.kind === 'absolute' ? [-5000, 6000] : m.kind === 'land' ? [0, 6000] : [m.minM, m.maxM];
}

/** 16-bit sample of an elevation in metres (orogen's quantisation). */
export function quantise(m: HeightMapping, metres: number): number {
  if (m.kind === 'land' && metres <= 0) return 0;
  const [lo, hi] = mappingRange(m);
  const t = Math.max(0, Math.min(1, (metres - lo) / (hi - lo)));
  return Math.max(0, Math.min(65535, (t * 65535 + 0.5) | 0));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const c = new Uint8Array(4 + 4 + data.length + 4);
  const dv = new DataView(c.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
  c.set(data, 8);
  dv.setUint32(8 + data.length, crc32(c.subarray(4, 8 + data.length)));
  return c;
}

/** tEXt payload: Latin-1 keyword (1–79 chars), NUL, text. */
function text(keyword: string, value: string): Uint8Array {
  const s = `${keyword}\0${value}`;
  if (keyword.length < 1 || keyword.length > 79 || /[^\x20-\x7e]/.test(keyword) || /[^\x20-\x7e\n]/.test(value)) throw new Error(`bad tEXt: ${keyword}`);
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}

/**
 * Encodes 16-bit samples as a PNG. With `alpha`, colour type 4 (grey, alpha per pixel, 0 or 65535); otherwise colour
 * type 0. `texts` become tEXt chunks after IHDR, in the given order.
 */
export function encodePng16(width: number, height: number, grey: Uint16Array, alpha: Uint8Array | null, texts: [string, string][] = []): Uint8Array {
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr[8] = 16; ihdr[9] = alpha ? 4 : 0;
  const bpp = alpha ? 4 : 2;
  const rowLen = 1 + width * bpp;
  const raw = new Uint8Array(height * rowLen);
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    raw[off] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const v = grey[y * width + x]!, o = off + 1 + x * bpp;
      raw[o] = (v >> 8) & 0xff;
      raw[o + 1] = v & 0xff;
      if (alpha) raw[o + 2] = raw[o + 3] = alpha[y * width + x] ? 0xff : 0;
    }
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    ...texts.map(([k, v]) => chunk('tEXt', text(k, v))),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) { png.set(part, p); p += part.length; }
  return png;
}

export interface HeightmapExport {
  png: Uint8Array;
  /** The sampled elevation in metres, NaN outside the domain (the raster the PNG was quantised from). */
  metres: Float64Array;
}

/** Quantises a sampled metre raster (NaN outside) and encodes it with the mapping and view recorded as text. */
export function heightmapPngFromRaster(view: ProjectionView, metres: Float64Array, mapping: HeightMapping): Uint8Array {
  const [lo, hi] = mappingRange(mapping);
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)) throw new Error(`heightmapPng: bad range ${lo}..${hi} m`);
  const n = view.width * view.height;
  if (metres.length !== n) throw new Error(`heightmapPng: raster of ${metres.length} for ${view.width}×${view.height}`);
  const grey = new Uint16Array(n);
  let outside = false;
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const m = metres[i]!;
    if (Number.isNaN(m)) { outside = true; continue; }
    inside[i] = 1;
    grey[i] = quantise(mapping, m);
  }
  const rot = view.projection.rotate();
  return encodePng16(view.width, view.height, grey, outside ? inside : null, [
    ['Software', 'MapMaker'],
    ['MapMaker.layer', 'elevation'],
    ['MapMaker.mapping', mapping.kind === 'land' ? 'land (ocean = 0)' : mapping.kind],
    ['MapMaker.range_m', `${lo} ${hi}`],
    ['MapMaker.projection', `${view.spec.id} rotate ${rot.join(' ')}`],
  ]);
}

/** Samples elevation (metres per cell) through an exact view and encodes the 16-bit heightmap. */
export function heightmapPng(view: ProjectionView, sampler: MeshSampler, elevationM: ArrayLike<number>, mapping: HeightMapping): HeightmapExport {
  const metres = sampleRaster(view, sampler, elevationM, 'barycentric');
  return { png: heightmapPngFromRaster(view, metres, mapping), metres };
}
