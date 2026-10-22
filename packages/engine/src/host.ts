// Engine worker host: owns the World during generation and runs the stage runner (ARCHITECTURE §6.1).
// Works with any PortLike: a browser DedicatedWorkerGlobalScope, a Node worker_threads port, or a MessagePort.
import { type TypedArray, type World, arrayIds, cellExecutor, dmath, hashWorld, isSharedArray, loadWorld, saveWorld, setCellExecutor, setSharedAllocation } from '@mapmaker/core';
import { ParallelCells, canBlock, serveCells } from './cells';
import { type PoolPort, WorkerPool, defaultPoolSize } from './pool';
import type { EditState, MeshData, PortLike, Request, Response, RunSummary, SystemInfo, WorldStats } from './protocol';
import { staleStages } from './stale';
import { resolveVariant } from './runner';
import { runPipeline } from './runner';
import type { CancelFlag, Stage } from './stage';

const surrendered = new WeakMap<object, ArrayBufferLike[]>();

/**
 * Marks buffers anywhere inside a world kernel's result as handed over to the page: the host transfers them (no structured
 * clone, no copy on arrival). The kernel must not use them afterwards, so they are copies, never cached arrays.
 */
export function withTransfer<T extends object>(value: T, buffers: ArrayBufferLike[]): T {
  surrendered.set(value, buffers);
  return value;
}

export interface HostOptions {
  stages: Stage[];
  /** Engine fingerprint written to the save's determinism profile. */
  engine: string;
  /** Data-parallel kernels callable through the pool. Must be pure functions of their arguments. */
  kernels?: Record<string, (args: never) => unknown>;
  /**
   * Functions of the loaded World, callable with the `worldKernel` op. They must not modify the World (views and
   * exports: a World hash guard test covers the projection kernels).
   */
  worldKernels?: Record<string, (world: World, args: never) => unknown>;
  /** Builds a fresh world from request params (the `create` op). */
  create?: (params: unknown) => World;
  /**
   * Per-cell kernels in a worker pool (cells.ts, decision PK1). Used only where shared memory is available and this
   * thread may block (a cross-origin isolated page's worker, Node); elsewhere every kernel runs in this thread.
   */
  pool?: { create: () => PoolPort; size?: number; chunk?: number };
}

