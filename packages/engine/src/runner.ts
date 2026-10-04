// Stage runner (ARCHITECTURE §4): variants, the one-producer check, input hashing, skipping, invalidation,
// mid-stage checkpoints and cooperative cancellation. Original shell code.
import { type EntityTable, type TableSpec, type TypedArray, type World, EntityTable as Table, arrayIds, hashString, canonicalJson } from '@mapmaker/core';
import { hashInputs, hashTable, snapshotHashes } from './hash-state';
import { CancelledError, type CancelFlag, type Stage, type StageContext } from './stage';

export interface RunOptions {
  variant?: string;
  signal?: CancelFlag;
  onProgress?: (e: { stageId: string; fraction: number; message?: string }) => void;
  /** Verify after each stage that nothing outside its declared writes changed. Default true. */
  strict?: boolean;
  /** Run only these stages (and skip the rest). Default all. */
  only?: string[];
}

export interface RunResult {
  ran: string[];
  skipped: string[];
  /** Set when a stage was cancelled; the world keeps its checkpoint so the run can resume. */
  cancelledAt?: string;
}

/** Stages taking part in `variant`, in order. */
export function resolveVariant(stages: Stage[], variant: string): Stage[] {
  return stages.filter((s) => !s.variants || s.variants.includes(variant));
}

/** Throws unless every layer written by a stage has exactly that stage as its producer in this variant. */
export function checkProducers(world: World, stages: Stage[], variant: string): void {
  const ids = new Set<string>();
  for (const s of stages) {
    if (ids.has(s.id)) throw new Error(`duplicate stage id: ${s.id}`);
    ids.add(s.id);
  }
  const writer = new Map<string, string>();
  for (const s of stages) {
    for (const w of s.writes) {
      if (w.startsWith('table:')) {
        const other = writer.get(w);
        if (other) throw new Error(`${w} is written by both ${other} and ${s.id} in variant ${variant}`);
        writer.set(w, s.id);
        continue;
      }
      if (!world.registry.has(w)) throw new Error(`stage ${s.id} writes unregistered layer ${w}`);
      const producer = world.registry.producerFor(w, variant);
      if (producer !== s.id) throw new Error(`layer ${w} has producer ${producer ?? 'none'} in variant ${variant}, but stage ${s.id} writes it`);
      const other = writer.get(w);
      if (other) throw new Error(`layer ${w} is written by both ${other} and ${s.id} in variant ${variant}`);
      writer.set(w, s.id);
    }
  }
  for (const s of stages) for (const r of s.reads) if (!r.startsWith('table:') && !world.registry.has(r)) throw new Error(`stage ${s.id} reads unregistered layer ${r}`);
}

