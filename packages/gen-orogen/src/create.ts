// World factory for orogen runs. Original shell code.
import { Timeline, World } from '@mapmaker/core';
import { type OrogenParams, PARAM_KEY } from './params';
import { registerOrogenLayers } from './layers';

const CALENDAR = { epoch: 'AD', yearLengthDays: 365, monthLengthsDays: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 35] };
const DEFAULT_MASTER = '00112233445566778899aabbccddeeff';

/** A world with the orogen layers registered and the given generation parameters. The mesh is built by the `mesh` stage. */
export function createOrogenWorld(params: Partial<OrogenParams> = {}, opts: { masterSeed?: string; now?: string } = {}): World {
  const now = opts.now ?? '2026-10-04T00:00:00.000Z';
  const w = new World({
    params: { masterSeed: opts.masterSeed ?? DEFAULT_MASTER, [PARAM_KEY]: params },
    manifest: { appVersion: '0.0.0', created: now, modified: now, stageVersions: {} },
    timeline: new Timeline(CALENDAR, [{ fromTick: 0, dtYears: 1 }], { tStartMyr: 0, dtMyr: 5, keyframeEveryMyr: 50 }),
  });
  registerOrogenLayers(w);
  return w;
}
