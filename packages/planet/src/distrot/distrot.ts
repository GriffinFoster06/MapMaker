// Provenance: ported from upstream/VPLanet src/distrot.c at dd55da7 (MIT); see PROVENANCE.md.
// DistRot with the LL2 orbit model: the obliquity vector (x, y, z) = (sin obl cos pA, sin obl sin pA, cos obl) of a planet
// under the stellar torque, the torque of the other planets (fndObliquityALL2/BLL2/CLL2 :1900-1940, fndDistRotLL2DxDt/DyDt/DzDt
// :2092-2140, fndCentralTorqueR :1821, fndCentralTorqueSfac :1809) and the post-Newtonian axial correction (fndAxialGRDxDt :1996).
// Rates are per year. Not ported: RD4 orbit model, external orbit data (bReadOrbitData), dynamical ellipticity from the interior.
import { dmath } from '@mapmaker/core';
import { AUM, DAYSEC, KGAUSS, LIGHTSPEED, MSUN, YEARSEC } from '../poise/constants.js';
import { rk4Step, type OdeSystem } from '../evolve/rk4.js';
import { ll2Evaluate, type Ll2Planet, type Ll2System } from '../distorb/ll2.js';

export interface RotParams {
  starMass: number; // kg
  planet: Ll2Planet; // for a, mass
  rotPeriod: number; // s
  dynEllip: number; // dynamical ellipticity (Earth 3.28e-3)
  obliquity: number; // rad, relative to the orbital plane at t = 0
  precA: number; // rad
  grCorr: boolean;
  /**
   * Multiplier of the stellar torque for the torque of moons (default 1: VPLanet has no moons). A moon at distance d with mass m
   * adds m / d^3 against the star's M / a^3 (averaged torque), so the factor is 1 + sum (m / M) (a / d)^3 (Earth: 3.18).
   */
  torqueMultiplier?: number;
}

export interface ObliquitySample {
  t: number; // years
  obliquity: number; // rad
  precA: number; // rad in [0, 2 pi]
}

/** Time derivative (per year) of the obliquity vector at (x, y, z), given the orbit state of the planet. */
export function obliquityRates(
  r: RotParams,
  x: number, y: number, z: number,
  orb: { h: number; k: number; p: number; q: number; dpdt: number; dqdt: number },
  out: Float64Array,
): void {
  const a = r.planet.semi / AUM;
  const sfac = 0.5 * dmath.pow(1.0 - orb.h * orb.h - orb.k * orb.k, -1.5);
  const omega = (2 * Math.PI) / r.rotPeriod; // rad/s
  const R = (((3 * (KGAUSS * KGAUSS) * r.starMass) / MSUN / (a * a * a * (omega * DAYSEC))) * r.dynEllip * sfac * z * (r.torqueMultiplier ?? 1)) / DAYSEC * YEARSEC;
  let dx = -y * R;
  let dy = x * R;
  // Torque of the other planets.
  const C = orb.q * orb.dpdt - orb.p * orb.dqdt;
  const norm = 2.0 / Math.sqrt(1 - orb.p * orb.p - orb.q * orb.q);
  const A = norm * (orb.dqdt + orb.p * C);
  const B = norm * (orb.dpdt - orb.q * C);
  const s = Math.sqrt(Math.abs(1.0 - x * x - y * y));
  dx += A * s + y * 2.0 * C;
  dy += -B * s - x * 2.0 * C;
  const dz = y * B - x * A;
  if (r.grCorr) {
    const n = KGAUSS * Math.sqrt((r.starMass + r.planet.mass) / MSUN / (a * a * a));
    const c = (LIGHTSPEED / AUM) * DAYSEC;
    const g = (((3 * n * n * n * a * a) / (c * c * (1.0 - orb.h * orb.h - orb.k * orb.k))) / DAYSEC / 2.0) * YEARSEC;
    dx += y * g;
    dy += -x * g;
  }
  out[0] = dx;
  out[1] = dy;
  out[2] = dz;
}

export interface EvolveOptions {
  /** Step in years (fixed). */
  dt: number;
  /** Record a sample every this many years (a multiple of dt). */
  sampleEvery: number;
  /**
   * Evaluate the orbital forcing at the start of each step for all four RK4 stages, as VPLanet does (the stage bodies keep
   * the start-of-step age, evolve.c:403). With false the forcing is evaluated at each stage time (an accurate RK4).
   */
  frozenForcing?: boolean;
}

/** Evolve the obliquity vector of planet `index` (0-based among the LL2 planets) to `tEnd` years. */
export function evolveObliquity(sys: Ll2System, index: number, r: RotParams, tEnd: number, opt: EvolveOptions): ObliquitySample[] {
  const state = Float64Array.from([
    dmath.sin(r.obliquity) * dmath.cos(r.precA),
    dmath.sin(r.obliquity) * dmath.sin(r.precA),
    dmath.cos(r.obliquity),
  ]);
  let frozen = ll2Evaluate(sys, index, 0);
  const ode: OdeSystem = {
    vars: [
      { kind: 'rate-abs', scale: (s, f) => (s[0]! * s[0]! + s[1]! * s[1]! > 0 ? Math.abs(Math.sqrt(s[0]! * s[0]! + s[1]! * s[1]!) / f) : 1e100) },
      { kind: 'rate-abs', scale: (s, f) => (s[0]! * s[0]! + s[1]! * s[1]! > 0 ? Math.abs(Math.sqrt(s[0]! * s[0]! + s[1]! * s[1]!) / f) : 1e100) },
      { kind: 'rate-abs' },
    ],
    derivatives(s, t, out) {
      const orb = opt.frozenForcing ? frozen : ll2Evaluate(sys, index, t);
      obliquityRates(r, s[0]!, s[1]!, s[2]!, orb, out);
    },
  };
  const sample = (t: number): ObliquitySample => {
    let pa = dmath.atan2(state[1]!, state[0]!);
    while (pa < 0) pa += 2 * Math.PI;
    while (pa > 2 * Math.PI) pa -= 2 * Math.PI;
    return { t, obliquity: dmath.atan2(Math.sqrt(state[0]! * state[0]! + state[1]! * state[1]!), state[2]!), precA: pa };
  };
  const out: ObliquitySample[] = [sample(0)];
  const perSample = Math.round(opt.sampleEvery / opt.dt);
  const steps = Math.round(tEnd / opt.dt);
  for (let i = 1; i <= steps; i++) {
    const t = (i - 1) * opt.dt;
    if (opt.frozenForcing) frozen = ll2Evaluate(sys, index, t);
    rk4Step(ode, state, t, { dt: opt.dt });
    if (i % perSample === 0) out.push(sample(i * opt.dt));
  }
  return out;
}
