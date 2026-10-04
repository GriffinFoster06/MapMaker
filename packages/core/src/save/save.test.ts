import { describe, expect, it } from 'vitest';
import { EntityTable } from '../entities/table';
import { TimeVaryingLayer } from '../layers/time-varying';
import { SphereMesh } from '../mesh/sphere-mesh';
import { OrogenLcg } from '../rng/orogen-lcg';
import { Timeline } from '../timeline/timeline';
import { World } from '../world';
import { hashWorld, loadWorld, saveWorld } from './index';
import { zipSync } from 'fflate';

const MASTER = '00112233445566778899aabbccddeeff';
const cal = { epoch: 'AD', yearLengthDays: 365, monthLengthsDays: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 35] };

function makeWorld(): World {
  const w = new World({
    params: { masterSeed: MASTER, fidelityN: 2000, sliders: { land: 0.3 } },
    manifest: { appVersion: '0.0.0', created: '2026-10-03T00:00:00.000Z', modified: '2026-10-03T00:00:00.000Z', stageVersions: { terrain: '1', history: '1' } },
    timeline: new Timeline(cal, [{ fromTick: 0, dtYears: 5 }, { fromTick: 20, dtYears: 1 }], { tStartMyr: -300, dtMyr: 5, keyframeEveryMyr: 50 }),
  });
  w.planet = { radius_m: 6371000, obliquity_deg: 23.44 };
  const rng = new OrogenLcg('mesh', 5);
  w.addMesh({ id: 'global', mesh: SphereMesh.build({ N: 2000, jitter: 0.75, rng: () => rng.next(), precision: 'f64' }) });
  w.registry.register({ id: 'elevation', dtype: 'f32', unit: 'm', kind: 'scalar', producers: { '*': 'terrain' }, deps: [], sample: 'barycentric', timeVarying: false });
  w.registry.register({ id: 'wind.jan', dtype: 'f32', unit: 'm/s', kind: 'vector-en', producers: { '*': 'wind' }, deps: ['elevation'], sample: 'barycentric', timeVarying: false });
  const [elev] = w.layers.alloc('global', 'elevation', 2001);
  for (let i = 0; i < elev!.length; i++) elev![i] = Math.sin(i) * 1000;
  w.layers.alloc('global', 'wind.jan', 2001).forEach((a, k) => a.fill(k + 0.5));
  const plates = new EntityTable({ name: 'plates', timeAxis: 'geo', columns: { rate: 'f32' } });
  plates.add({ rate: 1.5 }, -300); plates.add({ rate: 2.5 }, -250, -100);
  w.addTable(plates);
  const sett = new EntityTable({ name: 'settlements', timeAxis: 'history', columns: { cell: 'i32', pop: 'f32' }, agent: true });
  for (let i = 0; i < 30; i++) sett.add({ cell: i * 7, pop: 100 + i }, 0);
  w.addTable(sett);
  const tv = new TimeVaryingLayer('global/polity', 'history', new Uint16Array(2001), 8);
  for (let s = 1; s <= 20; s++) { for (let c = 0; c < 5; c++) tv.set(s, s * 10 + c, s); tv.endStep(s); }
  w.timeVarying.set('global/polity', tv);
  const f = w.events.append({ tick: 3, type: 'founding', actors: [{ table: 'settlements', id: 1 }], cells: [7], payload: { name: 'A' } });
  w.events.append({ tick: 9, type: 'growth', actors: [], cells: [], payload: {}, causes: [f] });
  w.rng.stream('a'); w.rng.stream('b', 'alea');
  for (let i = 0; i < 10; i++) { w.rng.stream('a').next(); w.rng.stream('b', 'alea').next(); }
  w.pipeline = { variant: 'default', completed: [{ stageId: 'terrain', version: '1', inputHash: 'abc', outputHashes: { 'global/elevation': 'def' } }] };
  w.checkpoint = { stageId: 'history', meta: { tick: 20 }, chunks: { acc: new Float64Array([1, 2, 3]) } };
  w.timeline.tick = 20;
  return w;
}

