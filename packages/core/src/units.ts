// SI units and planet-radius scaling (ARCHITECTURE §3.1, F3). No hard-coded 6371 outside tests and the Earth preset.

export const EARTH_RADIUS_M = 6_371_000;

export const UNITS = [
  'm', 'km', 'degC', 'mm/yr', 'm/s', 'm^2', 'm^3/s', 'hPa', 'Myr', 'rad', 'sr', '1', 'normalized',
] as const;

export type UnitName = (typeof UNITS)[number] | `enum:${string}`;

export function isUnit(u: string): u is UnitName {
  return (UNITS as readonly string[]).includes(u) || /^enum:[a-z][a-z0-9_]*$/.test(u);
}

/** Great-circle arc length in metres for an angle in radians. */
export const arcLength_m = (angleRad: number, radius_m: number): number => angleRad * radius_m;
/** Area in m² for a solid angle in steradians. */
export const area_m2 = (sr: number, radius_m: number): number => sr * radius_m * radius_m;
