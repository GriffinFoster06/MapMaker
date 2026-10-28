// Constants from VPLanet (src/vplanet.h, src/stellar.h), MIT, commit dd55da7.
export const PI = Math.PI;
export const SIGMA = 5.670367e-8; // Stefan-Boltzmann constant, vplanet.h:87
export const LSUN = 3.846e26; // W, stellar.h:8
export const AUM = 149597870700; // m per AU, vplanet.h:65
export const DAYSEC = 86400; // vplanet.h:72
export const YEARSEC = 3.15576e7; // vplanet.h:71
// vplanet.h:82 defines DEGRAD = 0.017453292519444445, which is 3e-11 (relative) below pi/180; the exact value is used.
export const DEGRAD = Math.PI / 180; // radians per degree
export const EPS = 1e-10; // vplanet.h:64