describe('save / load v0', () => {
  it('round-trips the whole world with equal hash', async () => {
    const w = makeWorld();
    const bytes = await saveWorld(w, { engine: 'test' });
    const { world, manifest, viewOnly } = await loadWorld(bytes, { stageVersions: { terrain: '1', history: '1' } });
    expect(viewOnly).toBe(false);
    expect(manifest.format).toBe('0.1.0');
    expect(manifest.determinism).toEqual({ dmath: 'native', engine: 'test' });
    expect(await hashWorld(world)).toBe(await hashWorld(w));
    // And continuing the restored world matches continuing the original.
    expect(world.rng.stream('a').next()).toBe(w.rng.stream('a').next());
    expect(world.rng.stream('b', 'alea').next()).toBe(w.rng.stream('b', 'alea').next());
    expect(Array.from(world.timeVarying.get('global/polity')!.seek(7))).toEqual(Array.from(w.timeVarying.get('global/polity')!.seek(7)));
    expect(world.events.ancestry(2).map((e) => e.type)).toEqual(['founding']);
    expect(world.meshes.get('global')!.mesh.adjList).toEqual(w.meshes.get('global')!.mesh.adjList);
    expect(world.meshes.get('global')!.mesh.cellArea_sr).toEqual(w.meshes.get('global')!.mesh.cellArea_sr);
    expect(world.entities.get('settlements')!.spec.agent).toBe(true);
  });

  it('a save is a consistent snapshot even if arrays keep changing while it is written', async () => {
    const w = makeWorld();
    const before = await hashWorld(w);
    const p = saveWorld(w, { engine: 't' });
    w.layers.get('global', 'elevation').fill(7); // mutate immediately, before the async save finishes
    w.checkpoint!.chunks['acc']![0] = 99;
    const { world } = await loadWorld(await p);
    expect(await hashWorld(world)).toBe(before);
  });

  it('hash changes when any state changes', async () => {
    const w = makeWorld();
    const h0 = await hashWorld(w);
    w.layers.get('global', 'elevation')[5] = 12345;
    expect(await hashWorld(w)).not.toBe(h0);
    const w2 = makeWorld();
    w2.timeVarying.get('global/polity')!.set(21, 3, 9);
    expect(await hashWorld(w2)).not.toBe(h0);
  });

  it('chunk table carries dtype, shape, unit and sha256', async () => {
    const { manifest } = await loadWorld(await saveWorld(makeWorld(), { engine: 't' }));
    const e = manifest.chunks.find((c) => c.path === 'layers/global/elevation.f32')!;
    expect(e).toMatchObject({ dtype: 'f32', shape: [2001], unit: 'm' });
    expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.chunks.some((c) => c.path.startsWith('timeline/events/') && c.dtype === 'ndjson.gz')).toBe(true);
  });

  it('opens view-only when stage code versions differ', async () => {
    const r = await loadWorld(await saveWorld(makeWorld(), { engine: 't' }), { stageVersions: { terrain: '2', history: '1' } });
    expect(r.viewOnly).toBe(true);
    expect(r.staleStages).toEqual(['terrain']);
  });

  it('detects corruption and non-save files', async () => {
    const bytes = await saveWorld(makeWorld(), { engine: 't' });
    const { unzipSync } = await import('fflate');
    const files = unzipSync(bytes);
    const mutated = { ...files, 'layers/global/elevation.f32': files['layers/global/elevation.f32']!.map((b, i) => (i === 100 ? b ^ 1 : b)) };
    await expect(loadWorld(zipSync(mutated))).rejects.toThrow(/checksum/);
    await expect(loadWorld(zipSync({ 'x.txt': new Uint8Array(3) }))).rejects.toThrow(/manifest/);
  });

  it('refuses unknown format versions with no migration path', async () => {
    const { unzipSync } = await import('fflate');
    const files = unzipSync(await saveWorld(makeWorld(), { engine: 't' }));
    const m = JSON.parse(new TextDecoder().decode(files['manifest.json']!));
    m.format = '9.9.9';
    await expect(loadWorld(zipSync({ ...files, 'manifest.json': new TextEncoder().encode(JSON.stringify(m)) }))).rejects.toThrow(/migration/);
  });
});
