import { describe, expect, test } from 'vitest';
import { buildMask, buildMaskSliced, type MaskSlicing, type MaskView } from './label-mask';
import { maskCell, planLabels } from './placement';
import { proj, regionsFor, data } from './placement.test';
import { THEMES } from './style';
import type { CartoFeature } from './data';

const f = (kind: CartoFeature['kind'], name: string, lon: number, lat: number, r: number): CartoFeature => ({ id: `${kind}:${name}`, kind, name, lon, lat, area: r, radius: (r * Math.PI) / 180 });
const feats = [f('continent', 'Alpha', 0, 0, 30), f('island', 'Beta', 60, 20, 8), f('sea', 'Gamma', -70, -10, 15)];

/** Yields count as slices; `cancelAt` cancels after that many yields. */
const slicing = (cancelAt = Infinity): MaskSlicing & { yields: number } => {
  const s = { yields: 0, sliceMs: 0, yieldNow: async () => { s.yields++; }, cancelled: () => s.yields >= cancelAt, now: () => s.yields };
  return s;
};

describe('sliced label mask', () => {
  const w = 1000, h = 600, cell = maskCell(w), regions = regionsFor(feats);

  test('the sliced mask is identical to the one-go mask (every array, bit for bit)', async () => {
    const view = proj(w, h, 2, [30, -10]);
    const a = buildMask(view, regions, cell), s = slicing(), b = (await buildMaskSliced(view, regions, cell, s))!;
    expect(s.yields).toBeGreaterThan(5);
    expect(b.cols).toBe(a.cols);
    expect(b.ox).toBe(a.ox);
    expect(Buffer.from(b.region.buffer)).toEqual(Buffer.from(a.region.buffer));
    expect(Buffer.from(b.clear.buffer)).toEqual(Buffer.from(a.clear.buffer));
    expect(Buffer.from(b.edge.buffer)).toEqual(Buffer.from(a.edge.buffer));
  });

  test('invertInto gives the same mask as invert', () => {
    const view = proj(w, h, 1.5);
    const into: MaskView = { ...view, invertInto: (x, y, out) => { const ll = view.invert(x, y); if (!ll) return false; out[0] = ll[0]; out[1] = ll[1]; return true; } };
    const a = buildMask(view, regions, cell), b = buildMask(into, regions, cell);
    expect(Buffer.from(b.region.buffer)).toEqual(Buffer.from(a.region.buffer));
  });

  test('a plan from a sliced mask equals the plan made in one go', async () => {
    const d = data(feats), view = proj(w, h);
    const mask = (await buildMaskSliced(view, d.regions, maskCell(w), slicing()))!;
    const one = planLabels(d, view, THEMES['atlas']!), sliced = planLabels(d, view, THEMES['atlas']!, { mask });
    expect(JSON.stringify(sliced)).toBe(JSON.stringify(one));
    expect(one.labels.length).toBeGreaterThan(0);
  });

  test('a cancelled build stops at the next slice and returns null', async () => {
    const s = slicing(2);
    expect(await buildMaskSliced(proj(w, h), regions, cell, s)).toBeNull();
    expect(s.yields).toBe(2);
  });
});
