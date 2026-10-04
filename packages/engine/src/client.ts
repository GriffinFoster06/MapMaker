import type { PortLike, Request, Response, RunSummary } from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: { stageId: string; fraction: number; message?: string }) => void; onCheckpoint?: (b: Uint8Array) => void };

/** Main-thread side of the engine protocol. */
export class EngineClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly port: PortLike) {
    port.onmessage = (e) => {
      const m = e.data as Response;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.op === 'progress') p.onProgress?.({ stageId: m.stageId, fraction: m.fraction, ...(m.message !== undefined ? { message: m.message } : {}) });
      else if (m.op === 'checkpoint') p.onCheckpoint?.(m.bytes);
      else {
        this.pending.delete(m.id);
        if (m.op === 'error') p.reject(new Error(m.message)); else p.resolve(m.value);
      }
    };
  }

  private call<T>(req: (id: number) => Request, extra: Partial<Pending> = {}, transfer?: Transferable[]): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, ...extra });
      this.port.postMessage(req(id), transfer);
    });
  }

  /** Transfers a copy, so the caller's buffer stays usable. */
  load(bytes: Uint8Array): Promise<{ viewOnly: boolean; staleStages: string[]; tick: number }> {
    const copy = bytes.slice();
    return this.call((id) => ({ id, op: 'load', bytes: copy }), {}, [copy.buffer as ArrayBuffer]);
  }

  run(opts: { variant?: string; only?: string[]; checkpointEvery?: number; onProgress?: Pending['onProgress']; onCheckpoint?: Pending['onCheckpoint'] } = {}): Promise<RunSummary> {
    const { onProgress, onCheckpoint, ...rest } = opts;
    return this.call((id) => ({ id, op: 'run', ...rest }), { ...(onProgress ? { onProgress } : {}), ...(onCheckpoint ? { onCheckpoint } : {}) });
  }

  cancel(): void { this.port.postMessage({ op: 'cancel' } satisfies Request); }
  snapshot(): Promise<Uint8Array> { return this.call((id) => ({ id, op: 'snapshot' })); }
  hash(): Promise<string> { return this.call((id) => ({ id, op: 'hash' })); }
  kernel<T>(name: string, args: unknown): Promise<T> { return this.call((id) => ({ id, op: 'kernel', name, args })); }
}