export function attachHost(port: PortLike, opts: HostOptions): void {
  let world: World | undefined;
  let cancel: CancelFlag = { aborted: false };
  const stageVersions = Object.fromEntries(opts.stages.map((s) => [s.id, s.version]));
  const send = (m: Response, transfer?: Transferable[]) => port.postMessage(m, transfer);

  // The pool starts with the first run and lives as long as this host. Shared allocation is switched on before any
  // world is built, so its layers can be handed to the pool without a copy.
  const poolOn = !!opts.pool && canBlock() && setSharedAllocation(true);
  let pool: Promise<void> | undefined;
  const startPool = (): Promise<void> => pool ??= (async () => {
    const p = new WorkerPool(opts.pool!.create, opts.pool!.size ?? defaultPoolSize());
    await p.ready();
    setCellExecutor(new ParallelCells(p, { ...(opts.pool!.chunk ? { chunk: opts.pool!.chunk } : {}) }));
  })();

  port.onmessage = (e) => {
    const req = e.data as Request;
    if (req.op === 'cancel') { cancel.aborted = true; return; }
    if (req.op === 'cells') { serveCells(req); return; }
    void handle(req).catch((err: unknown) => send({ id: req.id, op: 'error', message: err instanceof Error ? err.message : String(err) }));
  };

  async function handle(req: Exclude<Request, { op: 'cancel' }>): Promise<void> {
    switch (req.op) {
      case 'load': {
        const r = await loadWorld(req.bytes, { stageVersions });
        world = r.world;
        send({ id: req.id, op: 'result', value: { viewOnly: r.viewOnly, staleStages: r.staleStages, tick: world.timeline.tick } });
        return;
      }
      case 'run': {
        if (!world) throw new Error('no world loaded');
        if (poolOn) await startPool();
        cancel = { aborted: false };
        let n = 0;
        const w = world;
        const pending: Promise<void>[] = [];
        const res = await runPipeline(w, opts.stages, {
          ...(req.variant ? { variant: req.variant } : {}),
          ...(req.only ? { only: req.only } : {}),
          ...(req.from ? { from: req.from } : {}),
          ...(req.strict !== undefined ? { strict: req.strict } : {}),
          signal: cancel,
          onProgress: (p) => {
            send({ id: req.id, op: 'progress', stageId: p.stageId, fraction: p.fraction, ...(p.message !== undefined ? { message: p.message } : {}) });
            if (req.checkpointEvery && ++n % req.checkpointEvery === 0) {
              pending.push(saveWorld(w, { engine: opts.engine }).then((bytes) => send({ id: req.id, op: 'checkpoint', bytes }, [bytes.buffer as ArrayBuffer])));
            }
          },
        });
        await Promise.all(pending); // checkpoints must arrive before the result closes the request
        const ex = cellExecutor();
        if (ex instanceof ParallelCells) ex.release();
        send({ id: req.id, op: 'result', value: res satisfies RunSummary });
        return;
      }
      case 'snapshot': {
        if (!world) throw new Error('no world loaded');
        const bytes = await saveWorld(world, { engine: opts.engine });
        send({ id: req.id, op: 'result', value: bytes }, [bytes.buffer as ArrayBuffer]);
        return;
      }
      case 'hash': {
        if (!world) throw new Error('no world loaded');
        send({ id: req.id, op: 'result', value: await hashWorld(world) });
        return;
      }
      case 'create': {
        if (!opts.create) throw new Error('this host cannot create worlds');
        world = opts.create(req.params);
        cancel = { aborted: false };
        send({ id: req.id, op: 'result', value: { viewOnly: false } });
        return;
      }
      case 'layers': {
        if (!world) throw new Error('no world loaded');
        const meshId = req.mesh ?? 'global';
        const out: Record<string, TypedArray[]> = {};
        const transfer: Transferable[] = [];
        for (const id of req.ids) {
          out[id] = arrayIds(world.registry.get(id)).map((a) => { const c = world!.layers.get(meshId, a).slice(); transfer.push(c.buffer as ArrayBuffer); return c; });
        }
        send({ id: req.id, op: 'result', value: out }, transfer);
        return;
      }
      case 'meshdata': {
        if (!world) throw new Error('no world loaded');
        const m = world.meshes.get(req.mesh ?? 'global');
        if (!m) throw new Error('no such mesh');
        const value: MeshData = { numRegions: m.mesh.numRegions, precision: m.mesh.precision, points: m.mesh.points.slice(), triangles: m.mesh.triangles.slice(), halfedges: m.mesh.halfedges.slice() };
        send({ id: req.id, op: 'result', value }, [value.points.buffer as ArrayBuffer, value.triangles.buffer as ArrayBuffer, value.halfedges.buffer as ArrayBuffer]);
        return;
      }
      case 'edit': {
        if (!world) throw new Error('no world loaded');
        const log = world.edits;
        if (req.action === 'append') for (const d of req.edits) log.append(d, req.now ?? '');
        else if (req.action === 'undo') log.undo();
        else if (req.action === 'redo') log.redo();
        else if (req.action === 'clear') log.clear();
        const n = log.cursor;
        const value: EditState = {
          cursor: n, length: log.length, canUndo: log.canUndo, canRedo: log.canRedo,
          edits: log.all().map((e, i) => ({ id: e.id, op: e.op, target: e.target.kind === 'layer' ? e.target.id : e.target.kind === 'param' ? e.target.key : e.target.kind, mode: e.mode, ...(e.gesture !== undefined ? { gesture: e.gesture } : {}), active: i < n, ...(e.label ? { label: e.label } : {}) })),
        };
        send({ id: req.id, op: 'result', value });
        return;
      }
      case 'systems': {
        if (!world) throw new Error('no world loaded');
        if (req.set) {
          const known = new Map(opts.stages.map((s) => [s.id, s]));
          for (const [id, mode] of Object.entries(req.set)) {
            const s = known.get(id);
            if (!s) throw new Error(`unknown stage: ${id}`);
            if (mode !== 'simulate' && s.switchable === false) throw new Error(`${id} is structure, not a system`);
          }
          world.systems = Object.fromEntries(Object.entries(req.set).filter(([, m]) => m !== 'simulate'));
        }
        const value: SystemInfo[] = resolveVariant(opts.stages, world.pipeline.variant).map((s) => ({ stageId: s.id, switchable: s.switchable !== false, mode: world!.systems[s.id] ?? 'simulate' }));
        send({ id: req.id, op: 'result', value });
        return;
      }
      case 'stale': {
        if (!world) throw new Error('no world loaded');
        send({ id: req.id, op: 'result', value: await staleStages(world, opts.stages, req.variant ?? world.pipeline.variant) });
        return;
      }
      case 'stats': {
        if (!world) throw new Error('no world loaded');
        let meshBytes = 0, layerBytes = 0;
        for (const m of world.meshes.values()) meshBytes += m.mesh.points.byteLength + m.mesh.triangles.byteLength + m.mesh.halfedges.byteLength + m.mesh.adjList.byteLength + m.mesh.adjOffset.byteLength + m.mesh.adjTriList.byteLength;
        const keys = world.layers.keys();
        for (const k of keys) { const i = k.indexOf('/'); layerBytes += world.layers.get(k.slice(0, i), k.slice(i + 1)).byteLength; }
        const ex = cellExecutor();
        const value: WorldStats = { meshBytes, layerBytes, layerArrays: keys.length, dmath: dmath.mode, kernelWorkers: ex instanceof ParallelCells ? ex.workers : 0, kernelCalls: ex instanceof ParallelCells ? ex.calls : 0 };
        send({ id: req.id, op: 'result', value });
        return;
      }
      case 'kernel': {
        const k = req.name === 'engine.ping' ? () => true : opts.kernels?.[req.name];
        if (!k) throw new Error(`unknown kernel: ${req.name}`);
        send({ id: req.id, op: 'result', value: await k(req.args as never) });
        return;
      }
      case 'worldKernel': {
        if (!world) throw new Error('no world loaded');
        const k = opts.worldKernels?.[req.name];
        if (!k) throw new Error(`unknown world kernel: ${req.name}`);
        const value = await k(world, req.args as never);
        // Typed arrays in the result (top level, or one level down in a plain object) are transferred.
        const transfer: Transferable[] = [];
        // A SharedArrayBuffer cannot be transferred (it is shared by the clone instead).
        const take = (v: unknown) => { if (ArrayBuffer.isView(v) && !isSharedArray(v) && !transfer.includes(v.buffer as ArrayBuffer)) transfer.push(v.buffer as ArrayBuffer); };
        if (ArrayBuffer.isView(value)) take(value);
        else if (value && typeof value === 'object') {
          for (const v of Object.values(value)) take(v);
          // Buffers the kernel gave up explicitly, however deep in the result (see `withTransfer`).
          for (const b of surrendered.get(value) ?? []) if (b instanceof ArrayBuffer && !transfer.includes(b)) transfer.push(b);
        }
        send({ id: req.id, op: 'result', value }, transfer.length ? transfer : undefined);
        return;
      }
    }
  }
}
