// World settings panel: orogen's generation sliders (upstream/orogen/index.html at cc2662b — labels, ranges, steps,
// defaults and help text; the land coverage and temperature defaults are 0.31 and −3 instead, decision P6), shown
// above the globe and kept in the page URL so a world can be shared exactly.
// Original shell code. Defaults must equal OROGEN_DEFAULTS (settings.test.ts); they are duplicated here so the page
// does not bundle the generator, which runs in the engine worker.

/** Registry levels (design note 17 §3.2): simple world-level controls, advanced per-system controls, expert (every registered constant). */
export type Level = 'simple' | 'advanced' | 'expert';
export const LEVELS: Level[] = ['simple', 'advanced', 'expert'];

export interface Setting {
  /** OrogenParams key. */
  key: string;
  /** Registry level: shown at this level and above (simple ⊂ advanced ⊂ expert). */
  level: Level;
  /** Domain the parameter belongs to (informational and for grouping). */
  domain: string;
  label: string;
  tip: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** Slider end labels, as in orogen. */
  lo: string;
  hi: string;
}

export interface SettingGroup { title: string; settings: Setting[] }

export const SETTING_GROUPS: SettingGroup[] = [
  {
    title: 'Shape your world',
    settings: [
      { key: 'jitter', level: 'simple', domain: 'mesh', label: 'Irregularity', min: 0, max: 1, step: 0.05, def: 0.75, lo: 'Uniform', hi: 'Scattered',
        tip: 'How randomly the cell points are scattered: 0 gives a uniform grid, 1 gives fully organic, irregular shapes.' },
      { key: 'P', level: 'simple', domain: 'tectonics', label: 'Plates', min: 4, max: 120, step: 1, def: 80, lo: 'Few', hi: 'Many',
        tip: 'Number of tectonic plates. More plates means more boundaries where mountains, trenches and coastlines form.' },
      { key: 'numContinents', level: 'simple', domain: 'tectonics', label: 'Continents', min: 1, max: 10, step: 1, def: 4, lo: 'Supercontinent', hi: 'Archipelago',
        tip: 'Target number of landmasses: 1 creates a supercontinent, higher values scatter land into continents and archipelagos.' },
      { key: 'nMag', level: 'simple', domain: 'terrain', label: 'Roughness', min: 0, max: 0.5, step: 0.01, def: 0.4, lo: 'Smooth', hi: 'Rugged',
        tip: 'Terrain roughness: higher values add more fractal detail to mountains and coastlines.' },
      { key: 'continentSizeVariety', level: 'advanced', domain: 'tectonics', label: 'Continent size variety', min: 0, max: 1, step: 0.05, def: 0.35, lo: 'Equal', hi: 'Varied',
        tip: 'How much continent sizes vary: at 0 all continents are similar in size, at 1 large and small landmasses mix.' },
      { key: 'landCoverage', level: 'simple', domain: 'tectonics', label: 'Land coverage', min: 0, max: 1, step: 0.01, def: 0.31, lo: 'Ocean world', hi: 'Desert world',
        tip: 'Share of the planet covered by land. Low values make ocean worlds; high values make desert worlds with less rain.' },
    ],
  },
  {
    title: 'Terrain sculpting',
    settings: [
      { key: 'terrainWarp', level: 'advanced', domain: 'terrain', label: 'Terrain warp', min: 0, max: 1, step: 0.05, def: 0.75, lo: 'None', hi: 'Heavy',
        tip: 'Deforms the elevation field with noise, giving more organic, squiggly coastlines and mountain ridges.' },
      { key: 'smoothing', level: 'advanced', domain: 'terrain', label: 'Smoothing', min: 0, max: 1, step: 0.05, def: 0.1, lo: 'None', hi: 'Heavy',
        tip: 'Blends harsh terrain boundaries from tectonic generation: smooths banded ridges and abrupt transitions.' },
      { key: 'glacialErosion', level: 'advanced', domain: 'erosion', label: 'Glacial erosion', min: 0, max: 1, step: 0.05, def: 0.5, lo: 'None', hi: 'Ice age',
        tip: 'Ice-age sculpting: carves fjords, U-shaped valleys and lake basins at high latitudes and altitudes.' },
      { key: 'hydraulicErosion', level: 'advanced', domain: 'erosion', label: 'Hydraulic erosion', min: 0, max: 1, step: 0.05, def: 0.5, lo: 'None', hi: 'Deep',
        tip: 'Stream-power erosion: carves river valleys and branching drainage networks.' },
      { key: 'thermalErosion', level: 'advanced', domain: 'erosion', label: 'Thermal erosion', min: 0, max: 1, step: 0.05, def: 0.1, lo: 'None', hi: 'Heavy',
        tip: 'Slope-driven material transport: softens ridges and creates natural talus slopes.' },
      { key: 'ridgeSharpening', level: 'advanced', domain: 'terrain', label: 'Ridge sharpening', min: 0, max: 1, step: 0.05, def: 0.5, lo: 'None', hi: 'Jagged',
        tip: 'Accentuates mountain ridgelines: pushes peaks further above their surroundings for more dramatic terrain.' },
    ],
  },
  {
    title: 'Climate',
    settings: [
      { key: 'temperatureOffset', level: 'simple', domain: 'climate', label: 'Temperature (°C)', min: -15, max: 15, step: 1, def: -3, lo: 'Colder', hi: 'Warmer',
        tip: 'Shifts global temperature; climate zones shift accordingly.' },
      { key: 'precipitationOffset', level: 'simple', domain: 'climate', label: 'Precipitation', min: -1, max: 1, step: 0.1, def: 0, lo: 'Drier', hi: 'Wetter',
        tip: 'Scales global precipitation: affects where deserts and rainforests form.' },
    ],
  },
];

