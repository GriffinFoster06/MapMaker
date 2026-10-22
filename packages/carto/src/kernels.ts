// Engine-worker kernels of the styled map (Phase 5c), called with the `worldKernel` op next to the projection kernels. They
// only read the World. `carto.data` and `carto.cellStyle` feed the interactive views; `carto.png` and `carto.svg` are the
// exact exports, through an exact view (dmath) like every other export (design note 18 §3.1, ARCHITECTURE §3.7).
import { type SphereMesh, type World } from '@mapmaker/core';
import { withTransfer } from '@mapmaker/engine';
import { MeshSampler, encodePngRgba8 } from '@mapmaker/projection';
import { exactView } from '@mapmaker/projection/exact';
import type { ViewOptions } from '@mapmaker/projection';
import { type CartoData, computeCartoData } from './data';
import { type CellStyle, type CellStyleOptions, cellStyle, shadeFor } from './cellstyle';
import { type OverlayOptions, furnitureLayout, overlaySvg, riverThreshold } from './overlay';
import { planLabels } from './placement';
import { styledRaster } from './raster';
import { type Style, styleKey } from './style';
import { buildLut, lutColor } from './colour';

export type ViewSpec = Omit<ViewOptions, 'registry'>;

export interface PngArgs { view: ViewSpec; style: Style; opaque?: boolean; mesh?: string }
export interface SvgArgs {
  view: ViewSpec;
  style: Style;
  /** Which layers to include; every one defaults to true. `raster` is the embedded base image. */
  layers?: Partial<Pick<OverlayOptions, 'graticule' | 'coast' | 'rivers' | 'outline' | 'scaleBar' | 'legend'>> & { raster?: boolean; labels?: boolean; background?: boolean };
  mesh?: string;
}

const samplers = new WeakMap<SphereMesh, MeshSampler>();
const samplerFor = (m: SphereMesh) => {
  let s = samplers.get(m);
  if (!s) { s = new MeshSampler(m); samplers.set(m, s); }
  return s;
};

