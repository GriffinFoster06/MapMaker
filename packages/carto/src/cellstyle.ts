// Per-cell inputs of the styled map (Phase 5c): the relief factor (hillshade as a brightness multiplier) and, for the climate
// and landmass modes, a land colour per cell. Original code around hillshade.ts. The three views (globe vertex colours, the
// flat map's GPU and CPU paths, and the exact export) all read these arrays, so they show the same shading.
import { type World, EARTH_RADIUS_M } from '@mapmaker/core';
import type { CartoData } from './data';
import { cellHillshade, flatGray } from './hillshade';
import { srgbToLinear } from './colour';
import type { Style } from './style';

export interface CellStyle {
  /** Brightness multiplier per cell (1 = unshaded), already scaled by the style's strength (land) or seaStrength (sea). */
  factor: Float32Array;
  /** Linear-light RGB per cell for land in the climate and landmass modes (sea cells are 0); null for the elevation mode. */
  colors: Float32Array | null;
}

/** Brightness factors from a per-cell hillshade (fractions of 255), the style's strengths and the flat-ground reference. */
export function reliefFactors(shade: Float32Array, elev: ArrayLike<number>, style: Style): Float32Array {
  const flat = flatGray(style.relief.hillshade) / 255, out = new Float32Array(shade.length);
  for (let i = 0; i < out.length; i++) {
    const s = elev[i]! > 0 ? style.relief.strength : style.relief.seaStrength;
    const f = flat > 0 ? shade[i]! / flat : 1;
    out[i] = Math.min(1.9, Math.max(0.2, 1 + s * (f - 1)));
  }
  return out;
}

/** A pastel colour for a landmass id (stable: hashed from the id), as linear light. */
export function landmassColor(id: string): [number, number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hue = ((h >>> 0) % 3600) / 3600, sat = 0.38, lig = 0.76;
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat, p = 2 * lig - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [srgbToLinear(f(hue + 1 / 3)), srgbToLinear(f(hue)), srgbToLinear(f(hue - 1 / 3))];
}

export interface CellStyleOptions {
  meshId?: string;
  /** Climate mode: the colour of a Köppen class at a raw elevation (linear light), and the raw elevation layer's id. */
  biome?: { color: (koppen: number, rawElevation: number) => ArrayLike<number>; rawElevation: string | ((world: World) => string) };
  /** The per-cell hillshade (fractions of 255) for the style's hillshade settings, when the caller has it cached. */
  shade?: Float32Array;
}

/** The per-cell hillshade of a world for a style (the part of cellStyle worth caching across relief-strength changes). */
export function shadeFor(world: World, style: Style, meshId = 'global'): Float32Array {
  const mesh = world.meshes.get(meshId)!.mesh, elev = world.layers.get(meshId, 'elevation');
  return cellHillshade(mesh, elev, (world.planet['radius_m'] as number | undefined) ?? EARTH_RADIUS_M, style.relief.hillshade);
}

export function cellStyle(world: World, style: Style, data: CartoData, opts: CellStyleOptions = {}): CellStyle {
  const meshId = opts.meshId ?? 'global';
  const mesh = world.meshes.get(meshId)!.mesh, elev = world.layers.get(meshId, 'elevation');
  const radius = (world.planet['radius_m'] as number | undefined) ?? EARTH_RADIUS_M;
  const shade = opts.shade ?? cellHillshade(mesh, elev, radius, style.relief.hillshade);
  const factor = reliefFactors(shade, elev, style);
  const n = mesh.numRegions;
  if (style.landMode === 'elevation') return { factor, colors: null };
  const colors = new Float32Array(3 * n);
  if (style.landMode === 'landmass') {
    const cache = data.landmasses.map((l) => landmassColor(l.id));
    for (let i = 0; i < n; i++) {
      const k = data.landmass[i]!;
      if (k < 0) continue;
      colors.set(cache[k]!, 3 * i);
    }
  } else {
    if (!opts.biome) throw new Error('the climate colour mode needs opts.biome');
    const rawId = typeof opts.biome.rawElevation === 'function' ? opts.biome.rawElevation(world) : opts.biome.rawElevation;
    const kop = world.layers.get(meshId, 'koppen'), raw = world.layers.get(meshId, rawId);
    for (let i = 0; i < n; i++) {
      if (elev[i]! <= 0) continue;
      const c = opts.biome.color(kop[i]!, raw[i]!);
      colors[3 * i] = c[0]!; colors[3 * i + 1] = c[1]!; colors[3 * i + 2] = c[2]!;
    }
  }
  return { factor, colors };
}
