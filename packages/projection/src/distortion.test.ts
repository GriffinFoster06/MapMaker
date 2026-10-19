// Distortion against closed forms (Snyder, "Map Projections: A Working Manual", 1987) and the pole rules of
// ARCHITECTURE §3.7. Unit sphere, unrotated views (the raw poles are the geographic poles) unless stated.
import { describe, expect, it } from 'vitest';
import { PROJECTIONS, ProjectionView, type DistortionValues, distortion, extrapolate } from './index';

const D = Math.PI / 180;
const view = (projection: string, rotate?: [number, number, number]) => new ProjectionView({ projection, width: 1000, height: 500, ...(rotate ? { rotate } : {}) });
const LONS = [-170, -120, -45, 0, 30, 90, 150, 179.5];
const LATS = [-80, -45, -10, 0, 20, 60, 85];

function values(v: ProjectionView, lon: number, lat: number): DistortionValues {
  const d = distortion(v, lon, lat);
  if (d.outside) throw new Error(`${v.spec.id} (${lon}, ${lat}) unexpectedly outside`);
  return d;
}

const close = (got: number, want: number, rel = 1e-8) => expect(Math.abs(got - want)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(want)));
/** ω from the two principal scales. */
const omegaOf = (a: number, b: number) => (2 * Math.asin(Math.abs(a - b) / (a + b))) / D;
/** Angular distance from the projection centre (0°, 0°). */
const centreDistance = (lon: number, lat: number) => Math.acos(Math.cos(lat * D) * Math.cos(lon * D));

describe('analytic distortion values (§3.7), central differences against closed forms', () => {
  it('equirectangular: h = 1, k = sec φ', () => {
    const v = view('equirectangular');
    for (const lon of LONS) for (const lat of LATS) {
      const d = values(v, lon, lat);
      close(d.h, 1); close(d.k, 1 / Math.cos(lat * D)); close(d.areal, 1 / Math.cos(lat * D));
    }
  });

  it('Mercator: h = k = sec φ, ω = 0', () => {
    const v = view('mercator');
    for (const lon of LONS) for (const lat of LATS) {
      const d = values(v, lon, lat);
      close(d.h, 1 / Math.cos(lat * D)); close(d.k, 1 / Math.cos(lat * D)); expect(d.omega).toBeLessThan(1e-6);
    }
  });

  it('transverse Mercator: conformal, h = k = 1/√(1 − B²) with B = cos φ sin λ', () => {
    const v = view('transverseMercator');
    for (const lon of [-80, -45, 0, 30, 60]) for (const lat of LATS) {
      const d = values(v, lon, lat);
      const B = Math.cos(lat * D) * Math.sin(lon * D);
      close(d.h, 1 / Math.sqrt(1 - B * B), 1e-7); close(d.k, 1 / Math.sqrt(1 - B * B), 1e-7); expect(d.omega).toBeLessThan(1e-5);
    }
  });

  it('sinusoidal: h = √(1 + λ² sin² φ), k = 1, equal-area', () => {
    const v = view('sinusoidal');
    for (const lon of LONS) for (const lat of LATS) {
      const d = values(v, lon, lat);
      const l = lon * D, s = Math.sin(lat * D);
      close(d.h, Math.sqrt(1 + l * l * s * s)); close(d.k, 1); close(d.areal, 1);
    }
  });

  it('orthographic: radial scale cos c, azimuthal 1', () => {
    const v = view('orthographic');
    for (const lon of [-80, -30, 0, 45, 85]) for (const lat of LATS) {
      const c = centreDistance(lon, lat);
      const d = values(v, lon, lat);
      close(d.areal, Math.cos(c), 1e-7); close(d.omega, omegaOf(1, Math.cos(c)), 1e-6);
    }
  });

  it('stereographic: h = k = 2/(1 + cos c), ω = 0', () => {
    const v = view('stereographic');
    for (const lon of [-120, -30, 0, 45, 120]) for (const lat of LATS) {
      const c = centreDistance(lon, lat);
      if (c > 140 * D) continue;
      const d = values(v, lon, lat);
      close(d.h, 2 / (1 + Math.cos(c)), 1e-7); close(d.k, 2 / (1 + Math.cos(c)), 1e-7); expect(d.omega).toBeLessThan(1e-5);
    }
  });

  it('azimuthal equal-area: areal 1, principal scales sec(c/2) and cos(c/2)', () => {
    const v = view('azimuthalEqualArea');
    for (const lon of LONS) for (const lat of LATS) {
      const c = centreDistance(lon, lat);
      if (c > 179 * D) continue;
      const d = values(v, lon, lat);
      close(d.areal, 1, 1e-7); close(d.omega, omegaOf(1 / Math.cos(c / 2), Math.cos(c / 2)), 1e-6);
    }
  });

  it('azimuthal equidistant: radial scale 1, azimuthal c / sin c', () => {
    const v = view('azimuthalEquidistant');
    for (const lon of LONS) for (const lat of LATS) {
      const c = centreDistance(lon, lat);
      if (c > 179 * D) continue;
      const az = c === 0 ? 1 : c / Math.sin(c);
      const d = values(v, lon, lat);
      close(d.areal, az, 1e-7); close(d.omega, omegaOf(az, 1), 1e-6);
    }
  });

  it('gnomonic: radial sec² c, azimuthal sec c', () => {
    const v = view('gnomonic');
    for (const lon of [-50, -20, 0, 35, 55]) for (const lat of [-50, -10, 0, 20, 55]) {
      const c = centreDistance(lon, lat);
      if (c >= 60 * D) continue;
      const s = 1 / Math.cos(c);
      const d = values(v, lon, lat);
      close(d.areal, s * s * s, 1e-7); close(d.omega, omegaOf(s * s, s), 1e-6);
    }
  });

  it('every equal-area projection has areal scale 1; every conformal one ω = 0', () => {
    for (const s of PROJECTIONS.filter((p) => p.equalArea || p.conformal)) {
      const v = view(s.id);
      for (const lon of LONS) for (const lat of LATS) {
        const d = distortion(v, lon, lat);
        if (d.outside) continue;
        // The smaller principal scale carries a finite-difference error of order 1e-9 of the larger one, so next to
        // a singular point (azimuthal equal-area 0.5° from its antipode: scales 229 and 1/229) the tolerance is in a².
        if (s.equalArea) close(d.areal, 1, 1e-9 * Math.max(100, d.a * d.a));
        if (s.conformal) expect(d.omega).toBeLessThan(1e-5);
      }
    }
  });

  it('Robinson and Natural Earth: their defined equator scales (0.8487, 0.8707)', () => {
    close(values(view('robinson'), 20, 0).k, 0.8487, 1e-9);
    close(values(view('naturalEarth1'), 20, 0).k, 0.8707, 1e-9);
  });

  it('areal scale and ω are invariant under rotation; the raw frame carries them', () => {
    const plain = view('mollweide'), rotated = view('mollweide', [40, -30, 15]);
    for (const [lon, lat] of [[10, 20], [-70, -40], [120, 65]] as const) {
      const [rl, rf] = rotated.toRaw([lon, lat]);
      const a = values(rotated, lon, lat), b = values(plain, rl, rf);
      close(a.areal, b.areal, 1e-7); close(a.omega, b.omega, 1e-6);
    }
  });

  it('the raw antimeridian is no seam: values match on both sides of ±180° in the raw frame', () => {
    const v = view('equalEarth');
    for (const lat of [-60, 0, 45]) {
      const a = values(v, 179.9999, lat), b = values(v, -179.9999, lat);
      close(a.h, b.h, 1e-6); close(a.k, b.k, 1e-6); close(values(v, 180, lat).areal, 1, 1e-7);
    }
  });
});

