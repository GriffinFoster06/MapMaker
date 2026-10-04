import { describe, expect, it } from 'vitest';
import { dmath, hashWorld, loadWorld, saveWorld } from '@mapmaker/core';
import { type Stage, dummyHistoryStage, runPipeline, checkProducers } from './index';

import { makeWorld } from './test-helpers';
const L = (id: string, producer: string, deps: string[] = []) =>
  ({ id, dtype: 'f32' as const, unit: 'm', kind: 'scalar' as const, producers: { '*': producer }, deps, sample: 'barycentric' as const, timeVarying: false as const });

function simpleWorld() {
  const w = makeWorld({}, 500);
  w.registry.register(L('a', 'sa'));
  w.registry.register(L('b', 'sb', ['a']));
  return w;
}
const stageA = (log: string[], fill = 1): Stage => ({ id: 'sa', version: '1', reads: [], writes: ['a'], params: ['fillA'], run(ctx) { log.push('sa'); ctx.writeLayer('a')[0]!.fill((ctx.world.params['fillA'] as number | undefined) ?? fill); } });
const stageB = (log: string[]): Stage => ({ id: 'sb', version: '1', reads: ['a'], writes: ['b'], run(ctx) { log.push('sb'); const a = ctx.layer('a')[0]!; const b = ctx.writeLayer('b')[0]!; for (let i = 0; i < b.length; i++) b[i] = a[i]! * 2; } });

