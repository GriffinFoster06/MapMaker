// Distortion overlays (overlay.ts): per-pixel values on the inverse path, outside and singular pixels flagged, the
// ramps, and the exported PNG through the exact path; pole and antimeridian pixels.
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  type DistortionRaster, PROJECTIONS, ProjectionView, SINGULAR_RGBA, distortion, distortionRaster, distortionRgba, rampPosition,
} from './index';
import { exactView, exportDistortionPng } from './exact';

const RAD = Math.PI / 180;

describe('distortionRaster', () => {
  it('equirectangular: h = 1 and k = sec φ at every pixel; equal-area: areal 1; conformal: ω 0', () => {
    const v = new ProjectionView({ projection: 'equirectangular', width: 180, height: 90 });
    const h = distortionRaster(v, 'h'), k = distortionRaster(v, 'k');
    for (let j = 0; j < 90; j++) for (let i = 0; i < 180; i++) {
      const lat = v.invert(i + 0.5, j + 0.5)![1];
      expect(h.values[j * 180 + i]).toBeCloseTo(1, 8);
      expect(k.values[j * 180 + i]! * Math.cos(lat * RAD)).toBeCloseTo(1, 7);
    }
    for (const s of PROJECTIONS.filter((p) => p.equalArea || p.conformal)) {
      const r = distortionRaster(new ProjectionView({ projection: s.id, width: 120, height: 60, rotate: [20, 30, 0] }), s.equalArea ? 'areal' : 'omega');
      for (let i = 0; i < r.values.length; i++) if (!r.outside[i]) expect(r.values[i]!, s.id).toBeCloseTo(s.equalArea ? 1 : 0, 5);
    }
  });

  it('every projection: no NaN inside the domain, outside exactly where invert rejects the pixel, Mercator poles outside', () => {
    for (const s of PROJECTIONS) for (const q of ['areal', 'omega', 'h', 'k'] as const) {
      const v = new ProjectionView({ projection: s.id, width: 80, height: 40, rotate: [-50, 20, 10] });
      const r = distortionRaster(v, q);
      for (let j = 0; j < 40; j++) for (let i = 0; i < 80; i++) {
        const o = j * 80 + i, inside = v.invert(i + 0.5, j + 0.5) !== null;
        expect(r.outside[o], `${s.id} ${q}`).toBe(inside ? 0 : 1);
        if (inside) expect(Number.isNaN(r.values[o]), `${s.id} ${q} ${i},${j}`).toBe(false);
      }
    }
  });

  it('a pixel centred on a pole of a point projection gives h = k = 1, ω = 0 (polar aspect, both poles)', () => {
    for (const id of ['azimuthalEqualArea', 'azimuthalEquidistant', 'orthographic', 'stereographic']) for (const lat of [90, -90]) {
      const v = exactView({ projection: id, width: 101, height: 101, rotate: [0, -lat, 0] });
      expect(Math.abs(v.invert(50.5, 50.5)![1] - lat)).toBeLessThan(1e-9);
      for (const q of ['h', 'k', 'areal', 'omega'] as const) {
        const r = distortionRaster(v, q, { y0: 50, y1: 51 });
        expect(r.values[50]!, `${id} ${lat} ${q}`).toBeCloseTo(q === 'omega' ? 0 : 1, 6);
        expect(r.singular[50]).toBe(0);
      }
    }
  });

  it('the top and bottom rows of line and cusp projections are finite, with k growing towards the pole line', () => {
    for (const id of ['equirectangular', 'equalEarth', 'mollweide', 'robinson']) {
      const v = exactView({ projection: id, width: 200, height: 100 });
      const r = distortionRaster(v, 'k');
      // The first row inside the outline (Equal Earth's fitted outline is a little shorter than the image).
      const col = 100, j0 = [...Array(100).keys()].find((j) => !r.outside[j * 200 + col])!;
      expect(j0, id).toBeLessThan(3);
      const top = r.values[j0 * 200 + col]!, next = r.values[(j0 + 1) * 200 + col]!;
      expect(Number.isFinite(top), id).toBe(true);
      expect(top, id).toBeGreaterThan(next);
      expect(r.values[(99 - j0) * 200 + col], id).toBeCloseTo(top, 6); // symmetric about the equator
    }
  });

  it('the antimeridian is no seam: the first and last columns of an unrotated view mirror each other', () => {
    for (const id of ['equirectangular', 'mollweide', 'winkel3']) for (const q of ['areal', 'omega', 'h', 'k'] as const) {
      const v = exactView({ projection: id, width: 160, height: 80 });
      const r = distortionRaster(v, q);
      for (let j = 0; j < 80; j++) {
        const a = r.values[j * 160]!, b = r.values[j * 160 + 159]!;
        if (Number.isNaN(a)) { expect(b).toBeNaN(); continue; }
        expect(Math.abs(a - b) / Math.max(1, Math.abs(a)), `${id} ${q} row ${j}`).toBeLessThan(1e-6);
      }
    }
  });
});

