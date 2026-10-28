// Provenance: ported from upstream/VPLanet src/binary.c at dd55da7 (MIT); see PROVENANCE.md.
// The Leung & Lee (2013) analytic orbit of a circumbinary planet (P-type): cylindrical position (R, Phi, Z) about the binary's
// barycentre as guiding-centre motion plus forced terms (K_MAX = 4): fndMeanMotionBinary :1894, fndEpiFreqK :1914, fndEpiFreqV
// :1942, fndPot0/Pot0dR/Pot1/Pot1dR :1967-2072, fndn :2074, fndC0 .. fndDMk :2085-2196, fndCBPRBinary :2197, fndCBPPhiBinary :2227,
// fndCBPZBinary :2266, fndFluxApproxBinary :2365. SI units; time in seconds from the epoch.
// Not ported: the Holman and Roche-lobe halts, the conversion of (R, Phi, Z) to osculating elements, the exact-flux integral.
import { dmath } from '@mapmaker/core';
import { derivLaplaceCoeff, laplaceCoeff } from '../distorb/ll2.js';
import { BIGG } from '../eqtide/ctl.js';

const K_MAX = 4; // binary.h:9

export interface Circumbinary {
  m0: number; // primary mass, kg
  m1: number; // secondary mass, kg
  binarySemi: number; // m
  binaryEcc: number;
  binaryLongP: number; // rad
  binaryPhiAB: number; // initial binary mean anomaly, rad
  planetMass: number; // kg
  semi: number; // initial guiding radius R0, m
  freeEcc: number;
  freeInc: number; // rad
  m0Cbp: number; // CBP initial mean anomaly (dCBPM0), rad
  psi: number; // dCBPPsi, rad
  zeta: number; // dCBPZeta, rad
}

export interface CircumbinaryFrequencies {
  binaryMeanMotion: number; // rad/s
  n0: number; // mean motion of the guiding centre
  kappa0: number; // epicyclic frequency
  nu0: number; // vertical frequency
}

const delta = (a: number, b: number): number => (a === b ? 1 : 0);

export class CircumbinaryOrbit {
  readonly freq: CircumbinaryFrequencies;
  private readonly M: number;
  private readonly R0: number;
  private readonly nKep: number;

  constructor(private readonly p: Circumbinary) {
    this.M = p.m0 + p.m1;
    this.R0 = p.semi;
    this.nKep = Math.sqrt((BIGG * (this.M + p.planetMass)) / (p.semi * p.semi * p.semi));
    const nb = Math.sqrt((BIGG * this.M) / (p.binarySemi * p.binarySemi * p.binarySemi));
    this.freq = { binaryMeanMotion: nb, n0: this.meanMotion(), kappa0: this.epiK(), nu0: this.epiV() };
  }

  private alphas(): { a: number; b: number } {
    const { m0, m1, binarySemi } = this.p;
    return { a: ((binarySemi * m1) / this.M) / this.R0, b: ((binarySemi * m0) / this.M) / this.R0 };
  }

  private meanMotion(): number {
    const { m0, m1, binarySemi } = this.p;
    const M = this.M;
    const { a, b } = this.alphas();
    const N0 = (this.nKep * this.nKep) / 2;
    const t1 = (m0 * laplaceCoeff(a, 0, 0.5)) / M + (m1 * laplaceCoeff(b, 0, 0.5)) / M;
    const t2 = ((m0 * m1 * binarySemi) / (M * M * this.R0)) * (derivLaplaceCoeff(1, a, 0, 0.5) + derivLaplaceCoeff(1, b, 0, 0.5));
    return Math.sqrt(N0 * (t1 + t2));
  }

  private epiK(): number {
    const { m0, m1, binarySemi } = this.p;
    const M = this.M;
    const { a, b } = this.alphas();
    let K0 = (this.nKep * this.nKep) / 2;
    const t1 = (m0 * laplaceCoeff(a, 0, 0.5)) / M + (m1 * laplaceCoeff(b, 0, 0.5)) / M;
    const t2 = ((m0 * m1 * binarySemi) / (M * M * this.R0)) * (derivLaplaceCoeff(1, a, 0, 0.5) + derivLaplaceCoeff(1, b, 0, 0.5));
    let t3 = (m0 * m1 * binarySemi * binarySemi) / (M * M * this.R0 * this.R0);
    const t4 = (m1 * derivLaplaceCoeff(2, a, 0, 0.5)) / M + (m0 * derivLaplaceCoeff(2, b, 0, 0.5)) / M;
    t3 *= t4;
    K0 *= t1 - t2 - t3;
    return Math.sqrt(K0);
  }

  private epiV(): number {
    const { m0, m1 } = this.p;
    const { a, b } = this.alphas();
    const V0 = (this.nKep * this.nKep) / 2;
    return Math.sqrt(V0 * ((m0 * laplaceCoeff(a, 0, 1.5)) / this.M + (m1 * laplaceCoeff(b, 0, 1.5)) / this.M));
  }

