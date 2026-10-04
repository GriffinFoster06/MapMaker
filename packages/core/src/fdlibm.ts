/* eslint-disable prefer-const, no-loss-of-precision -- verbatim port: C declaration blocks and constants (17+ digit literals) are kept exactly as in the source. */
// Provenance: ported from netlib fdlibm 5.3 (http://www.netlib.org/fdlibm, the files named in each section header)
// and, for log2 only, FreeBSD msun e_log2.c / k_log.h. See PROVENANCE.md.
//
// ====================================================
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this
// software is freely granted, provided that this notice
// is preserved.
// ====================================================
//
// The C code is translated line by line: same constants, same operation order, same branches. JavaScript doubles
// are IEEE-754 binary64 and the operations used (+ - * / and Math.sqrt) are correctly rounded and never fused, so
// the results are bit-identical on every engine and CPU. Math.abs, Math.floor and Math.trunc-style `| 0` casts are
// exact. Nothing here calls a Math transcendental. The port is checked bit-for-bit against the unmodified C
// (tools/fdlibm-vectors).
//
// Word access (the C __HI/__LO macros) goes through one shared Float64Array/Int32Array pair. All functions are
// non-reentrant (module scratch), which is safe because JavaScript is single-threaded per realm.

const f64 = new Float64Array(1);
const i32 = new Int32Array(f64.buffer);
const u32 = new Uint32Array(f64.buffer);
f64[0] = 1;
const HI = u32[1] === 0x3ff00000 ? 1 : 0;
const LO = 1 - HI;

/** High word as a signed int (C: `__HI(x)` read into an int). */
const hi = (x: number): number => { f64[0] = x; return i32[HI]!; };
/** Low word as unsigned (C: `__LO(x)` read into an unsigned). */
const lo = (x: number): number => { f64[0] = x; return u32[LO]!; };
/** C: `__HI(x) = h`, keeping the low word. */
const setHi = (x: number, h: number): number => { f64[0] = x; i32[HI] = h; return f64[0]!; };
/** C: `__LO(x) = 0`, keeping the high word. */
const clrLo = (x: number): number => { f64[0] = x; u32[LO] = 0; return f64[0]!; };
/** A double with the given high word and low word zero (C: `t = 0.0; __HI(t) = h`). */
const fromHi = (h: number): number => { u32[LO] = 0; i32[HI] = h; return f64[0]!; };

const huge = 1.0e300;
const tiny = 1.0e-300;
const two54 = 1.80143985094819840000e+16;
const twom54 = 5.55111512312578270212e-17;
const zero = 0.0;
const one = 1.0;

// ---- s_scalbn.c ----
function scalbn(x: number, n: number): number {
  let hx = hi(x);
  const lx = lo(x);
  let k = (hx & 0x7ff00000) >> 20;
  if (k === 0) {
    if (((lx | (hx & 0x7fffffff)) | 0) === 0) return x;
    x *= two54;
    hx = hi(x);
    k = ((hx & 0x7ff00000) >> 20) - 54;
    if (n < -50000) return tiny * x;
  }
  if (k === 0x7ff) return x + x;
  k = k + n;
  if (k > 0x7fe) return huge * (hx < 0 ? -huge : huge);
  if (k > 0) return setHi(x, (hx & 0x800fffff) | (k << 20));
  if (k <= -54) {
    if (n > 50000) return huge * (hx < 0 ? -huge : huge);
    return tiny * (hx < 0 ? -tiny : tiny);
  }
  k += 54;
  x = setHi(x, (hx & 0x800fffff) | (k << 20));
  return x * twom54;
}

// ---- k_sin.c, k_cos.c, k_tan.c ----
function kernelSin(x: number, y: number, iy: number): number {
  const half = 5.00000000000000000000e-01, S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03,
    S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08,
    S6 = 1.58969099521155010221e-10;
  const ix = hi(x) & 0x7fffffff;
  if (ix < 0x3e400000) { if ((x | 0) === 0) return x; }
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (half * y - v * r) - y) - v * S1);
}

function kernelCos(x: number, y: number): number {
  const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
    C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
  const ix = hi(x) & 0x7fffffff;
  if (ix < 0x3e400000) { if ((x | 0) === 0) return one; }
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3FD33333) return one - (0.5 * z - (z * r - x * y));
  let qx: number;
  if (ix > 0x3fe90000) qx = 0.28125;
  else qx = fromHi(ix - 0x00200000);
  const hz = 0.5 * z - qx;
  const a = one - qx;
  return a - (hz - (z * r - x * y));
}

const KT = [
  3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
  8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
  2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05,
];
const pio4 = 7.85398163397448278999e-01, pio4lo = 3.06161699786838301793e-17;

function kernelTan(x: number, y: number, iy: number): number {
  const T = KT;
  let z: number, r: number, v: number, w: number, s: number;
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix < 0x3e300000) {
    if ((x | 0) === 0) {
      if ((((ix | lo(x)) | 0) | (iy + 1)) === 0) return one / Math.abs(x);
      if (iy === 1) return x;
      let a: number, t: number;
      w = x + y;
      z = clrLo(w);
      v = y - (z - x);
      a = -one / w;
      t = clrLo(a);
      s = one + t * z;
      return t + a * (s + t * v);
    }
  }
  if (ix >= 0x3FE59428) {
    if (hx < 0) { x = -x; y = -y; }
    z = pio4 - x;
    w = pio4lo - y;
    x = z + w;
    y = 0.0;
  }
  z = x * x;
  w = z * z;
  r = T[1]! + w * (T[3]! + w * (T[5]! + w * (T[7]! + w * (T[9]! + w * T[11]!))));
  v = z * (T[2]! + w * (T[4]! + w * (T[6]! + w * (T[8]! + w * (T[10]! + w * T[12]!)))));
  s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T[0]! * s;
  w = x + r;
  if (ix >= 0x3FE59428) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (w * w / (w + v) - r)));
  }
  if (iy === 1) return w;
  let a: number, t: number;
  z = clrLo(w);
  v = r - (z - x);
  a = -1.0 / w;
  t = clrLo(a);
  s = 1.0 + t * z;
  return t + a * (s + t * v);
}

