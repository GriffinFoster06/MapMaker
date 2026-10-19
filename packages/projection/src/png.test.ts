// 16-bit PNG heightmap export (png.ts). The encoder against orogen's own (run from upstream/, unmodified), a decode
// that equals the sampler's raster under each mapping, the recorded text, and a golden hash of a fixed export.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { OrogenLcg, SphereMesh, bytesOf, dmath, sha256 } from '@mapmaker/core';
import { MeshSampler, type HeightMapping, crc32, encodePng16, quantise } from './index';
import { exactView, exportHeightmap } from './exact';

interface Decoded { width: number; height: number; colourType: number; grey: Uint16Array; alpha: Uint16Array | null; texts: Record<string, string>; chunks: string[] }

/** Minimal PNG decoder for 16-bit grey (type 0) and grey + alpha (type 4), filter 0; checks every CRC. */
function decode(png: Uint8Array): Decoded {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8, width = 0, height = 0, colourType = -1;
  const idat: Uint8Array[] = [], texts: Record<string, string> = {}, chunks: string[] = [];
  while (p < png.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...png.subarray(p + 4, p + 8)), data = png.subarray(p + 8, p + 8 + len);
    expect(dv.getUint32(p + 8 + len), `${type} CRC`).toBe(crc32(png.subarray(p + 4, p + 8 + len)));
    chunks.push(type);
    if (type === 'IHDR') {
      width = dv.getUint32(p + 8); height = dv.getUint32(p + 12); colourType = data[9]!;
      expect([data[8], data[10], data[11], data[12]]).toEqual([16, 0, 0, 0]);
    } else if (type === 'tEXt') {
      const z = data.indexOf(0);
      texts[String.fromCharCode(...data.subarray(0, z))] = String.fromCharCode(...data.subarray(z + 1));
    } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = unzlibSync(Uint8Array.from(idat.flatMap((d) => [...d])));
  const bpp = colourType === 4 ? 4 : 2, rowLen = 1 + width * bpp;
  expect(raw.length).toBe(height * rowLen);
  const grey = new Uint16Array(width * height), alpha = colourType === 4 ? new Uint16Array(width * height) : null;
  for (let y = 0; y < height; y++) {
    expect(raw[y * rowLen]).toBe(0);
    for (let x = 0; x < width; x++) {
      const o = y * rowLen + 1 + x * bpp;
      grey[y * width + x] = (raw[o]! << 8) | raw[o + 1]!;
      if (alpha) alpha[y * width + x] = (raw[o + 2]! << 8) | raw[o + 3]!;
    }
  }
  return { width, height, colourType, grey, alpha, texts, chunks };
}

/** orogen's encoder, evaluated from upstream/orogen/js/planet-mesh.js @ cc2662b as written (CompressionStream zlib). */
function orogenEncoder(): (w: number, h: number, d: Uint16Array) => Promise<Blob> {
  const src = readFileSync(resolve(__dirname, '../../../upstream/orogen/js/planet-mesh.js'), 'utf8');
  const a = src.indexOf('const _crc32Table'), b = src.indexOf('// ────', src.indexOf('async function encode16BitGrayscalePNG'));
  expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a);
  return new Function(`${src.slice(a, b)}\nreturn encode16BitGrayscalePNG;`)() as (w: number, h: number, d: Uint16Array) => Promise<Blob>;
}

const rng = new OrogenLcg('mesh', 5);
const M = SphereMesh.build({ N: 6000, jitter: 0.75, rng: () => rng.next(), precision: 'f64' });
const S = new MeshSampler(M);
/** Synthetic elevation in metres spanning −7 km to +8 km, so every mapping clamps somewhere. */
const ELEV = (() => {
  const v = new Float64Array(M.numRegions), p = M.points;
  for (let i = 0; i < M.numRegions; i++) v[i] = 6000 * dmath.sin(4 * p[3 * i]! + 2 * p[3 * i + 2]!) + 2000 * p[3 * i + 1]!;
  return v;
})();

