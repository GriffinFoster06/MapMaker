// .mapmaker container: a ZIP written with fflate (ARCHITECTURE §5). Original shell code.
// v0 deviation: written with zipSync, not the streaming API. Streaming for large worlds is Phase 12.
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { dmath, type DmathMode } from '../dmath';
import { sha256 } from '../hash';
import type { World, WorldManifest } from '../world';
import { FORMAT_VERSION, migrateToCurrent, type FileMap } from './migrations';
import { type ChunkEntry, chunkTable, filesToWorld, worldToFiles } from './serialize';

export interface DeterminismProfile { dmath: DmathMode; engine: string }

export interface SaveManifest extends WorldManifest {
  format: string;
  chunks: ChunkEntry[];
  determinism: DeterminismProfile;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
// fflate encodes DOS times in local time, so zip bytes can vary with the host time zone. Integrity and
// comparisons use the chunk sha256 table, never the container bytes.
const FIXED_MTIME = Date.UTC(1980, 0, 1, 12);

export async function saveWorld(w: World, opts: { engine: string; /** Defaults to the current dmath.mode. */ dmathMode?: DmathMode; now?: Date } = { engine: 'unknown' }): Promise<Uint8Array> {
  const { files, units } = worldToFiles(w);
  const chunks = await chunkTable(files, units);
  w.manifest.modified = (opts.now ?? new Date()).toISOString();
  const manifest: SaveManifest = { ...w.manifest, format: FORMAT_VERSION, chunks, determinism: { dmath: opts.dmathMode ?? dmath.mode, engine: opts.engine } };
  const z: Zippable = {};
  z['manifest.json'] = [enc.encode(JSON.stringify(manifest, null, 1)), { level: 6, mtime: FIXED_MTIME }];
  for (const [path, bytes] of files) z[path] = [bytes, { level: path.endsWith('.gz') ? 0 : 6, mtime: FIXED_MTIME }];
  return zipSync(z);
}

export interface LoadResult {
  world: World;
  manifest: SaveManifest;
  /** True when stage code versions differ from the running app: view and export only (§5 Versioning). */
  viewOnly: boolean;
  staleStages: string[];
  /** Set when the save was produced in a different dmath mode than this realm runs in: resuming would not be bit-exact (Q3). */
  modeMismatch?: { stored: DmathMode; current: DmathMode };
}

export async function loadWorld(bytes: Uint8Array, opts: { stageVersions?: Record<string, string> } = {}): Promise<LoadResult> {
  const raw = unzipSync(bytes);
  let files: FileMap = new Map(Object.entries(raw));
  const mbytes = files.get('manifest.json');
  if (!mbytes) throw new Error('not a .mapmaker file: manifest.json missing');
  const manifest = JSON.parse(dec.decode(mbytes)) as SaveManifest;
  if (manifest.format !== FORMAT_VERSION) {
    files = migrateToCurrent(manifest.format, files);
  }
  for (const c of manifest.chunks) {
    const f = files.get(c.path);
    if (!f) throw new Error(`save corrupt: ${c.path} missing`);
    if ((await sha256(f)) !== c.sha256) throw new Error(`save corrupt: checksum mismatch for ${c.path}`);
  }
  const world = filesToWorld(files, { appVersion: manifest.appVersion, gitCommit: manifest.gitCommit, created: manifest.created, modified: manifest.modified, stageVersions: manifest.stageVersions } as WorldManifest);
  const stale: string[] = [];
  if (opts.stageVersions) {
    for (const [id, v] of Object.entries(manifest.stageVersions)) if (opts.stageVersions[id] !== v) stale.push(id);
  }
  // The save records the dmath mode it was produced in. Resuming in another mode would break exact resume (Q3).
  const modeMismatch = manifest.determinism.dmath !== dmath.mode ? { stored: manifest.determinism.dmath, current: dmath.mode } : undefined;
  return { world, manifest, viewOnly: stale.length > 0, staleStages: stale.sort(), ...(modeMismatch ? { modeMismatch } : {}) };
}
