import { describe, expect, it } from 'vitest';
import { type Edit, type EditDraft, OrogenLcg, SpatialIndex, SphereMesh, hashWorld, loadWorld, saveWorld } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '../index';
import { elevToHeightKm } from '../port';
import { CLIMATE } from '../../vendor/js/climate-config.js';
import { applyCategoricalEdits, applyTerrainEdits, lapseAdjustment, rasterise } from './index';

const stages = [...orogenStages, ...structuredStages];
const buildMesh = (N: number) => { const rng = new OrogenLcg('t', 3); return SphereMesh.build({ N, jitter: 0.75, rng: () => rng.next(), precision: 'f64' }); };
const mesh = buildMesh(20000);
const index = new SpatialIndex(mesh);
const pt = (c: number): number[] => [mesh.points[3 * c]!, mesh.points[3 * c + 1]!, mesh.points[3 * c + 2]!];
const brush = (c: number, radius: number, falloff = 0.5) => ({ kind: 'brush' as const, path: pt(c), radius, falloff });
const draft = (over: Partial<EditDraft>): EditDraft => ({ target: { kind: 'layer', id: 'elevation' }, region: null, op: 'raise', payload: {}, mode: 'pin', ...over });
const ed = (id: number, over: Partial<EditDraft>): Edit => ({ ...draft(over), id, seq: id, branch: 'main', createdAt: '' });
const angle = (a: number, b: number): number => Math.acos(Math.min(1, pt(a)[0]! * pt(b)[0]! + pt(a)[1]! * pt(b)[1]! + pt(a)[2]! * pt(b)[2]!));

/** A land world with a smooth bump: raw elevation in orogen units and metres. */
function field(): { raw: Float32Array; m: Float32Array } {
  const raw = new Float32Array(mesh.numRegions), m = new Float32Array(mesh.numRegions);
  for (let i = 0; i < raw.length; i++) { raw[i] = 0.25 + 0.05 * Math.sin(40 * pt(i)[0]!) ; m[i] = elevToHeightKm(raw[i]!) * 1000; }
  return { raw, m };
}

describe('region rasterisation', () => {
  const c0 = 7000;
  it('a brush covers the cells within its radius, weights fall from 1 at the centre line to 0 at the rim', () => {
    const { cells, w } = rasterise(mesh, brush(c0, 0.15), index);
    expect(cells.length).toBeGreaterThan(50);
    for (let i = 0; i < cells.length; i++) {
      expect(angle(c0, cells[i]!)).toBeLessThanOrEqual(0.15 + 1e-9);
      expect(w[i]).toBeGreaterThan(0); expect(w[i]).toBeLessThanOrEqual(1);
    }
    expect(w[cells.indexOf(c0)]).toBe(1);
    // every cell within the radius is found
    let inside = 0; for (let c = 0; c < mesh.numRegions; c++) if (angle(c0, c) <= 0.15) inside++;
    expect(cells.length).toBe(inside);
    expect([...cells]).toEqual([...cells].sort((a, b) => a - b));
  });
  it('falloff 0 is a hard disc; a stroke covers its whole length; a brush below the cell size edits the centre cell', () => {
    expect([...rasterise(mesh, brush(c0, 0.1, 0), index).w].every((x) => x === 1)).toBe(true);
    const a = pt(c0), b = pt(c0 + 150);
    const stroke = rasterise(mesh, { kind: 'brush', path: [...a, ...b], radius: 0.05, falloff: 0.5 }, index);
    const only = rasterise(mesh, brush(c0, 0.05), index);
    expect(stroke.cells.length).toBeGreaterThan(only.cells.length);
    expect(rasterise(mesh, brush(c0, 1e-5), index).cells).toEqual(Int32Array.of(index.nearestCell(...(pt(c0) as [number, number, number]))));
  });
  it('the same geometry on a finer mesh covers about the same area', () => {
    const fine = buildMesh(80000), fi = new SpatialIndex(fine);
    const reg = brush(c0, 0.2);
    const area = (m: SphereMesh, ix: SpatialIndex) => { const r = rasterise(m, reg, ix); let s = 0; for (const c of r.cells) s += m.cellArea_sr[c]!; return s; };
    expect(Math.abs(area(fine, fi) / area(mesh, index) - 1)).toBeLessThan(0.1);
  });
  it('a polygon covers the cells inside it, a cell run covers its cells', () => {
    const ring = [0, 1, 2, 3].flatMap((k) => { const c = index.nearestCell(...(pt(c0).map((v, j) => v + [[0.1, 0, 0], [0, 0.1, 0], [-0.1, 0, 0], [0, -0.1, 0]][k]![j]!) as [number, number, number])); return pt(c); });
    const r = rasterise(mesh, { kind: 'polygon', ring }, index);
    expect(r.cells.length).toBeGreaterThan(5);
    expect(rasterise(mesh, { kind: 'cells', runs: [10, 3, 20, 2] }, index).cells).toEqual(Int32Array.of(10, 11, 12, 20, 21));
  });
});

