// Original code (design note 11 §3.1 to §3.3, first stage). Monthly temperature and precipitation for every cell from
// the two solstice solves the pipeline already makes, and Köppen from those monthly values (koppen-monthly.ts).
//
// The solves are orogen's NH-summer and NH-winter fields: `Ts` and `Tw` are the warmest and coldest-month values (the
// proxy classifier takes Thot = max, Tcold = min of them), and the precipitation fields are half-year totals in units of
// KOPPEN_PRECIP_SCALE_MM. They are the anchors of a trigonometric interpolation (seasons.ts). Thermal inertia puts the
// extremes after the solstices: about one month over land and two over the sea (note 11 §3.1; Hartmann 2016). The
// precipitation anchors are half-year means, so the interpolation is attenuated by the six-month window and the monthly
// extremes exceed the half-year means. Months are indexed from the northern winter-solstice month (month 0 = January).
import { CLIMATE } from '../../vendor/js/climate-config.js';
import { classifyFieldMonthly } from './koppen-monthly';
import { synthesizeCell } from './seasons';

/** Index (in the seasons.ts month convention) of the northern winter solstice: v2's equinox at t = 2.63, minus 3 months, minus half a month. */
export const WINTER_SOLSTICE_INDEX = 2.63 - 3 - 0.5;

export interface MonthlyOptions {
  /** Months the extremes lag the solstices over land and over the sea. */
  landLagMonths?: number;
  seaLagMonths?: number;
  /** Half-year-mean attenuation of the precipitation anchors, months. */
  precipAttenuation?: number;
}

export interface MonthlyClimate {
  /** Month-major monthly temperature, °C (length 12·n). Sea cells hold the same synthesis from their own solves. */
  T: Float32Array;
  /** Month-major monthly precipitation, mm/month. */
  P: Float32Array;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * @param tSummer normalised NH-summer temperature, (T + 45) / 90 as the Köppen stage reads it; likewise tWinter
 * @param pSummer NH-summer-half-year precipitation in units of KOPPEN_PRECIP_SCALE_MM; likewise pWinter
 * @param isLand 1 for land cells (they use the land lag)
 */
export function synthesizeMonthlyClimate(
  tSummer: ArrayLike<number>, tWinter: ArrayLike<number>, pSummer: ArrayLike<number>, pWinter: ArrayLike<number>,
  isLand: ArrayLike<number>, opts: MonthlyOptions = {},
): MonthlyClimate {
  const n = tSummer.length;
  const landLag = opts.landLagMonths ?? 1, seaLag = opts.seaLagMonths ?? 2, att = opts.precipAttenuation ?? 6;
  const scale = CLIMATE.KOPPEN_PRECIP_SCALE_MM;
  const T = new Float32Array(12 * n), P = new Float32Array(12 * n);
  const t12 = new Float64Array(12), p12 = new Float64Array(12), tA = [0, 0], pA = [0, 0];
  for (let r = 0; r < n; r++) {
    tA[0] = -45 + clamp01(tWinter[r]!) * 90;
    tA[1] = -45 + clamp01(tSummer[r]!) * 90;
    pA[0] = (Math.max(0, pWinter[r]!) * scale) / 6;
    pA[1] = (Math.max(0, pSummer[r]!) * scale) / 6;
    const phase = WINTER_SOLSTICE_INDEX + (isLand[r] ? landLag : seaLag);
    // Temperature anchors are the extremes themselves; precipitation anchors are half-year means.
    synthesizeCell(tA, pA, { phase, transform: 'sqrt', attenuation: 0 }, t12, new Float64Array(12));
    synthesizeCell(tA, pA, { phase, transform: 'sqrt', attenuation: att }, new Float64Array(12), p12);
    for (let m = 0; m < 12; m++) {
      T[r + m * n] = t12[m]!;
      P[r + m * n] = p12[m]!;
    }
  }
  return { T, P };
}

/** Köppen class ids (koppen.ts table) from the solstice solves via monthly values; sea cells (elevation <= 0) are 0. */
export function classifyKoppenMonthly(
  elevation: ArrayLike<number>, tSummer: ArrayLike<number>, tWinter: ArrayLike<number>, pSummer: ArrayLike<number>, pWinter: ArrayLike<number>,
  opts: MonthlyOptions = {},
): { koppen: Uint8Array; monthly: MonthlyClimate } {
  const n = tSummer.length;
  const land = new Uint8Array(n);
  for (let r = 0; r < n; r++) land[r] = elevation[r]! > 0 ? 1 : 0;
  const monthly = synthesizeMonthlyClimate(tSummer, tWinter, pSummer, pWinter, land, opts);
  return { koppen: classifyFieldMonthly(monthly.T, monthly.P, n, land), monthly };
}
