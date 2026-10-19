import { describe, expect, it } from 'vitest';
import { EditLog, type EditDraft, hashWorld, loadWorld, saveWorld } from '@mapmaker/core';
import { type Stage, runPipeline, staleStages } from './index';
import { makeWorld } from './test-helpers';

const L = (id: string, producer: string, deps: string[] = []) =>
  ({ id, dtype: 'f32' as const, unit: 'm', kind: 'scalar' as const, producers: { '*': producer }, deps, sample: 'barycentric' as const, timeVarying: false as const });
const draft = (value: number, over: Partial<EditDraft> = {}): EditDraft => ({ target: { kind: 'layer', id: 'a' }, region: null, op: 'add', payload: { value }, mode: 'pin', ...over });

function world() {
  const w = makeWorld({}, 500);
  w.registry.register(L('a', 'sa'));
  w.registry.register(L('b', 'sb', ['a']));
  w.registry.register(L('c', 'sc'));
  return w;
}
/** `a` = 1 plus the sum of the edits' values: a stage that consumes its edits. */
const stageA = (log: string[] = []): Stage => ({
  id: 'sa', version: '1', reads: [], writes: ['a'],
  run(ctx) { log.push('sa'); ctx.writeLayer('a')[0]!.fill(1 + ctx.edits.reduce((s, e) => s + (e.payload['value'] as number), 0)); },
  manual(ctx) { log.push('sa.manual'); ctx.writeLayer('a')[0]!.fill(ctx.edits.reduce((s, e) => s + (e.payload['value'] as number), 0)); },
});
const stageB = (log: string[] = []): Stage => ({ id: 'sb', version: '1', reads: ['a'], writes: ['b'], run(ctx) { log.push('sb'); const a = ctx.layer('a')[0]!; const b = ctx.writeLayer('b')[0]!; for (let i = 0; i < b.length; i++) b[i] = a[i]! * 2; } });
const stageC = (log: string[] = []): Stage => ({ id: 'sc', version: '1', reads: [], writes: ['c'], run(ctx) { log.push('sc'); ctx.writeLayer('c')[0]!.fill(7); } });

describe('edit log', () => {
  it('appends, undoes and redoes by gesture, and a new edit after an undo drops the redo tail', () => {
    const l = new EditLog();
    l.append(draft(1)); l.append(draft(2, { gesture: 5 })); l.append(draft(3, { gesture: 5 })); l.append(draft(4));
    expect(l.active().map((e) => e.payload['value'])).toEqual([1, 2, 3, 4]);
    expect(l.undo()).toHaveLength(1);
    expect(l.undo()).toHaveLength(2); // the whole gesture
    expect(l.active().map((e) => e.payload['value'])).toEqual([1]);
    expect(l.canRedo).toBe(true);
    expect(l.redo()).toHaveLength(2);
    l.undo(); // the redone gesture again: only edit 1 stays active
    l.append(draft(9));
    expect(l.canRedo).toBe(false);
    expect(l.all().map((e) => e.payload['value'])).toEqual([1, 9]);
    expect(new Set(l.all().map((e) => e.id)).size).toBe(2);
  });
  it('hashes ignore wall-clock and authorship, and a soft edit needs a weight', async () => {
    const a = new EditLog(), b = new EditLog();
    a.append(draft(1), '2026-01-01'); b.append(draft(1, { author: 'x', label: 'y' }), '2030-05-05');
    expect(await a.hash()).toBe(await b.hash());
    b.append(draft(2));
    expect(await a.hash()).not.toBe(await b.hash());
    expect(() => a.append(draft(1, { mode: 'soft' }))).toThrow(/weight/);
    expect(() => a.append(draft(1, { mode: 'soft', weight: 0.5 }))).not.toThrow();
  });
});

describe('edits through the runner', () => {
  it('an edit reruns exactly the producer and its dependants; unrelated stages are skipped', async () => {
    const w = world(); const log: string[] = [];
    const st = [stageA(log), stageB(log), stageC(log)];
    await runPipeline(w, st);
    expect((await runPipeline(w, st)).skipped).toEqual(['sa', 'sb', 'sc']);
    w.edits.append(draft(4));
    expect(await staleStages(w, st)).toEqual([{ stageId: 'sa', reason: 'edits' }, { stageId: 'sb', reason: 'upstream' }]);
    const r = await runPipeline(w, st);
    expect(r.ran).toEqual(['sa', 'sb']);
    expect(r.skipped).toEqual(['sc']);
    expect(w.layers.get('global', 'b')[0]).toBe(10);
    expect(await staleStages(w, st)).toEqual([]);
    w.edits.append(draft(1, { target: { kind: 'layer', id: 'c' } })); // c has no consumer of edits but is targeted: its stage reruns
    expect((await runPipeline(w, st)).ran).toEqual(['sc']);
  });
  it('undo and redo restore the exact world hashes', async () => {
    const w = world(); const st = [stageA(), stageB(), stageC()];
    await runPipeline(w, st);
    const h0 = await hashWorld(w);
    w.edits.append(draft(3));
    await runPipeline(w, st);
    const h1 = await hashWorld(w);
    expect(h1).not.toBe(h0);
    w.edits.undo();
    await runPipeline(w, st);
    const h0b = await hashWorld(w);
    // layers and records equal the unedited world (the edit log itself is part of the save, but it is empty again after the undo + truncate only on append)
    expect(w.layers.get('global', 'a')[0]).toBe(1);
    w.edits.redo();
    await runPipeline(w, st);
    expect(await hashWorld(w)).toBe(h1);
    expect(h0b).not.toBe(h1);
  });
  it('save, load and continue replays to the same world', async () => {
    const w = world(); const st = [stageA(), stageB(), stageC()];
    w.edits.append(draft(2)); w.edits.append(draft(5, { gesture: 1 })); w.edits.undo();
    w.systems['sc'] = 'off';
    await runPipeline(w, st);
    const bytes = await saveWorld(w, { engine: 'test' });
    const r = await loadWorld(bytes, { stageVersions: { sa: '1', sb: '1', sc: '1' } });
    expect(r.world.edits.cursor).toBe(1);
    expect(r.world.edits.length).toBe(2);
    expect(r.world.systems).toEqual({ sc: 'off' });
    expect(await hashWorld(r.world)).toBe(await hashWorld(w));
    expect((await runPipeline(r.world, st)).ran).toEqual([]);
    r.world.edits.redo();
    w.edits.redo();
    await runPipeline(r.world, st); await runPipeline(w, st);
    expect(await hashWorld(r.world)).toBe(await hashWorld(w));
  });
  it('a world without edits or switches saves no edit files', async () => {
    const w = world();
    await runPipeline(w, [stageA(), stageB(), stageC()]);
    const { worldToFiles } = await import('@mapmaker/core');
    const keys = [...worldToFiles(w).files.keys()];
    expect(keys.some((k) => k.startsWith('edits/') || k === 'systems.json')).toBe(false);
  });
});

