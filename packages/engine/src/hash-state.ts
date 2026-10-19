import { type EntityTable, type World, bytesOf, canonicalJson, editContent, hashString, sha256 } from '@mapmaker/core';
import { stageEdits, systemMode } from './edits';
import { splitRead } from './stage';

export async function hashTable(t: EntityTable): Promise<string> {
  const c = t.toChunks();
  const parts: Uint8Array[] = [new TextEncoder().encode(canonicalJson({ spec: c.spec, nextId: c.nextId, length: c.length })), bytesOf(c.ids), bytesOf(c.validFrom), bytesOf(c.validTo)];
  for (const k of Object.keys(c.data).sort()) parts.push(bytesOf(c.data[k]!));
  return sha256(parts);
}

/** `layers/<mesh>/<arrayId>` and `table:<name>` -> hash, for every layer array and table in the world. */
const editsHash = (edits: Parameters<typeof editContent>[0][]): unknown => edits.map(editContent);

export async function snapshotHashes(world: World, exclude: (key: string) => boolean = () => false): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of world.layers.keys()) {
    if (exclude(key)) continue;
    const i = key.indexOf('/');
    out[key] = await world.layers.hash(key.slice(0, i), key.slice(i + 1));
  }
  for (const [name, t] of world.entities) if (!exclude(`table:${name}`)) out[`table:${name}`] = await hashTable(t);
  return out;
}

export async function hashInputs(world: World, stage: { id: string; version: string; reads: string[]; writes?: string[]; params?: string[]; mesh?: string }): Promise<string> {
  const mesh = stage.mesh ?? 'global';
  const reads: Record<string, string> = {};
  for (const r of [...stage.reads].sort()) {
    if (r.startsWith('table:')) {
      const t = world.entities.get(r.slice(6));
      reads[r] = t ? await hashTable(t) : 'absent';
    } else {
      const { mesh: m, id: layer } = splitRead(r, mesh);
      const d = world.registry.get(layer);
      const ids = d.kind === 'vector-en' ? [`${layer}.east`, `${layer}.north`] : [layer];
      for (const id of ids) reads[`${m}/${id}`] = world.layers.has(m, id) ? await world.layers.hash(m, id) : 'absent';
    }
  }
  const params: Record<string, unknown> = { masterSeed: world.params.masterSeed };
  for (const k of stage.params ?? []) params[k] = world.params[k] ?? null;
  const key: Record<string, unknown> = { id: stage.id, version: stage.version, variant: world.pipeline.variant, reads, params };
  // Only present when used, so the input hashes of stages without edits or switches are unchanged.
  const edits = stageEdits(world, { id: stage.id, writes: stage.writes ?? [], ...(stage.params ? { params: stage.params } : {}), ...(stage.mesh ? { mesh: stage.mesh } : {}) });
  if (edits.length) key['edits'] = editsHash(edits);
  const mode = systemMode(world, stage);
  if (mode !== 'simulate') key['system'] = mode;
  return hashString(canonicalJson(key));
}
