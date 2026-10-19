// Edits as stage inputs (ARCHITECTURE §3.8). Original shell code.
import type { Edit, SystemMode, World } from '@mapmaker/core';
import type { Stage } from './stage';

type StageLike = Pick<Stage, 'id' | 'writes'> & Partial<Pick<Stage, 'params' | 'mesh'>>;

/** Active edits whose target one of this stage produces (a layer it writes) or consumes (a parameter it hashes). */
export function stageEdits(world: World, stage: StageLike): Edit[] {
  const mesh = stage.mesh ?? 'global';
  return world.edits.active().filter((e) => {
    const t = e.target;
    if (t.kind === 'layer') return (t.mesh ?? 'global') === mesh && stage.writes.some((w) => w === t.id || t.id.startsWith(`${w}.`));
    if (t.kind === 'param') return !!stage.params?.some((p) => t.key === p || t.key.startsWith(`${p}.`));
    return false;
  });
}

export const systemMode = (world: World, stage: { id: string }): SystemMode => world.systems[stage.id] ?? 'simulate';

export type StaleReason = 'never-run' | 'version' | 'inputs' | 'edits' | 'system' | 'upstream';
export interface StaleStage { stageId: string; reason: StaleReason }
