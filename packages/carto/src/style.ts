// Style model and the built-in themes (Phase 5c; design note 18 §2, §3.4). Original code.
//
// A style turns canonical layers into a map: hypsometric tints for the ocean and the land, how the land is coloured
// (elevation, Köppen climate or one colour per landmass), the relief shading, and the vector layers drawn over it (coastline,
// rivers, graticule, outline), the labels with their fonts, and the furniture (scale bar, legend). It is data (JSON), stored
// by name in a save and editable; switching style never changes the World (a guard test, like the projection guard).
// Sizes are in units of 1/1000 of the map's width, so an export at 4000 px has four times the line width and text size of
// the same map at 1000 px and the labels place the same way.
import type { HillshadeParams } from './hillshade';

/** sRGB, each channel 0 to 1. */
export type RGB = [number, number, number];

/** A hypsometric stop: elevation in metres (negative below sea level) and its colour. Colours between stops are linear in linear light. */
export interface Stop { m: number; c: RGB }

export type LandColorMode = 'elevation' | 'koppen' | 'landmass';

export type LabelKind = 'continent' | 'island' | 'ocean' | 'sea' | 'range' | 'river';

export interface LabelFont {
  /** Font size, units of 1/1000 of the map width. */
  size: number;
  italic?: boolean;
  /** Letter-spacing as a fraction of the font size. */
  tracking: number;
  upper?: boolean;
  fill: string;
  halo: string;
  /** Halo width, fraction of the font size. */
  halo_w: number;
  opacity?: number;
}

export interface Style {
  id: string;
  label: string;
  /** Page colour outside the projection's outline (SVG/PNG backgrounds). */
  background: string;
  ocean: Stop[];
  land: Stop[];
  landMode: LandColorMode;
  relief: {
    hillshade: HillshadeParams;
    /** 0 = no shading, 1 = full QGIS shading, on land. */
    strength: number;
    /** The same for sea cells (0 keeps the sea floor flat). */
    seaStrength: number;
  };
  coast: { color: string; width: number; /** a second, wider and fainter line outside the coast (a water-line halo) */ halo: { color: string; width: number; opacity: number } | null };
  rivers: { color: string; minWidth: number; maxWidth: number; /** Drainage area (steradians of the unit sphere) a river must drain to be drawn on a 1000 px wide world map; zoomed or larger maps draw more (overlay.ts riverThreshold). */ minAreaSr: number };
  graticule: { color: string; opacity: number; width: number; step: number };
  outline: { color: string; width: number };
  labels: { fonts: Record<LabelKind, LabelFont> };
  furniture: { scaleBar: boolean; legend: boolean; textColor: string; panel: string };
}

export const LABEL_KINDS: LabelKind[] = ['continent', 'island', 'ocean', 'sea', 'range', 'river'];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const stops = (...s: [number, string][]): Stop[] => s.map(([m, c]) => ({ m, c: hex(c) }));

const font = (size: number, fill: string, halo: string, o: Partial<LabelFont> = {}): LabelFont => ({ size, tracking: 0, fill, halo, halo_w: 0.22, ...o });

/**
 * The default sun for all themes: QGIS's own defaults (north-west, 45°). Terrain at world scale is nearly flat in metres per
 * metre (a 4 km range over 100 km is a slope of 0.04), so the themes exaggerate heights through QGIS's z factor.
 */
const SUN: HillshadeParams = { azimuthDeg: 315, lightAngleDeg: 45, zFactor: 1, multiDirectional: false };

// Elevation-colour ramps are the kind used in physical atlases: blues deepening with depth, green lowlands through yellow and
// brown to white summits. The numbers are ours (no table was copied from any atlas or program).
const ATLAS_OCEAN = stops([-9000, '#3d6a9b'], [-5000, '#5a85b5'], [-2500, '#7fa7cf'], [-800, '#a8c8e6'], [-150, '#c9e0f1'], [0, '#dcebf6']);
const ATLAS_LAND = stops([0, '#a8cf9c'], [150, '#bedba0'], [500, '#dde8a8'], [1000, '#efe3a0'], [2000, '#e2c488'], [3000, '#c9a171'], [4500, '#b08a6c'], [6500, '#f4f1ea']);