// ---- k_rem_pio2.c, e_rem_pio2.c ----
const initJk = [2, 3, 4, 6];
const PIo2 = [
  1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
  1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51,
];
const two24 = 1.67772160000000000000e+07;
const twon24 = 5.96046447753906250000e-08;
const iqS = new Int32Array(20), fS = new Float64Array(20), fqS = new Float64Array(20), qS = new Float64Array(20);

/** C: `__kernel_rem_pio2(x, y, e0, nx, prec, ipio2)`; returns n & 7 and writes y[0..prec]. */
function kernelRemPio2(x: Float64Array, y: Float64Array, e0: number, nx: number, prec: number, ipio2: readonly number[]): number {
  const iq = iqS, f = fS, fq = fqS, q = qS;
  let jz: number, jx: number, jv: number, jp: number, jk: number, carry: number, n: number, i: number, j: number, k: number,
    m: number, q0: number, ih: number;
  let z: number, fw: number;
  jk = initJk[prec]!;
  jp = jk;
  jx = nx - 1;
  jv = ((e0 - 3) / 24) | 0; if (jv < 0) jv = 0;
  q0 = e0 - 24 * (jv + 1);
  j = jv - jx; m = jx + jk;
  for (i = 0; i <= m; i++, j++) f[i] = (j < 0) ? zero : ipio2[j]!;
  for (i = 0; i <= jk; i++) {
    for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j]! * f[jx + i - j]!;
    q[i] = fw;
  }
  jz = jk;
  for (;;) { // `recompute:`
    for (i = 0, j = jz, z = q[jz]!; j > 0; i++, j--) {
      fw = ((twon24 * z) | 0);
      iq[i] = (z - two24 * fw) | 0;
      z = q[j - 1]! + fw;
    }
    z = scalbn(z, q0);
    z -= 8.0 * Math.floor(z * 0.125);
    n = z | 0;
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = (iq[jz - 1]! >> (24 - q0)); n += i;
      iq[jz - 1] = iq[jz - 1]! - (i << (24 - q0));
      ih = iq[jz - 1]! >> (23 - q0);
    } else if (q0 === 0) ih = iq[jz - 1]! >> 23;
    else if (z >= 0.5) ih = 2;
    if (ih > 0) {
      n += 1; carry = 0;
      for (i = 0; i < jz; i++) {
        j = iq[i]!;
        if (carry === 0) {
          if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; }
        } else iq[i] = 0xffffff - j;
      }
      if (q0 > 0) {
        switch (q0) {
          case 1: iq[jz - 1] = iq[jz - 1]! & 0x7fffff; break;
          case 2: iq[jz - 1] = iq[jz - 1]! & 0x3fffff; break;
        }
      }
      if (ih === 2) {
        z = one - z;
        if (carry !== 0) z -= scalbn(one, q0);
      }
    }
    if (z === zero) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) j |= iq[i]!;
      if (j === 0) {
        for (k = 1; iq[jk - k] === 0; k++);
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = ipio2[jv + i]!;
          for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j]! * f[jx + i - j]!;
          q[i] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  if (z === 0.0) {
    jz -= 1; q0 -= 24;
    while (iq[jz] === 0) { jz--; q0 -= 24; }
  } else {
    z = scalbn(z, -q0);
    if (z >= two24) {
      fw = ((twon24 * z) | 0);
      iq[jz] = (z - two24 * fw) | 0;
      jz += 1; q0 += 24;
      iq[jz] = fw | 0;
    } else iq[jz] = z | 0;
  }
  fw = scalbn(one, q0);
  for (i = jz; i >= 0; i--) { q[i] = fw * iq[i]!; fw *= twon24; }
  for (i = jz; i >= 0; i--) {
    for (fw = 0.0, k = 0; k <= jp && k <= jz - i; k++) fw += PIo2[k]! * q[i + k]!;
    fq[jz - i] = fw;
  }
  switch (prec) {
    case 0:
      fw = 0.0;
      for (i = jz; i >= 0; i--) fw += fq[i]!;
      y[0] = (ih === 0) ? fw : -fw;
      break;
    case 1:
    case 2:
      fw = 0.0;
      for (i = jz; i >= 0; i--) fw += fq[i]!;
      y[0] = (ih === 0) ? fw : -fw;
      fw = fq[0]! - fw;
      for (i = 1; i <= jz; i++) fw += fq[i]!;
      y[1] = (ih === 0) ? fw : -fw;
      break;
    case 3:
      for (i = jz; i > 0; i--) {
        fw = fq[i - 1]! + fq[i]!;
        fq[i] = fq[i]! + (fq[i - 1]! - fw);
        fq[i - 1] = fw;
      }
      for (i = jz; i > 1; i--) {
        fw = fq[i - 1]! + fq[i]!;
        fq[i] = fq[i]! + (fq[i - 1]! - fw);
        fq[i - 1] = fw;
      }
      for (fw = 0.0, i = jz; i >= 2; i--) fw += fq[i]!;
      if (ih === 0) { y[0] = fq[0]!; y[1] = fq[1]!; y[2] = fw; } else { y[0] = -fq[0]!; y[1] = -fq[1]!; y[2] = -fw; }
  }
  return n & 7;
}

