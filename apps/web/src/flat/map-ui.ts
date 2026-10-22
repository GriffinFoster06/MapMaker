// Flat-map UI (Phase 5 M5): globe/flat switch, projection and rotation controls, zoom (wheel, 1× to 16×) and drag to
// pan, overlays (graticule, coastlines, Tissot indicatrices, a distortion heatmap) and the exports (16-bit heightmap PNG
// and SVG, both through the exact path in the engine worker). Original shell code. Nothing here writes the World.
import type { EngineClient } from '@mapmaker/engine';
import {
  type DistortionQuantity, type DistortionRaster, type HeightMapping, PROJECTIONS, ProjectionView, distortionRgba, graticule,
  isGpuProjection, pathFor, projectionSpec, tissot, tissotFeatures,
} from '@mapmaker/projection';
import type { MultiLineString } from 'geojson';
import type { HeightmapArgs } from '@mapmaker/projection/exact/kernels';
import { CPU_REDUCTION, FlatMap, type MapState } from './flat-map';
import { lonLatDegToUnit, unitToLonLatDeg } from '../editor/editing';
import { saveFile } from '../desktop';
import { type CartoData, type OverlayOptions, type Style, furnitureLayout, overlayMapSvg, overlayScreenSvg, planLabels, riverThreshold } from '@mapmaker/carto';
import type { LabelPlan } from '@mapmaker/carto';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const MAX_ZOOM = 16;
/** Linear resolution factor of the distortion heatmap (computed on the CPU in the engine worker). */
const DISTORTION_REDUCTION = 4;

export interface StyledArgs { view: { projection: string; width: number; height: number; rotate: [number, number, number]; parallels?: [number, number] }; style: Style }

export interface MapUi {
  /** Whether the flat map is showing. */
  readonly flatShown: boolean;
  /** Call after a new world is generated (with its mesh already given to FlatMap.setWorld). */
  worldChanged(): void;
  /** Call after the layer changed (FlatMap.setLayer done). */
  layerChanged(): void;
  state(): MapState & { view: 'globe' | 'flat' };
  /** While an editing tool is active a drag no longer pans the map. */
  setEditing(on: boolean): void;
  /** Canonical unit vector under a pointer position (client coordinates) on the flat map, or null outside the projection. */
  pick(clientX: number, clientY: number): [number, number, number] | null;
  /** The element that receives the pointer events of the flat map. */
  readonly element: HTMLElement;
  /** The brush ring (Phase 5c): the small circle of `points` (unit vectors, xyz interleaved) projected under the current view; null hides it. */
  setRing(points: ArrayLike<number> | null): void;
  /** The ring's SVG path data (test hook), '' when hidden. */
  ringPath(): string;
  /**
   * Phase 5c: the styled map. `style()` is the style the controls choose; `active()` says whether the styled layer is on (then
   * the overlays are the style's, with rivers, labels, scale bar and legend). Exports always use `style()`.
   */
  setStyleSource(style: () => Style, active: () => boolean, data: () => Promise<CartoData>): void;
  /** The cartographic data of the world changed (a new world, or a re-run that changed the terrain). */
  dataChanged(): void;
  /** Redraws the overlays (a style control changed). */
  restyle(): void;
  /** Number of labels in the last styled overlay (test hook). */
  labelCount(): number;
  /** The styled export through the exact path: the raster PNG, the SVG with vectors and labels, and the composed PNG. */
  exportStyled(): Promise<{ raster: Uint8Array; svg: string; png: Uint8Array; args: StyledArgs }>;
  /** Resolves when the map and its overlays are drawn for the current state. */
  rendered(): Promise<void>;
  /** Exports with the current controls; resolves with the file's bytes (also offered for download) and the kernel args. */
  exportHeightmap(): Promise<{ png: Uint8Array; args: HeightmapArgs }>;
  exportSvg(): Promise<string>;
}

