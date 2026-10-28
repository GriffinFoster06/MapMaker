// Provenance: ported from upstream/VPLanet src/body.c at dd55da7 (MIT); see PROVENANCE.md.
// Stellar properties from the Baraffe et al. (2015) tracks as VPLanet interpolates them: fdBaraffe :1430, fdBaraffeInterpolate
// :1337, fdBaraffeBiCubic :1280, fdBaraffeBiLinear :1254, fiGetLowerBound :1226. The grid (25 masses x 502 ages) is
// `baraffe-grid.json`, extracted from `src/body.h` (STELLAR_BAR_MARR/AARR, DATA_LOGL/RADIUS/LOGT/RG, STELLAR_BICUBIC_MATRIX).
// Also fdHabitableZoneKopparapu2013 :1468. Not ported: the Proxima Cen and sine-wave models, XUV/Ribas, magnetic braking, flares.
import { dmath } from '@mapmaker/core';
import { AUM, LSUN, MSUN } from '../poise/constants.js';
import grid from './baraffe-grid.json';

const RSUN = 6.957e8; // vplanet.h:70
const M = Float64Array.from(grid.M);
const A = Float64Array.from(grid.A);
const ALEN = grid.alen;
const toArr = (v: (number | null)[]): Float64Array => Float64Array.from(v, (x) => (x === null ? NaN : x));
const DATA = { logL: toArr(grid.logL), radius: toArr(grid.radius), logT: toArr(grid.logT), rg: toArr(grid.rg) };
const BICUBIC = Int8Array.from(grid.bicubic as number[]);

export type BaraffeError = 'ok' | 'linear' | 'low' | 'high' | 'nan';

const idx = (x: number, y: number): number => x * ALEN + y;

function lowerBound(v: number, arr: Float64Array): number | BaraffeError {
  const dim = arr.length;
  if (v < arr[0]!) return 'low';
  if (v > arr[dim - 1]!) return 'high';
  let i = 0;
  for (; i < dim - 2; i++) if (v < arr[i + 1]!) break;
  if (i === 0) return 'low';
  if (i >= dim - 2) return 'high';
  return i;
}

function biLinear(d: Float64Array, xi: number, yi: number, dx: number, dy: number): number {
  let c0: number;
  let c1: number;
  if (dx === 0) {
    c0 = d[idx(xi, yi)]!;
    c1 = d[idx(xi, yi + 1)]!;
  } else {
    c0 = d[idx(xi, yi)]! * (1 - dx) + d[idx(xi + 1, yi)]! * dx;
    c1 = d[idx(xi, yi + 1)]! * (1 - dx) + d[idx(xi + 1, yi + 1)]! * dx;
  }
  return dy === 0 ? c0 : c0 * (1 - dy) + c1 * dy;
}

function biCubic(d: Float64Array, xi: number, yi: number, dx: number, dy: number): number {
  const g = (x: number, y: number): number => d[idx(x, y)]!;
  const v = [
    g(xi, yi), g(xi + 1, yi), g(xi, yi + 1), g(xi + 1, yi + 1),
    0.5 * (g(xi + 1, yi) - g(xi - 1, yi)), 0.5 * (g(xi + 2, yi) - g(xi, yi)),
    0.5 * (g(xi + 1, yi + 1) - g(xi - 1, yi + 1)), 0.5 * (g(xi + 2, yi + 1) - g(xi, yi + 1)),
    0.5 * (g(xi, yi + 1) - g(xi, yi - 1)), 0.5 * (g(xi + 1, yi + 1) - g(xi + 1, yi - 1)),
    0.5 * (g(xi, yi + 2) - g(xi, yi)), 0.5 * (g(xi + 1, yi + 2) - g(xi + 1, yi)),
    0.25 * (g(xi + 1, yi + 1) - g(xi - 1, yi + 1) - g(xi + 1, yi - 1) + g(xi - 1, yi - 1)),
    0.25 * (g(xi + 2, yi + 1) - g(xi, yi + 1) - g(xi + 2, yi - 1) + g(xi, yi - 1)),
    0.25 * (g(xi + 1, yi + 2) - g(xi - 1, yi + 2) - g(xi + 1, yi) + g(xi - 1, yi)),
    0.25 * (g(xi + 2, yi + 2) - g(xi, yi + 2) - g(xi + 2, yi) + g(xi, yi)),
  ];
  const coef = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    let s = 0;
    for (let j = 0; j < 16; j++) s += BICUBIC[i * 16 + j]! * v[j]!;
    coef[i] = s;
  }
  let result = 0;
  let k = 0;
  let dypow = 1;
  for (let j = 0; j < 4; j++) {
    result += dypow * (coef[k]! + dx * (coef[k + 1]! + dx * (coef[k + 2]! + dx * coef[k + 3]!)));
    k += 4;
    dypow *= dy;
  }
  return result;
}