describe('distortion at the poles, φ = ±90° (§3.7)', () => {
  const POLE_LONS = [-180, -90, 0, 45, 180];
  const finiteOrInf = (x: number) => !Number.isNaN(x) && (Number.isFinite(x) || x === Infinity);

  it('never NaN, for every projection, meridian and pole', () => {
    for (const s of PROJECTIONS) {
      const v = view(s.id);
      for (const lon of POLE_LONS) for (const lat of [90, -90]) {
        const d = distortion(v, lon, lat);
        if (d.outside) continue;
        for (const x of [d.areal, d.omega, d.h, d.k, d.a, d.b]) expect(finiteOrInf(x), `${s.id} ${lon} ${lat}`).toBe(true);
        expect(d.omega).toBeGreaterThanOrEqual(0); expect(d.omega).toBeLessThanOrEqual(180);
      }
    }
  });

  it('excluded: Mercator at the poles (and beyond 85.0511°) is outside the domain', () => {
    const v = view('mercator');
    expect(distortion(v, 0, 90).outside).toBe(true);
    expect(distortion(v, 30, -90).outside).toBe(true);
    expect(distortion(v, 0, 85.06).outside).toBe(true);
    expect(distortion(v, 0, 85.05).outside).toBe(false);
  });

  it('line pole, closed form: equirectangular h = 1, k = +∞ (singular), ω = 180°', () => {
    for (const lon of POLE_LONS) {
      const d = values(view('equirectangular'), lon, 90);
      expect([d.h, d.k, d.areal, d.omega, d.singular, d.poleLimit]).toEqual([1, Infinity, Infinity, 180, true, true]);
    }
  });

  it('line and cusp poles: equal-area projections report areal scale exactly 1', () => {
    for (const s of PROJECTIONS.filter((p) => p.equalArea && (p.poleClass === 'line' || p.poleClass === 'cusp'))) {
      for (const lon of POLE_LONS) for (const lat of [90, -90]) expect(values(view(s.id), lon, lat).areal, s.id).toBe(1);
    }
  });

  it('line poles: k diverges (+∞, singular, ω = 180°) and h stays finite', () => {
    for (const s of PROJECTIONS.filter((p) => p.poleClass === 'line')) {
      for (const lon of POLE_LONS) {
        const d = values(view(s.id), lon, 90);
        expect(d.k, s.id).toBe(Infinity); expect(d.singular).toBe(true); expect(d.omega).toBe(180);
        expect(Number.isFinite(d.h), `${s.id} h at ${lon}`).toBe(true);
      }
    }
  });

  it('extrapolated limits agree with the values just off the pole (convergent quantities)', () => {
    for (const [id, lon] of [['robinson', 45], ['naturalEarth1', 0], ['naturalEarth1', 120], ['winkel3', -60], ['sinusoidal', 100], ['hammer', 45], ['equalEarth', 30]] as const) {
      const v = view(id), lim = values(v, lon, 90), near = values(v, lon, 90 - 1e-4);
      expect(Math.abs(lim.h - near.h), `${id} ${lon}`).toBeLessThan(1e-4 * Math.max(1, near.h));
    }
  });

  it('cusp poles: sinusoidal h = √(1 + λ²), k = 1; Mollweide k = ∞ and h = 0 on the central meridian', () => {
    for (const lon of [0, 45, -90, 180]) {
      const d = values(view('sinusoidal'), lon, -90);
      close(d.h, Math.sqrt(1 + (lon * D) ** 2), 1e-6); close(d.k, 1, 1e-6);
    }
    const m = values(view('mollweide'), 0, 90);
    expect(m.k).toBe(Infinity); expect(m.h).toBeLessThan(1e-6); expect(m.areal).toBe(1); expect(m.omega).toBe(180);
  });

  it('point poles are differentiated directly: stereographic h = k = 2; azimuthal equidistant scales 1 and π/2', () => {
    for (const lon of POLE_LONS) {
      const s = values(view('stereographic'), lon, 90);
      close(s.h, 2, 1e-7); close(s.k, 2, 1e-7); expect(s.singular).toBe(false); expect(s.poleLimit).toBe(false);
      // The pole of the equatorial aspect lies 90° from the centre: radial scale 1, azimuthal π/2. The meridian λ
      // along which h is taken is radial at λ = 0° and 180° and azimuthal at ±90°.
      const e = values(view('azimuthalEquidistant'), lon, -90);
      close(e.a, Math.PI / 2, 1e-7); close(e.b, 1, 1e-7);
      const radial = Math.abs(Math.cos(lon * D)), azimuthal = Math.abs(Math.sin(lon * D));
      close(e.h, Math.hypot(radial, (Math.PI / 2) * azimuthal), 1e-7); close(e.k, Math.hypot((Math.PI / 2) * radial, azimuthal), 1e-7);
      close(values(view('azimuthalEqualArea'), lon, 90).areal, 1, 1e-7);
    }
  });

  it('a rotated view takes the pole rules at its raw poles: polar-aspect equirectangular is singular at (0°, 0°)', () => {
    const v = view('equirectangular', [0, -90, 0]);
    const [, rlat] = v.toRaw([0, 0]);
    expect(Math.abs(Math.abs(rlat) - 90)).toBeLessThan(1e-9);
    const d = values(v, 0, 0);
    expect(d.poleLimit).toBe(true); expect(d.singular).toBe(true); expect(d.omega).toBe(180);
    // ...and the geographic north pole is now an ordinary point of it.
    const n = values(v, 0, 90);
    expect(n.poleLimit).toBe(false); close(n.areal, 1, 1e-7);
  });
});

describe('extrapolate (pole limits of rule 3)', () => {
  const f = (L: number, C: number, p: number) => [1e-3, 5e-4, 2.5e-4].map((d) => L + C * d ** p) as [number, number, number];
  it('is exact for L + C·δ^p, whatever p > 0', () => {
    for (const p of [1, 2, 0.5, 1 / 3]) close(extrapolate(...f(1.25, 3, p)), 1.25, 1e-9);
    close(extrapolate(...f(0, 2, 2 / 3)), 0, 1e-9);
  });
  it('reports divergence (p < 0) as +Infinity', () => {
    for (const p of [-1, -0.5, -1 / 3]) expect(extrapolate(...f(1, 1, p))).toBe(Infinity);
  });
  it('returns a settled value as is, and never a negative scale', () => {
    expect(extrapolate(2, 2, 2)).toBe(2);
    close(extrapolate(...f(1e-9, -3, 1)), 1e-9, 1e-9);
    expect(extrapolate(0.3, 0.2, 0.1)).toBeGreaterThanOrEqual(0);
  });
});
