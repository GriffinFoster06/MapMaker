// Engine worker host: owns the World during generation and runs the stage runner (ARCHITECTURE §6.1).
// Works with any PortLike: a browser DedicatedWorkerGlobalScope, a Node worker_threads port, or a MessagePort.
import { type TypedArray, type World, arrayIds, dmath, hashWorld, loadWorld, saveWorld } from '@mapmaker/core';
import type { MeshData, PortLike, Request, Response, RunSummary, WorldStats } from './protocol';
import { runPipeline } from './runner';
import type { CancelFlag, Stage } from './stage';

export interface HostOptions {
  stages: Stage[];
  /** Engine fingerprint written to the save's determinism profile. */
  engine: string;
  /** Data-parallel kernels callable through the pool. Must be pure functions of their arguments. */
  kernels?: Record<string, (args: never) => unknown>;
  /** Builds a fresh world from request params (the `create` op). */
  create?: (params: unknown) => World;
}

export function attachHost(port: PortLike, opts: HostOptions): void {
  let world: World | undefined;
  let cancel: CancelFlag = { aborted: false };
  const stageVersions = Object.fromEntries(opts.stages.map((s) => [s.id, s.version]));
  const send = (m: Response, transfer?: Transferable[]) => port.postMessage(m, transfer);

  port.onmessage = (e) => {
    const req = e.data as Request;
    if (req.op === 'cancel') { cancel.aborted = true; return; }
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
        cancel = { aborted: false };
        let n = 0;
        const w = world;
        const pending: Promise<void>[] = [];
        const res = await runPipeline(w, opts.stages, {
          ...(req.variant ? { variant: req.variant } : {}),
          ...(req.only ? { only: req.only } : {}),
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
      case 'stats': {
        if (!world) throw new Error('no world loaded');
        let meshBytes = 0, layerBytes = 0;
        for (const m of world.meshes.values()) meshBytes += m.mesh.points.byteLength + m.mesh.triangles.byteLength + m.mesh.halfedges.byteLength + m.mesh.adjList.byteLength + m.mesh.adjOffset.byteLength + m.mesh.adjTriList.byteLength;
        const keys = world.layers.keys();
        for (const k of keys) { const i = k.indexOf('/'); layerBytes += world.layers.get(k.slice(0, i), k.slice(i + 1)).byteLength; }
        const value: WorldStats = { meshBytes, layerBytes, layerArrays: keys.length, dmath: dmath.mode };
        send({ id: req.id, op: 'result', value });
        return;
      }
      case 'kernel': {
        const k = opts.kernels?.[req.name];
        if (!k) throw new Error(`unknown kernel: ${req.name}`);
        send({ id: req.id, op: 'result', value: await k(req.args as never) });
        return;
      }
    }
  }
}