describe('terrain ops', () => {
  const c0 = 9000, reg = brush(c0, 0.15, 0.5);
  const run = (edits: Edit[]) => { const f = field(); const a = applyTerrainEdits(mesh, 1, f.m, f.raw, edits, index); return { ...f, a, base: field() }; };
  it('raise and lower move the centre by the amount; cells outside the region are bit-identical; raw and metres stay a pointwise map', () => {
    const r = run([ed(1, { region: reg, op: 'raise', payload: { amount: 500 } })]);
    const k = r.a.cells.indexOf(c0);
    expect(r.m[c0]! - r.base.m[c0]!).toBeGreaterThan(450);
    expect(r.m[c0]! - r.base.m[c0]!).toBeLessThan(550);
    for (let c = 0; c < mesh.numRegions; c++) {
      if (angle(c0, c) > 0.15) { expect(r.raw[c]).toBe(r.base.raw[c]); expect(r.m[c]).toBe(r.base.m[c]); }
      else if (r.raw[c] !== r.base.raw[c]) expect(r.m[c]).toBe(Math.fround(elevToHeightKm(r.raw[c]!) * 1000));
    }
    expect(r.a.cells.length).toBeGreaterThan(30);
    expect(r.a.oldRaw[k]).toBe(r.base.raw[c0]);
    const l = run([ed(1, { region: reg, op: 'lower', payload: { amount: 300 } })]);
    expect(l.base.m[c0]! - l.m[c0]!).toBeGreaterThan(250);
  });
  it('soft blends towards the edit by its weight', () => {
    const hard = run([ed(1, { region: reg, op: 'raise', payload: { amount: 400 } })]);
    const soft = run([{ ...ed(1, { region: reg, op: 'raise', payload: { amount: 400 }, mode: 'soft' }), weight: 0.25 }]);
    expect((soft.m[c0]! - soft.base.m[c0]!) / (hard.m[c0]! - hard.base.m[c0]!)).toBeCloseTo(0.25, 1);
  });
  it('smooth lowers the variance in the region, flatten brings it to its mean, terrace snaps to steps, set pins a value', () => {
    const f = field();
    const std = (a: Float32Array, cells: Int32Array) => { const v = Array.from(cells, (c) => a[c]!); const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length); };
    const { cells } = rasterise(mesh, brush(c0, 0.3, 0), index);
    const sm = run([ed(1, { region: brush(c0, 0.3, 0), op: 'smooth', payload: { strength: 1, iterations: 4 } })]);
    expect(std(sm.m, cells)).toBeLessThan(std(f.m, cells));
    const fl = run([ed(1, { region: brush(c0, 0.3, 0), op: 'flatten', payload: {} })]);
    expect(std(fl.m, cells)).toBeLessThan(2);
    const tr = run([ed(1, { region: brush(c0, 0.3, 0), op: 'terrace', payload: { step: 400 } })]);
    for (const c of cells.slice(0, 20)) expect(Math.abs(tr.m[c]! / 400 - Math.round(tr.m[c]! / 400))).toBeLessThan(0.02);
    const st = run([ed(1, { region: brush(c0, 0.2, 0), op: 'set', payload: { to: 1234 } })]);
    expect(Math.abs(st.m[c0]! - 1234)).toBeLessThan(1);
  });
  it('land and sea paint set the sign of the elevation; noise is reproducible and bounded; hotspot and ridge add relief', () => {
    const sea = run([ed(1, { region: brush(c0, 0.2, 0), op: 'sea', payload: { depth: 2000 } })]);
    expect(sea.m[c0]!).toBeLessThanOrEqual(-1999); expect(sea.raw[c0]!).toBeLessThan(0);
    const land = run([ed(1, { region: brush(c0, 0.2, 0), op: 'land', payload: { height: 50 } }), ed(2, { region: brush(c0, 0.2, 0), op: 'sea', payload: { depth: 100 } }), ed(3, { region: brush(c0, 0.2, 0), op: 'land', payload: { height: 300 } })]);
    expect(land.m[c0]!).toBeGreaterThanOrEqual(299);
    const n1 = run([ed(4, { region: brush(c0, 0.2, 0), op: 'noise', payload: { amplitude: 100 } })]), n2 = run([ed(4, { region: brush(c0, 0.2, 0), op: 'noise', payload: { amplitude: 100 } })]);
    expect(Array.from(n1.m)).toEqual(Array.from(n2.m));
    expect(n1.a.cells.length).toBeGreaterThan(10);
    const hs = run([ed(5, { region: brush(c0, 0.3, 0), op: 'hotspot', payload: { height: 2000 }, mode: 'seed' })]);
    expect(hs.m[c0]! - hs.base.m[c0]!).toBeGreaterThan(1500);
    const far = rasterise(mesh, brush(c0, 0.3, 0), index).cells.find((c) => angle(c0, c) > 0.25)!;
    expect(hs.m[far]! - hs.base.m[far]!).toBeLessThan(500);
    const rg = run([ed(6, { region: { kind: 'brush', path: [...pt(c0), ...pt(c0 + 60)], radius: 0.1, falloff: 1 }, op: 'ridge', payload: { height: 1500 }, mode: 'seed' })]);
    expect(rg.m[c0]! - rg.base.m[c0]!).toBeGreaterThan(500);
  });
  it('edits compose in log order, and an unknown op is rejected', () => {
    const a = run([ed(1, { region: reg, op: 'set', payload: { to: 100 } }), ed(2, { region: reg, op: 'raise', payload: { amount: 50 } })]);
    const b = run([ed(2, { region: reg, op: 'raise', payload: { amount: 50 } }), ed(1, { region: reg, op: 'set', payload: { to: 100 } })]);
    expect(a.m[c0]!).toBeGreaterThan(b.m[c0]! + 10);
    expect(() => run([ed(1, { region: reg, op: 'melt' })])).toThrow(/unknown terrain op/);
  });
  it('lapse adjustment equals orogen\'s rate and the vendored constants', () => {
    expect(CLIMATE.TEMP_MOIST_LAPSE_C_PER_KM).toBe(3.5);
    expect(CLIMATE.TEMP_DRY_LAPSE_EXTRA_C_PER_KM).toBe(3.4114);
    const raw = Float32Array.of(0.5, 0.25, 0.9), temp = Float32Array.of(0.6, 0.6, 0.01), precip = Float32Array.of(0.4, 0.4, 0.4);
    lapseAdjustment({ cells: Int32Array.of(0, 2), oldRaw: Float32Array.of(0.25, 0.1) }, raw)(temp, precip);
    expect(temp[0]).toBeCloseTo(0.6 - ((3.5 + 3.4114 * 0.6) * (elevToHeightKm(0.5) - elevToHeightKm(0.25))) / 90, 5);
    expect(temp[1]).toBe(Math.fround(0.6));
    expect(temp[2]).toBe(0); // clamped to the normalised range
  });
  it('categorical paint sets an enum inside the region where the weight is at least one half', () => {
    const koppen = new Uint8Array(mesh.numRegions).fill(3);
    const n = applyCategoricalEdits(mesh, 'koppen', koppen, [ed(1, { target: { kind: 'layer', id: 'koppen' }, region: brush(c0, 0.1, 0.5), op: 'paint', payload: { value: 9 } })], index);
    expect(n).toBeGreaterThan(10);
    expect(koppen[c0]).toBe(9);
    expect(koppen.filter((v) => v === 9).length).toBe(n);
    expect(() => applyCategoricalEdits(mesh, 'koppen', koppen, [ed(2, { target: { kind: 'layer', id: 'koppen' }, region: brush(c0, 0.1), op: 'paint', payload: { value: 1.5 } })], index)).toThrow(/integer/);
  });
});

