// Sky panel (Phase 6a M6, design note 20): the star and moon choices of the Planet panel. Original shell code. A choice is a
// named preset; `astroFromChoice` builds the generator's `AstroInput` from it and the planet sliders, and returns undefined for
// the Earth sky (the Sun with the Moon), so a world with it hashes exactly as without this panel. The readout and badge use the
// cheap `computeAstro` of @mapmaker/planet; the generator runs in the engine worker.
import { EARTH_PLANET, computeAstro, type AstroInput, type AstroResult, type MoonSpec, type StarSpec } from '@mapmaker/planet';
import { planetFromValues } from './planet-panel';

export interface SkyChoice { star: string; moons: string }
export const SKY_DEFAULT: SkyChoice = { star: 'sun', moons: 'earth-moon' };

export interface StarPreset { id: string; label: string; tip: string; star: StarSpec; companion?: { star: StarSpec; semiMajorAxis_AU: number; eccentricity: number } }

const SUN: StarSpec = { massSolar: 1, ageGyr: 4.6, luminosity_W: EARTH_PLANET.luminosity_W, teff_K: 5772, radius_m: 6.957e8 };

export const STAR_PRESETS: StarPreset[] = [
  { id: 'sun', label: 'Sun-like', tip: 'The Sun: Earth\'s sky.', star: SUN },
  { id: 'k-dwarf', label: 'K dwarf (0.7 Sun masses)', tip: 'A smaller, cooler, dimmer star. Its habitable zone is closer in, and planets there may be tidally locked.', star: { massSolar: 0.7, ageGyr: 5 } },
  { id: 'm-dwarf', label: 'M dwarf (0.3 Sun masses)', tip: 'A small, dim, red star. Its habitable zone is so close that planets there are usually tidally locked, which the climate model does not cover.', star: { massSolar: 0.3, ageGyr: 5 } },
  { id: 'binary', label: 'Binary (circumbinary planet)', tip: 'Two stars (0.69 and 0.20 Sun masses, 0.22 AU apart) with the planet orbiting both. The planet must be beyond the binary\'s stability limit (about 0.65 AU); the climate uses the total light.',
    star: { massSolar: 0.69, ageGyr: 5 }, companion: { star: { massSolar: 0.2, ageGyr: 5 }, semiMajorAxis_AU: 0.22, eccentricity: 0.16 } },
];

export interface MoonPreset { id: string; label: string; tip: string; moons: MoonSpec[] }
const MOON: MoonSpec = { name: 'Moon', mass_kg: 7.342e22, radius_m: 1.7374e6, semiMajorAxis_m: 3.844e8, inclination_deg: 5.145 };
export const MOON_PRESETS: MoonPreset[] = [
  { id: 'earth-moon', label: 'Earth\'s Moon', tip: 'One moon like ours: 0.27 m ocean tides, 2.4 solar eclipses a year, a stable axial tilt.', moons: [MOON] },
  { id: 'two-moons', label: 'Two moons', tip: 'Our Moon and a second, smaller one further out.',
    moons: [MOON, { name: 'Outer moon', mass_kg: 2.0e22, radius_m: 1.2e6, semiMajorAxis_m: 7.5e8, inclination_deg: 2 }] },
  { id: 'none', label: 'No moon', tip: 'No moon: no lunar tides or eclipses, and the axial tilt is less stable over millions of years.', moons: [] },
];

export const isEarthSky = (c: SkyChoice): boolean => c.star === SKY_DEFAULT.star && c.moons === SKY_DEFAULT.moons;

/** The sky for the current choice and planet sliders, or undefined for Earth's (nothing is sent to the generator). */
export function astroFromChoice(c: SkyChoice, planetValues: Record<string, number>): AstroInput | undefined {
  if (isEarthSky(c)) return undefined;
  const star = STAR_PRESETS.find((s) => s.id === c.star) ?? STAR_PRESETS[0]!;
  const moons = MOON_PRESETS.find((m) => m.id === c.moons) ?? MOON_PRESETS[0]!;
  const p = { ...EARTH_PLANET, ...planetFromValues(planetValues) };
  return {
    star: star.star,
    ...(star.companion ? { companion: star.companion } : {}),
    planet: {
      semiMajorAxis_AU: p.semiMajorAxis_AU, eccentricity: p.eccentricity, obliquity_deg: p.obliquity_deg, rotationPeriod_s: p.rotationPeriod_s,
      longPerihelion_deg: p.longPerihelion_deg, mass_kg: p.mass_kg, radius_m: p.radius_m,
    },
    moons: moons.moons,
  };
}

export interface SkyBadge { validity: AstroResult['validity']; text: string; lines: string[] }

/** A short readout and validity for the sky: year, zone, tides, eclipses, and anything outside the models. */
export function skyBadge(c: SkyChoice, planetValues: Record<string, number>): SkyBadge {
  const a = astroFromChoice(c, planetValues);
  if (!a) return { validity: 'ok', text: 'Earth\'s sky', lines: [] };
  const r = computeAstro(a);
  const lines = [
    `Year ${(r.calendar.year_s / 86400).toFixed(0)} days; habitable-zone position: ${r.habitability.zone}`,
    ...r.calendar.moons.map((m) => `${m.name}: month ${m.synodicMonth_days.toFixed(1)} days, tide ${m.tideAmplitude_m.toFixed(2)} m, ${m.solarEclipsesPerYear.toFixed(1)} solar eclipses a year`),
    ...(a.moons.length === 0 ? [`Star tide ${r.tide.starAmplitude_m.toFixed(2)} m, no lunar tides or eclipses`] : []),
  ];
  const why = r.notes.join('; ');
  const text = r.validity === 'ok' ? `Sky: ${lines[0]}` : `Sky outside model validity: ${why}`;
  return { validity: r.validity, text, lines };
}

/** `as_star` and `as_moons` for the choices that are not Earth's. */
export function encodeSky(c: SkyChoice): Record<string, string> {
  const out: Record<string, string> = {};
  if (c.star !== SKY_DEFAULT.star) out['as_star'] = c.star;
  if (c.moons !== SKY_DEFAULT.moons) out['as_moons'] = c.moons;
  return out;
}

/** Reads the sky keys back; unknown ids are ignored. Returns undefined when neither is present. */
export function decodeSky(q: URLSearchParams): SkyChoice | undefined {
  const star = q.get('as_star');
  const moons = q.get('as_moons');
  const s = STAR_PRESETS.some((x) => x.id === star) ? star! : undefined;
  const m = MOON_PRESETS.some((x) => x.id === moons) ? moons! : undefined;
  if (!s && !m) return undefined;
  return { star: s ?? SKY_DEFAULT.star, moons: m ?? SKY_DEFAULT.moons };
}

