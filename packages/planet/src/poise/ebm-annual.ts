// Provenance: ported from upstream/VPLanet src/poise.c at dd55da7 (MIT); see PROVENANCE.md and decision P8.
// Port of the VPLanet POISE annual energy-balance model (src/poise.c at dd55da7, MIT): InitializeClimateParams
// (:2020, annual branch), fvAlbedoAnnual (:5681), fvMatrixAnnual (:5827), fvMatrixInvertAnnual (:5716),
// fvTempGradientAnn (:5779) and PoiseAnnual (:5893). A 1-D meridional diffusion model on a grid uniform in
// x = sin(latitude), relaxed to steady state with a Crank-Nicolson step and an ice-albedo feedback.
// Temperatures are degrees Celsius. All transcendental functions go through dmath.
import { dmath } from '@mapmaker/core';
import { PI } from './constants.js';
import { luDecompose, luInverse } from './lu.js';
import { olr, olrSlope, type OlrModel } from './olr.js';

export interface AnnualEbmInput {
  /** Cell-centre latitudes, radians, uniform in sin(latitude) (see latGrid). */
  lats: ArrayLike<number>;
  /** Annual-mean insolation at each latitude, W/m^2 (see annualInsolation). */
  annualInsol: ArrayLike<number>;
  /** Heat diffusion coefficient dDiffusion (VPLanet default 0.44). */
  diffusion?: number;
  /** Heat capacity of the annual model, dHeatCapAnn (default 0.2). It only sets the relaxation rate. */
  heatCapAnn?: number;
  /** OLR = planckA + planckB T when calcAB is false (defaults 203.3 W/m^2 and 2.09 W/m^2/K). */
  planckA?: number;
  planckB?: number;
  /** Take A and B from the OLR model at each latitude's temperature (bCalcAB). */
  calcAB?: boolean;
  olrModel?: OlrModel;
  /** CO2 partial pressure, bar (default 3.3e-4). Used by the OLR models when calcAB is true. */
  pCO2?: number;
  /** Diffusion proportional to the Planck slope B (bMEPDiff), the maximum-entropy-production closure. */
  mepDiff?: boolean;
  /** Add a Hadley-cell diffusion bump within about 25 degrees of the equator (bHadley). */
  hadley?: boolean;
  /** Albedo of ice-free surface (dSurfAlbedo, default 0.3) and of ice (dIceAlbedo, default 0.6). */
  surfAlbedo?: number;
  iceAlbedo?: number;
  /** Fixed ice line, radians (dFixIceLat): ice poleward of it, none equatorward. 0 means "off". */
  fixIceLat?: number;
  /** Albedo from the zenith angle, 0.31 + 0.04 (3 sin^2 lat - 1) (bAlbedoZA). */
  albedoZA?: boolean;
  /** Start from a cold, iceball-prone state (bColdStart: initial temperatures 40 K lower). */
  coldStart?: boolean;
  /** Planet radius, m, for the meridional heat flux output (default 6.371e6). */
  radius_m?: number;
  maxIterations?: number;
}

export interface AnnualEbmResult {
  /** Zonal-mean annual temperature, degrees C. */
  temp: Float64Array;
  albedo: Float64Array;
  fluxIn: Float64Array;
  fluxOut: Float64Array;
  /** Meridional heat flux through the northern boundary of each cell, W. */
  flux: Float64Array;
  tGlobal: number;
  albedoGlobal: number;
  fluxInGlobal: number;
  fluxOutGlobal: number;
  iterations: number;
}