const twoOverPi = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A,
  0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41,
  0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
  0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08,
  0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880,
  0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B,
];
const npio2Hw = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
  0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
  0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
  0x404858EB, 0x404921FB,
];
const half = 5.00000000000000000000e-01,
  invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
  pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21,
  pio2_3t = 8.47842766036889956997e-32;
const Y = new Float64Array(3);
const TX = new Float64Array(3);

/** C: `__ieee754_rem_pio2(x, y)`; returns n and writes y[0], y[1] into the module scratch `Y`. */
function remPio2(x: number): number {
  let z: number, w: number, t: number, r: number, fn: number;
  let e0: number, i: number, j: number, nx: number, n: number;
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) { Y[0] = x; Y[1] = 0; return 0; }
  if (ix < 0x4002d97c) {
    if (hx > 0) {
      z = x - pio2_1;
      if (ix !== 0x3ff921fb) {
        Y[0] = z - pio2_1t;
        Y[1] = (z - Y[0]!) - pio2_1t;
      } else {
        z -= pio2_2;
        Y[0] = z - pio2_2t;
        Y[1] = (z - Y[0]!) - pio2_2t;
      }
      return 1;
    }
    z = x + pio2_1;
    if (ix !== 0x3ff921fb) {
      Y[0] = z + pio2_1t;
      Y[1] = (z - Y[0]!) + pio2_1t;
    } else {
      z += pio2_2;
      Y[0] = z + pio2_2t;
      Y[1] = (z - Y[0]!) + pio2_2t;
    }
    return -1;
  }
  if (ix <= 0x413921fb) {
    t = Math.abs(x);
    n = (t * invpio2 + half) | 0;
    fn = n;
    r = t - fn * pio2_1;
    w = fn * pio2_1t;
    if (n < 32 && ix !== npio2Hw[n - 1]) {
      Y[0] = r - w;
    } else {
      j = ix >> 20;
      Y[0] = r - w;
      i = j - ((hi(Y[0]!) >> 20) & 0x7ff);
      if (i > 16) {
        t = r;
        w = fn * pio2_2;
        r = t - w;
        w = fn * pio2_2t - ((t - r) - w);
        Y[0] = r - w;
        i = j - ((hi(Y[0]!) >> 20) & 0x7ff);
        if (i > 49) {
          t = r;
          w = fn * pio2_3;
          r = t - w;
          w = fn * pio2_3t - ((t - r) - w);
          Y[0] = r - w;
        }
      }
    }
    Y[1] = (r - Y[0]!) - w;
    if (hx < 0) { Y[0] = -Y[0]!; Y[1] = -Y[1]!; return -n; }
    return n;
  }
  if (ix >= 0x7ff00000) { Y[0] = Y[1] = x - x; return 0; }
  e0 = (ix >> 20) - 1046;
  z = setHi(x, ix - (e0 << 20));
  for (i = 0; i < 2; i++) {
    TX[i] = (z | 0);
    z = (z - TX[i]!) * two24;
  }
  TX[2] = z;
  nx = 3;
  while (TX[nx - 1] === zero) nx--;
  n = kernelRemPio2(TX, Y, e0, nx, 2, twoOverPi);
  if (hx < 0) { Y[0] = -Y[0]!; Y[1] = -Y[1]!; return -n; }
  return n;
}

