// Planet panel (Phase 6 M4, design notes 10 and 17): the physical inputs of the planet, their presets, the validity
// badge and the page-URL encoding. Original shell code. Values are in friendly units (Earth radii, hours, bar fractions);
// `planetFromValues` converts them to the generator's `PlanetInput` and keeps only what differs from Earth, so a world
// with Earth's values hashes exactly as before (design note 10 §3.3, decision P9). The generator runs in the engine
// worker; the page uses only the cheap validity assessment of @mapmaker/planet.
import { EARTH_PLANET, assessPlanet, type PlanetInput, type Validity } from '@mapmaker/planet';
import type { Level } from './settings';

export interface PlanetSetting {
  /** UI and URL id (`pl_` prefix in the query). */
  key: string;
  field: keyof PlanetInput;
  level: Level;
  label: string;
  tip: string;
  min: number;
  max: number;
  step: number;
  def: number;
  lo: string;
  hi: string;
  /** The slider value in the generator's units. */
  toInput(v: number): number;
}

const E = EARTH_PLANET;

export const PLANET_SETTINGS: PlanetSetting[] = [
  { key: 'obliquity', field: 'obliquity_deg', level: 'simple', label: 'Axial tilt (°)', min: 0, max: 90, step: 0.01, def: 23.44, lo: 'Upright', hi: 'On its side',
    tip: 'Tilt of the rotation axis. It sets how far the sun-belt moves through the year and how strong the seasons are. Above 40° the climate model is extrapolated; above 54° it is outside its validity.', toInput: (v) => v },
  { key: 'rotation', field: 'rotationPeriod_s', level: 'advanced', label: 'Day length (hours)', min: 4, max: 200, step: 0.01, def: 23.93, lo: 'Fast spin', hi: 'Slow spin',
    tip: 'Rotation period. Faster rotation squeezes the circulation belts toward the equator; slower rotation widens them (Held and Hou 1980). Outside half to twice Earth\'s rotation rate the model is extrapolated.', toInput: (v) => v * 3600 },
  { key: 'radius', field: 'radius_m', level: 'advanced', label: 'Radius (Earth = 1)', min: 0.3, max: 3, step: 0.01, def: 1, lo: 'Small', hi: 'Large',
    tip: 'Planet radius. Physical lengths such as mountain-range widths and the reach of moisture stay the same size in kilometres, so they cover more of a small planet.', toInput: (v) => v * E.radius_m },
  { key: 'mass', field: 'mass_kg', level: 'advanced', label: 'Mass (Earth = 1)', min: 0.05, max: 10, step: 0.01, def: 1, lo: 'Light', hi: 'Heavy',
    tip: 'Planet mass. With the radius it gives the surface gravity, which scales the lapse rates and compresses mountain heights.', toInput: (v) => v * E.mass_kg },
  { key: 'eccentricity', field: 'eccentricity', level: 'advanced', label: 'Orbit eccentricity', min: 0, max: 0.6, step: 0.0001, def: 0.0167, lo: 'Circular', hi: 'Eccentric',
    tip: 'How elongated the orbit is. It changes the length of the seasons and the strength of the seasonal contrast.', toInput: (v) => v },
  { key: 'distance', field: 'semiMajorAxis_AU', level: 'advanced', label: 'Orbit distance (AU)', min: 0.3, max: 3, step: 0.01, def: 1, lo: 'Close', hi: 'Far',
    tip: 'Distance from the star. With the star\'s brightness it sets how much sunlight arrives.', toInput: (v) => v },
  { key: 'luminosity', field: 'luminosity_W', level: 'advanced', label: 'Star brightness (Sun = 1)', min: 0.3, max: 1.7, step: 0.01, def: 1, lo: 'Dim', hi: 'Bright',
    tip: 'Luminosity of the star.', toInput: (v) => v * E.luminosity_W },
  { key: 'pressure', field: 'surfacePressure_Pa', level: 'advanced', label: 'Air pressure (Earth = 1)', min: 0.005, max: 5, step: 0.005, def: 1, lo: 'Thin', hi: 'Dense',
    tip: 'Surface pressure. It scales the pressure belts and the heat the atmosphere carries poleward. Outside half to twice Earth\'s it is extrapolated, below a tenth or above ten times it is outside the model.', toInput: (v) => v * E.surfacePressure_Pa },
  { key: 'greenhouse', field: 'greenhouse_Wm2', level: 'advanced', label: 'Greenhouse (W/m²)', min: -40, max: 60, step: 1, def: 0, lo: 'Weaker', hi: 'Stronger',
    tip: 'Extra trapped longwave radiation relative to Earth. It warms the whole planet.', toInput: (v) => v },
];

