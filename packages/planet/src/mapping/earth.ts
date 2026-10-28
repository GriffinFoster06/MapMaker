// Original code (design note 10). Earth's reference planet: the point at which every mapping rule has ratio 1 and
// `mapPlanet` returns the base constants unchanged.
import { AUM, DEGRAD } from '../poise/constants.js';

export interface PlanetInput {
  /** Planet radius, m. */
  radius_m: number;
  /** Planet mass, kg (gravity follows from mass and radius). */
  mass_kg: number;
  /** Sidereal rotation period, s. */
  rotationPeriod_s: number;
  /** Obliquity, degrees. */
  obliquity_deg: number;
  eccentricity: number;
  /** Longitude of perihelion, degrees. */
  longPerihelion_deg: number;
  semiMajorAxis_AU: number;
  /** Stellar luminosity, W. */
  luminosity_W: number;
  /** Surface pressure, Pa. */
  surfacePressure_Pa: number;
  /** Mean molar mass of the atmosphere, g/mol (enters the heat-transport scaling). */
  meanMolarMass: number;
  /** Specific heat of the atmosphere at constant pressure, J/kg/K. */
  cp: number;
  /** Greenhouse forcing, W/m^2 removed from the outgoing longwave radiation (0 at Earth). */
  greenhouse_Wm2: number;
  /** Fraction of the surface covered by ocean. */
  oceanFraction: number;
  /** A tidally locked planet is outside the model (note 10 §3.4). */
  tidallyLocked: boolean;
}

export const G_NEWTON = 6.6743e-11;

export const EARTH_PLANET: Readonly<PlanetInput> = Object.freeze({
  radius_m: 6.371e6,
  mass_kg: 5.972e24,
  rotationPeriod_s: 86164.0905,
  obliquity_deg: 23.44,
  eccentricity: 0.0167,
  longPerihelion_deg: 102.94719,
  semiMajorAxis_AU: 1.00000011,
  luminosity_W: 3.846e26,
  surfacePressure_Pa: 101325,
  meanMolarMass: 28.97,
  cp: 1004,
  greenhouse_Wm2: 0,
  oceanFraction: 0.69,
  tidallyLocked: false,
});

export const surfaceGravity = (p: Pick<PlanetInput, 'mass_kg' | 'radius_m'>): number => (G_NEWTON * p.mass_kg) / (p.radius_m * p.radius_m);
export const rotationRate = (p: Pick<PlanetInput, 'rotationPeriod_s'>): number => (2 * Math.PI) / p.rotationPeriod_s;
export { AUM, DEGRAD };
