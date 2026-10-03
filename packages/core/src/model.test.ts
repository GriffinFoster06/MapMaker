import { describe, expect, it } from 'vitest';
import { EntityTable } from './entities/table';
import { LayerRegistry, LayerStore, type LayerDescriptor } from './layers/registry';
import { TimeVaryingLayer } from './layers/time-varying';
import { EventLog } from './timeline/event-log';
import { Timeline } from './timeline/timeline';

const desc = (o: Partial<LayerDescriptor> & { id: string }): LayerDescriptor => ({
  dtype: 'f32', unit: 'm', kind: 'scalar', producers: { '*': 'terrain' }, deps: [], sample: 'barycentric', timeVarying: false, ...o,
});

describe('LayerRegistry / LayerStore', () => {
  it('validates descriptors', () => {
    const r = new LayerRegistry();
    r.register(desc({ id: 'elevation' }));
    expect(() => r.register(desc({ id: 'elevation' }))).toThrow(/already/);
    expect(() => r.register(desc({ id: '9bad' }))).toThrow(/bad layer id/);
    expect(() => r.register(desc({ id: 'x', unit: 'parsec' }))).toThrow(/unit/);
    expect(() => r.register(desc({ id: 'k', kind: 'categorical', dtype: 'u8', unit: 'enum:koppen', sample: 'barycentric' }))).toThrow(/categorical/);
    expect(() => r.register(desc({ id: 'np', producers: {} }))).toThrow(/producer/);
  });

  it('resolves producers per variant with a wildcard', () => {
    const r = new LayerRegistry();
    r.register(desc({ id: 'crustAge_Myr', unit: 'Myr', producers: { '*': 'crust', plateEvolution: 'plates2e' } }));
    expect(r.producerFor('crustAge_Myr', 'default')).toBe('crust');
    expect(r.producerFor('crustAge_Myr', 'plateEvolution')).toBe('plates2e');
  });

  it('finds transitive dependents', () => {
    const r = new LayerRegistry();
    r.register(desc({ id: 'a' }));
    r.register(desc({ id: 'b', deps: ['a'] }));
    r.register(desc({ id: 'c', deps: ['b'] }));
    r.register(desc({ id: 'd' }));
    expect([...r.dependents(['a'])].sort()).toEqual(['b', 'c']);
  });

  it('allocates two arrays for vector-en layers and checks dtype on set', () => {
    const r = new LayerRegistry();
    r.register(desc({ id: 'wind.jan', unit: 'm/s', kind: 'vector-en' }));
    const s = new LayerStore(r);
    const arrays = s.alloc('global', 'wind.jan', 10);
    expect(arrays).toHaveLength(2);
    expect(s.keys()).toEqual(['global/wind.jan.east', 'global/wind.jan.north']);
    expect(() => s.set('global', 'wind.jan.east', new Float64Array(10))).toThrow(/expected f32/);
    expect(() => s.alloc('global', 'wind.jan', 10)).toThrow(/already/);
  });

  it('round-trips through JSON', () => {
    const r = new LayerRegistry();
    r.register(desc({ id: 'elevation' }));
    expect(LayerRegistry.fromJSON(JSON.parse(JSON.stringify(r.toJSON()))).list()).toEqual(r.list());
  });
});

describe('EntityTable', () => {
  const mk = () => new EntityTable({ name: 'plates', timeAxis: 'geo', columns: { rate: 'f32', oceanic: 'u8' } });

  it('assigns stable, never-reused ids and finds rows by id', () => {
    const t = mk();
    const ids = Array.from({ length: 100 }, (_, i) => t.add({ rate: i, oceanic: i % 2 }, -300));
    expect(ids).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(t.get(42, 'rate')).toBe(41);
    t.set(42, 'rate', 7);
    expect(t.column('rate')[41]).toBe(7);
    expect(t.indexOf(1000)).toBe(-1);
  });

  it('tracks validity on the declared axis', () => {
    const t = mk();
    const a = t.add({ rate: 1, oceanic: 0 }, -300, -100);
    const b = t.add({ rate: 2, oceanic: 1 }, -200);
    expect(t.aliveAt(-250)).toEqual([a]);
    expect(t.aliveAt(-150)).toEqual([a, b]);
    expect(t.aliveAt(-100)).toEqual([b]);
    t.end(b, -50);
    expect(t.aliveAt(0)).toEqual([]);
  });

  it('rejects missing and unknown columns', () => {
    const t = mk();
    expect(() => t.add({ rate: 1 })).toThrow(/missing column/);
    expect(() => t.add({ rate: 1, oceanic: 0, extra: 3 })).toThrow(/unknown column/);
  });

  it('round-trips chunks', () => {
    const t = mk();
    for (let i = 0; i < 40; i++) t.add({ rate: i / 3, oceanic: i % 2 }, -i);
    const u = EntityTable.fromChunks(t.toChunks());
    expect(u.toChunks()).toEqual(t.toChunks());
    expect(u.add({ rate: 0, oceanic: 0 })).toBe(41);
  });
});

