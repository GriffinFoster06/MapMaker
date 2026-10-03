// orogen's dimensionless elevation → km (verbatim formula from orogen js/color-map.js elevToHeightKm @ cc2662b, GPL-3.0).
export function elevToHeightKmAt(elev) {
  if (elev <= 0) return elev * 10;
  const t = Math.min(elev, 1), t2 = t * t;
  return 6 * t2 * t2 * (5 - 4 * t);
}
