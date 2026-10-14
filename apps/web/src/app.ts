// Globe app: generate an orogen world in the engine worker, show it on the globe, pick layers, time the stages.
import { type TypedArray, bytesOf, sha256 } from '@mapmaker/core';
import { EngineClient, type PortLike, type WorldStats } from '@mapmaker/engine';
import { Globe } from './globe/globe';
import { RAW_ELEVATION, makeLayers } from './globe/colors';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const TIERS: Record<string, number> = { '20k': 20_000, '50k': 50_000, '200k': 200_000, '500k': 500_000, '1M': 1_000_000, '2.56M': 2_560_000 };
/** Preview tier shown first when a larger final is requested (Phase 4b: same seed, same reference world). */
export const PREVIEW_N = 50_000;
/** Pipeline variants: `structured` (Phase 4b, default) or stock orogen (`parity`, Phase 4a; debug). */
export type Variant = 'structured' | 'parity';

export interface GlobeHook {
  /** Resolves when the first generation finished and the globe shows a layer. */
  generate(opts: { N: number; seed: number; variant?: Variant }): Promise<{ stages: Record<string, number>; totalMs: number; stats: WorldStats }>;
  setLayer(id: string): Promise<void>;
  layerHash(id: string): Promise<string>;
  litFraction(): number;
  pixelSum(): number;
  layers: string[];
}

declare global { interface Window { __globe?: GlobeHook } }

export function startApp(): void {
  const worker = new Worker(new URL('./engine-worker.ts', import.meta.url), { type: 'module' });
  const client = new EngineClient(worker as unknown as PortLike);
  const globe = new Globe($<HTMLCanvasElement>('globe'));

  const sel = $<HTMLSelectElement>('layer');
  let variant: Variant = 'structured';
  let layers = makeLayers(RAW_ELEVATION[variant]!);
  for (const l of layers) sel.add(new Option(l.label, l.id));
  const pipelineSel = $<HTMLSelectElement>('pipeline');
  const tier = $<HTMLSelectElement>('tier');
  for (const k of Object.keys(TIERS)) tier.add(new Option(`${k} cells`, k));
  tier.value = '50k';

  const status = $('status');
  let busy = false;

  async function paint(id: string): Promise<void> {
    const layer = layers.find((l) => l.id === id)!;
    const data = await client.layers(layer.need);
    layer.paint(data, globe.colors);
    globe.colorsChanged();
  }

  async function generate(opts: { N: number; seed: number; variant?: Variant }, label = '') {
    if (busy) throw new Error('already generating');
    busy = true;
    try {
      variant = opts.variant ?? 'structured';
      layers = makeLayers(RAW_ELEVATION[variant]!);
      const t0 = performance.now();
      const stages: Record<string, number> = {};
      let cur = '', curStart = t0;
      const close = (t: number) => { if (cur) stages[cur] = (stages[cur] ?? 0) + (t - curStart); };
      await client.create({ N: opts.N, seed: opts.seed });
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
      globe.setMesh(await client.meshData());
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
    const N = TIERS[tier.value]!, seed = Number($<HTMLInputElement>('seed').value) || 12345;
    const v = pipelineSel.value as Variant;
    const previewFirst = v === 'structured' && $<HTMLInputElement>('preview').checked && N > PREVIEW_N;
    void (async () => {
      // Phase 4b: the preview is the final's structure at a lower resolution (same seed, same reference world), so it
      // is shown first and replaced by the final when that is ready.
      if (previewFirst) await generate({ N: PREVIEW_N, seed, variant: v }, 'preview: ');
      await generate({ N, seed, variant: v }, previewFirst ? 'final: ' : '');
    })().catch((e: unknown) => { status.textContent = `error: ${e instanceof Error ? e.message : String(e)}`; });
  });
  sel.addEventListener('change', () => { void paint(sel.value); });

  window.__globe = {
    generate,
    setLayer: async (id) => { sel.value = id; await paint(id); },
    layerHash: async (id) => {
      const layer = layers.find((l) => l.id === id)!;
      const data = await client.layers(layer.need);
      const arrays: TypedArray[] = layer.need.flatMap((n) => data[n]!);
      return sha256(arrays.map((a) => bytesOf(a)));
    },
    litFraction: () => globe.litFraction(),
    pixelSum: () => globe.pixelSum(),
    layers: layers.map((l) => l.id),
  };
}
