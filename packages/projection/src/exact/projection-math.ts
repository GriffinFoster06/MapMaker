// Stand-in for d3-geo-projection 4.0.0 src/math.js in the exact path (see geo-math.ts). Same exports and
// definitions; transcendental functions go through dmath at call time. d3-geo-projection's files are not modified.
import { dmath } from '@mapmaker/core';

export const abs = Math.abs;
export const atan = (x: number) => dmath.atan(x);
export const atan2 = (y: number, x: number) => dmath.atan2(y, x);
export const ceil = Math.ceil;
export const cos = (x: number) => dmath.cos(x);
export const exp = (x: number) => dmath.exp(x);
export const floor = Math.floor;
export const log = (x: number) => dmath.log(x);
export const max = Math.max;
export const min = Math.min;
export const pow = (x: number, y: number) => dmath.pow(x, y);
export const round = Math.round;
export const sign = Math.sign;
export const sin = (x: number) => dmath.sin(x);
export const tan = (x: number) => dmath.tan(x);

export const epsilon = 1e-6;
export const epsilon2 = 1e-12;
export const pi = Math.PI;
export const halfPi = pi / 2;
export const quarterPi = pi / 4;
export const sqrt1_2 = Math.SQRT1_2;
export const sqrt2 = sqrt(2);
export const sqrtPi = sqrt(pi);
export const tau = pi * 2;
export const degrees = 180 / pi;
export const radians = pi / 180;

export function sinci(x: number) {
  return x ? x / dmath.sin(x) : 1;
}

export function asin(x: number) {
  return x > 1 ? halfPi : x < -1 ? -halfPi : dmath.asin(x);
}

export function acos(x: number) {
  return x > 1 ? 0 : x < -1 ? pi : dmath.acos(x);
}

export function sqrt(x: number) {
  return x > 0 ? Math.sqrt(x) : 0;
}

export function tanh(x: number) {
  x = exp(2 * x);
  return (x - 1) / (x + 1);
}

export function sinh(x: number) {
  return (exp(x) - exp(-x)) / 2;
}

export function cosh(x: number) {
  return (exp(x) + exp(-x)) / 2;
}

export function arsinh(x: number) {
  return log(x + sqrt(x * x + 1));
}

export function arcosh(x: number) {
  return log(x + sqrt(x * x - 1));
}