// ---- s_sin.c, s_cos.c, s_tan.c ----
function sin(x: number): number {
  const ix = hi(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0.0, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  const y0 = Y[0]!, y1 = Y[1]!;
  switch (n & 3) {
    case 0: return kernelSin(y0, y1, 1);
    case 1: return kernelCos(y0, y1);
    case 2: return -kernelSin(y0, y1, 1);
    default: return -kernelCos(y0, y1);
  }
}

function cos(x: number): number {
  const ix = hi(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0.0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  const y0 = Y[0]!, y1 = Y[1]!;
  switch (n & 3) {
    case 0: return kernelCos(y0, y1);
    case 1: return -kernelSin(y0, y1, 1);
    case 2: return -kernelCos(y0, y1);
    default: return kernelSin(y0, y1, 1);
  }
}

function tan(x: number): number {
  const ix = hi(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelTan(x, 0.0, 1);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  return kernelTan(Y[0]!, Y[1]!, 1 - ((n & 1) << 1));
}

// ---- e_asin.c, e_acos.c ----
const pio2_hi = 1.57079632679489655800e+00, pio2_lo = 6.12323399573676603587e-17, pio4_hi = 7.85398163397448278999e-01,
  pS0 = 1.66666666666666657415e-01, pS1 = -3.25565818622400915405e-01, pS2 = 2.01212532134862925881e-01,
  pS3 = -4.00555345006794114027e-02, pS4 = 7.91534994289814532176e-04, pS5 = 3.47933107596021167570e-05,
  qS1 = -2.40339491173441421878e+00, qS2 = 2.02094576023350569471e+00, qS3 = -6.88283971605453293030e-01,
  qS4 = 7.70381505559019352791e-02;
const pi = 3.14159265358979311600e+00;

function asin(x: number): number {
  let t = 0, w: number, p: number, q: number, c: number, r: number, s: number;
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if ((((ix - 0x3ff00000) | lo(x)) | 0) === 0) return x * pio2_hi + x * pio2_lo;
    return (x - x) / (x - x);
  } else if (ix < 0x3fe00000) {
    if (ix < 0x3e400000) {
      if (huge + x > one) return x;
    } else t = x * x;
    p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
    q = one + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
    w = p / q;
    return x + x * w;
  }
  w = one - Math.abs(x);
  t = w * 0.5;
  p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
  q = one + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
  s = Math.sqrt(t);
  if (ix >= 0x3FEF3333) {
    w = p / q;
    t = pio2_hi - (2.0 * (s + s * w) - pio2_lo);
  } else {
    w = clrLo(s);
    c = (t - w * w) / (s + w);
    r = p / q;
    p = 2.0 * s * r - (pio2_lo - 2.0 * c);
    q = pio4_hi - 2.0 * w;
    t = pio4_hi - (p - q);
  }
  return hx > 0 ? t : -t;
}

function acos(x: number): number {
  let z: number, p: number, q: number, r: number, w: number, s: number, c: number, df: number;
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if ((((ix - 0x3ff00000) | lo(x)) | 0) === 0) {
      if (hx > 0) return 0.0;
      return pi + 2.0 * pio2_lo;
    }
    return (x - x) / (x - x);
  }
  if (ix < 0x3fe00000) {
    if (ix <= 0x3c600000) return pio2_hi + pio2_lo;
    z = x * x;
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
    q = one + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
    r = p / q;
    return pio2_hi - (x - (pio2_lo - x * r));
  } else if (hx < 0) {
    z = (one + x) * 0.5;
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
    q = one + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
    s = Math.sqrt(z);
    r = p / q;
    w = r * s - pio2_lo;
    return pi - 2.0 * (s + w);
  }
  z = (one - x) * 0.5;
  s = Math.sqrt(z);
  df = clrLo(s);
  c = (z - df * df) / (s + df);
  p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
  q = one + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
  r = p / q;
  w = r * s + c;
  return 2.0 * (df + w);
}

// ---- s_atan.c, e_atan2.c ----
const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const aT = [
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02,
];

function atan(x: number): number {
  let w: number, s1: number, s2: number, z: number, id: number;
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && (lo(x) !== 0))) return x + x;
    if (hx > 0) return atanhi[3]! + atanlo[3]!;
    return -atanhi[3]! - atanlo[3]!;
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000) {
      if (huge + x > one) return x;
    }
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - one) / (2.0 + x); }
      else { id = 1; x = (x - one) / (x + one); }
    } else {
      if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (one + 1.5 * x); }
      else { id = 3; x = -1.0 / x; }
    }
  }
  z = x * x;
  w = z * z;
  s1 = z * (aT[0]! + w * (aT[2]! + w * (aT[4]! + w * (aT[6]! + w * (aT[8]! + w * aT[10]!)))));
  s2 = w * (aT[1]! + w * (aT[3]! + w * (aT[5]! + w * (aT[7]! + w * aT[9]!))));
  if (id < 0) return x - x * (s1 + s2);
  z = atanhi[id]! - ((x * (s1 + s2) - atanlo[id]!) - x);
  return (hx < 0) ? -z : z;
}

const pi_o_4 = 7.8539816339744827900E-01, pi_o_2 = 1.5707963267948965580E+00, pi_lo = 1.2246467991473531772E-16;

function atan2(y: number, x: number): number {
  let z: number;
  let k: number, m: number;
  const hx = hi(x), ix = hx & 0x7fffffff, lx = lo(x);
  const hy = hi(y), iy = hy & 0x7fffffff, ly = lo(y);
  if ((((ix | (((lx | -lx) >>> 31))) >>> 0) > 0x7ff00000) || (((iy | (((ly | -ly) >>> 31))) >>> 0) > 0x7ff00000)) return x + y;
  if ((((hx - 0x3ff00000) | lx) | 0) === 0) return atan(y);
  m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
  if (((iy | ly) | 0) === 0) {
    switch (m) {
      case 0:
      case 1: return y;
      case 2: return pi + tiny;
      case 3: return -pi - tiny;
    }
  }
  if (((ix | lx) | 0) === 0) return (hy < 0) ? -pi_o_2 - tiny : pi_o_2 + tiny;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0: return pi_o_4 + tiny;
        case 1: return -pi_o_4 - tiny;
        case 2: return 3.0 * pi_o_4 + tiny;
        case 3: return -3.0 * pi_o_4 - tiny;
      }
    } else {
      switch (m) {
        case 0: return zero;
        case 1: return -zero;
        case 2: return pi + tiny;
        case 3: return -pi - tiny;
      }
    }
  }
  if (iy === 0x7ff00000) return (hy < 0) ? -pi_o_2 - tiny : pi_o_2 + tiny;
  k = (iy - ix) >> 20;
  if (k > 60) z = pi_o_2 + 0.5 * pi_lo;
  else if (hx < 0 && k < -60) z = 0.0;
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return setHi(z, hi(z) ^ 0x80000000);
    case 2: return pi - (z - pi_lo);
    default: return (z - pi_lo) - pi;
  }
}

// ---- e_exp.c ----
const halF = [0.5, -0.5];
const twom1000 = 9.33263618503218878990e-302, o_threshold = 7.09782712893383973096e+02,
  u_threshold = -7.45133219101941108420e+02;
const ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
const ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const invln2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;

function exp(x: number): number {
  let y: number, hi_ = 0, lo_ = 0, c: number, t: number;
  let k = 0;
  let hx = hi(x) >>> 0;
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  if (hx >= 0x40862E42) {
    if (hx >= 0x7ff00000) {
      if ((((hx & 0xfffff) | lo(x)) | 0) !== 0) return x + x;
      return (xsb === 0) ? x : 0.0;
    }
    if (x > o_threshold) return huge * huge;
    if (x < u_threshold) return twom1000 * twom1000;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3FF0A2B2) {
      hi_ = x - ln2HI[xsb]!; lo_ = ln2LO[xsb]!; k = 1 - xsb - xsb;
    } else {
      k = (invln2 * x + halF[xsb]!) | 0;
      t = k;
      hi_ = x - t * ln2HI[0]!;
      lo_ = t * ln2LO[0]!;
    }
    x = hi_ - lo_;
  } else if (hx < 0x3e300000) {
    if (huge + x > one) return one + x;
  } else k = 0;
  t = x * x;
  c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return one - ((x * c) / (c - 2.0) - x);
  y = one - ((lo_ - (x * c) / (2.0 - c)) - hi_);
  if (k >= -1021) return setHi(y, (hi(y) + (k << 20)) | 0);
  y = setHi(y, (hi(y) + ((k + 1000) << 20)) | 0);
  return y * twom1000;
}