/** Bicubic interpolation of one grid; mass in solar masses, age in Gyr (fdBaraffeInterpolate with order 3). */
function interpolate(d: Float64Array, mass: number, ageGyr: number): { value: number; error: BaraffeError } {
  if (ageGyr < 0.001) ageGyr = 0.001;
  const xi = lowerBound(mass, M);
  if (typeof xi === 'string') return { value: 0, error: xi };
  const yi = lowerBound(ageGyr, A);
  if (typeof yi === 'string') return { value: 0, error: yi };
  const dx = (mass - M[xi]!) / (M[xi + 1]! - M[xi]!);
  const dy = (ageGyr - A[yi]!) / (A[yi + 1]! - A[yi]!);
  const r = biCubic(d, xi, yi, dx, dy);
  if (!Number.isNaN(r)) return { value: r, error: 'ok' };
  const corners = dx === 0 ? [[0, 0], [0, 1]] : dy === 0 ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  for (const [a, b] of corners) if (Number.isNaN(d[idx(xi + a!, yi + b!)]!)) return { value: 0, error: 'nan' };
  return { value: biLinear(d, xi, yi, dx, dy), error: 'linear' };
}

export interface StarProperties {
  luminosity: number; // W
  radius: number; // m
  temperature: number; // K
  radGyra: number;
}

/** Baraffe (2015) luminosity, radius, effective temperature and radius of gyration of a star of `mass` (kg) at `ageYears`. NaN outside the grid. */
export function baraffeStar(mass: number, ageYears: number): StarProperties {
  const m = mass / MSUN;
  const age = ageYears / 1e9;
  const pick = (d: Float64Array): number => {
    const r = interpolate(d, m, age);
    return r.error === 'ok' || r.error === 'linear' ? r.value : NaN;
  };
  return {
    luminosity: LSUN * dmath.pow(10, pick(DATA.logL)),
    radius: RSUN * pick(DATA.radius),
    temperature: dmath.pow(10, pick(DATA.logT)),
    radGyra: pick(DATA.rg),
  };
}

/** Habitable-zone limits in metres from Kopparapu et al. (2013): in the order of VPLanet's `daHZLimit` (its six Seff rows, inner to outer). */
export function habitableZone(luminosity: number, teff: number): number[] {
  const seffSun = [1.7763, 1.0385, 1.0146, 0.3507, 0.2946, 0.2484];
  const A = [1.4335e-4, 1.2456e-4, 8.1884e-5, 5.9578e-5, 4.9952e-5, 4.2588e-5];
  const B = [3.3954e-9, 1.4612e-8, 1.9394e-9, 1.6707e-9, 1.3893e-9, 1.1963e-9];
  const C = [-7.6364e-12, -7.6345e-12, -4.3618e-12, -3.0058e-12, -2.5331e-12, -2.1709e-12];
  const D = [-1.195e-15, -1.7511e-15, -6.826e-16, -5.1925e-16, -4.3896e-16, -3.8282e-16];
  const t = teff - 5700;
  return seffSun.map((s0, i) => {
    const seff = s0 + A[i]! * t + B[i]! * t * t + C[i]! * dmath.pow(t, 3) + D[i]! * dmath.pow(t, 4);
    return Math.sqrt(luminosity / LSUN / seff) * AUM;
  });
}
