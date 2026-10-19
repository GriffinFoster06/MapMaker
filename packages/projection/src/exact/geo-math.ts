// Stand-in for d3-geo 3.1.1 src/math.js in the exact path (ARCHITECTURE §3.5, §3.7; alias/d3-dmath.mjs). Same
// exports, same definitions, with every transcendental function routed through dmath at call time (so the active
// dmath mode, fdlibm by default, decides the result). abs, ceil, floor, sign and sqrt stay on Math: they are exact,
// or correctly rounded under IEEE 754, on every engine. d3-geo's own files are not modified.
import { dmath } from '@mapmaker/core';

export const epsilon = 1e-6;
export const epsilon2 = 1e-12;
export const pi = Math.PI;
export const halfPi = pi / 2;
export const quarterPi = pi / 4;
export const tau = pi * 2;

export const degrees = 180 / pi;
export const radians = pi / 180;

export const abs = Math.abs;
export const atan = (x: number) => dmath.atan(x);
export const atan2 = (y: number, x: number) => dmath.atan2(y, x);
export const cos = (x: number) => dmath.cos(x);
export const ceil = Math.ceil;
export const exp = (x: number) => dmath.exp(x);
export const floor = Math.floor;
export const hypot = (...v: number[]) => dmath.hypot(...v);
export const log = (x: number) => dmath.log(x);
export const pow = (x: number, y: number) => dmath.pow(x, y);
export const sin = (x: number) => dmath.sin(x);
export const sign = Math.sign;
export const sqrt = Math.sqrt;
export const tan = (x: number) => dmath.tan(x);

export function acos(x: number) {
  return x > 1 ? 0 : x < -1 ? pi : dmath.acos(x);
}

export function asin(x: number) {
  return x > 1 ? halfPi : x < -1 ? -halfPi : dmath.asin(x);
}

export function haversin(x: number) {
  return (x = sin(x / 2)) * x;
}