describe('distortionRgba', () => {
  it('singular pixels get the dedicated colour, outside pixels are transparent, the ramps are monotone', () => {
    const r: DistortionRaster = { width: 4, y0: 0, quantity: 'k', values: Float64Array.from([Infinity, NaN, 1, 8]), singular: Uint8Array.from([1, 0, 0, 0]), outside: Uint8Array.from([0, 1, 0, 0]) };
    const px = distortionRgba(r);
    expect([...px.subarray(0, 4)]).toEqual([...SINGULAR_RGBA]);
    expect([...px.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...px.subarray(8, 12)]).toEqual([247, 247, 247, 255]); // 1×: white
    expect([...px.subarray(12, 16)]).toEqual([178, 24, 43, 255]); // 8×: ramp end
    expect(rampPosition('omega', 45)).toBe(0.5);
    expect(rampPosition('omega', 180)).toBe(1);
    expect(rampPosition('areal', 0.125)).toBe(0);
  });

  it('equirectangular at a raw pole is singular in k: the pole value is +Infinity and drawn in the singular colour', () => {
    // A pixel centre never lies exactly on the pole line, so evaluate the pole itself (rule 2) and colour it.
    const v = exactView({ projection: 'equirectangular', width: 360, height: 180 });
    const d = distortion(v, 0, 90);
    if (d.outside) throw new Error('outside');
    const r: DistortionRaster = { width: 1, y0: 0, quantity: 'k', values: Float64Array.of(d.k), singular: Uint8Array.of(d.k === Infinity ? 1 : 0), outside: Uint8Array.of(0) };
    expect(d.k).toBe(Infinity);
    expect([...distortionRgba(r)]).toEqual([...SINGULAR_RGBA]);
  });
});

describe('exportDistortionPng', () => {
  it('is an 8-bit RGBA PNG of the overlay through the exact view', () => {
    const png = exportDistortionPng({ projection: 'mollweide', width: 64, height: 32 }, 'areal');
    const dv = new DataView(png.buffer, png.byteOffset);
    expect(dv.getUint32(16)).toBe(64);
    expect(dv.getUint32(20)).toBe(32);
    expect([png[24], png[25]]).toEqual([8, 6]);
    // The IDAT payload inflates to the overlay's pixels, one filter byte per row.
    let p = 8, idat: Uint8Array | null = null;
    while (p < png.length) {
      const len = dv.getUint32(p), type = String.fromCharCode(...png.subarray(p + 4, p + 8));
      if (type === 'IDAT') idat = png.subarray(p + 8, p + 8 + len);
      p += 12 + len;
    }
    const raw = unzlibSync(idat!);
    const want = distortionRgba(distortionRaster(exactView({ projection: 'mollweide', width: 64, height: 32 }), 'areal'));
    for (let y = 0; y < 32; y++) {
      expect(raw[y * 257]).toBe(0);
      expect([...raw.subarray(y * 257 + 1, (y + 1) * 257)]).toEqual([...want.subarray(y * 256, (y + 1) * 256)]);
    }
  });
});
