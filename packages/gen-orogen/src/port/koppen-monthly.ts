// Provenance: ported from upstream/orogen-evolution v2/js/climate/koppen.js at 47edc28 (GPL-3.0); see PROVENANCE.md and
// decision P7.
// Köppen–Geiger classification from 12 monthly means, with the rules of Beck et al. (2018, 2023): the Peel et al. (2007)
// thresholds, the 0 °C C/D boundary, As merged into Aw. Months are indexed 0 to 11 from the northern-hemisphere winter
// solstice month, so on any planet the two fixed halves 3..8 and 9..2 are the halves around the solstices; "summer" is
// the warmer of the two for each cell, which is Beck's April-September / October-March rule in either hemisphere.
// Class ids are those of koppen.ts (orogen's table), so maps and scores compare one to one. No Math.* is used.
import { KOPPEN_CLASSES } from './koppen';

const ID: Record<string, number> = {};
KOPPEN_CLASSES.forEach((c, i) => { ID[c.code] = i; });
const id = (code: string): number => {
  const v = ID[code];
  if (v === undefined) throw new Error(`unknown Köppen class ${code}`);
  return v;
};

const SUMMER_A = [3, 4, 5, 6, 7, 8]; // months around the northern summer solstice
const SUMMER_B = [9, 10, 11, 0, 1, 2]; // months around the northern winter solstice

/**
 * Classifies one cell from monthly temperature (°C) and precipitation (mm/month), read as T[o + m·stride].
 * Returns a KOPPEN_CLASSES id (1 to 30).
 */
export function classifyCellMonthly(T: ArrayLike<number>, P: ArrayLike<number>, o = 0, stride = 1): number {
  let MAT = 0, MAP = 0, Thot = -Infinity, Tcold = Infinity, Tmon10 = 0, Pdry = Infinity;
  for (let m = 0; m < 12; m++) {
    const t = T[o + m * stride]!, p = Math.max(0, P[o + m * stride]!);
    MAT += t; MAP += p;
    if (t > Thot) Thot = t;
    if (t < Tcold) Tcold = t;
    if (t > 10) Tmon10++;
    if (p < Pdry) Pdry = p;
  }
  MAT /= 12;

  let tA = 0, tB = 0;
  for (const m of SUMMER_A) tA += T[o + m * stride]!;
  for (const m of SUMMER_B) tB += T[o + m * stride]!;
  const summer = tA >= tB ? SUMMER_A : SUMMER_B, winter = tA >= tB ? SUMMER_B : SUMMER_A;
  let Ps = 0, Psdry = Infinity, Pswet = 0, Pwdry = Infinity, Pwwet = 0;
  for (const m of summer) { const p = Math.max(0, P[o + m * stride]!); Ps += p; if (p < Psdry) Psdry = p; if (p > Pswet) Pswet = p; }
  for (const m of winter) { const p = Math.max(0, P[o + m * stride]!); if (p < Pwdry) Pwdry = p; if (p > Pwwet) Pwwet = p; }
  const Pw = MAP - Ps;

  // B (arid) takes precedence
  const Pth = Pw > 0.7 * MAP ? 2 * MAT : Ps > 0.7 * MAP ? 2 * MAT + 28 : 2 * MAT + 14;
  if (MAP < 10 * Pth) {
    const hot = MAT >= 18;
    if (MAP < 5 * Pth) return hot ? id('BWh') : id('BWk');
    return hot ? id('BSh') : id('BSk');
  }
  // A (tropical)
  if (Tcold >= 18) {
    if (Pdry >= 60) return id('Af');
    return Pdry >= 100 - MAP / 25 ? id('Am') : id('Aw');
  }
  // E (polar)
  if (Thot <= 10) return Thot > 0 ? id('ET') : id('EF');

  // C or D
  const C = Tcold > 0;
  let s = Psdry < 40 && Psdry < Pwwet / 3;
  let w = Pwdry < Pswet / 10;
  if (s && w) { s = Ps <= Pw; w = !s; } // both: the wetter half decides
  const L2 = s ? 's' : w ? 'w' : 'f';
  const L3 = Thot >= 22 ? 'a' : Tmon10 >= 4 ? 'b' : (!C && Tcold < -38) ? 'd' : 'c';
  return id((C ? 'C' : 'D') + L2 + L3);
}

/**
 * Classifies every cell of month-major fields T and P (length 12·n). Cells where `land` is 0, or any input is NaN,
 * get 0 (Ocean). Returns Uint8Array(n).
 */
export function classifyFieldMonthly(T: ArrayLike<number>, P: ArrayLike<number>, n: number, land: ArrayLike<number> | null = null): Uint8Array {
  const out = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    if (land && !land[c]) continue;
    let ok = true;
    for (let m = 0; m < 12 && ok; m++) ok = !Number.isNaN(T[c + m * n]!) && !Number.isNaN(P[c + m * n]!);
    if (ok) out[c] = classifyCellMonthly(T, P, c, n);
  }
  return out;
}
