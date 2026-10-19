// World settings panel: orogen's generation sliders (upstream/orogen/index.html at cc2662b — labels, ranges, steps,
// defaults and help text), shown above the globe and kept in the page URL so a world can be shared exactly.
// Original shell code. Defaults must equal OROGEN_DEFAULTS (settings.test.ts); they are duplicated here so the page
// does not bundle the generator, which runs in the engine worker.

export interface Setting {
  /** OrogenParams key. */
  key: string;
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
      { key: 'jitter', label: 'Irregularity', min: 0, max: 1, step: 0.05, def: 0.75, lo: 'Uniform', hi: 'Scattered',
        tip: 'How randomly the cell points are scattered: 0 gives a uniform grid, 1 gives fully organic, irregular shapes.' },
      { key: 'P', label: 'Plates', min: 4, max: 120, step: 1, def: 80, lo: 'Few', hi: 'Many',
        tip: 'Number of tectonic plates. More plates means more boundaries where mountains, trenches and coastlines form.' },
      { key: 'numContinents', label: 'Continents', min: 1, max: 10, step: 1, def: 4, lo: 'Supercontinent', hi: 'Archipelago',
        tip: 'Target number of landmasses: 1 creates a supercontinent, higher values scatter land into continents and archipelagos.' },
      { key: 'nMag', label: 'Roughness', min: 0, max: 0.5, step: 0.01, def: 0.4, lo: 'Smooth', hi: 'Rugged',
        tip: 'Terrain roughness: higher values add more fractal detail to mountains and coastlines.' },
      { key: 'continentSizeVariety', label: 'Continent size variety', min: 0, max: 1, step: 0.05, def: 0.35, lo: 'Equal', hi: 'Varied',
        tip: 'How much continent sizes vary: at 0 all continents are similar in size, at 1 large and small landmasses mix.' },
      { key: 'landCoverage', label: 'Land coverage', min: 0, max: 1, step: 0.01, def: 0.3, lo: 'Ocean world', hi: 'Desert world',
        tip: 'Share of the planet covered by land. Low values make ocean worlds; high values make desert worlds with less rain.' },
    ],
  },
  {
    title: 'Terrain sculpting',
    settings: [
      { key: 'terrainWarp', label: 'Terrain warp', min: 0, max: 1, step: 0.05, def: 0.75, lo: 'None', hi: 'Heavy',
        tip: 'Deforms the elevation field with noise, giving more organic, squiggly coastlines and mountain ridges.' },
      { key: 'smoothing', label: 'Smoothing', min: 0, max: 1, step: 0.05, def: 0.1, lo: 'None', hi: 'Heavy',
        tip: 'Blends harsh terrain boundaries from tectonic generation: smooths banded ridges and abrupt transitions.' },
      { key: 'glacialErosion', label: 'Glacial erosion', min: 0, max: 1, step: 0.05, def: 0.5, lo: 'None', hi: 'Ice age',
        tip: 'Ice-age sculpting: carves fjords, U-shaped valleys and lake basins at high latitudes and altitudes.' },
      { key: 'hydraulicErosion', label: 'Hydraulic erosion', min: 0, max: 1, step: 0.05, def: 0.5, lo: 'None', hi: 'Deep',
        tip: 'Stream-power erosion: carves river valleys and branching drainage networks.' },
      { key: 'thermalErosion', label: 'Thermal erosion', min: 0, max: 1, step: 0.05, def: 0.1, lo: 'None', hi: 'Heavy',
        tip: 'Slope-driven material transport: softens ridges and creates natural talus slopes.' },
      { key: 'ridgeSharpening', label: 'Ridge sharpening', min: 0, max: 1, step: 0.05, def: 0.5, lo: 'None', hi: 'Jagged',
        tip: 'Accentuates mountain ridgelines: pushes peaks further above their surroundings for more dramatic terrain.' },
    ],
  },
  {
    title: 'Climate',
    settings: [
      { key: 'temperatureOffset', label: 'Temperature (°C)', min: -15, max: 15, step: 1, def: 0, lo: 'Colder', hi: 'Warmer',
        tip: 'Shifts global temperature; climate zones shift accordingly.' },
      { key: 'precipitationOffset', label: 'Precipitation', min: -1, max: 1, step: 0.1, def: 0, lo: 'Drier', hi: 'Wetter',
        tip: 'Scales global precipitation: affects where deserts and rainforests form.' },
    ],
  },
];

export const SETTINGS: Setting[] = SETTING_GROUPS.flatMap((g) => g.settings);

/** A named set of slider values. Presets never change the defaults (world hashes depend on them); they only fill the sliders. */
export interface Preset { id: string; label: string; tip: string; values: Record<string, number> }

export const PRESETS: Preset[] = [
  {
    id: 'earthlike', label: 'Earth-like',
    tip: 'Found by a sweep of the 14 sliders against Earth statistics (docs/earth-tests/DEFAULTS_SWEEP.md, configuration L612). Compared with the defaults it gives Earth-like land fraction, hypsometry, continent sizes, climate-zone shares and river density. Preview-tier evidence only.',
    values: { jitter: 0.75, P: 81, numContinents: 4, nMag: 0.23, continentSizeVariety: 0.1, landCoverage: 0.36, terrainWarp: 0, smoothing: 0.15, glacialErosion: 0.75, hydraulicErosion: 0.4, thermalErosion: 0.25, ridgeSharpening: 0.95, temperatureOffset: -2, precipitationOffset: -0.5 },
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

export interface PageState { seed?: number; tier?: string; pipeline?: string; params: Record<string, number> }

/** Encodes seed, tier, pipeline and non-default settings as a URL query (`?seed=…&tier=…&P=40`). */
export function encodeState(st: PageState): string {
  const q = new URLSearchParams();
  if (st.seed !== undefined) q.set('seed', String(st.seed));
  if (st.tier) q.set('tier', st.tier);
  if (st.pipeline && st.pipeline !== 'structured') q.set('pipeline', st.pipeline);
  for (const [k, v] of Object.entries(changedParams(st.params))) q.set(k, String(v));
  return q.toString();
}

/** Reads a URL query back; unknown keys and invalid numbers are ignored, values are clamped to the slider range. */
export function decodeState(search: string): PageState {
  const q = new URLSearchParams(search);
  const num = (k: string): number | undefined => { const v = q.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined; };
  const params: Record<string, number> = {};
  for (const s of SETTINGS) { const v = num(s.key); if (v !== undefined) params[s.key] = clamp(s, v); }
  const st: PageState = { params };
  const seed = num('seed');
  if (seed !== undefined) st.seed = Math.trunc(seed);
  const tier = q.get('tier');
  if (tier) st.tier = tier;
  const pipeline = q.get('pipeline');
  if (pipeline) st.pipeline = pipeline;
  return st;
}
