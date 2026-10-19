// Which stages a re-run would execute, and why (the UI's dirty-stage list; design note 16 §3.5). Original shell code.
import type { World } from '@mapmaker/core';
import { type StaleReason, type StaleStage, stageEdits, systemMode } from './edits';
import { hashInputs } from './hash-state';
import { resolveVariant } from './runner';
import { type Stage, splitRead } from './stage';

/**
 * Stages that are stale in `variant`, in pipeline order. A stage is stale when it has never run, its code version or
 * input hash differs from the record, or a stage that produces one of its inputs is stale (its output will change, so the
 * recorded input hash cannot be trusted yet). The reason of a directly stale stage says whether edits or a switch changed it.
 */
export async function staleStages(world: World, allStages: Stage[], variant = world.pipeline.variant): Promise<StaleStage[]> {
  const stages = resolveVariant(allStages, variant);
  const out: StaleStage[] = [];
  const staleIds = new Set<string>();
  const producerOf = new Map<string, string>();
  for (const s of stages) for (const w of s.writes) producerOf.set(`${s.mesh ?? 'global'}/${w}`, s.id);
  const sameVariant = world.pipeline.variant === variant;
  for (const s of stages) {
    const rec = sameVariant ? world.pipeline.completed.find((r) => r.stageId === s.id) : undefined;
    let reason: StaleReason | undefined;
    if (!rec) reason = 'never-run';
    else if (rec.version !== s.version) reason = 'version';
    else if (rec.inputHash !== (await hashInputs(world, s))) reason = stageEdits(world, s).length ? 'edits' : systemMode(world, s) !== 'simulate' ? 'system' : 'inputs';
    if (!reason) {
      for (const r of s.reads) {
        if (r.startsWith('table:')) continue;
        const { mesh, id } = splitRead(r, s.mesh ?? 'global');
        const p = producerOf.get(`${mesh}/${id}`) ?? [...producerOf].find(([k]) => k.startsWith(`${mesh}/`) && id.startsWith(k.slice(mesh.length + 1) + '.'))?.[1];
        if (p && staleIds.has(p)) { reason = 'upstream'; break; }
      }
    }
    if (reason) { staleIds.add(s.id); out.push({ stageId: s.id, reason }); }
  }
  return out;
}
