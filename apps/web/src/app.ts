// Globe app: generate an orogen world in the engine worker, show it on the globe, pick layers, time the stages.
import { type TypedArray, bytesOf, sha256 } from '@mapmaker/core';
import { EngineClient, type PortLike, type WorldStats } from '@mapmaker/engine';
import { Globe } from './globe/globe';
import { FlatMap, type MapState } from './flat/flat-map';
import type { HeightmapArgs } from '@mapmaker/projection/exact/kernels';
import { type MapUi, startMapUi } from './flat/map-ui';
import { type DebugMode, ProjectionView, type ViewOptions } from '@mapmaker/projection';
import { RAW_ELEVATION, makeLayers } from './globe/colors';
import { SETTING_GROUPS, SETTINGS, changedParams, decodeState, encodeState } from './settings';

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
  ui: Pick<MapUi, 'state' | 'rendered'> & { exportHeightmap(): Promise<{ sha256: string; args: HeightmapArgs }>; exportSvg(): Promise<string>; overlayPaths(): number };
}

declare global { interface Window { __globe?: GlobeHook; __flat?: FlatHook } }

/** Builds the World settings panel and returns a reader of the current slider values. */
function buildSettings(initial: Record<string, number>, onChange: () => void): { values(): Record<string, number>; reset(): void } {
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
  return {
    values: () => Object.fromEntries(SETTINGS.map((st) => [st.key, Number(inputs.get(st.key)!.value)])),
    reset: () => { for (const st of SETTINGS) { const i = inputs.get(st.key)!; i.value = String(st.def); i.dispatchEvent(new Event('input')); } },
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
  $('resetSettings').addEventListener('click', () => settings.reset());
  $('copyLink').addEventListener('click', () => {
    syncUrl();
    navigator.clipboard.writeText(location.href).then(() => { $('linkStatus').textContent = 'link copied'; },
      () => { $('linkStatus').textContent = location.href; });
  });

  const status = $('status');
  let busy = false;

  async function paint(id: string): Promise<void> {
    const layer = layers.find((l) => l.id === id)!;
    const data = await client.layers(layer.need);
    if (globe) { layer.paint(data, globe.colors); globe.colorsChanged(); }
    flat.setLayer(layer.flat(data));
    ui.layerChanged();
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
      const mesh = await client.meshData();
      globe?.setMesh(mesh);
      flat.setWorld(mesh);
      ui.worldChanged();
      await paint(sel.value);
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
    },
  };

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
    layers: layers.map((l) => l.id),
  };
}