export const THEMES: Record<string, Style> = {
  atlas: {
    id: 'atlas', label: 'Atlas (physical)', background: '#ffffff',
    ocean: ATLAS_OCEAN, land: ATLAS_LAND, landMode: 'elevation',
    relief: { hillshade: { ...SUN, zFactor: 12 }, strength: 0.75, seaStrength: 0 },
    coast: { color: '#4d6f8f', width: 0.9, halo: { color: '#a9c8e4', width: 3.2, opacity: 0.55 } },
    rivers: { color: '#4f86bd', minWidth: 0.5, maxWidth: 2.6, minAreaSr: 0.006 },
    graticule: { color: '#7d93a8', opacity: 0.45, width: 0.5, step: 15 },
    outline: { color: '#34495e', width: 1.2 },
    labels: { fonts: {
      continent: font(15, '#33302b', '#ffffff', { tracking: 0.25, upper: true, halo_w: 0.14 }),
      island: font(9.5, '#3b3731', '#ffffff', { halo_w: 0.16 }),
      ocean: font(14, '#2f5d8a', '#e9f3fb', { italic: true, tracking: 0.35, upper: true, halo_w: 0.1 }),
      sea: font(10, '#2f5d8a', '#e9f3fb', { italic: true, tracking: 0.12, halo_w: 0.12 }),
      range: font(9.5, '#6b4f3a', '#fbf7ee', { italic: true, tracking: 0.18, upper: true }),
      river: font(8.5, '#2e6aa6', '#ffffff', { italic: true, tracking: 0.04 }),
    } },
    furniture: { scaleBar: true, legend: true, textColor: '#2b2b2b', panel: '#ffffffd9' },
  },
  physical: {
    id: 'physical', label: 'Physical (shaded relief)', background: '#0d1b2a',
    ocean: stops([-9000, '#0b2c52'], [-5000, '#124a7c'], [-2500, '#1f6ba8'], [-800, '#3d8ec6'], [-150, '#74b6dc'], [0, '#9fd0e8']),
    land: stops([0, '#5c9a45'], [200, '#79ad4c'], [600, '#a9bd58'], [1200, '#cdb55d'], [2200, '#b48a54'], [3500, '#8d6a4c'], [5000, '#c9c0b5'], [6500, '#ffffff']),
    landMode: 'elevation',
    relief: { hillshade: { ...SUN, zFactor: 20 }, strength: 1, seaStrength: 0 },
    coast: { color: '#17324f', width: 0.7, halo: null },
    rivers: { color: '#3f87c4', minWidth: 0.5, maxWidth: 2.4, minAreaSr: 0.006 },
    graticule: { color: '#ffffff', opacity: 0.22, width: 0.4, step: 15 },
    outline: { color: '#e8eef5', width: 1 },
    labels: { fonts: {
      continent: font(15, '#ffffff', '#102236', { tracking: 0.25, upper: true, halo_w: 0.16 }),
      island: font(9.5, '#ffffff', '#102236', { halo_w: 0.16 }),
      ocean: font(14, '#cfe6f7', '#0b2c52', { italic: true, tracking: 0.35, upper: true, halo_w: 0.1 }),
      sea: font(10, '#cfe6f7', '#0b2c52', { italic: true, tracking: 0.12, halo_w: 0.12 }),
      range: font(9.5, '#fff6e0', '#3a2a1c', { italic: true, tracking: 0.18, upper: true }),
      river: font(8.5, '#d8ecff', '#123552', { italic: true, tracking: 0.04 }),
    } },
    furniture: { scaleBar: true, legend: true, textColor: '#eaf2fa', panel: '#0d1b2acc' },
  },
  parchment: {
    id: 'parchment', label: 'Parchment (fantasy)', background: '#efe2c3',
    ocean: stops([-9000, '#a9a58b'], [-3000, '#b9b497'], [-800, '#c9c3a3'], [-150, '#d8d1ae'], [0, '#e2dab5']),
    land: stops([0, '#efe0b4'], [300, '#e9d6a1'], [900, '#dfc58b'], [1800, '#cfae74'], [3000, '#b9915f'], [4500, '#a07a52'], [6500, '#e9dcc0']),
    landMode: 'elevation',
    relief: { hillshade: { ...SUN, multiDirectional: true, zFactor: 14 }, strength: 0.75, seaStrength: 0 },
    coast: { color: '#4a3524', width: 1.1, halo: { color: '#8f8467', width: 3.6, opacity: 0.35 } },
    rivers: { color: '#5d6f78', minWidth: 0.5, maxWidth: 2.2, minAreaSr: 0.008 },
    graticule: { color: '#7a6a4c', opacity: 0.3, width: 0.5, step: 15 },
    outline: { color: '#4a3524', width: 1.6 },
    labels: { fonts: {
      continent: font(16, '#3a2a1c', '#efe2c3', { italic: true, tracking: 0.3, upper: true, halo_w: 0.16 }),
      island: font(9.5, '#3a2a1c', '#efe2c3', { italic: true, halo_w: 0.16 }),
      ocean: font(14, '#5a5340', '#e2dab5', { italic: true, tracking: 0.4, upper: true, halo_w: 0.12 }),
      sea: font(10.5, '#5a5340', '#e2dab5', { italic: true, tracking: 0.14, halo_w: 0.14 }),
      range: font(10, '#4a3524', '#efe2c3', { italic: true, tracking: 0.2, upper: true }),
      river: font(8.5, '#4d5c64', '#efe2c3', { italic: true, tracking: 0.05 }),
    } },
    furniture: { scaleBar: true, legend: false, textColor: '#3a2a1c', panel: '#efe2c3e6' },
  },
  political: {
    id: 'political', label: 'Political (landmass colours)', background: '#ffffff',
    ocean: stops([-9000, '#bcd4e6'], [-3000, '#c7dcec'], [-800, '#d3e4f0'], [0, '#dfecf5']),
    land: stops([0, '#ece6d6'], [6500, '#ece6d6']),
    landMode: 'landmass',
    relief: { hillshade: { ...SUN, zFactor: 12 }, strength: 0.3, seaStrength: 0 },
    coast: { color: '#59707f', width: 0.9, halo: null },
    rivers: { color: '#6fa0c8', minWidth: 0.4, maxWidth: 1.8, minAreaSr: 0.01 },
    graticule: { color: '#8aa0b0', opacity: 0.4, width: 0.5, step: 15 },
    outline: { color: '#44566a', width: 1.2 },
    labels: { fonts: {
      continent: font(15, '#2d3640', '#ffffff', { tracking: 0.25, upper: true, halo_w: 0.14 }),
      island: font(9.5, '#2d3640', '#ffffff', { halo_w: 0.16 }),
      ocean: font(14, '#4d7aa0', '#eef5fa', { italic: true, tracking: 0.35, upper: true, halo_w: 0.1 }),
      sea: font(10, '#4d7aa0', '#eef5fa', { italic: true, tracking: 0.12, halo_w: 0.12 }),
      range: font(9, '#6b5a4a', '#ffffff', { italic: true, tracking: 0.18, upper: true }),
      river: font(8.5, '#3f7bb0', '#ffffff', { italic: true, tracking: 0.04 }),
    } },
    furniture: { scaleBar: true, legend: false, textColor: '#2b2b2b', panel: '#ffffffd9' },
  },
  satellite: {
    id: 'satellite', label: 'Satellite-like (climate colours)', background: '#02060c',
    ocean: stops([-9000, '#041428'], [-5000, '#06223f'], [-2500, '#0a3763'], [-800, '#134f84'], [-150, '#2a78a8'], [0, '#3f94b4']),
    land: stops([0, '#4f7a3a'], [6500, '#4f7a3a']),
    landMode: 'koppen',
    relief: { hillshade: { ...SUN, zFactor: 16 }, strength: 1, seaStrength: 0 },
    coast: { color: '#0b2236', width: 0.5, halo: { color: '#8fd0d8', width: 2.4, opacity: 0.22 } },
    rivers: { color: '#4f93c4', minWidth: 0.4, maxWidth: 1.6, minAreaSr: 0.01 },
    graticule: { color: '#ffffff', opacity: 0.18, width: 0.4, step: 15 },
    outline: { color: '#7d8fa3', width: 0.8 },
    labels: { fonts: {
      continent: font(15, '#ffffff', '#02060c', { tracking: 0.25, upper: true, halo_w: 0.16 }),
      island: font(9.5, '#ffffff', '#02060c', { halo_w: 0.16 }),
      ocean: font(14, '#bfe0f5', '#02060c', { italic: true, tracking: 0.35, upper: true, halo_w: 0.12 }),
      sea: font(10, '#bfe0f5', '#02060c', { italic: true, tracking: 0.12, halo_w: 0.14 }),
      range: font(9.5, '#fff1cf', '#02060c', { italic: true, tracking: 0.18, upper: true }),
      river: font(8.5, '#c9e6ff', '#02060c', { italic: true, tracking: 0.04 }),
    } },
    furniture: { scaleBar: true, legend: false, textColor: '#e7eef6', panel: '#02060ccc' },
  },
};

export const THEME_IDS = Object.keys(THEMES);

/** The theme named `id`, or a copy of it with the given overrides merged one level deep. */
export function styleFor(id: string, overrides: Partial<Style> = {}): Style {
  const base = THEMES[id];
  if (!base) throw new Error(`unknown style: ${id}`);
  return { ...base, ...overrides };
}

/** A canonical string of a style (sorted keys), for hashing and cache keys. */
export function styleKey(s: Style): string {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(canon(s));
}

/** A CSS colour string of an sRGB triple. */
export const css = (c: RGB): string => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
