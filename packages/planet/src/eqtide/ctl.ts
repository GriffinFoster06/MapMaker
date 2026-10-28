// Provenance: ported from upstream/VPLanet src/eqtide.c at dd55da7 (MIT); see PROVENANCE.md.
// EqTide's constant-time-lag model (CTL, Leconte et al. 2010; VPLanet `sTideModel t8`) for one orbiter and its central body:
// fdCTLF1..F5/Beta :4391-4416, fdaCTLZ :4484, fdaChi :3547, fdCTLDsemiDt, fdCTLDeccDt, fdCTLDrotrateDt, fdCTLDoblDt,
// fdCTLEqRotRate, fbTidalLock :3555, ForceBehaviorEqtide :3896. SI units internally (seconds); the API takes years.
// Not ported: CPL (sTideModel p2), the DB15 and ocean/mantle/envelope tide variants, tidal heating feedback to ThermInt.
import { dmath } from '@mapmaker/core';
import { YEARSEC } from '../poise/constants.js';
import { rk4Step, timeScale, type OdeSystem } from '../evolve/rk4.js';

export const BIGG = 6.67428e-11; // vplanet.h:59

export interface TidalBody {
  mass: number; // kg
  radius: number; // m
  radGyra: number; // radius of gyration
  k2: number; // Love number
  tau: number; // time lag, s
  rotRate: number; // rad/s
  obliquity: number; // rad
}

export interface CtlState {
  semi: number; // m
  ecc: number;
  central: TidalBody;
  orbiter: TidalBody;
  lockedCentral: boolean;
  lockedOrbiter: boolean;
}

const beta = (e: number): number => Math.sqrt(1 - e * e);
const f1 = (e: number): number => {
  const q = e * e;
  return 1 + (31 / 2) * q + (255 / 8) * q * q + (185 / 16) * q * q * q + (25 / 64) * q * q * q * q;
};
const f2 = (e: number): number => {
  const q = e * e;
  return 1 + (15 / 2) * q + (45 / 8) * q * q + (5 / 16) * q * q * q;
};
const f3 = (e: number): number => {
  const q = e * e;
  return 1 + (15 / 4) * q + (15 / 8) * q * q + (5 / 64) * q * q * q;
};
const f4 = (e: number): number => {
  const q = e * e;
  return 1 + 1.5 * q + (1 / 8) * q * q;
};
const f5 = (e: number): number => {
  const q = e * e;
  return 1 + 3 * q + (3 / 8) * q * q;
};

/** Mean motion of the orbit, rad/s. */
export const meanMotion = (s: Pick<CtlState, 'semi' | 'central' | 'orbiter'>): number =>
  Math.sqrt((BIGG * (s.central.mass + s.orbiter.mass)) / (s.semi * s.semi * s.semi));

/** Equilibrium (locked) rotation rate of a body, rad/s (fdCTLEqRotRate). */
export function eqRotRate(ecc: number, obliquity: number, n: number): number {
  const b = beta(ecc);
  const c = dmath.cos(obliquity);
  return (f2(ecc) / (b * b * b * f5(ecc))) * ((2 * c) / (1 + c * c)) * n;
}

function pow(x: number, y: number): number {
  return dmath.pow(x, y);
}

/** Derivatives of [a, e, rotC, rotO, oblC, oblO] (per second). */
export function ctlRates(st: CtlState, out: Float64Array): void {
  const { central: c, orbiter: o, semi: a, ecc: e } = st;
  const n = meanMotion(st);
  const b = beta(e);
  const F = [f1(e), f2(e), f3(e), f4(e), f5(e)] as const;
  const Z = (self: TidalBody, other: TidalBody): number =>
    (3 * BIGG * BIGG * self.k2 * other.mass * other.mass * (self.mass + other.mass) * pow(self.radius, 5) * self.tau) / pow(a, 9);
  const Zc = Z(c, o);
  const Zo = Z(o, c);
  const cc = dmath.cos(c.obliquity);
  const co = dmath.cos(o.obliquity);
  const semiSum =
    Zo * ((co * F[1] * o.rotRate) / (pow(b, 12) * n) - F[0] / pow(b, 15)) + Zc * ((cc * F[1] * c.rotRate) / (pow(b, 12) * n) - F[0] / pow(b, 15));
  out[0] = ((2 * a * a) / (BIGG * c.mass * o.mass)) * semiSum;
  const eccSum =
    Zo * ((co * F[3] * o.rotRate) / (pow(b, 10) * n) - (18 * F[2]) / (11 * pow(b, 13))) +
    Zc * ((cc * F[3] * c.rotRate) / (pow(b, 10) * n) - (18 * F[2]) / (11 * pow(b, 13)));
  out[1] = ((11 * a * e) / (2 * BIGG * c.mass * o.mass)) * eccSum;
  const spin = (self: TidalBody, other: TidalBody, z: number): { dOmega: number; dObl: number } => {
    const cs = dmath.cos(self.obliquity);
    const ss = dmath.sin(self.obliquity);
    const inertia = 2 * self.mass * self.radGyra * self.radGyra * self.radius * self.radius * n;
    const dOmega = (z / inertia) * ((2 * cs * F[1]) / pow(b, 12) - ((1 + cs * cs) * F[4] * self.rotRate) / (pow(b, 9) * n));
    const chi = (self.radGyra * self.radGyra * self.radius * self.radius * self.rotRate * a * n) / (BIGG * other.mass);
    const dObl = ((z * ss) / (inertia * self.rotRate)) * (((cs - chi / b) * F[4] * self.rotRate) / (pow(b, 9) * n) - (2 * F[1]) / pow(b, 12));
    return { dOmega, dObl };
  };
  const sc = spin(c, o, Zc);
  const so = spin(o, c, Zo);
  out[2] = st.lockedCentral ? 0 : sc.dOmega;
  out[3] = st.lockedOrbiter ? 0 : so.dOmega;
  out[4] = sc.dObl;
  out[5] = so.dObl;
}