// ---- s_expm1.c ----
const Q1 = -3.33333333333331316428e-02, Q2 = 1.58730158725481460165e-03, Q3 = -7.93650757867487942473e-05,
  Q4 = 4.00821782732936239552e-06, Q5 = -2.01099218183624371326e-07;
const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10;

function expm1(x: number): number {
  let y: number, hi_ = 0, lo_ = 0, c = 0, t: number, e: number, hxs: number, hfx: number, r1: number;
  let k = 0;
  let hx = hi(x) >>> 0;
  const xsb = hx & 0x80000000;
  hx &= 0x7fffffff;
  if (hx >= 0x4043687A) {
    if (hx >= 0x40862E42) {
      if (hx >= 0x7ff00000) {
        if ((((hx & 0xfffff) | lo(x)) | 0) !== 0) return x + x;
        return (xsb === 0) ? x : -1.0;
      }
      if (x > o_threshold) return huge * huge;
    }
    if (xsb !== 0) {
      if (x + tiny < 0.0) return tiny - one;
    }
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3FF0A2B2) {
      if (xsb === 0) { hi_ = x - ln2_hi; lo_ = ln2_lo; k = 1; }
      else { hi_ = x + ln2_hi; lo_ = -ln2_lo; k = -1; }
    } else {
      k = (invln2 * x + ((xsb === 0) ? 0.5 : -0.5)) | 0;
      t = k;
      hi_ = x - t * ln2_hi;
      lo_ = t * ln2_lo;
    }
    x = hi_ - lo_;
    c = (hi_ - x) - lo_;
  } else if (hx < 0x3c900000) {
    t = huge + x;
    return x - (t - (huge + x));
  } else k = 0;
  hfx = 0.5 * x;
  hxs = x * hfx;
  r1 = one + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  t = 3.0 - r1 * hfx;
  e = hxs * ((r1 - t) / (6.0 - x * t));
  if (k === 0) return x - (x * e - hxs);
  e = (x * (e - c) - c);
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5));
    return one + 2.0 * (x - e);
  }
  if (k <= -2 || k > 56) {
    y = one - (e - x);
    y = setHi(y, (hi(y) + (k << 20)) | 0);
    return y - one;
  }
  t = one;
  if (k < 20) {
    t = setHi(t, 0x3ff00000 - (0x200000 >> k));
    y = t - (e - x);
    y = setHi(y, (hi(y) + (k << 20)) | 0);
  } else {
    t = fromHi((0x3ff - k) << 20);
    y = x - (e + t);
    y += one;
    y = setHi(y, (hi(y) + (k << 20)) | 0);
  }
  return y;
}

// ---- e_log.c ----
const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
  Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
  Lg7 = 1.479819860511658591e-01;

