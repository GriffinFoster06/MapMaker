// Globe app: generate an orogen world in the engine worker, show it on the globe, pick layers, time the stages.
import { type TypedArray, bytesOf, sha256 } from '@mapmaker/core';
import { EngineClient, type PortLike, type WorldStats } from '@mapmaker/engine';
import { Globe } from './globe/globe';
import { FlatMap, type MapState } from './flat/flat-map';
import type { HeightmapArgs } from '@mapmaker/projection/exact/kernels';
import { type MapUi, type StyledArgs, startMapUi } from './flat/map-ui';
import { type DebugMode, ProjectionView, type ViewOptions } from '@mapmaker/projection';
import { RAW_ELEVATION, makeLayers } from './globe/colors';
import { type EditorHandle, startEditor } from './editor/editor-ui';
import { THEMES, THEME_IDS, type CartoData, type Style, buildLut, lutColor } from '@mapmaker/carto';
import { desktop, saveFile } from './desktop';
import { GlobeLabels } from './globe/globe-labels';
import { LEVELS, type Level, PRESETS, SETTING_GROUPS, SETTINGS, changedParams, decodeState, encodeState, visibleAt } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const TIERS: Record<string, number> = { '20k': 20_000, '50k': 50_000, '200k': 200_000, '500k': 500_000, '1M': 1_000_000, '2.56M': 2_560_000 };
/** Preview tier shown first when a larger final is requested (Phase 4b: same seed, same reference world). */
export const PREVIEW_N = 50_000;
/** Pipeline variants: `structured` (Phase 4b, default) or stock orogen (`parity`, Phase 4a; debug). */
export type Variant = 'structured' | 'parity';

export interface GlobeHook {
  /** Resolves when the first generation finished and the globe shows a layer. */
  generate(opts: GenerateOpts): Promise<{ stages: Record<string, number>; totalMs: number; stats: WorldStats }>;
  /**
   * Benchmark hook: the same generation in a fresh engine worker, with no globe and no transfers back, so the worker's
   * memory can be told apart from the page's (Phase 5 M0). The worker is terminated afterwards.
   */
  generateInWorker(opts: GenerateOpts): Promise<{ totalMs: number; stats: WorldStats }>;
  setLayer(id: string): Promise<void>;
  layerHash(id: string): Promise<string>;
  litFraction(): number;
  pixelSum(): number;
  /** Test hook: the former draw path (both faces, mesh triangle order) when true; the picture must be identical. */
  setFormerDraw(former: boolean): void;
  /** Which path draws the globe: `fast` (front faces, ordered triangles, verified identical on this GPU) or `former`. */
  drawPath(): 'fast' | 'former';
  layers: string[];
}

/** `params`: orogen generation settings that differ from the defaults (World settings panel). */
export interface GenerateOpts { N: number; seed: number; variant?: Variant; params?: Record<string, number> }

/** Test hook of the flat map (Phase 5 M4/M5). */
export interface FlatHook {
  /** Uploads the current world and layer to the GPU path. */
  ready(layer?: string): Promise<{ gpu: boolean; maxTextureSize: number }>;
  /** Debug render of a stock view (DebugMode 1 or 2) on the GPU; base64 of the RGBA32UI pixels, rows top to bottom. */
  debug(view: ViewOptions, mode: DebugMode): Promise<string>;
  render(st: MapState): Promise<string>;
  worldHash(): Promise<string>;
  /** The map UI: its state, a wait for the current draw, and the export buttons' actions (sha256 of the file). */
  ui: Pick<MapUi, 'state' | 'rendered' | 'labelCount'> & {
    exportHeightmap(): Promise<{ sha256: string; args: HeightmapArgs }>; exportSvg(): Promise<string>; overlayPaths(): number;
    /** The styled export: sha256 of the exact raster PNG, sizes of the composed PNG and the SVG, the SVG text and the arguments sent to the worker. */
    exportStyled(): Promise<{ rasterSha256: string; pngBytes: number; svg: string; args: StyledArgs; pngWidth: number; pngHeight: number }>;
    /** Number of labels on the globe (test hook). */
    globeLabels(): number;
    /** The GPU's styled pixels against the exact path's raster for the same view (test hook): inside both, per-channel differences (0 to 255). */
    compareStyled(): Promise<{ w: number; h: number; inside: number; mean: number; p99: number; max: number; over8: number; coverageMismatch: number }>;
  };
}