/** A named set of planet values (keys of PLANET_SETTINGS; unlisted ones are Earth's). */
export interface PlanetPreset { id: string; label: string; tip: string; values: Record<string, number>; landCoverage?: number }

export const PLANET_PRESETS: PlanetPreset[] = [
  { id: 'earth', label: 'Earth', tip: 'Earth\'s values: the world is generated exactly as without a planet.', values: {} },
  { id: 'super-earth', label: 'Super-Earth', tip: 'A larger, heavier planet with a denser atmosphere and a shorter day.',
    values: { radius: 1.5, mass: 4, rotation: 20, pressure: 1.5, greenhouse: 5 } },
  { id: 'mars-like', label: 'Mars-like', tip: 'A small, cold planet with a thin atmosphere. The thin atmosphere is outside the climate model\'s validity, so the climate is only indicative.',
    values: { radius: 0.53, mass: 0.107, rotation: 24.62, obliquity: 25.19, eccentricity: 0.0934, distance: 1.52, pressure: 0.006 }, landCoverage: 0.7 },
];

const isDefault = (s: PlanetSetting, v: number): boolean => Math.abs(v - s.def) <= s.step / 2;

/** The slider values with `values` applied over Earth's (a missing key is Earth's value). */
export function withDefaults(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(PLANET_SETTINGS.map((s) => [s.key, values[s.key] ?? s.def]));
}

/** Only the planet inputs that differ from Earth, in the generator's units. Empty means Earth. */
export function planetFromValues(values: Record<string, number>): Partial<PlanetInput> {
  const out: Partial<PlanetInput> = {};
  for (const s of PLANET_SETTINGS) {
    const v = values[s.key];
    if (v === undefined || isDefault(s, v)) continue;
    const c = Math.min(s.max, Math.max(s.min, v));
    (out as Record<string, number>)[s.field] = s.toInput(c);
  }
  return out;
}

export interface PlanetBadge { validity: Validity; text: string }

/** The validity of the current values against the climate model (design note 10 §3.4), as the badge shows it. */
export function planetBadge(values: Record<string, number>): PlanetBadge {
  const planet = planetFromValues(values);
  if (Object.keys(planet).length === 0) return { validity: 'ok', text: 'Earth' };
  const a = assessPlanet(planet);
  if (a.validity === 'ok') return { validity: 'ok', text: 'Within the climate model\'s validity' };
  const why = a.notes.join('; ');
  return a.validity === 'extrapolated'
    ? { validity: 'extrapolated', text: `Climate model extrapolated: ${why}` }
    : { validity: 'unsupported', text: `Climate outside model validity: ${why}` };
}

/** `pl_<key>=<value>` for each value that differs from Earth's. */
export function encodePlanetValues(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of PLANET_SETTINGS) {
    const v = values[s.key];
    if (v !== undefined && !isDefault(s, v)) out[`pl_${s.key}`] = Math.min(s.max, Math.max(s.min, v));
  }
  return out;
}

/** Reads `pl_*` query keys back; unknown keys and invalid numbers are ignored, values clamped to the slider range. */
export function decodePlanetValues(q: URLSearchParams): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of PLANET_SETTINGS) {
    const raw = q.get(`pl_${s.key}`);
    if (raw === null || raw === '' || !Number.isFinite(Number(raw))) continue;
    out[s.key] = Math.min(s.max, Math.max(s.min, Number(raw)));
  }
  return out;
}