export const SETTINGS: Setting[] = SETTING_GROUPS.flatMap((g) => g.settings);

/** Settings visible at `level`: a level shows its own parameters and every lower level's. */
export const visibleAt = (level: Level): Setting[] => SETTINGS.filter((s) => LEVELS.indexOf(s.level) <= LEVELS.indexOf(level));

/** A named set of slider values: the sliders it changes from the defaults (unlisted ones are set to their default). Presets never change the defaults (world hashes depend on them); they only fill the sliders. */
export interface Preset { id: string; label: string; tip: string; values: Record<string, number> }

export const PRESETS: Preset[] = [
  {
    id: 'earthlike', label: 'Earth-like',
    tip: 'Found by a sweep of the 14 sliders against Earth statistics from the earth.png heightmap (docs/earth-tests/DEFAULTS_SWEEP.md, configuration L612). Against the independent Earth data of decision P6 it scores worse than the defaults, mainly on slopes; kept as a style option until the generator sliders are swept again.',
    // Only the sliders that differ from the defaults; `apply` sets every unlisted slider to its default, so this is L612.
    values: { P: 81, nMag: 0.23, continentSizeVariety: 0.1, landCoverage: 0.36, terrainWarp: 0, smoothing: 0.15, glacialErosion: 0.75, hydraulicErosion: 0.4, thermalErosion: 0.25, ridgeSharpening: 0.95, temperatureOffset: -2, precipitationOffset: -0.5 },
  },
];

const clamp = (s: Setting, v: number): number => Math.min(s.max, Math.max(s.min, v));

/** Only the values that differ from the defaults (what the world needs; defaults reproduce existing worlds exactly). */
export function changedParams(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of SETTINGS) {
    const v = values[s.key];
    if (v !== undefined && v !== s.def) out[s.key] = clamp(s, v);
  }
  return out;
}

import { decodePlanetValues, encodePlanetValues } from './planet-panel';
import { decodeSky, encodeSky, type SkyChoice } from './astro-panel';

export interface PageState { seed?: number; tier?: string; pipeline?: string; params: Record<string, number>; /** Planet panel values (keys of PLANET_SETTINGS); absent means Earth. */ planet?: Record<string, number>; /** Star and moon choice of the Sky panel; absent means Earth's sky. */ sky?: SkyChoice }

/** Encodes seed, tier, pipeline and non-default settings as a URL query (`?seed=…&tier=…&P=40`). */
export function encodeState(st: PageState): string {
  const q = new URLSearchParams();
  if (st.seed !== undefined) q.set('seed', String(st.seed));
  if (st.tier) q.set('tier', st.tier);
  if (st.pipeline && st.pipeline !== 'structured') q.set('pipeline', st.pipeline);
  for (const [k, v] of Object.entries(changedParams(st.params))) q.set(k, String(v));
  for (const [k, v] of Object.entries(encodePlanetValues(st.planet ?? {}))) q.set(k, String(v));
  for (const [k, v] of Object.entries(encodeSky(st.sky ?? { star: 'sun', moons: 'earth-moon' }))) q.set(k, v);
  return q.toString();
}

/** Reads a URL query back; unknown keys and invalid numbers are ignored, values are clamped to the slider range. */
export function decodeState(search: string): PageState {
  const q = new URLSearchParams(search);
  const num = (k: string): number | undefined => { const v = q.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined; };
  const params: Record<string, number> = {};
  for (const s of SETTINGS) { const v = num(s.key); if (v !== undefined) params[s.key] = clamp(s, v); }
  const st: PageState = { params };
  const planet = decodePlanetValues(q);
  if (Object.keys(planet).length > 0) st.planet = planet;
  const sky = decodeSky(q);
  if (sky) st.sky = sky;
  const seed = num('seed');
  if (seed !== undefined) st.seed = Math.trunc(seed);
  const tier = q.get('tier');
  if (tier) st.tier = tier;
  const pipeline = q.get('pipeline');
  if (pipeline) st.pipeline = pipeline;
  return st;
}
