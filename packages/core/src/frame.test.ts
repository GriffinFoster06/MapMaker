import { describe, expect, it } from 'vitest';
import { DEG, eastNorth, lonLatToXyz, orogenToCanonical, xyzToLonLat } from './frame';
import { area_m2, arcLength_m, EARTH_RADIUS_M, isUnit } from './units';
import { dmath } from './dmath';

describe('frame', () => {
  it('puts +Z at the north pole and +X at (0N, 0E), +Y at (0N, 90E)', () => {
    expect(lonLatToXyz(0, 0)).toEqual([1, 0, 0]);
    const y = lonLatToXyz(90 * DEG, 0);
    expect(y[0]).toBeCloseTo(0, 15); expect(y[1]).toBeCloseTo(1, 15);
    expect(lonLatToXyz(0, 90 * DEG)[2]).toBe(1);
  });

  it('round-trips lon/lat', () => {
    for (const [lon, lat] of [[10, 20], [-170, -80], [179.9, 0.1], [0, 89.99]] as const) {
      const [x, y, z] = lonLatToXyz(lon * DEG, lat * DEG);
      const r = xyzToLonLat(x, y, z);
      expect(r.lon / DEG).toBeCloseTo(lon, 9);
      expect(r.lat / DEG).toBeCloseTo(lat, 9);
    }
  });

  it('east and north are orthonormal tangents', () => {
    const { east, north } = eastNorth(0.7, -0.4);
    const p = lonLatToXyz(0.7, -0.4);
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(dot(east, north)).toBeCloseTo(0, 15);
    expect(dot(east, p)).toBeCloseTo(0, 15);
    expect(dot(north, p)).toBeCloseTo(0, 15);
  });

  it('orogen permutation maps orogen lat=asin(y), lon=atan2(x,z) onto canonical lat/lon exactly (F1)', () => {
    const o = new Float64Array([0.3, 0.8, Math.sqrt(1 - 0.09 - 0.64), -0.5, -0.1, Math.sqrt(1 - 0.26)]);
    const c = orogenToCanonical(o);
    for (let i = 0; i < 6; i += 3) {
      const latO = Math.asin(o[i + 1]!), lonO = Math.atan2(o[i]!, o[i + 2]!);
      const r = xyzToLonLat(c[i]!, c[i + 1]!, c[i + 2]!);
      expect(r.lat).toBe(latO);
      expect(r.lon).toBe(lonO);
    }
  });
});

describe('units and dmath', () => {
  it('scales by radius, never by a constant', () => {
    expect(arcLength_m(Math.PI, EARTH_RADIUS_M)).toBeCloseTo(Math.PI * 6371000, 3);
    expect(area_m2(4 * Math.PI, 1000)).toBeCloseTo(4 * Math.PI * 1e6, 6);
    expect(isUnit('mm/yr')).toBe(true);
    expect(isUnit('enum:koppen')).toBe(true);
    expect(isUnit('furlong')).toBe(false);
  });

  it('dmath is a pass-through to Math in native mode', () => {
    expect(dmath.mode).toBe('native');
    for (const x of [0, 0.5, 1, 2.5, -3.7, 1e-8, 700]) {
      expect(dmath.sin(x)).toBe(Math.sin(x));
      expect(dmath.exp(x / 100)).toBe(Math.exp(x / 100));
      expect(dmath.atan2(x, 1.3)).toBe(Math.atan2(x, 1.3));
      expect(dmath.pow(Math.abs(x), 0.37)).toBe(Math.pow(Math.abs(x), 0.37));
    }
  });
});
