// World <-> file map in the §5 layout. Original shell code.
import { EntityTable, type TableChunks, type TableSpec } from '../entities/table';
import { sha256 } from '../hash';
import { type LayerDescriptor, LayerRegistry } from '../layers/registry';
import { type ChangeRuns, TimeVaryingLayer } from '../layers/time-varying';
import { SphereMesh, buildTopology, type Precision } from '../mesh/sphere-mesh';
import { RngService, type MasterSeed } from '../rng/service';
import type { SerializedStream } from '../rng/types';
import { EventLog, type GameEvent } from '../timeline/event-log';
import { Timeline, type TimelineJSON } from '../timeline/timeline';
import { type Dtype, type TypedArray, arrayFromBytes, bytesOf, canonicalJson, dtypeOf } from '../typed';
import { World, type Checkpoint, type PipelineState, type WorldManifest, type WorldParams } from '../world';
import { gunzipSync, gzipSync } from 'fflate';
import type { FileMap } from './migrations';

export interface ChunkEntry {
  path: string;
  dtype: Dtype | 'json' | 'ndjson.gz';
  shape: number[];
  unit?: string;
  sha256: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const json = (v: unknown): Uint8Array => enc.encode(canonicalJson(v));
const parse = <T>(files: FileMap, path: string): T => JSON.parse(dec.decode(need(files, path))) as T;
function need(files: FileMap, path: string): Uint8Array {
  const f = files.get(path);
  if (!f) throw new Error(`save file missing: ${path}`);
  return f;
}

/** Everything except manifest.json. */
export function worldToFiles(w: World): { files: FileMap; units: Map<string, string> } {
  const files: FileMap = new Map();
  const units = new Map<string, string>();
  const putArr = (path: string, a: TypedArray, unit?: string) => {
    files.set(path, bytesOf(a));
    if (unit) units.set(path, unit);
  };

  files.set('params.json', json(w.params));
  files.set('planet.json', json(w.planet));
  files.set('rng.json', json({ master: w.params.masterSeed, streams: w.rng.serialize() }));

  for (const [id, rec] of [...w.meshes].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    files.set(`mesh/${id}/meta.json`, json({ numRegions: rec.mesh.numRegions, precision: rec.mesh.precision, parent: rec.parent ?? null, patchSpec: rec.patchSpec ?? null, hasParentOf: !!rec.parentOf }));
    putArr(`mesh/${id}/points.f64`, rec.mesh.points);
    putArr(`mesh/${id}/triangles.i32`, rec.mesh.triangles);
    putArr(`mesh/${id}/halfedges.i32`, rec.mesh.halfedges);
    if (rec.parentOf) putArr(`mesh/${id}/parentOf.i32`, rec.parentOf);
  }

  files.set('layers/descriptors.json', json(w.registry.toJSON()));
  for (const key of w.layers.keys()) {
    const [meshId, ...rest] = key.split('/');
    const arrayId = rest.join('/');
    const a = w.layers.get(meshId!, arrayId);
    const layer = w.registry.list().find((d) => d.id === arrayId || arrayId.startsWith(d.id + '.'));
    putArr(`layers/${meshId}/${arrayId}.${dtypeOf(a)}`, a, layer?.unit);
  }

  for (const [name, t] of [...w.entities].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const c = t.toChunks();
    const root = `${c.spec.agent ? 'agents' : 'entities'}/${name}`;
    files.set(`${root}/schema.json`, json({ spec: c.spec, nextId: c.nextId, length: c.length }));
    putArr(`${root}/_id.i32`, c.ids);
    putArr(`${root}/_validFrom.f64`, c.validFrom);
    putArr(`${root}/_validTo.f64`, c.validTo);
    for (const col of Object.keys(c.data).sort()) putArr(`${root}/${col}.${c.spec.columns[col]}`, c.data[col]!);
  }

  files.set('pipeline.json', json({ pipeline: w.pipeline, checkpoint: w.checkpoint ? { stageId: w.checkpoint.stageId, meta: w.checkpoint.meta, chunks: Object.keys(w.checkpoint.chunks).sort() } : null }));
  if (w.checkpoint) for (const [n, a] of Object.entries(w.checkpoint.chunks)) putArr(`pipeline/checkpoint/${n}.${dtypeOf(a)}`, a);

  files.set('timeline/timeline.json', json(w.timeline.toJSON()));
  const tv = [...w.timeVarying].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  files.set('timeline/tv.json', json(tv.map(([key, l]) => ({ key, axis: l.axis, keyframeEvery: l.keyframeEvery, startStep: l.startStep, dtype: l.dtype, n: l.current.length, keyframes: [...l.keyframes.keys()].sort((x, y) => x - y) }))));
  for (const [key, l] of tv) {
    putArr(`timeline/current/${key}.${l.dtype}`, l.current);
    for (const [s, a] of l.keyframes) putArr(`timeline/keyframes/${s}/${key}.${l.dtype}`, a);
    const r = l.runs();
    putArr(`timeline/changes/${key}.time.f64`, r.time);
    putArr(`timeline/changes/${key}.cell.i32`, r.cell);
    putArr(`timeline/changes/${key}.count.i32`, r.count);
    putArr(`timeline/changes/${key}.old.${l.dtype}`, r.old);
    putArr(`timeline/changes/${key}.new.${l.dtype}`, r.next);
  }
  files.set('timeline/events/index.json', json({ chunkTicks: w.events.chunkTicks, chunks: [...w.events.chunks().keys()].sort((a, b) => a - b), count: w.events.length }));
  for (const [k, evs] of w.events.chunks()) {
    const nd = evs.map((e) => canonicalJson(e)).join('\n');
    files.set(`timeline/events/${k}.ndjson.gz`, gzipSync(enc.encode(nd), { level: 6, mtime: 0 }));
  }
  if (w.ui !== undefined) files.set('ui.json', json(w.ui));
  return { files, units };
}

function extToDtype(path: string): ChunkEntry['dtype'] {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.ndjson.gz')) return 'ndjson.gz';
  return path.slice(path.lastIndexOf('.') + 1) as Dtype;
}

const BYTES: Record<Dtype, number> = { f32: 4, f64: 8, i32: 4, u32: 4, u16: 2, u8: 1 };

export async function chunkTable(files: FileMap, units: Map<string, string>): Promise<ChunkEntry[]> {
  const out: ChunkEntry[] = [];
  for (const path of [...files.keys()].sort()) {
    if (path === 'manifest.json') continue;
    const dtype = extToDtype(path);
    const bytes = files.get(path)!;
    const e: ChunkEntry = { path, dtype, shape: [dtype === 'json' || dtype === 'ndjson.gz' ? bytes.length : bytes.length / BYTES[dtype]], sha256: await sha256(bytes) };
    const u = units.get(path);
    if (u) e.unit = u;
    out.push(e);
  }
  return out;
}

/** One hash for the whole world state, independent of manifest timestamps and the zip container. */
export async function hashWorld(w: World): Promise<string> {
  const { files, units } = worldToFiles(w);
  const table = await chunkTable(files, units);
  return sha256(enc.encode(canonicalJson(table.map((t) => [t.path, t.sha256]))));
}

const arr = (files: FileMap, path: string): TypedArray => arrayFromBytes(extToDtype(path) as Dtype, need(files, path));

export function filesToWorld(files: FileMap, manifest: WorldManifest): World {
  const params = parse<WorldParams>(files, 'params.json');
  const tj = parse<TimelineJSON>(files, 'timeline/timeline.json');
  const w = new World({ params, manifest, timeline: Timeline.fromJSON(tj) });
  w.planet = parse(files, 'planet.json');
  const rng = parse<{ master: MasterSeed; streams: SerializedStream[] }>(files, 'rng.json');
  w.rng = RngService.restore(rng.master, rng.streams);

  const meshIds = new Set<string>();
  for (const p of files.keys()) if (p.startsWith('mesh/') && p.endsWith('/meta.json')) meshIds.add(p.split('/')[1]!);
  for (const id of [...meshIds].sort()) {
    const meta = parse<{ numRegions: number; precision: Precision; parent: string | null; patchSpec: unknown; hasParentOf: boolean }>(files, `mesh/${id}/meta.json`);
    const tri = arr(files, `mesh/${id}/triangles.i32`) as Int32Array, he = arr(files, `mesh/${id}/halfedges.i32`) as Int32Array;
    const mesh = new SphereMesh(arr(files, `mesh/${id}/points.f64`) as Float64Array, buildTopology(tri, he, meta.numRegions), meta.precision);
    const rec: { id: string; mesh: SphereMesh; parent?: string; parentOf?: Int32Array; patchSpec?: unknown } = { id, mesh };
    if (meta.parent) rec.parent = meta.parent;
    if (meta.hasParentOf) rec.parentOf = arr(files, `mesh/${id}/parentOf.i32`) as Int32Array;
    if (meta.patchSpec !== null) rec.patchSpec = meta.patchSpec;
    w.meshes.set(id, rec);
  }

  w.registry = LayerRegistry.fromJSON(parse<LayerDescriptor[]>(files, 'layers/descriptors.json'));
  w.layers = new (w.layers.constructor as new (r: LayerRegistry) => typeof w.layers)(w.registry);
  for (const p of [...files.keys()].sort()) {
    if (!p.startsWith('layers/') || p === 'layers/descriptors.json') continue;
    const [, meshId, ...rest] = p.split('/');
    const file = rest.join('/');
    const arrayId = file.slice(0, file.lastIndexOf('.'));
    w.layers.set(meshId!, arrayId, arr(files, p));
  }

  for (const p of [...files.keys()].sort()) {
    const m = /^(entities|agents)\/([^/]+)\/schema\.json$/.exec(p);
    if (!m) continue;
    const root = `${m[1]}/${m[2]}`;
    const s = parse<{ spec: TableSpec; nextId: number; length: number }>(files, p);
    const data: Record<string, TypedArray> = {};
    for (const col of Object.keys(s.spec.columns)) data[col] = arr(files, `${root}/${col}.${s.spec.columns[col]}`);
    const chunks: TableChunks = {
      spec: s.spec, nextId: s.nextId, length: s.length, data,
      ids: arr(files, `${root}/_id.i32`) as Int32Array, validFrom: arr(files, `${root}/_validFrom.f64`) as Float64Array, validTo: arr(files, `${root}/_validTo.f64`) as Float64Array,
    };
    w.entities.set(s.spec.name, EntityTable.fromChunks(chunks));
  }

  const pl = parse<{ pipeline: PipelineState; checkpoint: { stageId: string; meta: unknown; chunks: string[] } | null }>(files, 'pipeline.json');
  w.pipeline = pl.pipeline;
  if (pl.checkpoint) {
    const cp: Checkpoint = { stageId: pl.checkpoint.stageId, meta: pl.checkpoint.meta, chunks: {} };
    for (const n of pl.checkpoint.chunks) {
      const path = [...files.keys()].find((f) => f.startsWith(`pipeline/checkpoint/${n}.`));
      if (!path) throw new Error(`checkpoint chunk missing: ${n}`);
      cp.chunks[n] = arr(files, path);
    }
    w.checkpoint = cp;
  }

  const tvIndex = parse<{ key: string; axis: 'geo' | 'history'; keyframeEvery: number; startStep: number; dtype: Dtype; n: number; keyframes: number[] }[]>(files, 'timeline/tv.json');
  for (const t of tvIndex) {
    const kfs = new Map<number, TypedArray>();
    for (const s of t.keyframes) kfs.set(s, arr(files, `timeline/keyframes/${s}/${t.key}.${t.dtype}`));
    const runs: ChangeRuns = {
      time: arr(files, `timeline/changes/${t.key}.time.f64`) as Float64Array, cell: arr(files, `timeline/changes/${t.key}.cell.i32`) as Int32Array,
      count: arr(files, `timeline/changes/${t.key}.count.i32`) as Int32Array, old: arr(files, `timeline/changes/${t.key}.old.${t.dtype}`), next: arr(files, `timeline/changes/${t.key}.new.${t.dtype}`),
    };
    w.timeVarying.set(t.key, TimeVaryingLayer.restore(t.key, t.axis, arr(files, `timeline/current/${t.key}.${t.dtype}`), t.keyframeEvery, t.startStep, kfs, runs));
  }

  const ei = parse<{ chunkTicks: number; chunks: number[]; count: number }>(files, 'timeline/events/index.json');
  const events: GameEvent[] = [];
  for (const k of ei.chunks) {
    const text = dec.decode(gunzipSync(need(files, `timeline/events/${k}.ndjson.gz`)));
    for (const line of text.split('\n')) if (line) events.push(JSON.parse(line) as GameEvent);
  }
  w.events = EventLog.fromEvents(events, ei.chunkTicks);
  if (events.length !== ei.count) throw new Error('event count mismatch');
  if (files.has('ui.json')) w.ui = parse(files, 'ui.json');
  return w;
}