export interface CtlOptions {
  eta: number; // variable-step safety factor (VPLanet dEta)
  maxLockDiff: number; // dMaxLockDiff
  minEcc?: number; // dMinValue
}

export interface CtlSample {
  years: number;
  semi: number;
  ecc: number;
  rotPeriodCentral: number; // days
  rotPeriodOrbiter: number; // days
  obliquityOrbiter: number; // rad
  lockedOrbiter: boolean;
}

/** Spin-lock test for one body (fbTidalLock): locked once the rate is within maxLockDiff of equilibrium and the torque points toward it. */
function checkLock(st: CtlState, which: 'central' | 'orbiter', maxDiff: number): boolean {
  const body = st[which];
  const eq = eqRotRate(st.ecc, body.obliquity, meanMotion(st));
  const diff = Math.abs(body.rotRate - eq) / eq;
  if (diff >= maxDiff) return false;
  const keep = body.rotRate;
  const tmp = new Float64Array(6);
  const idx = which === 'central' ? 2 : 3;
  const wasLocked = which === 'central' ? st.lockedCentral : st.lockedOrbiter;
  if (which === 'central') st.lockedCentral = false;
  else st.lockedOrbiter = false;
  body.rotRate = (1 + 2 * maxDiff) * eq;
  ctlRates(st, tmp);
  let locked = false;
  if (tmp[idx]! < 0) {
    body.rotRate = (1 - 2 * maxDiff) * eq;
    ctlRates(st, tmp);
    locked = tmp[idx]! > 0;
  }
  body.rotRate = keep;
  if (which === 'central') st.lockedCentral = wasLocked;
  else st.lockedOrbiter = wasLocked;
  return locked;
}

/** Evolve to `years`, sampling every `outputYears`. Mirrors VPLanet's loop: RK4 with dt = eta * smallest time scale, lock check after each step. */
export function evolveCtl(init: CtlState, years: number, outputYears: number, opt: CtlOptions): CtlSample[] {
  const st: CtlState = JSON.parse(JSON.stringify(init)) as CtlState;
  const tEnd = years * YEARSEC;
  const outDt = outputYears * YEARSEC;
  const vec = new Float64Array([st.semi, st.ecc, st.central.rotRate, st.orbiter.rotRate, st.central.obliquity, st.orbiter.obliquity]);
  const load = (): void => {
    st.semi = vec[0]!;
    st.ecc = vec[1]!;
    st.central.rotRate = vec[2]!;
    st.orbiter.rotRate = vec[3]!;
    st.central.obliquity = vec[4]!;
    st.orbiter.obliquity = vec[5]!;
  };
  const ode: OdeSystem = {
    // The obliquities are integrated like VPLanet's x, y, z components: their rates set the step only through |sin(psi)/f|.
    vars: [
      { kind: 'rate' },
      { kind: 'rate' },
      { kind: 'rate' },
      { kind: 'rate' },
      { kind: 'rate-abs', scale: (s, f) => Math.abs(dmath.sin(s[4]!) / f) },
      { kind: 'rate-abs', scale: (s, f) => Math.abs(dmath.sin(s[5]!) / f) },
    ],
    derivatives(s, _t, out) {
      const saved = { semi: st.semi, ecc: st.ecc, cr: st.central.rotRate, or: st.orbiter.rotRate, co: st.central.obliquity, oo: st.orbiter.obliquity };
      st.semi = s[0]!;
      st.ecc = Math.max(s[1]!, 0);
      st.central.rotRate = s[2]!;
      st.orbiter.rotRate = s[3]!;
      st.central.obliquity = s[4]!;
      st.orbiter.obliquity = s[5]!;
      ctlRates(st, out);
      st.semi = saved.semi;
      st.ecc = saved.ecc;
      st.central.rotRate = saved.cr;
      st.orbiter.rotRate = saved.or;
      st.central.obliquity = saved.co;
      st.orbiter.obliquity = saved.oo;
    },
  };
  const sample = (t: number): CtlSample => ({
    years: t / YEARSEC,
    semi: st.semi,
    ecc: st.ecc,
    rotPeriodCentral: (2 * Math.PI) / st.central.rotRate / 86400,
    rotPeriodOrbiter: (2 * Math.PI) / st.orbiter.rotRate / 86400,
    obliquityOrbiter: st.orbiter.obliquity,
    lockedOrbiter: st.lockedOrbiter,
  });
  const out: CtlSample[] = [sample(0)];
  let t = 0;
  let next = outDt;
  const d = new Float64Array(6);
  while (t < tEnd) {
    load();
    ode.derivatives(vec, t, d);
    const dt = Math.min(opt.eta * timeScale(ode, vec, d, 1, false), next - t);
    rk4Step(ode, vec, t, { dt: dt });
    t += dt;
    load();
    if (opt.minEcc && st.ecc < opt.minEcc) {
      st.ecc = 0;
      vec[1] = 0;
    }
    if (st.lockedOrbiter) vec[3] = eqRotRate(st.ecc, st.orbiter.obliquity, meanMotion(st));
    if (st.lockedCentral) vec[2] = eqRotRate(st.ecc, st.central.obliquity, meanMotion(st));
    load();
    if (!st.lockedOrbiter && checkLock(st, 'orbiter', opt.maxLockDiff)) st.lockedOrbiter = true;
    if (!st.lockedCentral && checkLock(st, 'central', opt.maxLockDiff)) st.lockedCentral = true;
    if (t >= next - 1e-6) {
      out.push(sample(t));
      next += outDt;
    }
  }
  return out;
}