  // --- Potential terms (j = 0 only, as in VPLanet) ---
  private al(R: number): { a: number; b: number } {
    const { m0, m1, binarySemi, binaryEcc } = this.p;
    const f = 1.0 + (binaryEcc * binaryEcc) / 2;
    return { a: (((binarySemi * m1) / this.M) / R) * f, b: (((binarySemi * m0) / this.M) / R) * f };
  }
  private sgn(k: number): number {
    return k % 2 === 0 ? 1 : -1; // (-1)^k
  }
  private pot0(k: number, R: number): number {
    const { m0, m1 } = this.p;
    const { a, b } = this.al(R);
    const coeff = (-(2 - delta(k, 0)) / 2) * ((BIGG * this.M) / R);
    return coeff * ((this.sgn(k) * m0 * laplaceCoeff(a, k, 0.5)) / this.M + (m1 * laplaceCoeff(b, k, 0.5)) / this.M);
  }
  private pot0dR(k: number, R: number): number {
    const { m0, m1 } = this.p;
    const { a, b } = this.al(R);
    const coeff = -(2 - delta(k, 0)) / 2;
    const f = (this.sgn(k) * m0 * laplaceCoeff(a, k, 0.5)) / this.M + (m1 * laplaceCoeff(b, k, 0.5)) / this.M;
    const g = (BIGG * this.M) / R;
    const gp = -g / R;
    const fp = (-this.sgn(k) * m0 * a * R * derivLaplaceCoeff(1, a, k, 0.5)) / (R * R * this.M) + (-m1 * b * R * derivLaplaceCoeff(1, b, k, 0.5)) / (R * R * this.M);
    return coeff * (fp * g + gp * f);
  }
  private pot1(k: number, R: number): number {
    const { m0, m1 } = this.p;
    const { a, b } = this.al(R);
    const coeff = (-(2 - delta(k, 0)) / 2) * ((BIGG * this.M) / R);
    return coeff * ((this.sgn(k) * m0 * a * derivLaplaceCoeff(1, a, k, 0.5)) / this.M + (m1 * b * derivLaplaceCoeff(1, b, k, 0.5)) / this.M);
  }
  private pot1dR(k: number, R: number): number {
    const { m0, m1 } = this.p;
    const { a, b } = this.al(R);
    const coeff = -(2 - delta(k, 0)) / 2;
    const f = (this.sgn(k) * m0 * a) / this.M;
    const g = derivLaplaceCoeff(1, a, k, 0.5);
    const h = (m1 * b) / this.M;
    const i = derivLaplaceCoeff(1, b, k, 0.5);
    const l = (BIGG * this.M) / R;
    const fp = (-this.sgn(k) * m0 * a) / (R * this.M);
    const gp = (-a * derivLaplaceCoeff(2, a, k, 0.5)) / R;
    const hp = (-m1 * b) / (R * this.M);
    const ip = (-b * derivLaplaceCoeff(2, b, k, 0.5)) / R;
    const lp = (-BIGG * this.M) / (R * R);
    return coeff * ((fp * g + gp * f + hp * i + ip * h) * l + lp * (f * g + h * i));
  }
  private nPot(R: number): number {
    return Math.sqrt(this.pot0dR(0, R) / R);
  }