/** Natural aspect (width / height) of a projection's outline. */
function aspect(projection: string, parallels?: [number, number]): number {
  const v = new ProjectionView({ projection, width: 1000, height: 1000, ...(parallels ? { parallels } : {}) });
  const [[x0, y0], [x1, y1]] = pathFor(v).bounds(v.outline());
  return (x1 - x0) / (y1 - y0);
}

export function startMapUi(client: EngineClient, flat: FlatMap, globeCanvas: HTMLCanvasElement): MapUi {
  const mapEl = $('map'), svg = $<HTMLElement>('mapSvg'), distCanvas = $<HTMLCanvasElement>('mapDist');
  const projSel = $<HTMLSelectElement>('projection');
  for (const p of PROJECTIONS) projSel.add(new Option(`${p.label}${isGpuProjection(p.id) ? '' : ' (CPU)'}`, p.id));
  const rot = (['rotLambda', 'rotPhi', 'rotGamma'] as const).map((id) => $<HTMLInputElement>(id));
  const rotVal = $('rotValue'), zoomVal = $('zoomValue'), mapStatus = $('mapStatus');
  const viewSel = $<HTMLSelectElement>('viewMode');
  const ovGrat = $<HTMLInputElement>('ovGraticule'), ovCoast = $<HTMLInputElement>('ovCoast'), ovTissot = $<HTMLInputElement>('ovTissot');
  const ovDist = $<HTMLSelectElement>('ovDistortion');
  const ovRivers = $<HTMLInputElement>('ovRivers'), ovLabels = $<HTMLInputElement>('ovLabels'), ovFurniture = $<HTMLInputElement>('ovFurniture');
  let styleOf: () => Style = () => { throw new Error('no style source'); };
  let styledOn: () => boolean = () => false;
  let dataOf: () => Promise<CartoData> = () => { throw new Error('no style source'); };
  let labelCount = 0;

  // The overlay's three layers, in the drawing order of the former single string: map-bound paths, labels and furniture, Tissot circles.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const [gBelow, gScreen, gAbove] = [0, 1, 2].map(() => svg.appendChild(document.createElementNS(SVGNS, 'g'))) as [SVGGElement, SVGGElement, SVGGElement];
  let geoCache: { key: string; data: unknown; below: string; above: string } | null = null, geoKeyNow = '';

  let zoom = 1, pan: [number, number] = [0, 0];
  let coast: Promise<MultiLineString> | undefined;
  let pending: Promise<void> = Promise.resolve();
  let scheduled = false, gen = 0, distBusy = false, distStale = false;

  const par = [$<HTMLInputElement>('par1'), $<HTMLInputElement>('par2')] as const;
  const isConic = () => projectionSpec(projSel.value).conic !== undefined;
  const state = (): MapState => ({
    projection: projSel.value, rotate: [Number(rot[0]!.value), Number(rot[1]!.value), Number(rot[2]!.value)], zoom, pan: [pan[0], pan[1]],
    ...(isConic() ? { parallels: [Number(par[0].value), Number(par[1].value)] as [number, number] } : {}),
  });
  /** Shows the parallels controls for a conic and loads its default pair. */
  const syncParallels = (resetToDefault: boolean) => {
    const conic = projectionSpec(projSel.value).conic;
    $('parallelsBox').hidden = !conic;
    if (conic && resetToDefault) { par[0].value = String(conic.defaultParallels[0]); par[1].value = String(conic.defaultParallels[1]); }
    $('parValue').textContent = `${par[0].value}, ${par[1].value}`;
  };

  async function draw(): Promise<void> {
    const my = ++gen;
    const st = state();
    rotVal.textContent = st.rotate.join(', ');
    zoomVal.textContent = `${zoom.toFixed(2)}×`;
    const [W, H] = flat.size();
    mapStatus.textContent = flat.usesGpu(st.projection) ? 'drawing (GPU)…' : 'drawing (CPU, reduced resolution)…';
    if (!flat.ready) { mapStatus.textContent = 'generate a world first'; return; }
    const path = await flat.render(st);
    if (path === 'superseded' || my !== gen) return;
    // Overlays, through the same stock view at the map's device-pixel size. The map-bound paths (graticule, rivers, coastline,
    // outline, Tissot) are made at pan 0 and moved with a transform: while only the pan changes they are kept as they are (every
    // coordinate of the path of a panned view is the pan-0 coordinate plus the pan). Labels, scale bar and legend are per view.
    const view = FlatMap.view(st, W, H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const shift = view.panInvariant;
    const geoView = shift ? FlatMap.view({ ...st, pan: [0, 0] }, W, H) : view, p = pathFor(geoView);
    const flags = `${ovGrat.checked}${ovCoast.checked}${ovRivers.checked}${ovFurniture.checked}${ovTissot.checked}`;
    const geoKey = [st.projection, st.rotate.join(), st.parallels?.join() ?? '', zoom, W, H, shift ? '' : st.pan.join(), flags].join('|');
    let below = '', above = '', screen = '', geoData: unknown;
    if (styledOn()) {
      // The styled map's vector layers: the same geometry the exports draw, through this stock view.
      const style = styleOf();
      const data = await dataOf();
      if (my !== gen) return;
      geoData = data;
      const o: OverlayOptions = { graticule: ovGrat.checked, coast: ovCoast.checked, rivers: ovRivers.checked, outline: true, labels: null, scaleBar: ovFurniture.checked, legend: ovFurniture.checked };
      const key = `${geoKey}|${JSON.stringify(style)}`;
      if (!geoCache || geoCache.key !== key || geoCache.data !== data) below = overlayMapSvg(geoView, data, style, o);
      else below = geoCache.below;
      geoKeyNow = key;
      let plan: LabelPlan | null = null;
      if (ovLabels.checked) {
        const fur = furnitureLayout(W, H, style, o);
        plan = planLabels(data, view, style, { obstacles: [fur.scale, fur.legend].filter((b): b is NonNullable<typeof b> => !!b), riverMinArea: riverThreshold(style, view.scale), limb: st.projection === 'orthographic' });
        o.labels = plan;
      }
      labelCount = plan?.labels.length ?? 0;
      screen = overlayScreenSvg(view, data, style, o);
    } else {
      labelCount = 0;
      let c: MultiLineString | null = null;
      if (ovCoast.checked) {
        coast ??= client.worldKernel<MultiLineString>('projection.coastlines', {});
        c = await coast;
        if (my !== gen) return;
      }
      geoData = c;
      const key = `${geoKey}|plain`;
      if (!geoCache || geoCache.key !== key || geoCache.data !== c) {
        below = `<path d="${p(geoView.outline()) ?? ''}" fill="none" stroke="#9aa" stroke-width="${W / 600}"/>`;
        if (ovGrat.checked) below += `<path class="graticule" d="${p(graticule(geoView, 15)) ?? ''}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="${W / 1200}"/>`;
        if (c) below += `<path class="coast" d="${p(c) ?? ''}" fill="none" stroke="#111" stroke-width="${W / 900}"/>`;
      } else below = geoCache.below;
      geoKeyNow = key;
    }
    if (ovTissot.checked) {
      if (geoCache && geoCache.key === geoKeyNow && geoCache.data === geoData) above = geoCache.above;
      else {
        const f = tissotFeatures(tissot(geoView, { step: 30, radius: 5 }));
        above = `<g class="tissot" fill="#e33" fill-opacity="0.35" stroke="#b11" stroke-width="${W / 1200}">${f.circles.map((cc) => `<path d="${p(cc) ?? ''}"/>`).join('')}${f.axes.map((a) => `<path d="${p(a) ?? ''}" fill="none"/>`).join('')}</g>`;
      }
    }
    if (!geoCache || geoCache.key !== geoKeyNow || geoCache.data !== geoData) {
      geoCache = { key: geoKeyNow, data: geoData, below, above };
      gBelow.innerHTML = below;
      gAbove.innerHTML = above;
    }
    const move = shift ? `translate(${st.pan[0]} ${st.pan[1]})` : '';
    if (move) { gBelow.setAttribute('transform', move); gAbove.setAttribute('transform', move); } else { gBelow.removeAttribute('transform'); gAbove.removeAttribute('transform'); }
    gScreen.innerHTML = screen;
    const q = ovDist.value as DistortionQuantity | '';
    if (q) {
      const w = Math.ceil(W / DISTORTION_REDUCTION), h = Math.ceil(H / DISTORTION_REDUCTION);
      const opts = { projection: st.projection, width: w, height: h, rotate: st.rotate, zoom, pan: [pan[0] / DISTORTION_REDUCTION, pan[1] / DISTORTION_REDUCTION] as [number, number], ...(st.parallels ? { parallels: st.parallels } : {}) };
      // One heatmap request at a time in the worker: while one runs, newer states wait, and the latest is drawn after it.
      if (distBusy) { distStale = true; return; }
      distBusy = true;
      let r: Pick<DistortionRaster, 'values' | 'singular' | 'outside'>;
      try { r = await client.worldKernel('projection.distortion', { view: opts, quantity: q }); } finally { distBusy = false; }
      if (my !== gen || distStale) { distStale = false; schedule(); return; }
      distCanvas.width = w; distCanvas.height = h;
      distCanvas.getContext('2d')!.putImageData(new ImageData(distortionRgba({ ...r, width: w, y0: 0, quantity: q }) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      distCanvas.hidden = false;
    } else distCanvas.hidden = true;
    mapStatus.textContent = `${projectionSpec(st.projection).label}: ${path === 'gpu' ? 'GPU' : `CPU at 1/${CPU_REDUCTION} resolution`}`;
  }

  function schedule(): void {
    if (viewSel.value !== 'flat' || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      pending = draw().catch((e: unknown) => { mapStatus.textContent = `error: ${e instanceof Error ? e.message : String(e)}`; });
    });
  }

  function show(): void {
    const isFlat = viewSel.value === 'flat';
    mapEl.hidden = !isFlat;
    globeCanvas.hidden = isFlat;
    $('mapControls').hidden = !isFlat;
    $('globeLabels').hidden = isFlat;
    schedule();
  }

  viewSel.addEventListener('change', show);
  projSel.addEventListener('change', () => { zoom = 1; pan = [0, 0]; syncParallels(true); schedule(); });
  for (const r of par) r.addEventListener('input', () => { syncParallels(false); schedule(); });
  for (const r of rot) r.addEventListener('input', schedule);
  for (const el of [ovGrat, ovCoast, ovTissot, ovDist, ovRivers, ovLabels, ovFurniture]) el.addEventListener('change', schedule);
  $('mapReset').addEventListener('click', () => { for (const r of rot) r.value = '0'; zoom = 1; pan = [0, 0]; syncParallels(true); schedule(); });
  new ResizeObserver(() => schedule()).observe(mapEl);

  // Zoom about the cursor: the map point under it stays put (pan in device pixels, ProjectionView's zoom and pan).
  mapEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = mapEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const [W, H] = flat.size(), mx = (e.clientX - rect.left) * dpr, my = (e.clientY - rect.top) * dpr;
    const z1 = Math.min(MAX_ZOOM, Math.max(1, zoom * Math.exp(-e.deltaY * 0.0015)));
    const x0 = (mx - W / 2 - pan[0]) / zoom, y0 = (my - H / 2 - pan[1]) / zoom;
    pan = [pan[0] + x0 * (zoom - z1), pan[1] + y0 * (zoom - z1)];
    zoom = z1;
    if (zoom === 1) pan = [0, 0];
    schedule();
  }, { passive: false });
  let drag: { x: number; y: number; pan: [number, number] } | null = null;
  let editing = false;
  mapEl.addEventListener('pointerdown', (e) => { if (editing) return; drag = { x: e.clientX, y: e.clientY, pan: [pan[0], pan[1]] }; mapEl.setPointerCapture(e.pointerId); });
  mapEl.addEventListener('pointermove', (e) => {
    if (editing || !drag || zoom === 1) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    pan = [drag.pan[0] + (e.clientX - drag.x) * dpr, drag.pan[1] + (e.clientY - drag.y) * dpr];
    schedule();
  });
  mapEl.addEventListener('pointerup', () => { drag = null; });

  // Exports: full outline (zoom 1) at the chosen width, the height from the projection's natural aspect.
  const exportSize = (): [number, number] => {
    const w = Math.max(16, Math.min(16384, Math.round(Number($<HTMLInputElement>('exportWidth').value) || 2048)));
    return [w, Math.max(8, Math.round(w / aspect(projSel.value, state().parallels)))];
  };
  const updateSize = () => { const [w, h] = exportSize(); $('exportSize').textContent = `${w} × ${h}`; };
  projSel.addEventListener('change', updateSize);
  for (const r of par) r.addEventListener('input', updateSize);
  $<HTMLInputElement>('exportWidth').addEventListener('input', updateSize);
  updateSize();
  const mappingSel = $<HTMLSelectElement>('exportMapping');
  mappingSel.addEventListener('change', () => { $('customRange').hidden = mappingSel.value !== 'custom'; });

  async function exportHeightmap(): Promise<{ png: Uint8Array; args: HeightmapArgs }> {
    const [width, height] = exportSize(), st = state();
    const kind = mappingSel.value;
    const mapping: HeightMapping = kind === 'custom'
      ? { kind: 'custom', minM: Number($<HTMLInputElement>('rangeMin').value), maxM: Number($<HTMLInputElement>('rangeMax').value) }
      : kind === 'land' ? { kind: 'land' } : { kind: 'absolute' };
    const outside = $<HTMLInputElement>('exportTransparent').checked ? 'transparent' : 'zero';
    $('exportStatus').textContent = `exporting ${width} × ${height}…`;
    const args: HeightmapArgs = { view: { projection: st.projection, width, height, rotate: st.rotate, ...(st.parallels ? { parallels: st.parallels } : {}) }, mapping, png: { outside } };
    const png = await client.worldKernel<Uint8Array>('projection.heightmap', args);
    await saveFile('png', `heightmap-${st.projection}-${width}x${height}.png`, png);
    $('exportStatus').textContent = `heightmap: ${(png.length / 1e6).toFixed(1)} MB`;
    return { png, args };
  }
  /** The view of an export at the chosen size, with the conic's parallels when it has them. */
  const exportView = (): StyledArgs['view'] => {
    const [width, height] = exportSize(), st = state();
    return { projection: st.projection, width, height, rotate: st.rotate, ...(st.parallels ? { parallels: st.parallels } : {}) };
  };

  /**
   * The styled export (Phase 5c): the raster comes from the exact path in the worker; the vectors, labels, scale bar and legend
   * are an SVG from the same worker, laid over it on a canvas for the PNG, and embedded with it in the SVG file.
   */
  async function exportStyled(): Promise<{ raster: Uint8Array; svg: string; png: Uint8Array; args: StyledArgs }> {
    const args: StyledArgs = { view: exportView(), style: styleOf() };
    const { width, height } = args.view;
    $('exportStatus').textContent = `exporting styled map ${width} × ${height}…`;
    const [raster, overlay, svg] = await Promise.all([
      client.worldKernel<Uint8Array>('carto.png', args),
      client.worldKernel<string>('carto.svg', { ...args, layers: { raster: false, background: false } }),
      client.worldKernel<string>('carto.svg', args),
    ]);
    const bmp = await createImageBitmap(new Blob([raster as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([overlay], { type: 'image/svg+xml' }));
    try { img.src = url; await img.decode(); ctx.drawImage(img, 0, 0, width, height); } finally { URL.revokeObjectURL(url); }
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
    const png = new Uint8Array(await blob.arrayBuffer());
    $('exportStatus').textContent = `styled map: ${(png.length / 1e6).toFixed(1)} MB PNG, ${(svg.length / 1e6).toFixed(1)} MB SVG`;
    return { raster, svg, png, args };
  }
  async function exportSvg(): Promise<string> {
    const [width, height] = exportSize(), st = state();
    $('exportStatus').textContent = 'exporting SVG…';
    const text = await client.worldKernel<string>('projection.svg', { view: { projection: st.projection, width, height, rotate: st.rotate, ...(st.parallels ? { parallels: st.parallels } : {}) }, layers: { graticule: ovGrat.checked ? 15 : false, tissot: ovTissot.checked ? { step: 30, radius: 5 } : false }, coastlines: true });
    await saveFile('svg', `map-${st.projection}.svg`, text);
    $('exportStatus').textContent = `SVG: ${(text.length / 1e6).toFixed(1)} MB`;
    return text;
  }
  $('exportStyledPng').addEventListener('click', () => { void exportStyled().then(async (r) => { await saveFile('png', `map-styled-${r.args.view.projection}-${r.args.view.width}x${r.args.view.height}.png`, r.png); }).catch((e: unknown) => { $('exportStatus').textContent = `error: ${String(e)}`; }); });
  $('exportStyledSvg').addEventListener('click', () => { void exportStyled().then(async (r) => { await saveFile('svg', `map-styled-${r.args.view.projection}.svg`, r.svg); }).catch((e: unknown) => { $('exportStatus').textContent = `error: ${String(e)}`; }); });
  $('exportHeightmap').addEventListener('click', () => { void exportHeightmap().catch((e: unknown) => { $('exportStatus').textContent = `error: ${String(e)}`; }); });
  $('exportSvg').addEventListener('click', () => { void exportSvg().catch((e: unknown) => { $('exportStatus').textContent = `error: ${String(e)}`; }); });

  // Brush ring: one SVG path in its own element above the map, redrawn on pointer moves (not with the map draw).
  const ringSvg = $<HTMLElement>('mapRing'), ringEl = ringSvg.querySelector('path')!;
  let ringView: { key: string; view: ProjectionView } | undefined;
  function setRing(points: ArrayLike<number> | null): void {
    if (!points || !flat.ready) { ringEl.setAttribute('d', ''); return; }
    const [W, H] = flat.size(), st = state(), key = `${W}x${H} ${JSON.stringify(st)}`;
    if (ringView?.key !== key) ringView = { key, view: FlatMap.view(st, W, H) };
    const n = points.length / 3, coords: [number, number][] = [];
    for (let i = 0; i <= n; i++) { const k = i % n; coords.push(unitToLonLatDeg(points[3 * k]!, points[3 * k + 1]!, points[3 * k + 2]!)); }
    ringSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    ringEl.setAttribute('stroke-width', String(Math.max(1.5, W / 500)));
    ringEl.setAttribute('d', pathFor(ringView.view)({ type: 'LineString', coordinates: coords }) ?? '');
  }

  syncParallels(true);
  show();
  return {
    get flatShown() { return viewSel.value === 'flat'; },
    worldChanged() { coast = undefined; schedule(); },
    dataChanged() { coast = undefined; schedule(); },
    setStyleSource(style, active, data) { styleOf = style; styledOn = active; dataOf = data; },
    restyle() { schedule(); },
    labelCount: () => labelCount,
    exportStyled,
    layerChanged() { schedule(); },
    state: () => ({ ...state(), view: viewSel.value as 'globe' | 'flat' }),
    setEditing(on) { editing = on; drag = null; },
    element: mapEl,
    pick(clientX, clientY) {
      if (!flat.ready) return null;
      const rect = mapEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      const [W, H] = flat.size();
      const ll = FlatMap.view(state(), W, H).invert((clientX - rect.left) * dpr, (clientY - rect.top) * dpr);
      return ll ? lonLatDegToUnit(ll[0], ll[1]) : null;
    },
    rendered: async () => {
      // Wait for the scheduled frame and the draw it started, until no further draw is scheduled.
      do {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await pending;
      } while (scheduled);
    },
    exportHeightmap,
    exportSvg,
    setRing,
    ringPath: () => ringEl.getAttribute('d') ?? '',
  };
}
