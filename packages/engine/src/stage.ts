// Stage interface (ARCHITECTURE §4). Original shell code.
import type { Checkpoint, EntityTable, TableSpec, TypedArray, World } from '@mapmaker/core';

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
  /** Layer ids, or `table:<name>` for entity tables. */
  reads: string[];
  writes: string[];
  /** World params keys that influence the stage (hashed into its input). */
  params?: string[];
  run(ctx: StageContext): void | Promise<void>;
}

export interface StageContext {
  readonly world: World;
  readonly stage: Stage;
  readonly meshId: string;
  readonly signal: CancelFlag;
  /** Present when this stage was interrupted earlier and the world was saved or kept mid-stage. */
  readonly resume: Checkpoint | undefined;
  progress(fraction: number, message?: string): void;
  /** Record mid-stage state. The world's own tables and layers are saved with it, so keep only extra state here. */
  checkpoint(meta: unknown, chunks?: Record<string, TypedArray>): void;
  /** Yield to the event loop and throw CancelledError if cancellation was requested. */
  yield(): Promise<void>;
  throwIfCancelled(): void;
  /** Arrays of a layer the stage declared in `reads` or `writes`. */
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
