import { OrogenLcg, SphereMesh, Timeline, World } from '@mapmaker/core';
import { registerDummyHistoryLayers } from './index';

const MASTER = '00112233445566778899aabbccddeeff';
const cal = { epoch: 'AD', yearLengthDays: 365, monthLengthsDays: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 35] };

export function makeWorld(extra: Record<string, unknown> = {}, N = 3000): World {
  const w = new World({
    params: { masterSeed: MASTER, ticks: 30, keyframeEvery: 8, ...extra },
    manifest: { appVersion: '0.0.0', created: '2026-10-03T00:00:00.000Z', modified: '2026-10-03T00:00:00.000Z', stageVersions: {} },
    timeline: new Timeline(cal, [{ fromTick: 0, dtYears: 10 }, { fromTick: 12, dtYears: 1 }], { tStartMyr: -300, dtMyr: 5, keyframeEveryMyr: 50 }),
  });
  const rng = new OrogenLcg('mesh', 9);
  w.addMesh({ id: 'global', mesh: SphereMesh.build({ N, jitter: 0.75, rng: () => rng.next(), precision: 'f64' }) });
  registerDummyHistoryLayers(w);
  return w;
}