async function layerHashes(w: ReturnType<typeof createOrogenWorld>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of w.layers.keys()) { const i = key.indexOf('/'); out[key] = await w.layers.hash(key.slice(0, i), key.slice(i + 1)); }
  return out;
}
const tag = (n: number) => ({ author: 't', label: `e${n}` });

describe('edits through the structured pipeline', () => {
  const N = 20000;
  const fresh = () => createOrogenWorld({ N, seed: 5 });
  const run = (w: ReturnType<typeof createOrogenWorld>, only?: string[]) => runPipeline(w, stages, { variant: STRUCTURED, strict: true, ...(only ? { only } : {}) });
  const wmesh = (w: ReturnType<typeof createOrogenWorld>) => w.meshes.get('global')!.mesh;
  /** Builds the world's mesh (the first stage) so edit geometry can be chosen before the full run. */
  const withMesh = async (w: ReturnType<typeof createOrogenWorld>) => { await run(w, ['mesh']); return w; };

  it('an elevation edit re-runs only the detail pass, changes only the edited cells and what the elevation drives locally', async () => {
    const w = fresh();
    await run(w);
    const before = await layerHashes(w);
    const e0 = Float32Array.from(w.layers.get('global', 'elevation'));
    const t0 = Float32Array.from(w.layers.get('global', 'temp.summer'));
    const m = wmesh(w);
    const c = 1234, p = [m.points[3 * c]!, m.points[3 * c + 1]!, m.points[3 * c + 2]!];
    w.edits.append(draft({ region: { kind: 'brush', path: p, radius: 0.12, falloff: 0.5 }, op: 'raise', payload: { amount: 3000 }, ...tag(1) }));
    const r = await run(w);
    expect(r.ran).toEqual(['detail.pass']);
    expect(r.skipped).toContain('ref.pass');
    const after = await layerHashes(w);
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => k.slice(7));
    expect(changed.sort()).toEqual(['basin', 'detail.elevRaw', 'drainageArea', 'elevation', 'koppen', 'receiver', 'temp.summer', 'temp.winter']);
    const e1 = w.layers.get('global', 'elevation'), t1 = w.layers.get('global', 'temp.summer');
    let inside = 0;
    for (let i = 0; i < m.numRegions; i++) {
      const far = Math.acos(Math.min(1, m.points[3 * i]! * p[0]! + m.points[3 * i + 1]! * p[1]! + m.points[3 * i + 2]! * p[2]!)) > 0.12;
      if (far) { expect(e1[i]).toBe(e0[i]); expect(t1[i]).toBe(t0[i]); } else if (e1[i] !== e0[i]) { inside++; if (e0[i]! > 0) expect(t1[i]!).toBeLessThan(t0[i]!); }
    }
    expect(inside).toBeGreaterThan(40);
  });

  it('undo restores the earlier layer hashes exactly, and redo restores the edited ones', async () => {
    const w = fresh();
    await run(w);
    const h0 = await layerHashes(w);
    const m = wmesh(w);
    w.edits.append(draft({ region: { kind: 'brush', path: [m.points[3000]!, m.points[3001]!, m.points[3002]!], radius: 0.2, falloff: 0.5 }, op: 'raise', payload: { amount: 1200 } }));
    await run(w);
    const h1 = await layerHashes(w);
    expect(h1['global/elevation']).not.toBe(h0['global/elevation']);
    w.edits.undo();
    expect((await run(w)).ran).toEqual(['detail.pass']);
    expect(await layerHashes(w)).toEqual(h0);
    w.edits.redo();
    await run(w);
    expect(await layerHashes(w)).toEqual(h1);
  });

  it('a pinned value survives a re-run of the reference pass (a parameter edit changes the whole world)', async () => {
    const w = fresh();
    await run(w);
    const m = wmesh(w);
    const c = 2500, p = [m.points[3 * c]!, m.points[3 * c + 1]!, m.points[3 * c + 2]!];
    w.edits.append(draft({ region: { kind: 'brush', path: p, radius: 0.15, falloff: 0 }, op: 'set', payload: { to: 1234 } }));
    await run(w);
    const before = Float32Array.from(w.layers.get('global', 'elevation'));
    expect(Math.abs(before[c]! - 1234)).toBeLessThan(1);
    w.edits.append(draft({ target: { kind: 'param', key: 'orogen.landCoverage' }, op: 'set', payload: { value: 0.55 } }));
    w.edits.append(draft({ target: { kind: 'param', key: 'orogen.numContinents' }, op: 'set', payload: { value: 7 } }));
    // The mesh stage rebuilds the world on a parameter change, which the strict audit (writes-only) rightly cannot describe.
    const r = await runPipeline(w, stages, { variant: STRUCTURED, strict: false });
    expect(r.ran).toEqual(['mesh', 'ref.pass', 'detail.pass']);
    const after = w.layers.get('global', 'elevation');
    const { cells } = rasterise(m, { kind: 'brush', path: p, radius: 0.15, falloff: 0 }, new SpatialIndex(m));
    for (const i of cells) expect(Math.abs(after[i]! - 1234)).toBeLessThan(1);
    let moved = 0; for (let i = 0; i < m.numRegions; i++) if (Math.abs(after[i]! - before[i]!) > 100) moved++;
    expect(moved).toBeGreaterThan(m.numRegions * 0.05); // the rest of the world did change
  });

  it('replay is deterministic: edits applied across a save and load give the same world as applying them in one go', async () => {
    const drafts = (m2: SphereMesh): EditDraft[] => [0, 1, 2, 3, 4].map((k) => ({
      target: { kind: 'layer', id: k === 3 ? 'koppen' : 'elevation' } as EditDraft['target'],
      region: { kind: 'brush', path: [m2.points[3 * (1500 * (k + 1))]!, m2.points[3 * (1500 * (k + 1)) + 1]!, m2.points[3 * (1500 * (k + 1)) + 2]!], radius: 0.08 + 0.02 * k, falloff: 0.3 },
      op: (['raise', 'smooth', 'noise', 'paint', 'land'] as const)[k]!,
      payload: ([{ amount: 700 }, { strength: 0.8 }, { amplitude: 200 }, { value: 4 }, { height: 120 }] as const)[k] as EditDraft['payload'],
      mode: 'pin',
    }));
    const a = fresh();
    await run(a);
    const ds = drafts(wmesh(a));
    for (const d of ds.slice(0, 3)) a.edits.append(d);
    await run(a);
    const bytes = await saveWorld(a, { engine: 'test' });
    const loaded = (await loadWorld(bytes, { stageVersions: Object.fromEntries(stages.map((s) => [s.id, s.version])) })).world;
    for (const d of ds.slice(3)) loaded.edits.append(d);
    await run(loaded);
    const b = fresh();
    for (const d of ds) b.edits.append(d);
    await run(b);
    expect(await layerHashes(loaded)).toEqual(await layerHashes(b));
    expect(await hashWorld(loaded)).toBe(await hashWorld(b));
  });

  it('a hand-authored (manual) detail pass starts flat and is painted by the edit log; off leaves it flat', async () => {
    const w = await withMesh(fresh());
    w.systems['detail.pass'] = 'manual';
    const m0 = wmesh(w);
    const c = 4000, p = [m0.points[3 * c]!, m0.points[3 * c + 1]!, m0.points[3 * c + 2]!];
    w.edits.append(draft({ region: { kind: 'brush', path: p, radius: 0.2, falloff: 0 }, op: 'land', payload: { height: 800 } }));
    await run(w);
    const e = w.layers.get('global', 'elevation');
    expect(Math.abs(e[c]! - 800)).toBeLessThan(1);
    expect(Array.from(e).filter((v) => v !== 0).length).toBeGreaterThan(50);
    expect(Array.from(e).filter((v) => v === 0).length).toBeGreaterThan(m0.numRegions * 0.9);
    w.systems['detail.pass'] = 'off';
    await run(w);
    expect(Array.from(w.layers.get('global', 'elevation')).every((v) => v === 0)).toBe(true);
    w.systems['ref.pass'] = 'off';
    await expect(run(w)).rejects.toThrow(/structure, not a system/);
  });

  it('categorical paint reaches the output Köppen and plate layers', async () => {
    const w = await withMesh(fresh());
    const m0 = wmesh(w);
    const c = 5000, p = [m0.points[3 * c]!, m0.points[3 * c + 1]!, m0.points[3 * c + 2]!];
    w.edits.append(draft({ target: { kind: 'layer', id: 'koppen' }, region: { kind: 'brush', path: p, radius: 0.1, falloff: 0 }, op: 'paint', payload: { value: 17 } }));
    w.edits.append(draft({ target: { kind: 'layer', id: 'plate' }, region: { kind: 'brush', path: p, radius: 0.1, falloff: 0 }, op: 'paint', payload: { value: 3 } }));
    await run(w);
    expect(w.layers.get('global', 'koppen')[c]).toBe(17);
    expect(w.layers.get('global', 'plate')[c]).toBe(3);
  });
});

