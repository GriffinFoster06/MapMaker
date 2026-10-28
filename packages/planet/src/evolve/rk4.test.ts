import { describe, expect, it } from 'vitest';
import { assignDt, integrate, rk4Step, timeScale, type OdeSystem } from './rk4.js';

const decay: OdeSystem = { vars: [{ kind: 'rate' }], derivatives: (s, _t, o) => { o[0] = -s[0]!; } };
const osc: OdeSystem = {
  vars: [{ kind: 'rate-abs' }, { kind: 'rate-abs' }],
  derivatives: (s, _t, o) => { o[0] = s[1]!; o[1] = -s[0]!; },
};

function endError(dt: number): number {
  const s = Float64Array.from([1]);
  integrate(decay, s, 0, 1, { dt });
  return Math.abs(s[0]! - Math.exp(-1));
}

describe('RK4 (VPLanet RungeKutta4Step)', () => {
  it('is fourth order on exponential decay', () => {
    const order = Math.log2(endError(0.1) / endError(0.05));
    expect(order).toBeGreaterThan(3.9);
    expect(order).toBeLessThan(4.1);
  });

  it('keeps an oscillator on the circle over many periods', () => {
    const s = Float64Array.from([1, 0]);
    integrate(osc, s, 0, 20 * Math.PI, { dt: 0.01 });
    expect(Math.abs(s[0]! - 1)).toBeLessThan(1e-7);
    expect(Math.abs(s[1]!)).toBeLessThan(1e-7);
  });

  it('runs backward in time with dir = -1 and returns to the start', () => {
    const s = Float64Array.from([1, 0]);
    for (let i = 0; i < 100; i++) rk4Step(osc, s, 0, { dt: 0.05 });
    for (let i = 0; i < 100; i++) rk4Step(osc, s, 0, { dt: 0.05, dir: -1 });
    expect(Math.abs(s[0]! - 1)).toBeLessThan(1e-7);
    expect(Math.abs(s[1]!)).toBeLessThan(1e-7);
  });

  it('takes eta times the smallest time scale, and never steps past the next output', () => {
    const s = Float64Array.from([2]);
    const d = Float64Array.from([-4]); // |x / f| = 0.5
    expect(timeScale(decay, s, d, 1, false)).toBe(0.5);
    expect(assignDt(0.5, 10, 0.01)).toBe(0.005);
    expect(assignDt(0.5, 0.001, 0.01)).toBe(0.001);
    const dt = rk4Step(decay, s, 0, { dt: 1, eta: 0.01, untilOutput: 10 });
    expect(dt).toBeCloseTo(0.01, 12); // |x / f| = 1 for pure decay, times eta
  });

  it('skips zero values and zero rates when choosing the time scale', () => {
    expect(timeScale(decay, Float64Array.from([0]), Float64Array.from([1]), 1, false)).toBe(1e100);
    expect(timeScale(decay, Float64Array.from([1]), Float64Array.from([0]), 1, false)).toBe(1e100);
  });

  it('assigns explicit variables the callback value, and passive ones never limit the step', () => {
    const sys: OdeSystem = {
      vars: [{ kind: 'explicit' }, { kind: 'passive' }],
      derivatives: (_s, t, o) => { o[0] = 3 * t + 1; o[1] = 5; },
    };
    const s = Float64Array.from([0, 0]);
    const dt = rk4Step(sys, s, 2, { dt: 0.5 });
    expect(s[0]).toBe(7); // value at the start of the step, as VPLanet assigns daDeriv[0]
    expect(s[1]).toBeCloseTo(5 * dt, 12);
    expect(timeScale(sys, s, Float64Array.from([1, 1e9]), 0.5, false)).toBeGreaterThan(0);
  });
});