export function solveAnnualEbm(input: AnnualEbmInput): AnnualEbmResult {
  const lats = input.lats;
  const n = lats.length;
  const insol = input.annualInsol;
  if (insol.length !== n) throw new Error('annualInsol and lats differ in length');
  const diffCoeff = input.diffusion ?? 0.44;
  const heatCap = input.heatCapAnn ?? 0.2;
  const calcAB = input.calcAB ?? false;
  const olrModel = input.olrModel ?? 'wk97';
  const pCO2 = input.pCO2 ?? 3.3e-4;
  const mep = input.mepDiff ?? false;
  const surfAlbedo = input.surfAlbedo ?? 0.3;
  const iceAlbedo = input.iceAlbedo ?? 0.6;
  const fixIceLat = input.fixIceLat ?? 0;
  const radius = input.radius_m ?? 6.371e6;
  const iterMax = input.maxIterations ?? 2000;

  const temp = new Float64Array(n);
  const planckA = new Float64Array(n);
  const planckB = new Float64Array(n);
  const albedo = new Float64Array(n);
  const diffusion = new Float64Array(n + 1); // at the n + 1 cell boundaries
  const lambda = new Float64Array(n + 1);
  const toffset = input.coldStart ? -40.0 : 0.0;
  for (let i = 0; i < n; i++) {
    const s = dmath.sin(lats[i]!);
    temp[i] = 20 * (1.0 - 1.5 * s * s) + toffset;
  }

  const updatePlanck = (): void => {
    for (let i = 0; i < n; i++) {
      if (calcAB) {
        planckB[i] = olrSlope(olrModel, temp[i]!, pCO2);
        planckA[i] = olr(olrModel, temp[i]!, pCO2) - planckB[i]! * temp[i]!;
      } else {
        planckB[i] = input.planckB ?? 2.09;
        planckA[i] = input.planckA ?? 203.3;
      }
    }
  };
  const updateMepDiffusion = (): void => {
    for (let i = 0; i <= n; i++) {
      if (i === 0) diffusion[i] = planckB[i]! / 4.0;
      else if (i === n) diffusion[i] = planckB[i - 1]! / 4.0;
      else diffusion[i] = (planckB[i]! + planckB[i - 1]!) / 8.0;
    }
  };
  const updateAlbedo = (): void => {
    for (let i = 0; i < n; i++) {
      if (fixIceLat) albedo[i] = Math.abs(lats[i]!) > fixIceLat ? iceAlbedo : surfAlbedo;
      else if (input.albedoZA) {
        const s = dmath.sin(lats[i]!);
        albedo[i] = 0.31 + 0.04 * (3 * (s * s) - 1);
      } else albedo[i] = temp[i]! <= -10.0 ? iceAlbedo : surfAlbedo;
    }
  };

  // InitializeClimateParams (annual branch)
  updatePlanck();
  if (mep) updateMepDiffusion();
  else for (let i = 0; i <= n; i++) diffusion[i] = diffCoeff;
  if (input.hadley) {
    for (let i = 0; i <= n; i++) {
      const xb = -1.0 + (i * 2.0) / n;
      diffusion[i] = diffusion[i]! + diffCoeff * 9. * dmath.exp(-dmath.pow(xb / dmath.sin(25. * (PI / 180)), 6));
    }
  }

  // PoiseAnnual
  updateAlbedo();
  const dDeltaT = 1.5 / n;
  const dDeltaX = 2.0 / n;
  const setLambda = (): void => {
    for (let i = 0; i <= n; i++) {
      const xb = -1.0 + (i * 2.0) / n;
      lambda[i] = (diffusion[i]! * (1.0 - xb * xb)) / (dDeltaX * dDeltaX);
    }
  };
  setLambda();

  const mClim = new Float64Array(n * n);
  const mDiff = new Float64Array(n * n);
  const mEuler = new Float64Array(n * n);
  const sourceF = new Float64Array(n);
  const tempTerms = new Float64Array(n);
  let invM: Float64Array = new Float64Array(n * n);

  // fvMatrixAnnual + fvMatrixInvertAnnual
  const buildMatrices = (): void => {
    for (let i = 0; i < n; i++) {
      tempTerms[i] = 0.0;
      for (let j = 0; j < n; j++) {
        const ij = i * n + j;
        if (j === i) {
          mClim[ij] = (-planckB[i]! - lambda[i + 1]! - lambda[i]!) / heatCap;
          mDiff[ij] = -lambda[i + 1]! - lambda[i]!;
          mEuler[ij] = -1.0 / dDeltaT;
        } else if (j === i + 1) {
          mClim[ij] = lambda[j]! / heatCap;
          mDiff[ij] = lambda[j]!;
          mEuler[ij] = 0.0;
        } else if (j === i - 1) {
          mClim[ij] = lambda[i]! / heatCap;
          mDiff[ij] = lambda[i]!;
          mEuler[ij] = 0.0;
        } else {
          mClim[ij] = 0.0;
          mDiff[ij] = 0.0;
          mEuler[ij] = 0.0;
        }
        mEuler[ij] = mEuler[ij]! + 0.5 * mClim[ij]!;
        tempTerms[i] = tempTerms[i]! + mClim[ij]! * temp[j]!;
      }
      sourceF[i] = ((1.0 - albedo[i]!) * insol[i]! - planckA[i]!) / heatCap;
      tempTerms[i] = tempTerms[i]! + sourceF[i]!;
    }
    invM = luInverse(luDecompose(mEuler, n));
  };

  let tGlobal = 0.0;
  for (let i = 0; i < n; i++) tGlobal += temp[i]! / n;
  buildMatrices();

  // Relaxation to equilibrium
  const tmpTemp = new Float64Array(n);
  const tmpTerms = new Float64Array(n);
  let iter = 1;
  let tempChange = 1.0;
  while (Math.abs(tempChange) > 1e-12) {
    let tmpTGlobal = 0.0;
    for (let i = 0; i < n; i++) {
      let acc = 0.0;
      for (let j = 0; j < n; j++) acc += -invM[i * n + j]! * (0.5 * (tempTerms[j]! + sourceF[j]!) + temp[j]! / dDeltaT);
      tmpTemp[i] = acc;
      tmpTGlobal += acc / n;
    }
    for (let i = 0; i < n; i++) {
      let acc = sourceF[i]!;
      for (let j = 0; j < n; j++) acc += mClim[i * n + j]! * tmpTemp[j]!;
      tmpTerms[i] = acc;
    }
    tempChange = tmpTGlobal - tGlobal;

    // Update albedo (from the previous temperatures, as in VPLanet), source, temperature and terms.
    updateAlbedo();
    for (let i = 0; i < n; i++) {
      sourceF[i] = ((1.0 - albedo[i]!) * insol[i]! - planckA[i]!) / heatCap;
      temp[i] = tmpTemp[i]!;
      tempTerms[i] = tmpTerms[i]!;
    }
    tGlobal = tmpTGlobal;
    if (iter >= iterMax) throw new Error('POISE annual solution not converged before max iterations reached');
    if (calcAB) {
      updatePlanck();
      if (mep) {
        updateMepDiffusion();
        setLambda();
      }
      buildMatrices();
    }
    iter++;
  }

  // Derived quantities (fvTempGradientAnn and the flux sums)
  const tGrad = new Float64Array(n);
  tGrad[0] = (temp[1]! - temp[0]!) / dDeltaX;
  for (let i = 1; i < n - 1; i++) tGrad[i] = (temp[i + 1]! - temp[i - 1]!) / (2 * dDeltaX);
  tGrad[n - 1] = (temp[n - 1]! - temp[n - 2]!) / dDeltaX;
  const flux = new Float64Array(n);
  const fluxIn = new Float64Array(n);
  const fluxOut = new Float64Array(n);
  let fluxInGlobal = 0.0;
  let fluxOutGlobal = 0.0;
  let albedoGlobal = 0.0;
  for (let i = 0; i < n; i++) {
    const dMid = 0.5 * (diffusion[i + 1]! + diffusion[i]!);
    const s = dmath.sin(lats[i]!);
    flux[i] = -2. * PI * (radius * radius) * dmath.sqrt(1.0 - s * s) * dMid * tGrad[i]!;
    fluxIn[i] = (1.0 - albedo[i]!) * insol[i]!;
    fluxOut[i] = planckA[i]! + planckB[i]! * temp[i]!;
    fluxInGlobal += fluxIn[i]! / n;
    fluxOutGlobal += fluxOut[i]! / n;
    albedoGlobal += albedo[i]! / n;
  }
  return { temp, albedo, fluxIn, fluxOut, flux, tGlobal, albedoGlobal, fluxInGlobal, fluxOutGlobal, iterations: iter - 1 };
}