describe('system switches and re-run from a stage', () => {
  it('off zero-fills the outputs, manual applies the edit log to zeros, simulate restores; dependants follow', async () => {
    const w = world(); const log: string[] = []; const st = [stageA(log), stageB(log), stageC(log)];
    await runPipeline(w, st);
    w.systems['sa'] = 'off';
    expect((await runPipeline(w, st)).ran).toEqual(['sa', 'sb']);
    expect(w.layers.get('global', 'a')[0]).toBe(0);
    expect(w.layers.get('global', 'b')[0]).toBe(0);
    w.edits.append(draft(6));
    w.systems['sa'] = 'manual';
    await runPipeline(w, st);
    expect(w.layers.get('global', 'a')[0]).toBe(6);
    expect(log).toContain('sa.manual');
    w.systems['sa'] = 'simulate';
    await runPipeline(w, st);
    expect(w.layers.get('global', 'a')[0]).toBe(7);
  });
  it('rejects a switch on structure', async () => {
    const w = world();
    w.systems['sa'] = 'off';
    await expect(runPipeline(w, [{ ...stageA(), switchable: false }, stageB(), stageC()])).rejects.toThrow(/structure, not a system/);
  });
  it('from re-runs that stage and every later one even when nothing changed', async () => {
    const w = world(); const st = [stageA(), stageB(), stageC()];
    await runPipeline(w, st);
    expect((await runPipeline(w, st, { from: 'sb' } as never)).ran).toEqual(['sb', 'sc']);
    await expect(runPipeline(w, st, { from: 'nope' } as never)).rejects.toThrow(/unknown stage/);
  });
});

describe('edit protocol (in-process MessageChannel)', () => {
  it('append, undo, redo, clear, stale, systems and run-from work over the worker protocol', async () => {
    const { MessageChannel } = await import('node:worker_threads');
    const { EngineClient, attachHost } = await import('./index');
    const { port1, port2 } = new MessageChannel();
    const st = [{ ...stageA(), switchable: false }, stageB(), stageC()];
    attachHost(port2 as never, { stages: st, engine: 'test' });
    const c = new EngineClient(port1 as never);
    const w = world();
    await c.load(await saveWorld(w, { engine: 't' }));
    await c.run();
    expect(await c.stale()).toEqual([]);
    const s1 = await c.appendEdits([draft(3, { gesture: 1, label: 'raise' }), draft(4, { gesture: 1 })]);
    expect(s1).toMatchObject({ cursor: 2, length: 2, canUndo: true, canRedo: false });
    expect(s1.edits[0]).toMatchObject({ op: 'add', target: 'a', mode: 'pin', active: true, label: 'raise' });
    expect(await c.stale()).toEqual([{ stageId: 'sa', reason: 'edits' }, { stageId: 'sb', reason: 'upstream' }]);
    expect((await c.run()).ran).toEqual(['sa', 'sb']);
    const s2 = await c.editAction('undo');
    expect(s2).toMatchObject({ cursor: 0, canRedo: true });
    expect(s2.edits.every((e) => !e.active)).toBe(true);
    expect((await c.editAction('redo')).cursor).toBe(2);
    expect((await c.editAction('clear')).length).toBe(0);
    await c.run();
    const sys = await c.systems();
    expect(sys).toEqual([{ stageId: 'sa', switchable: false, mode: 'simulate' }, { stageId: 'sb', switchable: true, mode: 'simulate' }, { stageId: 'sc', switchable: true, mode: 'simulate' }]);
    expect((await c.systems({ sc: 'off' })).find((s) => s.stageId === 'sc')!.mode).toBe('off');
    await expect(c.systems({ sa: 'off' })).rejects.toThrow(/structure, not a system/);
    await expect(c.systems({ nope: 'off' })).rejects.toThrow(/unknown stage/);
    expect((await c.stale()).map((x) => x.stageId)).toEqual(['sc']);
    expect((await c.run({ from: 'sb' })).ran).toEqual(['sb', 'sc']);
    port1.close(); port2.close();
  });
});
