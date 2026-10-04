// The World object (ARCHITECTURE §3): everything the app knows about a world. Original shell code.
import { EntityTable } from './entities/table';
import { LayerRegistry, LayerStore } from './layers/registry';
import type { TimeVaryingLayer } from './layers/time-varying';
import type { SphereMesh } from './mesh/sphere-mesh';
import { RngService } from './rng/service';
import { EventLog } from './timeline/event-log';
import { Timeline } from './timeline/timeline';
import type { TypedArray } from './typed';

export interface MeshRecord {
  id: string;
  mesh: SphereMesh;
  parent?: string;
  /** Patch cell -> parent cell. */
  parentOf?: Int32Array;
  patchSpec?: unknown;
}

export interface StageRecord {
  stageId: string;
  version: string;
  inputHash: string;
  /** array key (`${mesh}/${arrayId}`) or entity table name -> sha256 */
  outputHashes: Record<string, string>;
  referenceHash?: string;
  /** dmath modes the stage ran in: ['fdlibm'] for canonical stages, ['fdlibm','native'] for parity stages that used withMode('native'). */
  dmath?: string[];
}

export interface PipelineState {
  variant: string;
  completed: StageRecord[];
  /** Set while an iterative stage is mid-run; its state chunks live in World.checkpoint. */
  current?: { stageId: string };
}

export interface Checkpoint {
  stageId: string;
  meta: unknown;
  chunks: Record<string, TypedArray>;
}

export interface WorldManifest {
  appVersion: string;
  gitCommit?: string;
  created: string;
  modified: string;
  /** stage id -> code version that produced/last ran in this world */
  stageVersions: Record<string, string>;
}

export interface WorldParams {
  /** 32 lowercase hex characters (128 bits). */
  masterSeed: string;
  [key: string]: unknown;
}

export class World {
  manifest: WorldManifest;
  params: WorldParams;
  planet: Record<string, unknown> = {};
  rng: RngService;
  meshes = new Map<string, MeshRecord>();
  registry = new LayerRegistry();
  layers: LayerStore;
  entities = new Map<string, EntityTable>();
  timeline: Timeline;
  timeVarying = new Map<string, TimeVaryingLayer>();
  events = new EventLog();
  pipeline: PipelineState = { variant: 'default', completed: [] };
  checkpoint?: Checkpoint;
  ui?: unknown;

  constructor(opts: { params: WorldParams; manifest: WorldManifest; timeline: Timeline }) {
    this.params = opts.params;
    this.manifest = opts.manifest;
    this.timeline = opts.timeline;
    this.rng = new RngService(opts.params.masterSeed);
    this.layers = new LayerStore(this.registry);
  }

  addMesh(rec: MeshRecord): void {
    if (this.meshes.has(rec.id)) throw new Error(`mesh exists: ${rec.id}`);
    this.meshes.set(rec.id, rec);
  }

  addTable(t: EntityTable): void {
    if (this.entities.has(t.name)) throw new Error(`table exists: ${t.name}`);
    this.entities.set(t.name, t);
  }
}
