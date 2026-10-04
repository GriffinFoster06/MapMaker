// Typed worker protocol (ARCHITECTURE §6.1): run, progress, checkpoint, cancel, result. Original shell code.
export interface PortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export type Request =
  | { id: number; op: 'load'; bytes: Uint8Array }
  | { id: number; op: 'create'; params: unknown }
  | { id: number; op: 'run'; variant?: string; only?: string[]; /** post a checkpoint snapshot every N progress events */ checkpointEvery?: number; /** false skips the per-stage hash audit (large worlds) */ strict?: boolean }
  /** Copies of the arrays of the named layers (vector layers give [east, north]). Transferred, not shared. */
  | { id: number; op: 'layers'; ids: string[]; mesh?: string }
  /** Points, triangles and halfedges of a mesh, copied. */
  | { id: number; op: 'meshdata'; mesh?: string }
  | { id: number; op: 'stats' }
  | { id: number; op: 'snapshot' }
  | { id: number; op: 'hash' }
  | { id: number; op: 'kernel'; name: string; args: unknown }
  | { op: 'cancel' };

export type Response =
  | { id: number; op: 'result'; value: unknown }
  | { id: number; op: 'progress'; stageId: string; fraction: number; message?: string }
  | { id: number; op: 'checkpoint'; bytes: Uint8Array }
  | { id: number; op: 'error'; message: string };

export interface MeshData { numRegions: number; precision: 'f32' | 'f64'; points: Float64Array; triangles: Int32Array; halfedges: Int32Array }
/** Logical working set of the world: bytes held by mesh arrays and layer arrays. */
export interface WorldStats { meshBytes: number; layerBytes: number; layerArrays: number; dmath: string }

export interface RunSummary { ran: string[]; skipped: string[]; cancelledAt?: string }