describe('runner', () => {
  it('runs stages, records manifests, skips unchanged, reruns and invalidates on input change', async () => {
    const w = simpleWorld(); const log: string[] = [];
    const stages = [stageA(log), stageB(log)];
    expect((await runPipeline(w, stages)).ran).toEqual(['sa', 'sb']);
    expect(w.layers.get('global', 'b')[0]).toBe(2);
    expect(w.pipeline.completed.map((r) => r.stageId)).toEqual(['sa', 'sb']);
    expect(w.manifest.stageVersions).toEqual({ sa: '1', sb: '1' });
    expect((await runPipeline(w, stages)).skipped).toEqual(['sa', 'sb']);
    w.params['fillA'] = 5; // sa's declared param changes -> sa reruns, and sb because its input a changed
    expect((await runPipeline(w, stages)).ran).toEqual(['sa', 'sb']);
    expect(w.layers.get('global', 'b')[0]).toBe(10);
    expect(log).toEqual(['sa', 'sb', 'sa', 'sb']);
  });

  it('a stage version bump reruns that stage and, through its output hash, only what depends on it', async () => {
    const w = simpleWorld(); const log: string[] = [];
    await runPipeline(w, [stageA(log), stageB(log)]);
    const r = await runPipeline(w, [{ ...stageA(log), version: '2' }, stageB(log)]);
    expect(r.ran).toEqual(['sa']);
    expect(r.skipped).toEqual(['sb']);
  });

  it('rejects writes outside declared writes (strict) and undeclared reads', async () => {
    const w = simpleWorld();
    const bad: Stage = { id: 'sa', version: '1', reads: [], writes: ['a'], run(ctx) { ctx.writeLayer('a')[0]!.fill(1); ctx.world.layers.alloc('global', 'b', 500); } };
    await expect(runPipeline(w, [bad])).rejects.toThrow(/modified global\/b/);
    const w2 = simpleWorld();
    await runPipeline(w2, [stageA([])]);
    const peek: Stage = { id: 'sb', version: '1', reads: [], writes: ['b'], run(ctx) { ctx.layer('a'); } };
    await expect(runPipeline(w2, [stageA([]), peek])).rejects.toThrow(/did not declare a in reads/);
  });

  it('enforces one producer per layer per variant', () => {
    const w = simpleWorld();
    const dup: Stage = { id: 'other', version: '1', reads: [], writes: ['a'], run() {} };
    expect(() => checkProducers(w, [stageA([]), dup], 'default')).toThrow(/producer sa.*other|written by both|has producer/);
    const dup2: Stage = { ...stageA([]), id: 'sa2' };
    expect(() => checkProducers(w, [dup2], 'default')).toThrow(/has producer sa in variant default, but stage sa2/);
    expect(() => checkProducers(w, [{ ...stageA([]), writes: ['zzz'] }], 'default')).toThrow(/unregistered/);
  });

  it('resolves producers per variant (plate evolution style)', async () => {
    const w = makeWorld({}, 500);
    w.registry.register({ ...L('crustAge', 'crust'), producers: { '*': 'crust', plateEvolution: 'evo' } });
    const crust: Stage = { id: 'crust', version: '1', reads: [], writes: ['crustAge'], run(c) { c.writeLayer('crustAge')[0]!.fill(1); } };
    const evo: Stage = { id: 'evo', version: '1', variants: ['plateEvolution'], reads: [], writes: ['crustAge'], run(c) { c.writeLayer('crustAge')[0]!.fill(2); } };
    const crustDefault: Stage = { ...crust, variants: ['default'] };
    await runPipeline(w, [crustDefault, evo], { variant: 'default' });
    expect(w.layers.get('global', 'crustAge')[0]).toBe(1);
    const w2 = makeWorld({}, 500);
    w2.registry.register({ ...L('crustAge', 'crust'), producers: { '*': 'crust', plateEvolution: 'evo' } });
    await runPipeline(w2, [crustDefault, evo], { variant: 'plateEvolution' });
    expect(w2.layers.get('global', 'crustAge')[0]).toBe(2);
    // both stages in one variant -> error
    expect(() => checkProducers(w2, [crust, { ...evo, variants: undefined }], 'plateEvolution')).toThrow();
  });

  it('records a referenceHash for detail-pass stages', async () => {
    const w = simpleWorld();
    const r = { ...stageA([]), pass: 'R' as const }, d = { ...stageB([]), pass: 'D' as const };
    await runPipeline(w, [r, d]);
    expect(w.pipeline.completed[0]!.referenceHash).toBeUndefined();
    expect(w.pipeline.completed[1]!.referenceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cancels cooperatively and keeps a checkpoint', async () => {
    const w = makeWorld({ ticks: 30 });
    const signal = { aborted: false };
    const res = await runPipeline(w, [dummyHistoryStage], { signal, onProgress: (e) => { if (e.fraction >= 10 / 30) signal.aborted = true; } });
    expect(res.cancelledAt).toBe('dummy-history');
    expect(w.timeline.tick).toBe(10);
    expect(w.pipeline.current).toEqual({ stageId: 'dummy-history' });
    expect(w.checkpoint?.meta).toEqual({ tick: 10 });
  });
});

describe('dmath mode guard (Checkpoint 3b)', () => {
  const stage = (over: Partial<Stage>, run: () => void): Stage => ({ id: 'g', version: '1', reads: [], writes: [], run, ...over });

  it('canonical stages run in fdlibm mode by default', async () => {
    expect(dmath.mode).toBe('fdlibm');
    const w = makeWorld();
    const seen: string[] = [];
    await runPipeline(w, [stage({}, () => { seen.push(dmath.mode); })]);
    expect(seen).toEqual(['fdlibm']);
    expect(w.pipeline.completed[0]!.dmath).toEqual(['fdlibm']);
  });

  it('fails if a canonical stage starts in native mode', async () => {
    const w = makeWorld();
    dmath.setMode('native');
    try { await expect(runPipeline(w, [stage({}, () => {})])).rejects.toThrow(/native|fdlibm/); }
    finally { dmath.setMode('fdlibm'); }
  });

  it('fails if a canonical stage enters native mode, even inside withMode', async () => {
    const w = makeWorld();
    await expect(runPipeline(w, [stage({}, () => { dmath.withMode('native', () => dmath.sin(1)); })])).rejects.toThrow(/canonical stage g ran in dmath 'native'/);
    expect(dmath.mode).toBe('fdlibm');
  });

  it('lets a parity stage use withMode("native") and records it', async () => {
    const w = makeWorld();
    await runPipeline(w, [stage({ parity: true }, () => { dmath.withMode('native', () => dmath.sin(1)); })]);
    expect(w.pipeline.completed[0]!.dmath).toEqual(['fdlibm', 'native']);
  });

  it('rejects a parity stage that leaves native mode switched on', async () => {
    const w = makeWorld();
    try { await expect(runPipeline(w, [stage({ parity: true }, () => { dmath.setMode('native'); })])).rejects.toThrow(/left dmath/); }
    finally { dmath.setMode('fdlibm'); }
  });
});

describe('dummy history stage: save -> load -> resume gives the uninterrupted hash (§5 exact resume)', () => {
  it('populates agents, causal events, keyframes, change log and a geo table', async () => {
    const w = makeWorld({ ticks: 40 });
    await runPipeline(w, [dummyHistoryStage]);
    expect(w.entities.get('settlements')!.length).toBeGreaterThan(12);
    expect(w.entities.get('plates')!.spec.timeAxis).toBe('geo');
    const tv = w.timeVarying.get('global/polity')!;
    expect([...tv.keyframes.keys()]).toEqual([0, 8, 16, 24, 32, 40]);
    expect(tv.runs().time.length).toBeGreaterThan(0);
    const chained = [...Array(w.events.length).keys()].map((i) => w.events.get(i + 1)).filter((e) => e.causes.length);
    expect(chained.length).toBeGreaterThan(0);
    expect(w.events.ancestry(chained[chained.length - 1]!.id).length).toBeGreaterThan(0);
    expect(w.pipeline.current).toBeUndefined();
    expect(w.checkpoint).toBeUndefined();
  });

  for (const k of [1, 9, 16, 29]) {
    it(`interrupt at tick ${k}, save, load, resume == uninterrupted`, async () => {
      const ref = makeWorld();
      await runPipeline(ref, [dummyHistoryStage]);
      const refHash = await hashWorld(ref);

      const w = makeWorld();
      const signal = { aborted: false };
      const r1 = await runPipeline(w, [dummyHistoryStage], { signal, onProgress: (e) => { if (Math.round(e.fraction * 30) >= k) signal.aborted = true; } });
      expect(r1.cancelledAt).toBe('dummy-history');
      expect(w.timeline.tick).toBe(k);
      const bytes = await saveWorld(w, { engine: 'test' });

      const { world, viewOnly } = await loadWorld(bytes, { stageVersions: { 'dummy-history': '1' } });
      expect(viewOnly).toBe(false);
      expect(world.checkpoint?.meta).toEqual({ tick: k });
      const r2 = await runPipeline(world, [dummyHistoryStage]);
      expect(r2.ran).toEqual(['dummy-history']);
      expect(await hashWorld(world)).toBe(refHash);
    });
  }

  it('a finished world re-saved and re-loaded skips the stage', async () => {
    const w = makeWorld();
    await runPipeline(w, [dummyHistoryStage]);
    const { world } = await loadWorld(await saveWorld(w, { engine: 'test' }));
    expect((await runPipeline(world, [dummyHistoryStage])).skipped).toEqual(['dummy-history']);
    expect(await hashWorld(world)).toBe(await hashWorld(w));
  });

  it('changing the era schedule changes results only from the changed era onward', async () => {
    const a = makeWorld(), b = makeWorld();
    b.timeline.eras[1]!.dtYears = 2; // era starting at tick 12
    await runPipeline(a, [dummyHistoryStage]); await runPipeline(b, [dummyHistoryStage]);
    expect(a.events.range(0, 11)).toEqual(b.events.range(0, 11));
    expect(Array.from(a.timeVarying.get('global/polity')!.seek(11))).toEqual(Array.from(b.timeVarying.get('global/polity')!.seek(11)));
    expect(Array.from(a.entities.get('settlements')!.column('pop'))).not.toEqual(Array.from(b.entities.get('settlements')!.column('pop')));
  });
});