describe('Timeline', () => {
  const cal = { epoch: 'AD', yearLengthDays: 365.25, monthLengthsDays: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] };

  it('reads dtYears per era and integrates sim time', () => {
    const t = new Timeline(cal, [{ fromTick: 0, dtYears: 25 }, { fromTick: 100, dtYears: 10 }, { fromTick: 300, dtYears: 1 }]);
    expect(t.dtAt(0)).toBe(25);
    expect(t.dtAt(99)).toBe(25);
    expect(t.dtAt(100)).toBe(10);
    expect(t.dtAt(5000)).toBe(1);
    expect(t.simTimeAt(100)).toBe(2500);
    expect(t.simTimeAt(300)).toBe(2500 + 2000);
    expect(t.simTimeAt(310)).toBe(4500 + 10);
  });

  it('changing a later era does not change earlier sim time', () => {
    const a = new Timeline(cal, [{ fromTick: 0, dtYears: 10 }, { fromTick: 50, dtYears: 1 }]);
    const b = new Timeline(cal, [{ fromTick: 0, dtYears: 10 }, { fromTick: 50, dtYears: 5 }]);
    expect(a.simTimeAt(50)).toBe(b.simTimeAt(50));
  });

  it('validates eras and exposes the geologic axis', () => {
    expect(() => new Timeline(cal, [{ fromTick: 5, dtYears: 1 }])).toThrow();
    expect(() => new Timeline(cal, [{ fromTick: 0, dtYears: 1 }, { fromTick: 0, dtYears: 2 }])).toThrow();
    const t = new Timeline(cal, undefined, { tStartMyr: -300, dtMyr: 1, keyframeEveryMyr: 10 });
    expect(t.geoTimeMyr(300)).toBe(0);
    expect(t.geoKeyframeEverySteps).toBe(10);
    expect(Timeline.fromJSON(JSON.parse(JSON.stringify(t.toJSON()))).toJSON()).toEqual(t.toJSON());
  });
});

describe('TimeVaryingLayer', () => {
  it('seek reproduces every past state from keyframes plus the change log', () => {
    const n = 200;
    const l = new TimeVaryingLayer('pop', 'history', new Uint16Array(n), 10);
    const history: Uint16Array[] = [l.current.slice() as Uint16Array];
    let x = 12345;
    const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff);
    for (let step = 1; step <= 95; step++) {
      const base = rnd() % (n - 8);
      const v = rnd() % 5;
      for (let j = 0; j < 1 + (rnd() % 7); j++) l.set(step, base + j, v);
      for (let j = 0; j < 3; j++) l.set(step, rnd() % n, rnd() % 5);
      l.endStep(step);
      history.push(l.current.slice() as Uint16Array);
    }
    expect([...l.keyframes.keys()].sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    for (let s = 0; s <= 95; s++) expect(Array.from(l.seek(s))).toEqual(Array.from(history[s]!));
  });

  it('packs consecutive identical changes into one run', () => {
    const l = new TimeVaryingLayer('p', 'history', new Uint8Array(20), 5);
    for (let c = 3; c < 9; c++) l.set(1, c, 4);
    const r = l.runs();
    expect(Array.from(r.cell)).toEqual([3]);
    expect(Array.from(r.count)).toEqual([6]);
    l.set(1, 15, 4); // not consecutive
    expect(l.runs().cell.length).toBe(2);
  });

  it('ignores no-op sets and rejects out-of-order steps', () => {
    const l = new TimeVaryingLayer('p', 'geo', new Uint8Array(4), 5);
    l.set(1, 0, 0);
    expect(l.runs().time.length).toBe(0);
    l.set(3, 0, 1);
    expect(() => l.set(2, 1, 1)).toThrow();
  });
});

describe('EventLog', () => {
  it('requires causes to point to earlier events and keeps order', () => {
    const log = new EventLog(10);
    const famine = log.append({ tick: 1, type: 'famine', actors: [], cells: [3], payload: {} });
    const migrate = log.append({ tick: 2, type: 'migration', actors: [], cells: [], payload: { n: 40 }, causes: [famine] });
    const war = log.append({ tick: 12, type: 'war', actors: [{ table: 'polities', id: 1 }], cells: [], payload: {}, causes: [migrate, famine] });
    expect(log.ancestry(war).map((e) => e.type)).toEqual(['migration', 'famine']);
    expect(() => log.append({ tick: 12, type: 'x', actors: [], cells: [], payload: {}, causes: [99] })).toThrow(/cause/);
    expect(() => log.append({ tick: 3, type: 'x', actors: [], cells: [], payload: {} })).toThrow(/non-decreasing/);
  });

  it('chunks by tick range', () => {
    const log = new EventLog(10);
    for (const tick of [0, 5, 10, 25]) log.append({ tick, type: 't', actors: [], cells: [], payload: {} });
    expect([...log.chunks()].map(([k, v]) => [k, v.length])).toEqual([[0, 2], [1, 1], [2, 1]]);
    expect(log.range(5, 10)).toHaveLength(2);
  });
});
