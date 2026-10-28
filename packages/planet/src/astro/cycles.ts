// Original code (Phase 6a M5; design note 20 §3.2): orbital-element keyframes on the geologic axis, from the LL2 secular
// solution (the port of DistOrb) and the DistRot obliquity integration. Off by default in the engine (a switch); the series
// are the forcing for paleoclimate runs (Phase 8b).
import { ll2Elements, ll2Evaluate, ll2Solve, type Ll2Planet } from '../distorb/ll2.js';
import { evolveObliquity, type RotParams } from '../distrot/distrot.js';
import { DEGRAD } from '../poise/constants.js';

export interface OrbitKeyframe {
  t_yr: number;
  eccentricity: number;
  inclination_deg: number;
  /** Longitude of pericentre, degrees. */
  longPeri_deg: number;
  obliquity_deg: number;
  /** Axial precession angle, degrees in [0, 360). */
  precessionAngle_deg: number;
}

/**
 * Keyframes every `stepYears` from the epoch forward to `years`. `planets` are all planets of the system (the secular
 * coupling needs them), `index` the one that carries the world, `rot` its spin; the integration step is `dtYears`.
 */
export function orbitalKeyframes(
  starMass: number, planets: Ll2Planet[], index: number, rot: RotParams, years: number, stepYears: number, dtYears = 10,
): OrbitKeyframe[] {
  const sys = ll2Solve(starMass, planets, true);
  const obl = evolveObliquity(sys, index, rot, years, { dt: dtYears, sampleEvery: stepYears });
  return obl.map((o) => {
    const e = ll2Elements(ll2Evaluate(sys, index, o.t));
    const lp = ((e.longP / DEGRAD) % 360 + 360) % 360;
    return {
      t_yr: o.t, eccentricity: e.ecc, inclination_deg: e.inc / DEGRAD, longPeri_deg: lp,
      obliquity_deg: o.obliquity / DEGRAD, precessionAngle_deg: o.precA / DEGRAD,
    };
  });
}