/** Test hook for the editor panel (Phase 5b). */
export interface EditHook { state(): ReturnType<EditorHandle['state']> }
declare global { interface Window { __globe?: GlobeHook; __flat?: FlatHook; __edit?: EditHook } }

/** Builds the World settings panel and returns a reader of the current slider values. */
function buildSettings(initial: Record<string, number>, onChange: () => void): { values(): Record<string, number>; reset(): void; apply(values: Record<string, number>): void } {
  const inputs = new Map<string, HTMLInputElement>();
  const host = $('settingGroups');
  for (const g of SETTING_GROUPS) {
    const box = document.createElement('div');
    box.className = 'sgroup';
    const h = document.createElement('h3');
    h.textContent = g.title;
    const grid = document.createElement('div');
    grid.className = 'sgrid';
    for (const st of g.settings) {
      const wrap = document.createElement('div');
      wrap.className = 'setting';
      wrap.dataset['level'] = st.level;
      wrap.title = st.tip;
      const label = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = st.label;
      const val = document.createElement('span');
      val.className = 'val';
      const input = document.createElement('input');
      input.type = 'range';
      input.id = `set-${st.key}`;
      input.min = String(st.min); input.max = String(st.max); input.step = String(st.step);
      input.value = String(initial[st.key] ?? st.def);
      const show = () => { val.textContent = input.value; };
      show();
      input.addEventListener('input', () => { show(); onChange(); });
      label.htmlFor = input.id;
      label.append(name, val);
      const ends = document.createElement('div');
      ends.className = 'ends';
      ends.innerHTML = '<span></span><span></span>';
      ends.children[0]!.textContent = st.lo; ends.children[1]!.textContent = st.hi;
      wrap.append(label, input, ends);
      grid.append(wrap);
      inputs.set(st.key, input);
    }
    box.append(h, grid);
    host.append(box);
  }
  /** Shows the parameters of the chosen registry level (simple, advanced, expert); every slider keeps its value when hidden. */
  const showLevel = (level: Level) => {
    const vis = new Set(visibleAt(level).map((x) => x.key));
    for (const st of SETTINGS) inputs.get(st.key)!.closest<HTMLElement>('.setting')!.hidden = !vis.has(st.key);
    for (const box of host.querySelectorAll<HTMLElement>('.sgroup')) box.hidden = ![...box.querySelectorAll<HTMLElement>('.setting')].some((el) => !el.hidden);
    $('expertNote').hidden = level !== 'expert';
  };
  const levelSel = $<HTMLSelectElement>('level');
  for (const l of LEVELS) levelSel.add(new Option(l, l));
  levelSel.addEventListener('change', () => showLevel(levelSel.value as Level));
  levelSel.value = 'advanced';
  showLevel('advanced');
  return {
    values: () => Object.fromEntries(SETTINGS.map((st) => [st.key, Number(inputs.get(st.key)!.value)])),
    reset: () => { for (const st of SETTINGS) { const i = inputs.get(st.key)!; i.value = String(st.def); i.dispatchEvent(new Event('input')); } },
    /** Sets every slider to `values[key]` (the default where a key is missing). */
    apply: (values) => { for (const st of SETTINGS) { const i = inputs.get(st.key)!; i.value = String(values[st.key] ?? st.def); i.dispatchEvent(new Event('input')); } },
  };
}