describe('encodePng16 (orogen encode16BitGrayscalePNG port)', () => {
  it("matches orogen's encoder: identical signature, IHDR and IEND chunks, identical scanlines after inflate", async () => {
    const w = 37, h = 11, d = Uint16Array.from({ length: w * h }, (_, i) => (i * 7919) & 0xffff);
    const ours = encodePng16(w, h, d, null);
    const theirs = new Uint8Array(await (await orogenEncoder()(w, h, d)).arrayBuffer());
    const prefix = 8 + 25; // signature + IHDR chunk
    expect([...ours.subarray(0, prefix)]).toEqual([...theirs.subarray(0, prefix)]);
    expect([...ours.subarray(-12)]).toEqual([...theirs.subarray(-12)]);
    const a = decode(ours), b = decode(theirs);
    expect(a.colourType).toBe(0);
    expect([...a.grey]).toEqual([...d]);
    expect([...b.grey]).toEqual([...d]);
  });

  it("quantises as orogen: (t·65535 + 0.5) | 0, absolute −5..6 km, land-only 0..6 km with ocean 0", () => {
    const abs: HeightMapping = { kind: 'absolute' }, land: HeightMapping = { kind: 'land' };
    expect(quantise(abs, -5000)).toBe(0);
    expect(quantise(abs, 6000)).toBe(65535);
    expect(quantise(abs, -9000)).toBe(0);
    expect(quantise(abs, 0)).toBe(((5 / 11) * 65535 + 0.5) | 0);
    expect(quantise(land, -100)).toBe(0);
    expect(quantise(land, 0)).toBe(0);
    expect(quantise(land, 3000)).toBe(32768);
    expect(quantise(land, 7000)).toBe(65535);
    expect(quantise({ kind: 'custom', minM: -1000, maxM: 1000 }, 0)).toBe(32768);
  });
});

describe('heightmap export through the exact path', () => {
  const mappings: HeightMapping[] = [{ kind: 'absolute' }, { kind: 'land' }, { kind: 'custom', minM: -2500, maxM: 4500 }];

  it('decodes to the quantised sampler raster for every mapping, with the mapping and range written as text', () => {
    for (const mapping of mappings) for (const projection of ['equirectangular', 'mollweide']) {
      const { png, metres } = exportHeightmap({ projection, width: 160, height: 80 }, S, ELEV, mapping);
      const d = decode(png);
      expect(d.chunks[0]).toBe('IHDR');
      expect(d.chunks.at(-2)).toBe('IDAT');
      expect([d.width, d.height]).toEqual([160, 80]);
      const outside = metres.some(Number.isNaN);
      expect(d.colourType, projection).toBe(outside ? 4 : 0);
      for (let i = 0; i < metres.length; i++) {
        if (Number.isNaN(metres[i]!)) { expect(d.alpha![i]).toBe(0); expect(d.grey[i]).toBe(0); continue; }
        if (d.alpha) expect(d.alpha[i]).toBe(65535);
        expect(d.grey[i]).toBe(quantise(mapping, metres[i]!));
      }
      const range = mapping.kind === 'absolute' ? '-5000 6000' : mapping.kind === 'land' ? '0 6000' : '-2500 4500';
      expect(d.texts['MapMaker.range_m']).toBe(range);
      expect(d.texts['MapMaker.mapping']).toBe(mapping.kind === 'land' ? 'land (ocean = 0)' : mapping.kind);
      expect(d.texts['MapMaker.projection']).toBe(`${projection} rotate 0 0 0`);
    }
  });

  it('the raster is the barycentric sample of elevation through the exact view', async () => {
    const opts = { projection: 'robinson', width: 120, height: 60, rotate: [40, 0, 0] as [number, number, number] };
    const { metres } = exportHeightmap(opts, S, ELEV, { kind: 'absolute' });
    const { sampleRaster } = await import('./sampler');
    expect(Buffer.from(metres.buffer).equals(Buffer.from(sampleRaster(exactView(opts), S, ELEV, 'barycentric').buffer))).toBe(true);
  });

  it('rejects an empty or inverted custom range', () => {
    expect(() => exportHeightmap({ projection: 'equirectangular', width: 8, height: 4 }, S, ELEV, { kind: 'custom', minM: 10, maxM: 10 })).toThrow(/bad range/);
  });

  it('golden: a fixed export has a fixed hash (fdlibm exact path; bytes identical on every engine)', async () => {
    const hashes: Record<string, string> = {};
    for (const projection of ['equirectangular', 'mollweide', 'orthographic']) {
      hashes[projection] = await sha256(bytesOf(exportHeightmap({ projection, width: 128, height: 64, rotate: [-30, 20, 0] }, S, ELEV, { kind: 'absolute' }).png));
    }
    expect(hashes).toEqual(GOLDEN);
  });
});

/** Recorded when the exporter was written (Phase 5 M2); also checked in every browser by the determinism probe. */
const GOLDEN: Record<string, string> = {
  equirectangular: 'ac08768473a1955a4da52edae82aec8b256c77d60e73171934768822fc654f12',
  mollweide: '9b2a83ac3da51b4a69f31946206c4195b60cad219f2e8dae093c4bbbc7f51eee',
  orthographic: 'ad1c2cbfe8181ee536eb5cecc6848093e4ec7ee4d604518df466fc39ebf6defb',
};
