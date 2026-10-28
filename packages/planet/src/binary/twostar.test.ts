import { describe, expect, it } from 'vitest';
import { AUM, DEGRAD, LSUN, MSUN } from '../poise/constants.js';
import { BIGG } from '../eqtide/ctl.js';
import { binaryStarPositions, dailyInsolationTwoStars, type TwoStarGeometry, type Vec3 } from './twostar.js';

const lats = Float64Array.from([-80, -45, -10, 0, 20, 45, 66, 85].map((d) => d * DEGRAD));

/** Single star at the origin, planet fixed at orbital longitude `theta` on a circle, obliquity `obl` (spin axis tilts toward +y at theta = 0). */
function single(L1: number, obl: number, theta: number): TwoStarGeometry {
  const r = AUM;
  const p: Vec3 = [r * Math.cos(theta), r * Math.sin(theta), 0];
  return {
    luminosity: [LSUN, L1],
    stars: () => [[0, 0, 0], [0, 0, 0]],
    planet: () => p,
    spinAxis: [-Math.sin(obl) * 0 + 0, Math.sin(obl), Math.cos(obl)],
    meridian0: [1, 0, 0],
    rotationPeriod: 86400,
  };
}

describe('two-star latitude-resolved insolation (original code)', () => {
  it('equals the analytic single-star daily mean when the companion has zero luminosity', () => {
    const obl = 23.44 * DEGRAD;
    const S = LSUN / (4 * Math.PI * AUM * AUM);
    // The spin axis lies in the y-z plane, so the sub-stellar declination is sin(delta) = -(axis . unit vector to the planet)
    // (the star is at the origin, the planet at (cos theta, sin theta, 0) AU).
    for (const thetaDeg of [0, 60, 150, 270]) {
      const theta = thetaDeg * DEGRAD;
      const got = dailyInsolationTwoStars(single(0, obl, theta), lats, 0, 720);
      const sinDelta = -Math.sin(obl) * Math.sin(theta);
      const delta = Math.asin(sinDelta);
      for (let j = 0; j < lats.length; j++) {
        const phi = lats[j]!;
        const x = -Math.tan(phi) * Math.tan(delta);
        const h = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
        const expected = (S / Math.PI) * (h * Math.sin(phi) * sinDelta + Math.cos(phi) * Math.cos(delta) * Math.sin(h));
        expect(Math.abs(got[j]! - expected)).toBeLessThan(1e-3 * S + 2e-3 * expected);
      }
    }
  });

  it('conserves energy: the planet-averaged insolation is the total flux over 4 for a distant binary', () => {
    const m0 = 0.69 * MSUN;
    const m1 = 0.2 * MSUN;
    const a = 0.224 * AUM;
    const nb = Math.sqrt((BIGG * (m0 + m1)) / (a * a * a));
    const L: readonly [number, number] = [0.15 * 3.846e26, 0.0057 * 3.846e26];
    const R = 0.7 * AUM;
    const planet = (t: number): Vec3 => [R * Math.cos(1e-6 * t), R * Math.sin(1e-6 * t), 0];
    const g: TwoStarGeometry = {
      luminosity: L,
      stars: (t) => binaryStarPositions(m0, m1, a, 0.16, 1.0, nb, 0.3, t),
      planet,
      spinAxis: [0, 0, 1],
      meridian0: [1, 0, 0],
      rotationPeriod: 86400,
    };
    const fine = Float64Array.from({ length: 180 }, (_, i) => Math.asin(-1 + (2 * i + 1) / 180));
    const q = dailyInsolationTwoStars(g, fine, 0, 96);
    const mean = q.reduce((s, v) => s + v, 0) / q.length; // equal-area latitude bands
    const flux = (L[0] + L[1]) / (4 * Math.PI * R * R);
    expect(Math.abs(mean / (flux / 4) - 1)).toBeLessThan(0.02);
  });

  it('puts the stars on opposite sides of the barycentre with the mass ratio', () => {
    const m0 = 0.69 * MSUN;
    const m1 = 0.2 * MSUN;
    const s = binaryStarPositions(m0, m1, 1e10, 0.3, 0.5, 1e-6, 1.0, 12345);
    expect(Math.abs(m0 * s[0][0] + m1 * s[1][0])).toBeLessThan(1e-3);
    expect(Math.abs(m0 * s[0][1] + m1 * s[1][1])).toBeLessThan(1e-3);
    const sep = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
    expect(sep).toBeGreaterThan(1e10 * 0.7 - 1);
    expect(sep).toBeLessThan(1e10 * 1.3 + 1);
  });
});
void DEGRAD;

describe('orbit-averaged flux (VPLanet fndFluxApproxBinary)', () => {
  it('the exact average over a binary period matches the approximation for several planet phases', async () => {
    const { CircumbinaryOrbit } = await import('./ll13.js');
    const m0 = 0.69 * MSUN;
    const m1 = 0.2 * MSUN;
    const a = 0.224 * AUM;
    const e = 0.16;
    const varpi = 263.49 * DEGRAD;
    const nb = Math.sqrt((BIGG * (m0 + m1)) / (a * a * a));
    const L: readonly [number, number] = [0.15 * 3.846e26, 0.0057 * 3.846e26];
    const orbit = new CircumbinaryOrbit({
      m0, m1, binarySemi: a, binaryEcc: e, binaryLongP: varpi, binaryPhiAB: 0, planetMass: 1e25, semi: 0.7 * AUM,
      freeEcc: 0, freeInc: 0, m0Cbp: 0, psi: 0, zeta: 0,
    });
    const R = 0.7 * AUM;
    let worst = 0;
    for (const phiDeg of [0, 90, 180, 270]) {
      const phi = phiDeg * DEGRAD;
      let sum = 0;
      const n = 2000;
      for (let k = 0; k < n; k++) {
        const t = ((k + 0.5) / n) * ((2 * Math.PI) / nb);
        const s = binaryStarPositions(m0, m1, a, e, varpi, nb, 0, t);
        const px = R * Math.cos(phi);
        const py = R * Math.sin(phi);
        for (let i = 0; i < 2; i++) sum += L[i]! / (4 * Math.PI * ((s[i]![0] - px) ** 2 + (s[i]![1] - py) ** 2));
      }
      const exact = sum / n;
      const approx = orbit.approxFlux(L[0], L[1], R, 0, phi);
      worst = Math.max(worst, Math.abs(approx / exact - 1));
    }
    // The approximation keeps the first-order eccentricity term; the neglected terms are of order (a/R)^2 = 0.1.
    expect(worst).toBeLessThan(0.1);
  });
});
