// Dummy history stage (ARCHITECTURE §7 Phase 3): exercises the history schema (agent tables, causal events,
// a time-varying layer with keyframes and a change log, a geo-axis table) so that save -> load -> resume can be
// proven hash-exact before the real history engine exists. Original shell code; not a simulation.
import { EventLog, TimeVaryingLayer, type World } from '@mapmaker/core';
import type { Stage } from '../stage';

export const DUMMY_HISTORY_ID = 'dummy-history';

/** Registers the `polity` layer descriptor this stage produces. */
export function registerDummyHistoryLayers(world: World): void {
  if (!world.registry.has('polity')) {
    world.registry.register({ id: 'polity', dtype: 'u16', unit: '1', kind: 'categorical', producers: { '*': DUMMY_HISTORY_ID }, deps: [], sample: 'nearest', timeVarying: 'history' });
  }
}

export const dummyHistoryStage: Stage = {
  id: DUMMY_HISTORY_ID,
  version: '1',
  mesh: 'global',
  reads: [],
  writes: ['table:settlements', 'table:plates', 'polity'],
  params: ['ticks', 'keyframeEvery'],
  async run(ctx) {
    const { world } = ctx;
    const T = (world.params['ticks'] as number | undefined) ?? 40;
    const K = (world.params['keyframeEvery'] as number | undefined) ?? 8;
    const N = world.meshes.get(ctx.meshId)!.mesh.numRegions;
    const c = world.rng.counter('history'); // pure function of (tick, entityId, k): resume needs only the tick
    const unit = (...key: number[]) => c(...key) / 4294967296;
    const tvKey = `${ctx.meshId}/polity`;

    let agg: Float64Array;
    let start = 0;
    if (ctx.resume) {
      agg = ctx.resume.chunks['agg'] as Float64Array;
      start = (ctx.resume.meta as { tick: number }).tick;
      if (world.timeline.tick !== start) throw new Error('checkpoint tick does not match timeline tick');
    } else {
      agg = new Float64Array(T);
      world.entities.delete('settlements');
      world.entities.delete('plates');
      world.events = new EventLog(world.events.chunkTicks);
      world.timeline.tick = 0;
      const plates = ctx.table('plates', { name: 'plates', timeAxis: 'geo', columns: { rate: 'f32', oceanic: 'u8' } });
      for (let i = 0; i < 3; i++) plates.add({ rate: 1 + unit(0, i, 0) * 4, oceanic: i % 2 }, -300 + i * 50, i === 1 ? -100 : Infinity);
      const sett = ctx.table('settlements', { name: 'settlements', timeAxis: 'history', columns: { cell: 'i32', pop: 'f32', lastEvent: 'i32' }, agent: true });
      for (let i = 0; i < 12; i++) {
        const cell = c(0, i, 1) % N;
        const id = sett.length + 1;
        const ev = world.events.append({ tick: 0, type: 'founding', actors: [{ table: 'settlements', id }], cells: [cell], payload: { initial: true } });
        sett.add({ cell, pop: 50 + (c(0, i, 2) % 100), lastEvent: ev }, 0);
      }
      world.timeVarying.set(tvKey, new TimeVaryingLayer(tvKey, 'history', new Uint16Array(N), K));
    }

    const sett = ctx.table('settlements');
    const tv = world.timeVarying.get(tvKey)!;
    for (let tick = start + 1; tick <= T; tick++) {
      const dt = world.timeline.dtAt(tick - 1);
      const count = sett.length;
      let total = 0;
      for (let id = 1; id <= count; id++) {
        let pop = sett.get(id, 'pop') * (1 + 0.02 * dt * (unit(tick, id, 0) - 0.4));
        const cell = sett.get(id, 'cell');
        const k1 = unit(tick, id, 1);
        if (pop > 120 && k1 < 0.1) {
          const newCell = c(tick, id, 2) % N;
          const newId = sett.length + 1;
          const ev = world.events.append({ tick, type: 'founding', actors: [{ table: 'settlements', id: newId }], cells: [newCell], payload: { parent: id }, causes: [sett.get(id, 'lastEvent')] });
          sett.add({ cell: newCell, pop: pop / 2, lastEvent: ev }, tick);
          tv.set(tick, newCell, (id % 7) + 1);
          pop /= 2;
        } else if (k1 > 0.95) {
          sett.set(id, 'lastEvent', world.events.append({ tick, type: 'famine', actors: [{ table: 'settlements', id }], cells: [cell], payload: {}, causes: [sett.get(id, 'lastEvent')] }));
          pop *= 0.8;
        }
        sett.set(id, 'pop', pop);
        tv.set(tick, cell, (id % 7) + 1);
        total += sett.get(id, 'pop');
      }
      for (let id = count + 1; id <= sett.length; id++) total += sett.get(id, 'pop');
      tv.endStep(tick);
      agg[tick - 1] = total;
      world.timeline.tick = tick;
      ctx.checkpoint({ tick }, { agg });
      ctx.progress(tick / T);
      await ctx.yield();
    }
  },
};