const macrotask = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export async function runPipeline(world: World, allStages: Stage[], opts: RunOptions = {}): Promise<RunResult> {
  const variant = opts.variant ?? world.pipeline.variant;
  if (world.pipeline.variant !== variant) {
    // A different variant changes which stage produces which layer: nothing computed so far is trusted.
    world.pipeline = { variant, completed: [] };
  }
  const stages = resolveVariant(allStages, variant);
  checkProducers(world, stages, variant);
  const signal = opts.signal ?? { aborted: false };
  const strict = opts.strict ?? true;
  const only = opts.only ? new Set(opts.only) : undefined;
  const result: RunResult = { ran: [], skipped: [] };

  for (const stage of stages) {
    if (only && !only.has(stage.id)) continue;
    const mesh = stage.mesh ?? 'global';
    const inputHash = await hashInputs(world, stage);
    const done = world.pipeline.completed.find((r) => r.stageId === stage.id);
    if (done && done.version === stage.version && done.inputHash === inputHash) {
      result.skipped.push(stage.id);
      continue;
    }
    // Stale or never run. Later records stay: each stage's input hash covers what it reads, so a downstream stage
    // reruns only if this stage's output actually changed.
    const at = world.pipeline.completed.findIndex((r) => r.stageId === stage.id);
    if (at >= 0) world.pipeline.completed.splice(at, 1);
    for (const r of [...world.pipeline.completed]) if (!stages.some((s) => s.id === r.stageId)) world.pipeline.completed.splice(world.pipeline.completed.indexOf(r), 1);

    const writeKeys = (key: string): boolean => {
      if (key.startsWith('table:')) return stage.writes.includes(key);
      const arrayId = key.slice(key.indexOf('/') + 1);
      return stage.writes.some((w) => w === arrayId || arrayId.startsWith(w + '.'));
    };
    const before = strict ? await snapshotHashes(world, writeKeys) : {};

    const resume = world.checkpoint?.stageId === stage.id && world.pipeline.current?.stageId === stage.id ? world.checkpoint : undefined;
    if (!resume) { world.checkpoint = undefined; world.pipeline.current = undefined; }

    const ctx = makeContext(world, stage, mesh, signal, resume, opts);
    try {
      await stage.run(ctx);
    } catch (e) {
      if (e instanceof CancelledError) {
        world.pipeline.current = { stageId: stage.id };
        result.cancelledAt = stage.id;
        return result;
      }
      throw e;
    }
    world.pipeline.current = undefined;
    world.checkpoint = undefined;

    if (strict) {
      const after = await snapshotHashes(world, writeKeys);
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const k of keys) if (before[k] !== after[k]) throw new Error(`stage ${stage.id} modified ${k}, which it does not declare in writes`);
    }

    const outputHashes: Record<string, string> = {};
    for (const key of world.layers.keys()) if (writeKeys(key)) { const i = key.indexOf('/'); outputHashes[key] = await world.layers.hash(key.slice(0, i), key.slice(i + 1)); }
    for (const w of stage.writes) if (w.startsWith('table:')) { const t = world.entities.get(w.slice(6)); if (t) outputHashes[w] = await hashTable(t); }
    for (const w of stage.writes) {
      const tv = world.timeVarying.get(`${mesh}/${w}`);
      if (tv) outputHashes[`tv:${mesh}/${w}`] = await hashString(canonicalJson({ cur: Array.from(tv.current), kf: [...tv.keyframes.keys()] }));
    }
    const rec: { stageId: string; version: string; inputHash: string; outputHashes: Record<string, string>; referenceHash?: string } = { stageId: stage.id, version: stage.version, inputHash, outputHashes };
    if (stage.pass === 'D') {
      rec.referenceHash = await hashString(canonicalJson(world.pipeline.completed.filter((r) => stages.find((s) => s.id === r.stageId)?.pass === 'R').map((r) => [r.stageId, r.outputHashes])));
    }
    world.pipeline.completed.splice(at >= 0 ? at : world.pipeline.completed.length, 0, rec);
    world.manifest.stageVersions[stage.id] = stage.version;
    result.ran.push(stage.id);
  }
  return result;
}

function makeContext(world: World, stage: Stage, meshId: string, signal: CancelFlag, resume: StageContext['resume'], opts: RunOptions): StageContext {
  const canRead = (id: string) => stage.reads.includes(id) || stage.writes.includes(id);
  const throwIfCancelled = () => { if (signal.aborted) throw new CancelledError(); };
  const n = () => {
    const m = world.meshes.get(meshId);
    if (!m) throw new Error(`stage ${stage.id}: mesh ${meshId} not present`);
    return m.mesh.numRegions;
  };
  return {
    world, stage, meshId, signal, resume,
    progress: (fraction, message) => opts.onProgress?.({ stageId: stage.id, fraction, ...(message !== undefined ? { message } : {}) }),
    checkpoint: (meta, chunks = {}) => {
      world.pipeline.current = { stageId: stage.id };
      world.checkpoint = { stageId: stage.id, meta, chunks };
    },
    throwIfCancelled,
    async yield() { await macrotask(); throwIfCancelled(); },
    layer(layerId) {
      if (!canRead(layerId)) throw new Error(`stage ${stage.id} did not declare ${layerId} in reads`);
      return arrayIds(world.registry.get(layerId)).map((a) => world.layers.get(meshId, a));
    },
    writeLayer(layerId) {
      if (!stage.writes.includes(layerId)) throw new Error(`stage ${stage.id} did not declare ${layerId} in writes`);
      const d = world.registry.get(layerId);
      const ids = arrayIds(d);
      if (ids.every((a) => world.layers.has(meshId, a))) return ids.map((a) => world.layers.get(meshId, a));
      return world.layers.alloc(meshId, layerId, n()) as TypedArray[];
    },
    table(name: string, spec?: TableSpec): EntityTable {
      const key = `table:${name}`;
      if (!canRead(key)) throw new Error(`stage ${stage.id} did not declare ${key}`);
      let t = world.entities.get(name);
      if (!t) {
        if (!spec || !stage.writes.includes(key)) throw new Error(`table ${name} does not exist`);
        t = new Table(spec);
        world.addTable(t);
      }
      return t;
    },
  };
}