export function startApp(): void {
  const worker = new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' });
  const client = new EngineClient(worker as unknown as PortLike);
  // Without WebGL2 there is no globe; the flat map still works on its CPU path, so say so and start in the flat view.
  let globe: Globe | null = null;
  try { globe = new Globe($<HTMLCanvasElement>('globe')); } catch (e) {
    console.error(e);
    const viewMode = $<HTMLSelectElement>('viewMode');
    viewMode.value = 'flat';
    viewMode.querySelector<HTMLOptionElement>('option[value="globe"]')!.disabled = true;
    $('webglNotice').hidden = false;
  }
  const flat = new FlatMap(client, $<HTMLCanvasElement>('mapGpu'), $<HTMLCanvasElement>('mapCpu'));
  const ui = startMapUi(client, flat, $<HTMLCanvasElement>('globe'));

  const sel = $<HTMLSelectElement>('layer');
  let variant: Variant = 'structured';
  let layers = makeLayers(RAW_ELEVATION[variant]!);
  for (const l of layers) sel.add(new Option(l.label, l.id));
  // The styled map (Phase 5c) is a layer of its own: a theme's colours, QGIS hillshade, and the vector layers and labels.
  sel.add(new Option('Styled map (theme)', 'styled'));
  const styleSel = $<HTMLSelectElement>('styleSel'), relief = $<HTMLInputElement>('reliefStrength');
  for (const id of THEME_IDS) styleSel.add(new Option(THEMES[id]!.label, id));
  const currentStyle = (): Style => {
    const base = THEMES[styleSel.value]!;
    return { ...base, relief: { ...base.relief, strength: Number(relief.value) } };
  };
  let cartoDataP: Promise<CartoData> | undefined;
  const cartoData = () => (cartoDataP ??= client.worldKernel<CartoData>('carto.data', {}));
  ui.setStyleSource(currentStyle, () => sel.value === 'styled', cartoData);
  const ovLabels = $<HTMLInputElement>('ovLabels');
  const globeLabels = globe ? new GlobeLabels(globe, $('globeLabels') as unknown as SVGSVGElement, { style: () => (sel.value === 'styled' && ovLabels.checked ? currentStyle() : null), data: cartoData }) : null;
  const pipelineSel = $<HTMLSelectElement>('pipeline');
  const tier = $<HTMLSelectElement>('tier');
  for (const k of Object.keys(TIERS)) tier.add(new Option(`${k} cells`, k));
  tier.value = '50k';
  const seedInput = $<HTMLInputElement>('seed');

  // Page state from the URL (shared links): seed, tier, pipeline and non-default settings.
  const init = decodeState(location.search);
  if (init.seed !== undefined) seedInput.value = String(init.seed);
  if (init.tier && init.tier in TIERS) tier.value = init.tier;
  if (init.pipeline === 'parity' || init.pipeline === 'structured') pipelineSel.value = init.pipeline;
  const pageState = () => encodeState({ seed: Number(seedInput.value) || 12345, tier: tier.value, pipeline: pipelineSel.value, params: settings.values() });
  const syncUrl = () => { const q = pageState(); history.replaceState(null, '', q ? `?${q}` : location.pathname); };
  const settings = buildSettings(init.params, syncUrl);
  for (const el of [seedInput, tier, pipelineSel]) el.addEventListener('change', syncUrl);
  $('resetSettings').addEventListener('click', () => { settings.reset(); presetSel.value = ''; });
  const presetSel = $<HTMLSelectElement>('preset');
  for (const p of PRESETS) presetSel.add(Object.assign(new Option(p.label, p.id), { title: p.tip }));
  presetSel.addEventListener('change', () => { const p = PRESETS.find((x) => x.id === presetSel.value); if (p) settings.apply(p.values); });
  $('copyLink').addEventListener('click', () => {
    syncUrl();
    navigator.clipboard.writeText(location.href).then(() => { $('linkStatus').textContent = 'link copied'; },
      () => { $('linkStatus').textContent = location.href; });
  });

  const status = $('status');
  let busy = false;
  const editor = startEditor({ client, ui, globe, globeCanvas: $<HTMLCanvasElement>('globe'), variant: () => variant, rerun, busy: () => busy, status: (t) => { status.textContent = t; } });
  $('cancelRun').hidden = true;

  /** The styled layer: per-cell colours for the globe, the lookup, relief factors and land colours for the flat map. */
  async function paintStyled(): Promise<void> {
    const style = currentStyle();
    const [data, cs] = await Promise.all([client.layers(['elevation']), client.worldKernel<{ factor: Float32Array; colors: Float32Array | null }>('carto.cellStyle', { style })]);
    const elev = data['elevation']![0]! as Float32Array, lut = buildLut(style), c = [0, 0, 0];
    if (globe) {
      const out = globe.colors;
      for (let i = 0; i < elev.length; i++) {
        if (cs.colors && elev[i]! > 0) { c[0] = cs.colors[3 * i]!; c[1] = cs.colors[3 * i + 1]!; c[2] = cs.colors[3 * i + 2]!; } else lutColor(lut, elev[i]!, c);
        const f = cs.factor[i]!;
        out[3 * i] = c[0]! * f; out[3 * i + 1] = c[1]! * f; out[3 * i + 2] = c[2]! * f;
      }
      globe.colorsChanged();
    }
    flat.setLayer({ rule: 'styled', elevation: Float32Array.from(elev), factor: cs.factor, colors: cs.colors, lut });
    $('styledOverlays').hidden = false;
    ui.layerChanged();
    globeLabels?.schedule(0);
  }

  async function paint(id: string): Promise<void> {
    $('styledOverlays').hidden = id !== 'styled';
    if (id === 'styled') { await paintStyled(); return; }
    globeLabels?.schedule(0);
    const layer = layers.find((l) => l.id === id)!;
    const data = await client.layers(layer.need);
    if (globe) { layer.paint(data, globe.colors); globe.colorsChanged(); }
    flat.setLayer(layer.flat(data));
    ui.layerChanged();
  }

  /** Re-runs the pipeline on the current world (all stale stages, or from a stage) and repaints; the edit panel calls it. */
  async function rerun(from?: string): Promise<void> {
    if (busy) throw new Error('already running');
    busy = true;
    $('cancelRun').hidden = false;
    try {
      const t0 = performance.now();
      status.textContent = 're-running…';
      const res = await client.run({ variant, strict: false, ...(from ? { from } : {}), onProgress: (p) => { status.textContent = `re-running ${p.stageId}${p.message ? ': ' + p.message : ''}`; } });
      if (res.cancelledAt) { status.textContent = `cancelled in ${res.cancelledAt}; re-run to finish`; return; }
      cartoDataP = undefined;
      if (res.ran.includes('mesh')) { const mesh = await client.meshData(); globe?.setMesh(mesh); flat.setWorld(mesh); ui.worldChanged(); }
      ui.dataChanged();
      await paint(sel.value);
      status.textContent = `re-ran ${res.ran.length ? res.ran.join(', ') : 'nothing'} in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    } finally { busy = false; $('cancelRun').hidden = true; }
  }

  async function generate(opts: GenerateOpts, label = '') {
    if (busy) throw new Error('already generating');
    busy = true;
    try {
      variant = opts.variant ?? 'structured';
      layers = makeLayers(RAW_ELEVATION[variant]!);
      const t0 = performance.now();
      const stages: Record<string, number> = {};
      let cur = '', curStart = t0;
      const close = (t: number) => { if (cur) stages[cur] = (stages[cur] ?? 0) + (t - curStart); };
      await client.create({ ...(opts.params ?? {}), N: opts.N, seed: opts.seed });
      status.textContent = 'generating…';
      await client.run({
        variant,
        strict: false,
        onProgress: (p) => {
          const t = performance.now();
          if (p.stageId !== cur) { close(t); cur = p.stageId; curStart = t; }
          status.textContent = `${label}${p.stageId}${p.message ? ': ' + p.message : ''}`;
        },
      });
      const tEnd = performance.now();
      close(tEnd);
      cartoDataP = undefined;
      const mesh = await client.meshData();
      globe?.setMesh(mesh);
      flat.setWorld(mesh);
      ui.worldChanged();
      await paint(sel.value);
      await editor.refresh();
      const stats = await client.stats();
      const totalMs = performance.now() - t0;
      status.textContent = `${label}${opts.N.toLocaleString()} cells in ${(totalMs / 1000).toFixed(1)} s`;
      $('timing').textContent = Object.entries(stages).map(([k, v]) => `${k.padEnd(18)} ${(v / 1000).toFixed(2)} s`).join('\n') +
        `\nworking set        ${((stats.layerBytes + stats.meshBytes) / 1e6).toFixed(0)} MB (${stats.layerArrays} layer arrays)`;
      return { stages, totalMs, stats };
    } finally { busy = false; }
  }

  $('generate').addEventListener('click', () => {
    const N = TIERS[tier.value]!, seed = Number(seedInput.value) || 12345;
    const v = pipelineSel.value as Variant;
    const params = changedParams(settings.values());
    syncUrl();
    const previewFirst = v === 'structured' && $<HTMLInputElement>('preview').checked && N > PREVIEW_N;
    void (async () => {
      // Phase 4b: the preview is the final's structure at a lower resolution (same seed, same reference world), so it
      // is shown first and replaced by the final when that is ready.
      // The preview and the final use the same settings.
      if (previewFirst) await generate({ N: PREVIEW_N, seed, variant: v, params }, 'preview: ');
      await generate({ N, seed, variant: v, params }, previewFirst ? 'final: ' : '');
    })().catch((e: unknown) => { status.textContent = `error: ${e instanceof Error ? e.message : String(e)}`; });
  });
  sel.addEventListener('change', () => { void paint(sel.value); });
  let styleTimer = 0;
  const restyle = () => { clearTimeout(styleTimer); styleTimer = window.setTimeout(() => { if (sel.value === 'styled') void paint('styled').catch((e: unknown) => { status.textContent = `error: ${String(e)}`; }); }, 120); };
  styleSel.addEventListener('change', restyle);
  relief.addEventListener('input', restyle);
  ovLabels.addEventListener('change', () => { globeLabels?.schedule(0); });

  // Save and load a .mapmaker file (ARCHITECTURE §5): the worker writes and reads the container; the page only moves bytes.
  async function refreshAfterLoad(): Promise<void> {
    const { variant: v, cells } = await client.worldKernel<{ variant: string; cells: number }>('app.info', {});
    variant = v as Variant;
    layers = makeLayers(RAW_ELEVATION[variant]!);
    cartoDataP = undefined;
    const mesh = await client.meshData();
    globe?.setMesh(mesh);
    flat.setWorld(mesh);
    ui.worldChanged();
    await paint(sel.value);
    await editor.refresh();
    status.textContent = `loaded ${cells.toLocaleString()} cells`;
  }
  $('saveWorld').addEventListener('click', () => {
    void (async () => {
      const bytes = await client.snapshot();
      const saved = await saveFile('mapmaker', `world-${seedInput.value || 'x'}.mapmaker`, bytes);
      status.textContent = saved ? `saved ${(bytes.length / 1e6).toFixed(1)} MB` : 'save cancelled';
    })().catch((e: unknown) => { status.textContent = `save failed: ${String(e)}`; });
  });
  async function loadBytes(bytes: Uint8Array): Promise<void> {
    const r = await client.load(bytes);
    await refreshAfterLoad();
    if (r.viewOnly) status.textContent += ' (view only: stage versions differ)';
  }
  const loadFile = $<HTMLInputElement>('loadFile');
  // Electron: a native open dialog. Browser: the hidden file input.
  $('loadWorld').addEventListener('click', () => {
    const d = desktop();
    if (!d) { loadFile.click(); return; }
    void (async () => {
      const f = await d.openWorld();
      if (f) await loadBytes(f.bytes);
    })().catch((e: unknown) => { status.textContent = `load failed: ${String(e)}`; });
  });
  loadFile.addEventListener('change', () => {
    const f = loadFile.files?.[0];
    if (!f) return;
    void (async () => {
      await loadBytes(new Uint8Array(await f.arrayBuffer()));
      loadFile.value = '';
    })().catch((e: unknown) => { status.textContent = `load failed: ${String(e)}`; });
  });

  async function generateInWorker(opts: GenerateOpts): Promise<{ totalMs: number; stats: WorldStats }> {
    const w = new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' });
    try {
      const c = new EngineClient(w as unknown as PortLike);
      const t0 = performance.now();
      await c.create({ ...(opts.params ?? {}), N: opts.N, seed: opts.seed });
      await c.run({ variant: opts.variant ?? 'structured', strict: false });
      const stats = await c.stats();
      return { totalMs: performance.now() - t0, stats };
    } finally { w.terminate(); }
  }

  window.__flat = {
    ready: async (layer) => {
      if (layer) { sel.value = layer; await paint(layer); }
      const gpu = flat.gpu ? await flat.ensureGpu().then(() => true, (e: unknown) => { console.error(e); return false; }) : false;
      return { gpu, maxTextureSize: flat.gpu?.maxTextureSize ?? 0 };
    },
    debug: async (view, mode) => {
      const gpu = await flat.ensureGpu();
      const px = gpu.debug(new ProjectionView(view), mode);
      const bytes = new Uint8Array(px.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    render: (st) => flat.render(st),
    worldHash: () => client.hash(),
    ui: {
      state: () => ui.state(),
      rendered: () => ui.rendered(),
      exportHeightmap: async () => { const r = await ui.exportHeightmap(); return { sha256: await sha256(r.png), args: r.args }; },
      exportSvg: async () => sha256(new TextEncoder().encode(await ui.exportSvg())),
      overlayPaths: () => document.querySelectorAll('#mapSvg path').length,
      labelCount: () => ui.labelCount(),
      exportStyled: async () => {
        const r = await ui.exportStyled();
        const dv = new DataView(r.png.buffer, r.png.byteOffset + 16, 8);
        return { rasterSha256: await sha256(r.raster), pngBytes: r.png.length, svg: r.svg, args: r.args, pngWidth: dv.getUint32(0), pngHeight: dv.getUint32(4) };
      },
      globeLabels: () => globeLabels?.count ?? 0,
      compareStyled: async () => {
        const [W, H] = flat.size(), st = ui.state();
        const png = await client.worldKernel<Uint8Array>('carto.png', { view: { projection: st.projection, width: W, height: H, rotate: st.rotate, ...(st.parallels ? { parallels: st.parallels } : {}) }, style: currentStyle(), opaque: false });
        const exactBmp = await createImageBitmap(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
        const read = (src: CanvasImageSource) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0); return x.getImageData(0, 0, W, H).data; };
        const a = read($('mapGpu') as HTMLCanvasElement), b = read(exactBmp);
        const diffs: number[] = [];
        let inside = 0, mismatch = 0, over8 = 0, max = 0, sum = 0;
        for (let i = 0; i < W * H; i++) {
          const ia = a[4 * i + 3]! > 127, ib = b[4 * i + 3]! > 127;
          if (ia !== ib) { mismatch++; continue; }
          if (!ia) continue;
          inside++;
          const d = Math.max(Math.abs(a[4 * i]! - b[4 * i]!), Math.abs(a[4 * i + 1]! - b[4 * i + 1]!), Math.abs(a[4 * i + 2]! - b[4 * i + 2]!));
          diffs.push(d); sum += d; max = Math.max(max, d); if (d > 8) over8++;
        }
        diffs.sort((x, y) => x - y);
        return { w: W, h: H, inside, mean: sum / Math.max(1, inside), p99: diffs[Math.floor(0.99 * (diffs.length - 1))] ?? 0, max, over8: over8 / Math.max(1, inside), coverageMismatch: mismatch / (W * H) };
      },
    },
  };

  window.__edit = { state: () => editor.state() };

  window.__globe = {
    generate,
    generateInWorker,
    setLayer: async (id) => { sel.value = id; await paint(id); },
    layerHash: async (id) => {
      const layer = layers.find((l) => l.id === id)!;
      const data = await client.layers(layer.need);
      const arrays: TypedArray[] = layer.need.flatMap((n) => data[n]!);
      return sha256(arrays.map((a) => bytesOf(a)));
    },
    litFraction: () => globe?.litFraction() ?? 0,
    pixelSum: () => globe?.pixelSum() ?? 0,
    setFormerDraw: (former) => { globe?.setFormerDraw(former); },
    drawPath: () => globe?.drawPath ?? 'former',
    layers: layers.map((l) => l.id),
  };
}
