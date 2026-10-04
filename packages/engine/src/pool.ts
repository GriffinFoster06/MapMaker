import { EngineClient } from './client';
import type { PortLike } from './protocol';

export type PoolPort = PortLike & { terminate?: () => void | Promise<unknown> };

/** navigator.hardwareConcurrency - 1, at least 1 (ARCHITECTURE §6.1). */
export function defaultPoolSize(): number {
  const n = (globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency ?? 4;
  return Math.max(1, n - 1);
}

/** Worker pool for data-parallel kernels. Tasks queue until a worker is free; results keep input order. */
export class WorkerPool {
  private readonly workers: { port: PoolPort; client: EngineClient; busy: boolean }[];
  private readonly queue: (() => void)[] = [];

  constructor(create: () => PoolPort, readonly size = defaultPoolSize()) {
    this.workers = Array.from({ length: size }, () => {
      const port = create();
      return { port, client: new EngineClient(port), busy: false };
    });
  }

  private acquire(): Promise<(typeof this.workers)[number]> {
    return new Promise((resolve) => {
      const tryTake = () => {
        const w = this.workers.find((x) => !x.busy);
        if (!w) { this.queue.push(tryTake); return; }
        w.busy = true;
        resolve(w);
      };
      tryTake();
    });
  }

  async run<T>(name: string, args: unknown): Promise<T> {
    const w = await this.acquire();
    try {
      return await w.client.kernel<T>(name, args);
    } finally {
      w.busy = false;
      this.queue.shift()?.();
    }
  }

  map<T>(name: string, argsList: unknown[]): Promise<T[]> {
    return Promise.all(argsList.map((a) => this.run<T>(name, a)));
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.port.terminate?.()));
  }
}