/** A cheap fingerprint of the elevation layer (every 101st value), so cached data is dropped when a re-run changes the terrain. */
function fingerprint(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 101) s = (s * 31 + a[i]!) % 1e12;
  return s;
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function cartoKernels(opts: CellStyleOptions = {}) {
  const dataCache = new WeakMap<object, { fp: number; data: CartoData }>();
  const styleCache = new WeakMap<object, { key: string; fp: number; cs: CellStyle }>();
  // The hillshade depends on the hillshade settings only, so a change of relief strength or theme colours reuses it.
  const shadeCache = new WeakMap<object, { key: string; fp: number; shade: Float32Array }>();
  const elevationOf = (world: World, meshId: string) => world.layers.get(meshId, 'elevation');
  const dataFor = (world: World, meshId = 'global'): CartoData => {
    const elev = elevationOf(world, meshId), fp = fingerprint(elev), hit = dataCache.get(elev);
    if (hit && hit.fp === fp) return hit.data;
    const data = computeCartoData(world, { meshId });
    dataCache.set(elev, { fp, data });
    return data;
  };
  const styleFor = (world: World, style: Style, meshId = 'global'): CellStyle => {
    const elev = elevationOf(world, meshId), fp = fingerprint(elev), key = styleKey(style), hit = styleCache.get(elev);
    if (hit && hit.fp === fp && hit.key === key) return hit.cs;
    const hs = JSON.stringify(style.relief.hillshade), sh = shadeCache.get(elev);
    let shade = sh && sh.fp === fp && sh.key === hs ? sh.shade : undefined;
    if (!shade) { shade = shadeFor(world, style, meshId); shadeCache.set(elev, { key: hs, fp, shade }); }
    const cs = cellStyle(world, style, dataFor(world, meshId), { ...opts, meshId, shade });
    styleCache.set(elev, { key, fp, cs });
    return cs;
  };

  return {
    /** Features, river chains and the coastline of the world (cached until the terrain changes). */
    'carto.data': (world: World, a: { mesh?: string }): CartoData => {
      // Copies of the typed arrays: the worker transfers what a kernel returns, which would detach the cached ones.
      const d = dataFor(world, a.mesh);
      const out = { ...d, regions: { ...d.regions, id: d.regions.id.slice() }, landmass: d.landmass.slice(), rivers: d.rivers.map((r) => ({ pts: r.pts.slice(), area: r.area.slice() })) };
      // All of them are copies, so they are transferred instead of cloned on the page.
      return withTransfer(out, [out.regions.id.buffer, out.landmass.buffer, ...out.rivers.flatMap((r) => [r.pts.buffer, r.area.buffer])]);
    },
    /** The relief factor per cell, and the land colour per cell for the climate and landmass modes. */
    'carto.cellStyle': (world: World, a: { style: Style; mesh?: string }) => {
      const cs = styleFor(world, a.style, a.mesh);
      // Copies: the worker transfers what a kernel returns, which would detach the cached arrays.
      return { factor: cs.factor.slice(), colors: cs.colors ? cs.colors.slice() : null };
    },
    /**
     * Everything a layer switch to the styled map needs on the page, in one message of transferred buffers: the globe's colour per
     * cell (relief factor times the elevation palette or the climate/landmass colour), and the flat map's inputs.
     */
    'carto.styledLayer': (world: World, a: { style: Style; mesh?: string }) => {
      const meshId = a.mesh ?? 'global', cs = styleFor(world, a.style, meshId), elev = elevationOf(world, meshId), lut = buildLut(a.style);
      const globe = new Float32Array(3 * elev.length), c = [0, 0, 0];
      for (let i = 0; i < elev.length; i++) {
        if (cs.colors && elev[i]! > 0) { c[0] = cs.colors[3 * i]!; c[1] = cs.colors[3 * i + 1]!; c[2] = cs.colors[3 * i + 2]!; } else lutColor(lut, elev[i]!, c);
        const f = cs.factor[i]!;
        globe[3 * i] = c[0]! * f; globe[3 * i + 1] = c[1]! * f; globe[3 * i + 2] = c[2]! * f;
      }
      const out = { globe, factor: cs.factor.slice(), colors: cs.colors ? cs.colors.slice() : null, elevation: Float32Array.from(elev), lut };
      return withTransfer(out, [out.globe.buffer, out.factor.buffer, ...(out.colors ? [out.colors.buffer] : []), out.elevation.buffer, out.lut.rgba.buffer]);
    },
    /** The styled raster alone as an 8-bit RGBA PNG through an exact view (vector layers and labels are in the SVG). */
    'carto.png': (world: World, a: PngArgs) => {
      const meshId = a.mesh ?? 'global', view = exactView(a.view);
      const rgba = styledRaster(view, samplerFor(world.meshes.get(meshId)!.mesh), elevationOf(world, meshId), styleFor(world, a.style, meshId), a.style, { opaque: a.opaque ?? true });
      return encodePngRgba8(view.width, view.height, rgba, [
        ['Software', 'MapMaker'], ['MapMaker.style', a.style.id], ['MapMaker.projection', `${view.spec.id} rotate ${view.projection.rotate().join(' ')}`],
      ]);
    },
    /** A standalone SVG of the styled map: the raster as an embedded PNG, then the vector layers, labels, scale bar and legend. */
    'carto.svg': (world: World, a: SvgArgs) => {
      const meshId = a.mesh ?? 'global', view = exactView(a.view), style = a.style, L = a.layers ?? {};
      const data = dataFor(world, meshId);
      const o: OverlayOptions = {
        graticule: L.graticule ?? true, coast: L.coast ?? true, rivers: L.rivers ?? true, outline: L.outline ?? true,
        scaleBar: L.scaleBar ?? true, legend: L.legend ?? true, labels: null,
      };
      if (L.labels ?? true) {
        const fur = furnitureLayout(view.width, view.height, style, o);
        o.labels = planLabels(data, view, style, { obstacles: [fur.scale, fur.legend].filter((b): b is NonNullable<typeof b> => !!b), riverMinArea: riverThreshold(style, view.scale), limb: view.spec.id === 'orthographic' });
      }
      let raster = '';
      if (L.raster ?? true) {
        const rgba = styledRaster(view, samplerFor(world.meshes.get(meshId)!.mesh), elevationOf(world, meshId), styleFor(world, style, meshId), style, { opaque: true });
        raster = `<image x="0" y="0" width="${view.width}" height="${view.height}" href="data:image/png;base64,${base64(encodePngRgba8(view.width, view.height, rgba))}"/>\n`;
      }
      const rot = view.projection.rotate();
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="0 0 ${view.width} ${view.height}">
<!-- MapMaker: ${view.spec.id} rotate ${rot.join(' ')}, style ${style.id} -->
${(L.background ?? true) ? `<rect width="${view.width}" height="${view.height}" fill="${style.background}"/>\n` : ''}${raster}${overlaySvg(view, data, style, o)}</svg>
`;
    },
  } satisfies Record<string, (world: World, args: never) => unknown>;
}
