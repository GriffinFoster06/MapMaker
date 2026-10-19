// Typed worker protocol (ARCHITECTURE §6.1): run, progress, checkpoint, cancel, result. Original shell code.
import type { EditDraft, SystemMode } from '@mapmaker/core';
import type { StaleStage } from './edits';

export interface PortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export type Request =
  | { id: number; op: 'load'; bytes: Uint8Array }
  | { id: number; op: 'create'; params: unknown }
  | { id: number; op: 'run'; variant?: string; only?: string[]; /** re-run this stage and every later one ("re-run from stage X") */ from?: string; /** post a checkpoint snapshot every N progress events */ checkpointEvery?: number; /** false skips the per-stage hash audit (large worlds) */ strict?: boolean }
  /** Copies of the arrays of the named layers (vector layers give [east, north]). Transferred, not shared. */
  | { id: number; op: 'layers'; ids: string[]; mesh?: string }
  /** Points, triangles and halfedges of a mesh, copied. */
  | { id: number; op: 'meshdata'; mesh?: string }
  | { id: number; op: 'stats' }
  /** The edit log (§3.8): append edits (one gesture, one call), undo or redo a gesture, clear, or read the state. */
  | { id: number; op: 'edit'; action: 'append'; edits: EditDraft[]; now?: string }
  | { id: number; op: 'edit'; action: 'undo' | 'redo' | 'clear' | 'state' }
  /** Set per-stage switches (the given entries replace the current ones) and/or read the pipeline's stages and switches. */
  | { id: number; op: 'systems'; set?: Record<string, SystemMode> }
  /** Stages a run would execute, and why (the dirty-stage list). */
  | { id: number; op: 'stale'; variant?: string }
  | { id: number; op: 'snapshot' }
  | { id: number; op: 'hash' }
  | { id: number; op: 'kernel'; name: string; args: unknown }
  /** A host-registered function of the loaded World (read-only views and exports, §3.7). A typed-array result is transferred. */
  | { id: number; op: 'worldKernel'; name: string; args: unknown }
  | { op: 'cancel' };

export type Response =
  | { id: number; op: 'result'; value: unknown }
  | { id: number; op: 'progress'; stageId: string; fraction: number; message?: string }
  | { id: number; op: 'checkpoint'; bytes: Uint8Array }
  | { id: number; op: 'error'; message: string };

export interface MeshData { numRegions: number; precision: 'f32' | 'f64'; points: Float64Array; triangles: Int32Array; halfedges: Int32Array }
/** Logical working set of the world: bytes held by mesh arrays and layer arrays. */
export interface WorldStats { meshBytes: number; layerBytes: number; layerArrays: number; dmath: string }

/** The edit log as the UI sees it: a short line per edit, not the geometry. */
export interface EditState {
  cursor: number;
  length: number;
  canUndo: boolean;
  canRedo: boolean;
  edits: { id: number; op: string; target: string; mode: string; gesture?: number; active: boolean; label?: string }[];
}
export interface SystemInfo { stageId: string; switchable: boolean; mode: SystemMode }
export type { StaleStage };

export interface RunSummary { ran: string[]; skipped: string[]; cancelledAt?: string }
