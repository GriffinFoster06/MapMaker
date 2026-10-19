// ProjectionView: fitting, the inverse with its domain check (§3.7 raster path steps 1–2), and the forward path.
import { describe, expect, it } from 'vitest';
import { MERCATOR_MAX_LAT, PROJECTIONS, ProjectionView, ROUND_TRIP_PX } from './index';

const W = 400, H = 200;

describe('ProjectionView', () => {
  it('every registered projection inverts and re-projects its own pixels within the round-trip tolerance', () => {
    for (const s of PROJECTIONS) {
      const v = new ProjectionView({ projection: s.id, width: W, height: H });
      let inside = 0;
      for (let j = 0; j < H; j += 7) for (let i = 0; i < W; i += 7) {
        const ll = v.invert(i + 0.5, j + 0.5);
        if (!ll) continue;
        inside++;
        expect(Math.abs(ll[1])).toBeLessThanOrEqual(90);
        expect(Math.abs(ll[0])).toBeLessThanOrEqual(180);
        const xy = v.forward(ll[0], ll[1])!;
        expect(Math.hypot(xy[0] - i - 0.5, xy[1] - j - 0.5), s.id).toBeLessThanOrEqual(ROUND_TRIP_PX);
      }
      expect(inside, s.id).toBeGreaterThan(50);
    }
  });

  it('the centre pixel of an unrotated view is (0°, 0°); a rotation moves it', () => {
    for (const id of ['equirectangular', 'mollweide', 'orthographic', 'robinson']) {
      const ll = new ProjectionView({ projection: id, width: W, height: H }).invert(W / 2, H / 2)!;
      expect(Math.abs(ll[0]) + Math.abs(ll[1]), id).toBeLessThan(1e-9);
    }
    const r = new ProjectionView({ projection: 'equalEarth', width: W, height: H, rotate: [-30, -10, 0] }).invert(W / 2, H / 2)!;
    expect(r[0]).toBeCloseTo(30, 9); expect(r[1]).toBeCloseTo(10, 9);
  });

  it('pixels outside a projection outline are rejected (corners of Mollweide and of the orthographic disc)', () => {
    for (const id of ['mollweide', 'orthographic', 'hammer', 'sinusoidal', 'azimuthalEqualArea']) {
      const v = new ProjectionView({ projection: id, width: W, height: H });
      expect(v.invert(0.5, 0.5), id).toBeNull();
      expect(v.invert(W - 0.5, H - 0.5), id).toBeNull();
    }
  });

  it('the orthographic back hemisphere and gnomonic beyond its clip angle are outside the domain', () => {
    const o = new ProjectionView({ projection: 'orthographic', width: W, height: H });
    expect(o.forward(120, 0)).toBeNull();
    expect(o.inDomain(89, 0)).toBe(true);
    const g = new ProjectionView({ projection: 'gnomonic', width: W, height: H });
    expect(g.forward(70, 0)).toBeNull();
    expect(g.forward(40, 0)).not.toBeNull();
  });

  it('Mercator ends at its square map: |φ| ≤ atan(sinh π) ≈ 85.0511°', () => {
    expect(MERCATOR_MAX_LAT * 180 / Math.PI).toBeCloseTo(85.0511287798, 9);
    const v = new ProjectionView({ projection: 'mercator', width: 400, height: 400 });
    expect(v.forward(0, 85.05)).not.toBeNull();
    expect(v.forward(0, 85.06)).toBeNull();
    expect(v.forward(10, -90)).toBeNull();
    // The fitted square: its top row is just inside the limit.
    const top = v.invert(200, 0.5)!;
    expect(top[1]).toBeGreaterThan(84.9);
  });

  it('the antimeridian falls on the left and right edges of an unrotated equirectangular view', () => {
    const v = new ProjectionView({ projection: 'equirectangular', width: 360, height: 180 });
    expect(v.invert(0.5, 90)![0]).toBeCloseTo(-179.5, 9);
    expect(v.invert(359.5, 90)![0]).toBeCloseTo(179.5, 9);
    expect(v.invert(180.5, 0.5)![1]).toBeCloseTo(89.5, 9);
  });

  it('transverse Mercator reports d3 rotation without its internal 90° and the raw frame includes it', () => {
    const v = new ProjectionView({ projection: 'transverseMercator', width: W, height: H });
    // Its raw poles (the excluded points) are on the equator at ±90° longitude, not at the geographic poles.
    expect(Math.abs(v.toRaw([90, 0])[1])).toBeCloseTo(90, 9);
    expect(v.inDomain(90, 0)).toBe(false);
    expect(v.inDomain(0, 90)).toBe(true);
  });
});
