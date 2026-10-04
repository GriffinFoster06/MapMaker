// Globe app: generate an orogen world in the engine worker, show it on the globe, pick layers, time the stages.
import { type TypedArray, bytesOf, sha256 } from '@mapmaker/core';
import { EngineClient, type PortLike, type WorldStats } from '@mapmaker/engine';
import { Globe } from './globe/globe';
import { LAYERS } from './globe/colors';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const TIERS: Record<string, number> = { '20k': 20_000, '50k': 50_000, '200k': 200_000, '500k': 500_000, '1M': 1_000_000, '2.56M': 2_560_000 };

export interface GlobeHook {
  /** Resolves when the first generation finished and the globe shows a layer. */
  generate(opts: { N: number; seed: number }): Promise<{ stages: Record<string, number>; totalMs: number; stats: WorldStats }>;
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
  for (const l of LAYERS) sel.add(new Option(l.label, l.id));
  const tier = $<HTMLSelectElement>('tier');
  for (const k of Object.keys(TIERS)) tier.add(new Option(`${k} cells`, k));
  tier.value = '50k';

  const status = $('status');
  let busy = false;

  async function paint(id: string): Promise<void> {
    const layer = LAYERS.find((l) => l.id === id)!;
    const data = await client.layers(layer.need);
    layer.paint(data, globe.colors);
    globe.colorsChanged();
  }

  async function generate(opts: { N: number; seed: number }) {
    if (busy) throw new Error('already generating');
    busy = true;
    try {
      const t0 = performance.now();
      const stages: Record<string, number> = {};
      let cur = '', curStart = t0;
      const close = (t: number) => { if (cur) stages[cur] = (stages[cur] ?? 0) + (t - curStart); };
      await client.create({ N: opts.N, seed: opts.seed });
      status.textContent = 'generating…';
      await client.run({
        strict: false,
        onProgress: (p) => {
          const t = performance.now();
          if (p.stageId !== cur) { close(t); cur = p.stageId; curStart = t; }
          status.textContent = `${p.stageId}${p.message ? ': ' + p.message : ''}`;
        },
      });
      const tEnd = performance.now();
      close(tEnd);
      globe.setMesh(await client.meshData());
      await paint(sel.value);
      const stats = await client.stats();
      const totalMs = performance.now() - t0;
      status.textContent = `${opts.N.toLocaleString()} cells in ${(totalMs / 1000).toFixed(1)} s`;
      $('timing').textContent = Object.entries(stages).map(([k, v]) => `${k.padEnd(18)} ${(v / 1000).toFixed(2)} s`).join('\n') +
        `\nworking set        ${((stats.layerBytes + stats.meshBytes) / 1e6).toFixed(0)} MB (${stats.layerArrays} layer arrays)`;
      return { stages, totalMs, stats };
    } finally { busy = false; }
  }

  $('generate').addEventListener('click', () => {
    generate({ N: TIERS[tier.value]!, seed: Number($<HTMLInputElement>('seed').value) || 12345 }).catch((e: unknown) => { status.textContent = `error: ${e instanceof Error ? e.message : String(e)}`; });
  });
  sel.addEventListener('change', () => { void paint(sel.value); });

  window.__globe = {
    generate,
    setLayer: async (id) => { sel.value = id; await paint(id); },
    layerHash: async (id) => {
      const layer = LAYERS.find((l) => l.id === id)!;
      const data = await client.layers(layer.need);
      const arrays: TypedArray[] = layer.need.flatMap((n) => data[n]!);
      return sha256(arrays.map((a) => bytesOf(a)));
    },
    litFraction: () => globe.litFraction(),
    pixelSum: () => globe.pixelSum(),
    layers: LAYERS.map((l) => l.id),
  };
}
