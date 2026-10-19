// Stage interface (ARCHITECTURE §4). Original shell code.
import type { Checkpoint, Edit, EntityTable, TableSpec, TypedArray, World } from '@mapmaker/core';

export class CancelledError extends Error {
  constructor() { super('cancelled'); this.name = 'CancelledError'; }
}

/** Cooperative cancellation flag, polled at chunk boundaries. */
export interface CancelFlag { aborted: boolean }

export interface Stage {
  id: string;
  /** Stage code version; part of the input hash and the save manifest. */
  version: string;
  /** Pipeline variants this stage takes part in. Omitted = all. */
  variants?: string[];
  /** Reference pass (R) or detail pass (D), for the referenceHash slot (design note 14). */
  pass?: 'R' | 'D';
  /** Mesh the stage's layers live on. Default 'global'. */
  mesh?: string;
  /** Orogen-parity stage: may enter dmath 'native' mode, but only through dmath.withMode('native', ...). Canonical stages may not. */
  parity?: true;
  /**
   * Layer ids, or `table:<name>` for entity tables. A read may name another mesh as `<mesh>/<layerId>` (a detail
   * stage reading the reference mesh's layers); unqualified reads are on the stage's own mesh.
   */
  reads: string[];
  writes: string[];
  /** World params keys that influence the stage (hashed into its input). */
  params?: string[];
  /**
   * False for structure that is not a switchable system (the mesh, the reference pass): the runner rejects a
   * `manual` or `off` switch on it. Default true.
   */
  switchable?: boolean;
  run(ctx: StageContext): void | Promise<void>;
  /**
   * Runs instead of `run` when the stage's switch is `manual` (ARCHITECTURE §3.8): the outputs are zero-filled first, and this
   * hook applies the edit log to them. Omitted: the outputs stay zero-filled and the edits are not applied.
   */
  manual?(ctx: StageContext): void | Promise<void>;
}

export interface StageContext {
  readonly world: World;
  readonly stage: Stage;
  readonly meshId: string;
  readonly signal: CancelFlag;
  /** Present when this stage was interrupted earlier and the world was saved or kept mid-stage. */
  readonly resume: Checkpoint | undefined;
  /** Active edits that target this stage's outputs or parameters, in log order (§3.8). */
  readonly edits: readonly Edit[];
  progress(fraction: number, message?: string): void;
  /** Record mid-stage state. The world's own tables and layers are saved with it, so keep only extra state here. */
  checkpoint(meta: unknown, chunks?: Record<string, TypedArray>): void;
  /** Yield to the event loop and throw CancelledError if cancellation was requested. */
  yield(): Promise<void>;
  throwIfCancelled(): void;
  /** Arrays of a layer the stage declared in `reads` or `writes`; `<mesh>/<layerId>` for a mesh-qualified read. */
  layer(layerId: string): TypedArray[];
  /** Allocate (first call) or fetch the arrays of a layer the stage declared in `writes`. */
  writeLayer(layerId: string): TypedArray[];
  /** A table declared in `reads` or `writes`; created from `spec` when it is a write and does not exist yet. */
  table(name: string, spec?: TableSpec): EntityTable;
}

export interface PipelineSpec {
  variant: string;
  stages: Stage[];
}

/** Splits a read into its mesh and layer id: `<mesh>/<layerId>`, or the stage's own mesh when unqualified. */
export function splitRead(read: string, stageMesh: string): { mesh: string; id: string } {
  const i = read.indexOf('/');
  return i < 0 ? { mesh: stageMesh, id: read } : { mesh: read.slice(0, i), id: read.slice(i + 1) };
}