describe('edits in the stock (parity) pipeline', () => {
  it('an elevation edit is applied after erosion and the stock climate follows it', async () => {
    const w = createOrogenWorld({ N: 5000, seed: 2 });
    await runPipeline(w, orogenStages, { variant: 'parity', strict: false });
    const m = w.meshes.get('global')!.mesh;
    const el = w.layers.get('global', 'elevation');
    const c = Array.from(el).findIndex((v, i) => v > 100 && v < 1500 && Math.abs(m.points[3 * i + 2]!) < 0.5);
    expect(c).toBeGreaterThanOrEqual(0);
    const p = [m.points[3 * c]!, m.points[3 * c + 1]!, m.points[3 * c + 2]!];
    const t0 = Float32Array.from(w.layers.get('global', 'temp.summer')), e0 = el[c]!;
    w.edits.append(draft({ region: { kind: 'brush', path: p, radius: 0.25, falloff: 0 }, op: 'raise', payload: { amount: 2500 } }));
    const r = await runPipeline(w, orogenStages, { variant: 'parity', strict: false });
    expect(r.ran).toEqual(expect.arrayContaining(['orogen.erosion', 'orogen.climate', 'orogen.koppen']));
    expect(r.skipped).toEqual(expect.arrayContaining(['mesh', 'orogen.tectonics', 'orogen.elevation']));
    expect(w.layers.get('global', 'elevation')[c]! - e0).toBeGreaterThan(2000);
    expect(w.layers.get('global', 'temp.summer')[c]!).toBeLessThan(t0[c]! - 0.03);
  });
});
