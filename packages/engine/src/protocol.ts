// Typed worker protocol (ARCHITECTURE §6.1): run, progress, checkpoint, cancel, result. Original shell code.
export interface PortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export type Request =
  | { id: number; op: 'load'; bytes: Uint8Array }
  | { id: number; op: 'run'; variant?: string; only?: string[]; /** post a checkpoint snapshot every N progress events */ checkpointEvery?: number }
  | { id: number; op: 'snapshot' }
  | { id: number; op: 'hash' }
  | { id: number; op: 'kernel'; name: string; args: unknown }
  | { op: 'cancel' };

export type Response =
  | { id: number; op: 'result'; value: unknown }
  | { id: number; op: 'progress'; stageId: string; fraction: number; message?: string }
  | { id: number; op: 'checkpoint'; bytes: Uint8Array }
  | { id: number; op: 'error'; message: string };

export interface RunSummary { ran: string[]; skipped: string[]; cancelledAt?: string }