  private c0(): number {
    const nb = this.freq.binaryMeanMotion;
    const c = (-this.p.binaryEcc * this.pot1dR(0, this.R0)) / this.R0;
    return c / (this.freq.kappa0 * this.freq.kappa0 - nb * nb);
  }
  private c0k(k: number): number {
    const nb = this.freq.binaryMeanMotion;
    const n = this.nPot(this.R0);
    let c = this.pot0dR(k, this.R0) + (2 * n * this.pot0(k, this.R0)) / (this.R0 * (n - nb));
    c /= this.R0;
    return c / (this.freq.kappa0 * this.freq.kappa0 - k * k * (this.freq.n0 - nb) * (this.freq.n0 - nb));
  }
  private cpk(k: number): number {
    const nb = this.freq.binaryMeanMotion;
    const n = this.nPot(this.R0);
    let t1 = k * this.pot0dR(k, this.R0) - 0.5 * this.pot1dR(k, this.R0);
    let t2 = k * n * (2 * k * this.pot0(k, this.R0) - this.pot1(k, this.R0));
    t2 /= this.R0 * (k * n - (k + 1) * nb);
    t1 += t2;
    const c = (this.p.binaryEcc * t1) / this.R0;
    const d = k * this.freq.n0 - (k + 1) * nb;
    return c / (this.freq.kappa0 * this.freq.kappa0 - d * d);
  }
  private cmk(k: number): number {
    const nb = this.freq.binaryMeanMotion;
    const n = this.nPot(this.R0);
    let t1 = -k * this.pot0dR(k, this.R0) - 0.5 * this.pot1dR(k, this.R0);
    let t2 = k * n * (-2 * k * this.pot0(k, this.R0) - this.pot1(k, this.R0));
    t2 /= this.R0 * (k * n - (k - 1) * nb);
    t1 += t2;
    const c = (this.p.binaryEcc * t1) / this.R0;
    const d = k * this.freq.n0 - (k - 1) * nb;
    return c / (this.freq.kappa0 * this.freq.kappa0 - d * d);
  }
  private d0(): number {
    return 2.0 * this.c0();
  }
  private dk0(k: number): number {
    const nb = this.freq.binaryMeanMotion;
    const n = this.nPot(this.R0);
    const t1 = 2.0 * this.c0k(k);
    let Dk = -this.pot0(k, this.R0) / (this.R0 * this.R0);
    Dk /= n * (n - nb);
    return t1 - Dk;
  }
  private dpk(k: number): number {
    const nb = this.freq.binaryMeanMotion;
    const n = this.nPot(this.R0);
    const Dk = 2.0 * this.cpk(k);
    let t1 = this.p.binaryEcc * (k * (2 * k * this.pot0(k, this.R0) - this.pot1(k, this.R0)));
    t1 /= 2.0 * this.R0 * this.R0 * n * (k * n - (k + 1) * nb);
    return Dk - t1;
  }
  private dmk(k: number): number {
    const nb = this.freq.binaryMeanMotion;
    const n = this.nPot(this.R0);
    const Dk = 2.0 * this.cmk(k);
    let t1 = this.p.binaryEcc * (k * (-2 * k * this.pot0(k, this.R0) - this.pot1(k, this.R0)));
    t1 /= 2.0 * this.R0 * this.R0 * n * (k * n - (k - 1) * nb);
    return Dk - t1;
  }

  /** Cylindrical position of the planet about the barycentre at `t` seconds: R (m), Phi (rad, as VPLanet's fmod), Z (m). */
  position(t: number): { R: number; phi: number; Z: number } {
    const { freeEcc, freeInc, psi, zeta, binaryLongP: varpi, binaryPhiAB, m0Cbp } = this.p;
    const { binaryMeanMotion: nb, n0, kappa0, nu0 } = this.freq;
    const M = nb * t + binaryPhiAB;
    const phi0 = n0 * t + m0Cbp;
    let tmp2 = 0;
    for (let k = 1; k < K_MAX; k++) {
      let tmp3 = this.c0k(k) * dmath.cos(k * (phi0 - M - varpi));
      tmp3 += this.cpk(k) * dmath.cos(k * (phi0 - varpi) - (k + 1) * M);
      tmp3 += this.cmk(k) * dmath.cos(k * (phi0 - varpi) - (k - 1) * M);
      tmp2 += tmp3;
    }
    const tmp1 = 1 - freeEcc * dmath.cos(kappa0 * t + psi) - this.c0() * dmath.cos(M);
    const R = this.R0 * (tmp1 - tmp2);

    let phi = phi0 + (2.0 * n0 * freeEcc * dmath.sin(kappa0 * t + psi)) / kappa0;
    phi += (n0 * this.d0() * dmath.sin(M)) / nb;
    let tot = 0;
    for (let k = 1; k < K_MAX; k++) {
      let t1 = (n0 * this.dk0(k) * dmath.sin(k * (phi0 - M - varpi))) / (k * (n0 - nb));
      t1 += (n0 * this.dpk(k) * dmath.sin(k * (phi0 - varpi) - (k + 1) * M)) / (k * n0 - (k + 1) * nb);
      t1 += (n0 * this.dmk(k) * dmath.sin(k * (phi0 - varpi) - (k - 1) * M)) / (k * n0 - (k - 1) * nb);
      tot += t1;
    }
    phi = (phi + tot) % (2.0 * Math.PI);
    const Z = this.R0 * freeInc * dmath.cos(nu0 * t + zeta);
    return { R, phi, Z };
  }

  /** Orbit-averaged flux (W/m^2) from the two stars at the planet (fndFluxApproxBinary), given the luminosities (W) and the current R, Z, Phi. */
  approxFlux(L0: number, L1: number, R: number, Z: number, phi: number): number {
    const r = Math.sqrt(R * R + Z * Z);
    const mu1 = this.p.m0 / this.M;
    const mu2 = this.p.m1 / this.M;
    const flux = (L0 + L1) / (4.0 * Math.PI * r * r);
    const tmp = ((mu1 * L1 - mu2 * L0) / (8.0 * Math.PI * r * r * r)) * 3.0 * this.p.binarySemi * this.p.binaryEcc * dmath.cos(phi);
    return flux + tmp;
  }
}