function log(x: number): number {
  let hfsq: number, f: number, s: number, z: number, R: number, w: number, t1: number, t2: number, dk: number;
  let k: number, hx: number, i: number, j: number;
  hx = hi(x);
  const lx = lo(x);
  k = 0;
  if (hx < 0x00100000) {
    if ((((hx & 0x7fffffff) | lx) | 0) === 0) return -two54 / zero;
    if (hx < 0) return (x - x) / zero;
    k -= 54; x *= two54;
    hx = hi(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  i = (hx + 0x95f64) & 0x100000;
  x = setHi(x, hx | (i ^ 0x3ff00000));
  k += (i >> 20);
  f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === zero) {
      if (k === 0) return zero;
      dk = k;
      return dk * ln2_hi + dk * ln2_lo;
    }
    R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    dk = k;
    return dk * ln2_hi - ((R - dk * ln2_lo) - f);
  }
  s = f / (2.0 + f);
  dk = k;
  z = s * s;
  i = hx - 0x6147a;
  w = z * z;
  j = 0x6b851 - hx;
  t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  R = t2 + t1;
  if (i > 0) {
    hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
}

// ---- s_log1p.c ----
function log1p(x: number): number {
  let hfsq: number, f = 0, c = 0, s: number, z: number, R: number, u: number;
  let k: number, hu = 0;
  const hx = hi(x);
  const ax = hx & 0x7fffffff;
  k = 1;
  if (hx < 0x3FDA827A) {
    if (ax >= 0x3ff00000) {
      if (x === -1.0) return -two54 / zero;
      return (x - x) / (x - x);
    }
    if (ax < 0x3e200000) {
      if (two54 + x > zero && ax < 0x3c900000) return x;
      return x - x * x * 0.5;
    }
    if (hx > 0 || hx <= (0xbfd2bec3 | 0)) { k = 0; f = x; hu = 1; }
  }
  if (hx >= 0x7ff00000) return x + x;
  if (k !== 0) {
    if (hx < 0x43400000) {
      u = 1.0 + x;
      hu = hi(u);
      k = (hu >> 20) - 1023;
      c = (k > 0) ? 1.0 - (u - x) : x - (u - 1.0);
      c /= u;
    } else {
      u = x;
      hu = hi(u);
      k = (hu >> 20) - 1023;
      c = 0;
    }
    hu &= 0x000fffff;
    if (hu < 0x6a09e) {
      u = setHi(u, hu | 0x3ff00000);
    } else {
      k += 1;
      u = setHi(u, hu | 0x3fe00000);
      hu = (0x00100000 - hu) >> 2;
    }
    f = u - 1.0;
  }
  hfsq = 0.5 * f * f;
  if (hu === 0) {
    if (f === zero) {
      if (k === 0) return zero;
      c += k * ln2_lo; return k * ln2_hi + c;
    }
    R = hfsq * (1.0 - 0.66666666666666666 * f);
    if (k === 0) return f - R;
    return k * ln2_hi - ((R - (k * ln2_lo + c)) - f);
  }
  s = f / (2.0 + f);
  z = s * s;
  R = z * (Lg1 + z * (Lg2 + z * (Lg3 + z * (Lg4 + z * (Lg5 + z * (Lg6 + z * Lg7))))));
  if (k === 0) return f - (hfsq - s * (hfsq + R));
  return k * ln2_hi - ((hfsq - (s * (hfsq + R) + (k * ln2_lo + c))) - f);
}

// ---- e_log10.c ----
const ivln10 = 4.34294481903251816668e-01, log10_2hi = 3.01029995663611771306e-01, log10_2lo = 3.69423907715893078616e-13;

function log10(x: number): number {
  let y: number, z: number;
  let i: number, k: number, hx: number;
  hx = hi(x);
  const lx = lo(x);
  k = 0;
  if (hx < 0x00100000) {
    if ((((hx & 0x7fffffff) | lx) | 0) === 0) return -two54 / zero;
    if (hx < 0) return (x - x) / zero;
    k -= 54; x *= two54;
    hx = hi(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  i = (k >>> 31);
  hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
  y = k + i;
  x = setHi(x, hx);
  z = y * log10_2lo + ivln10 * log(x);
  return z + y * log10_2hi;
}

// ---- FreeBSD e_log2.c, k_log.h (fdlibm lineage; netlib fdlibm 5.3 has no log2) ----
const ivln2hi = 1.44269504072144627571e+00, ivln2lo = 1.67517131648865118353e-10;

function log2(x: number): number {
  let f: number, hfsq: number, hi_: number, lo_: number, r: number, val_hi: number, val_lo: number, w: number, y: number;
  let i: number, k: number, hx: number;
  hx = hi(x);
  const lx = lo(x);
  k = 0;
  if (hx < 0x00100000) {
    if ((((hx & 0x7fffffff) | lx) | 0) === 0) return -two54 / zero;
    if (hx < 0) return (x - x) / zero;
    k -= 54; x *= two54;
    hx = hi(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx === 0x3ff00000 && lx === 0) return zero;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  i = (hx + 0x95f64) & 0x100000;
  x = setHi(x, hx | (i ^ 0x3ff00000));
  k += (i >> 20);
  y = k;
  f = x - 1.0;
  hfsq = 0.5 * f * f;
  r = kLog1p(f);
  hi_ = clrLo(f - hfsq);
  lo_ = (f - hi_) - hfsq + r;
  val_hi = hi_ * ivln2hi;
  val_lo = (lo_ + hi_) * ivln2lo + lo_ * ivln2hi;
  w = y + val_hi;
  val_lo += (y - w) + val_hi;
  val_hi = w;
  return val_lo + val_hi;
}

function kLog1p(f: number): number {
  const s = f / (2.0 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  const R = t2 + t1;
  const hfsq = 0.5 * f * f;
  return s * (hfsq + R);
}

// ---- e_pow.c ----
const bp = [1.0, 1.5];
const dp_h = [0.0, 5.84962487220764160156e-01];
const dp_l = [0.0, 1.35003920212974897128e-08];
const two = 2.0, two53 = 9007199254740992.0;
const L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01,
  L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01;
const lg2 = 6.93147180559945286227e-01, lg2_h = 6.93147182464599609375e-01, lg2_l = -1.90465429995776804525e-09;
const ovt = 8.0085662595372944372e-17, cp = 9.61796693925975554329e-01, cp_h = 9.61796700954437255859e-01,
  cp_l = -7.02846165095275826516e-09, ivln2 = 1.44269504088896338700e+00, ivln2_h = 1.44269502162933349609e+00,
  ivln2_l = 1.92596299112661746887e-08;

function pow(x: number, y: number): number {
  let z: number, ax: number, z_h: number, z_l: number, p_h: number, p_l: number;
  let y1: number, t1: number, t2: number, r: number, s: number, t: number, u: number, v: number, w: number;
  let j: number, k: number, yisint: number, n: number;
  const hx = hi(x), lx = lo(x);
  const hy = hi(y), ly = lo(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if (((iy | ly) | 0) === 0) return one;
  if (ix > 0x7ff00000 || ((ix === 0x7ff00000) && (lx !== 0)) || iy > 0x7ff00000 || ((iy === 0x7ff00000) && (ly !== 0))) return x + y;
  yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        j = ly >>> (52 - k);
        if (((j << (52 - k)) >>> 0) === ly) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        j = iy >> (20 - k);
        if ((j << (20 - k)) === iy) yisint = 2 - (j & 1);
      }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) {
      if ((((ix - 0x3ff00000) | lx) | 0) === 0) return y - y;
      else if (ix >= 0x3ff00000) return (hy >= 0) ? y : zero;
      else return (hy < 0) ? -y : zero;
    }
    if (iy === 0x3ff00000) {
      if (hy < 0) return one / x; else return x;
    }
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000) {
      if (hx >= 0) return Math.sqrt(x);
    }
  }
  ax = Math.abs(x);
  if (lx === 0) {
    if (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000) {
      z = ax;
      if (hy < 0) z = one / z;
      if (hx < 0) {
        if ((((ix - 0x3ff00000) | yisint) | 0) === 0) {
          z = (z - z) / (z - z);
        } else if (yisint === 1) z = -z;
      }
      return z;
    }
  }
  n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return (x - x) / (x - x);
  s = one;
  if ((n | (yisint - 1)) === 0) s = -one;
  if (iy > 0x41e00000) {
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return (hy < 0) ? huge * huge : tiny * tiny;
      if (ix >= 0x3ff00000) return (hy > 0) ? huge * huge : tiny * tiny;
    }
    if (ix < 0x3fefffff) return (hy < 0) ? s * huge * huge : s * tiny * tiny;
    if (ix > 0x3ff00000) return (hy > 0) ? s * huge * huge : s * tiny * tiny;
    t = ax - one;
    w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    u = ivln2_h * t;
    v = t * ivln2_l - w * ivln2;
    t1 = clrLo(u + v);
    t2 = v - (t1 - u);
  } else {
    let ss: number, s2: number, s_h: number, s_l: number, t_h: number, t_l: number;
    n = 0;
    if (ix < 0x00100000) { ax *= two53; n -= 53; ix = hi(ax); }
    n += ((ix) >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    if (j <= 0x3988E) k = 0;
    else if (j < 0xBB67A) k = 1;
    else { k = 0; n += 1; ix -= 0x00100000; }
    ax = setHi(ax, ix);
    u = ax - bp[k]!;
    v = one / (ax + bp[k]!);
    ss = u * v;
    s_h = clrLo(ss);
    t_h = fromHi(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18));
    t_l = ax - (t_h - bp[k]!);
    s_l = v * ((u - s_h * t_h) - s_h * t_l);
    s2 = ss * ss;
    r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = clrLo(3.0 + s2 + r);
    t_l = r - ((t_h - 3.0) - s2);
    u = s_h * t_h;
    v = s_l * t_h + t_l * ss;
    p_h = clrLo(u + v);
    p_l = v - (p_h - u);
    z_h = cp_h * p_h;
    z_l = cp_l * p_h + p_l * cp + dp_l[k]!;
    t = n;
    t1 = clrLo((((z_h + z_l) + dp_h[k]!) + t));
    t2 = z_l - (((t1 - t) - dp_h[k]!) - z_h);
  }
  y1 = clrLo(y);
  p_l = (y - y1) * t1 + y * t2;
  p_h = y1 * t1;
  z = p_l + p_h;
  j = hi(z);
  let i = lo(z) | 0;
  if (j >= 0x40900000) {
    if ((((j - 0x40900000) | i) | 0) !== 0) return s * huge * huge;
    if (p_l + ovt > z - p_h) return s * huge * huge;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if ((((j - 0xc090cc00) | i) | 0) !== 0) return s * tiny * tiny;
    if (p_l <= z - p_h) return s * tiny * tiny;
  }
  i = j & 0x7fffffff;
  k = (i >> 20) - 0x3ff;
  n = 0;
  if (i > 0x3fe00000) {
    n = (j + (0x00100000 >> (k + 1))) | 0;
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    t = fromHi(n & ~(0x000fffff >> k));
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    p_h -= t;
  }
  t = clrLo(p_l + p_h);
  u = t * lg2_h;
  v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v;
  w = v - (z - u);
  t = z * z;
  t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  r = (z * t1) / (t1 - two) - (w + z * w);
  z = one - (r - z);
  j = hi(z);
  j += (n << 20);
  if ((j >> 20) <= 0) z = scalbn(z, n);
  else z = setHi(z, (hi(z) + (n << 20)) | 0);
  return s * z;
}

// ---- s_cbrt.c ----
const B1 = 715094163, B2 = 696219795;
const cbC = 5.42857142857142815906e-01, cbD = -7.05306122448979611050e-01, cbE = 1.41428571428571436819e+00,
  cbF = 1.60714285714285720630e+00, cbG = 3.57142857142857150787e-01;

function cbrt(x: number): number {
  let hx = hi(x);
  let r: number, s: number, t = 0.0, w: number;
  const sign = hx & 0x80000000;
  hx ^= sign;
  if (hx >= 0x7ff00000) return x + x;
  if (((hx | lo(x)) | 0) === 0) return x;
  x = setHi(x, hx);
  if (hx < 0x00100000) {
    t = fromHi(0x43500000);
    t *= x;
    t = setHi(t, (((hi(t) / 3) | 0) + B2) | 0);
  } else t = fromHi(((hx / 3) | 0) + B1);
  r = t * t / x;
  s = cbC + r * t;
  t *= cbG + cbF / (s + cbE + cbD / s);
  t = clrLo(t);
  t = setHi(t, (hi(t) + 1) | 0);
  s = t * t;
  r = x / s;
  w = t + t;
  r = (r - t) / (w + r);
  t = t + t * r;
  return setHi(t, hi(t) | sign);
}

// ---- e_sinh.c, e_cosh.c, s_tanh.c ----
const shuge = 1.0e307;

function sinh(x: number): number {
  let t: number, w: number, h: number;
  const jx = hi(x);
  const ix = jx & 0x7fffffff;
  if (ix >= 0x7ff00000) return x + x;
  h = 0.5;
  if (jx < 0) h = -h;
  if (ix < 0x40360000) {
    if (ix < 0x3e300000) { if (shuge + x > one) return x; }
    t = expm1(Math.abs(x));
    if (ix < 0x3ff00000) return h * (2.0 * t - t * t / (t + one));
    return h * (t + t / (t + one));
  }
  if (ix < 0x40862E42) return h * exp(Math.abs(x));
  const lx = lo(x);
  if (ix < 0x408633CE || (ix === 0x408633ce) && (lx <= 0x8fb9f87d)) {
    w = exp(0.5 * Math.abs(x));
    t = h * w;
    return t * w;
  }
  return x * shuge;
}

function cosh(x: number): number {
  let t: number, w: number;
  let ix = hi(x);
  ix &= 0x7fffffff;
  if (ix >= 0x7ff00000) return x * x;
  if (ix < 0x3fd62e43) {
    t = expm1(Math.abs(x));
    w = one + t;
    if (ix < 0x3c800000) return w;
    return one + (t * t) / (w + w);
  }
  if (ix < 0x40360000) {
    t = exp(Math.abs(x));
    return half * t + half / t;
  }
  if (ix < 0x40862E42) return half * exp(Math.abs(x));
  const lx = lo(x);
  if (ix < 0x408633CE || (ix === 0x408633ce) && (lx <= 0x8fb9f87d)) {
    w = exp(half * Math.abs(x));
    t = half * w;
    return t * w;
  }
  return huge * huge;
}

function tanh(x: number): number {
  let t: number, z: number;
  const jx = hi(x);
  const ix = jx & 0x7fffffff;
  if (ix >= 0x7ff00000) {
    if (jx >= 0) return one / x + one;
    return one / x - one;
  }
  if (ix < 0x40360000) {
    if (ix < 0x3c800000) return x * (one + x);
    if (ix >= 0x3ff00000) {
      t = expm1(two * Math.abs(x));
      z = one - two / (t + two);
    } else {
      t = expm1(-two * Math.abs(x));
      z = -t / (t + two);
    }
  } else z = one - tiny;
  return (jx >= 0) ? z : -z;
}

// ---- s_asinh.c, e_acosh.c, e_atanh.c ----
const ln2 = 6.93147180559945286227e-01;

function asinh(x: number): number {
  let t: number, w: number;
  const hx = hi(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x7ff00000) return x + x;
  if (ix < 0x3e300000) { if (huge + x > one) return x; }
  if (ix > 0x41b00000) {
    w = log(Math.abs(x)) + ln2;
  } else if (ix > 0x40000000) {
    t = Math.abs(x);
    w = log(2.0 * t + one / (Math.sqrt(x * x + one) + t));
  } else {
    t = x * x;
    w = log1p(Math.abs(x) + t / (one + Math.sqrt(one + t)));
  }
  return hx > 0 ? w : -w;
}

function acosh(x: number): number {
  let t: number;
  const hx = hi(x);
  if (hx < 0x3ff00000) return (x - x) / (x - x);
  if (hx >= 0x41b00000) {
    if (hx >= 0x7ff00000) return x + x;
    return log(x) + ln2;
  }
  if ((((hx - 0x3ff00000) | lo(x)) | 0) === 0) return 0.0;
  if (hx > 0x40000000) {
    t = x * x;
    return log(2.0 * x - one / (x + Math.sqrt(t - one)));
  }
  t = x - one;
  return log1p(t + Math.sqrt(2.0 * t + t * t));
}

function atanh(x: number): number {
  let t: number;
  const hx = hi(x);
  const lx = lo(x);
  const ix = hx & 0x7fffffff;
  if ((((ix | (((lx | -lx) >>> 31))) >>> 0) > 0x3ff00000)) return (x - x) / (x - x);
  if (ix === 0x3ff00000) return x / zero;
  if (ix < 0x3e300000 && (huge + x) > zero) return x;
  x = setHi(x, ix);
  if (ix < 0x3fe00000) {
    t = x + x;
    t = 0.5 * log1p(t + t * x / (one - x));
  } else t = 0.5 * log1p((x + x) / (one - x));
  return hx >= 0 ? t : -t;
}

// ---- e_hypot.c ----
function hypot2(x: number, y: number): number {
  let a: number, b: number, t1: number, t2: number, y1: number, y2: number, w: number;
  let j: number, k: number, ha: number, hb: number;
  ha = hi(x) & 0x7fffffff;
  hb = hi(y) & 0x7fffffff;
  if (hb > ha) { a = y; b = x; j = ha; ha = hb; hb = j; } else { a = x; b = y; }
  a = setHi(a, ha);
  b = setHi(b, hb);
  if ((ha - hb) > 0x3c00000) return a + b;
  k = 0;
  if (ha > 0x5f300000) {
    if (ha >= 0x7ff00000) {
      w = a + b;
      if ((((ha & 0xfffff) | lo(a)) | 0) === 0) w = a;
      if ((((hb ^ 0x7ff00000) | lo(b)) | 0) === 0) w = b;
      return w;
    }
    ha -= 0x25800000; hb -= 0x25800000; k += 600;
    a = setHi(a, ha);
    b = setHi(b, hb);
  }
  if (hb < 0x20b00000) {
    if (hb <= 0x000fffff) {
      if (((hb | lo(b)) | 0) === 0) return a;
      t1 = fromHi(0x7fd00000);
      b *= t1;
      a *= t1;
      k -= 1022;
    } else {
      ha += 0x25800000;
      hb += 0x25800000;
      k -= 600;
      a = setHi(a, ha);
      b = setHi(b, hb);
    }
  }
  w = a - b;
  if (w > b) {
    t1 = fromHi(ha);
    t2 = a - t1;
    w = Math.sqrt(t1 * t1 - (b * (-b) - t2 * (a + t1)));
  } else {
    a = a + a;
    y1 = fromHi(hb);
    y2 = b - y1;
    t1 = fromHi(ha + 0x00100000);
    t2 = a - t1;
    w = Math.sqrt(t1 * y1 - (w * (-w) - (t1 * y2 + t2 * b)));
  }
  if (k !== 0) {
    t1 = setHi(1.0, (hi(1.0) + (k << 20)) | 0);
    return t1 * w;
  }
  return w;
}

export const fdlibm = {
  sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh, atanh,
  exp, expm1, log, log1p, log2, log10, pow, cbrt, hypot2, scalbn,
};
