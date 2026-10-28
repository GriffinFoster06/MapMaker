// Provenance: ported from upstream/VPLanet src/poise.c at dd55da7 (MIT); see PROVENANCE.md and decision P8.
// Outgoing longwave radiation models of VPLanet POISE (src/poise.c at dd55da7, MIT), as functions of the
// temperature T in degrees Celsius and the CO2 partial pressure pCO2 (bar):
//   Williams & Kasting (1997): fdOLRwk97 (:6236), fdOLRdTwk97 (:6277);
//   Haqq-Misra et al. (2016):  fdOLRhm16 (:6112), fdOLRdThm16 (:6153);
//   Spiegel et al. (2009):     fdOLRsms09 (:6189), fdOLRdTsms09 (:6211).
// The slope functions return dOLR/dT in W m^-2 K^-1. HM16's slope in VPLanet divides by daTempLW (the seasonal
// longwave temperature, uninitialised in the annual model); here the same temperature T is used throughout.
import { dmath } from '@mapmaker/core';
import { SIGMA } from './constants.js';

export type OlrModel = 'wk97' | 'hm16' | 'sms09';

export function olrWk97(tempC: number, pCO2: number): number {
  const phi = dmath.log(pCO2 / 3.3e-4);
  const T = tempC + 273.15;
  let out =
    9.468980 - 7.714727e-5 * phi - 2.794778 * T - 3.244753e-3 * phi * T - 3.547406e-4 * (phi * phi) +
    2.212108e-2 * (T * T) + 2.229142e-3 * (phi * phi) * T + 3.088497e-5 * phi * (T * T) -
    2.789815e-5 * (phi * T * phi * T) - 3.442973e-3 * (phi * phi * phi) - 3.361939e-5 * (T * T * T) +
    9.173169e-3 * (phi * phi * phi) * T - 7.775195e-5 * (phi * phi * phi) * (T * T) -
    1.679112e-7 * phi * (T * T * T) + 6.590999e-8 * (phi * phi) * (T * T * T) +
    1.528125e-7 * (phi * phi * phi) * (T * T * T) - 3.367567e-2 * (phi * phi * phi * phi) -
    1.631909e-4 * (phi * phi * phi * phi) * T + 3.663871e-6 * (phi * phi * phi * phi) * (T * T) -
    9.255646e-9 * (phi * phi * phi * phi) * (T * T * T);
  if (out >= 300) out = 300.0;
  if (T < 190) out = SIGMA * T * T * T * T;
  return out;
}

export function olrSlopeWk97(tempC: number, pCO2: number): number {
  const phi = dmath.log(pCO2 / 3.3e-4);
  const T = tempC + 273.15;
  let dI =
    -2.794778 + 2 * 2.212108e-2 * T - 3 * 3.361939e-5 * (T * T) - 3.244753e-3 * phi + 2 * 3.088497e-5 * phi * T -
    3 * 1.679112e-7 * phi * (T * T) + 2.229142e-3 * (phi * phi) - 2 * 2.789815e-5 * (phi * phi) * T +
    3 * 6.590999e-8 * (phi * phi) * (T * T) + 9.173169e-3 * (phi * phi * phi) -
    2 * 7.775195e-5 * (phi * phi * phi) * T + 3 * 1.528125e-7 * (phi * phi * phi) * (T * T) -
    1.631909e-4 * (phi * phi * phi * phi) + 2 * 3.663871e-6 * (phi * phi * phi * phi) * T -
    3 * 9.255646e-9 * (phi * phi * phi * phi) * (T * T);
  if (olrWk97(tempC, pCO2) >= 300.0) dI = 0.001;
  if (T < 190) dI = 4 * SIGMA * T * T * T;
  return dI;
}

export function olrHm16(tempC: number, pCO2: number): number {
  const phi = dmath.log10(pCO2);
  const dT = tempC + 273.15;
  if (dT > 150) {
    const tmpk = dmath.log10(dT);
    const f =
      9.12805643869791438760 * (tmpk * tmpk * tmpk * tmpk) + 4.58408794768168803557 * (tmpk * tmpk * tmpk) * phi -
      8.47261075643147449910e+01 * (tmpk * tmpk * tmpk) + 4.35517381112690282752e-01 * (tmpk * phi * tmpk * phi) -
      2.86355036260417961103e+01 * (tmpk * tmpk) * phi + 2.96626642498045896446e+02 * (tmpk * tmpk) -
      6.01082900358299240806e-02 * tmpk * (phi * phi * phi) - 2.60414691486954641420 * tmpk * (phi * phi) +
      5.69812976563675661623e+01 * tmpk * phi - 4.62596100127381816947e+02 * tmpk +
      2.18159373001564722491e-03 * (phi * phi * phi * phi) + 1.61456772400726950023e-01 * (phi * phi * phi) +
      3.75623788187470086797 * (phi * phi) - 3.53347289223180354156e+01 * phi + 2.75011005409836684521e+02;
    return dmath.pow(10.0, f) / 1000.0;
  }
  return SIGMA * dT * dT * dT * dT; // very cold
}

export function olrSlopeHm16(tempC: number, pCO2: number): number {
  const phi = dmath.log10(pCO2);
  const dT = tempC + 273.15;
  const tmpk = dmath.log10(dT);
  const f =
    4 * 9.12805643869791438760 * (tmpk * tmpk * tmpk) + 3 * 4.58408794768168803557 * (tmpk * tmpk) * phi -
    3 * 8.47261075643147449910e+01 * (tmpk * tmpk) + 2 * 4.35517381112690282752e-01 * tmpk * (phi * phi) -
    2 * 2.86355036260417961103e+01 * tmpk * phi + 2 * 2.96626642498045896446e+02 * tmpk -
    6.01082900358299240806e-02 * (phi * phi * phi) - 2.60414691486954641420 * (phi * phi) +
    5.69812976563675661623e+01 * phi - 4.62596100127381816947e+02;
  const dI = (olrHm16(tempC, pCO2) * f) / dT;
  return dI <= 0 ? olrSlopeWk97(tempC, pCO2) : dI;
}

export function olrSms09(tempC: number): number {
  const T = tempC + 273.15;
  const tau = 0.79 * (T / 273.15) * (T / 273.15) * (T / 273.15);
  return (SIGMA * T * T * T * T) / (1.0 + 0.75 * tau);
}

export function olrSlopeSms09(tempC: number): number {
  const T = tempC + 273.15;
  const tau = 0.79 * (T / 273.15) * (T / 273.15) * (T / 273.15);
  const dtau = (3.0 * 0.79 * T * T) / (273.15 * 273.15 * 273.15);
  // VPLanet (poise.c:6211) multiplies the second term by tau as well (0.75 * tau * dtau), which is not the derivative of
  // fdOLRsms09; this is the exact derivative (decision P8). The steady state does not depend on the slope.
  return SIGMA * ((4 * T * T * T) / (1.0 + 0.75 * tau) - ((T * T * T * T) / (1. + 0.75 * tau) / (1. + 0.75 * tau)) * 0.75 * dtau);
}

export function olr(model: OlrModel, tempC: number, pCO2: number): number {
  return model === 'wk97' ? olrWk97(tempC, pCO2) : model === 'hm16' ? olrHm16(tempC, pCO2) : olrSms09(tempC);
}

export function olrSlope(model: OlrModel, tempC: number, pCO2: number): number {
  return model === 'wk97' ? olrSlopeWk97(tempC, pCO2) : model === 'hm16' ? olrSlopeHm16(tempC, pCO2) : olrSlopeSms09(tempC);
}
