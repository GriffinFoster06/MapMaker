import { describe, expect, test } from 'vitest';
import { type CartoData, type CartoFeature, REGION_WATER, type RegionGrid } from './data';
import { inkOf, planLabels, type Projector } from './placement';
import { THEMES } from './style';

/** An equirectangular projector over `w × h` pixels, zoomed about the centre and panned. */
export const proj = (w: number, h: number, zoom = 1, pan: [number, number] = [0, 0]): Projector => ({
  width: w, height: h,
  forward: (lon, lat) => (Math.abs(lat) > 90 ? null : [w / 2 + pan[0] + (((lon + 180) / 360) * w - w / 2) * zoom, h / 2 + pan[1] + (((90 - lat) / 180) * h - h / 2) * zoom]),
  invert: (x, y) => {
    const lat = 90 - ((((y - h / 2 - pan[1]) / zoom) + h / 2) / h) * 180, lon = ((((x - w / 2 - pan[0]) / zoom) + w / 2) / w) * 360 - 180;
    return Math.abs(lat) > 90 || Math.abs(lon) > 180 ? null : [lon, lat];
  },
});

const feat = (kind: CartoFeature['kind'], name: string, lon: number, lat: number, radiusDeg: number, path?: number[]): CartoFeature => ({
  id: `${kind}:${Math.round(lon / 3)}:${Math.round(lat / 3)}`, kind, name, lon, lat, area: radiusDeg, radius: (radiusDeg * Math.PI) / 180, ...(path ? { path } : {}),
});

/** A regions raster with every area feature painted as a disc of its radius (the nearest centre, as a fraction of its radius, wins). */
export function regionsFor(features: CartoFeature[]): RegionGrid {
  const w = 720, h = 360, id = new Int16Array(w * h).fill(REGION_WATER), R = Math.PI / 180;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const lon = (-180 + (i + 0.5) * 0.5) * R, lat = (90 - (j + 0.5) * 0.5) * R;
    let best = -1, bestRatio = 1;
    features.forEach((f, k) => {
      if (f.path) return;
      const dot = Math.sin(lat) * Math.sin(f.lat * R) + Math.cos(lat) * Math.cos(f.lat * R) * Math.cos(lon - f.lon * R), d = Math.acos(Math.min(1, Math.max(-1, dot))), ratio = d / f.radius;
      if (ratio <= bestRatio) { bestRatio = ratio; best = k; }
    });
    if (best >= 0) id[j * w + i] = best;
  }
  return { w, h, id };
}

export const data = (features: CartoFeature[]): CartoData => ({ seed: 's', regions: regionsFor(features), landmass: new Int32Array(0), landmasses: [], features, rivers: [], coast: { type: 'MultiLineString', coordinates: [] }, radius_m: 6_371_000 });
const style = THEMES['atlas']!;

describe('label plan', () => {
  test('a continent label sits on its own ground, centred near its anchor', () => {
    const plan = planLabels(data([feat('continent', 'Alpha', 0, 0, 30)]), proj(1000, 500), style);
    expect(plan.labels).toHaveLength(1);
    const l = plan.labels[0]!;
    expect(l.x!).toBeGreaterThan(380);
    expect(l.x!).toBeLessThan(560);
    expect(l.y!).toBeGreaterThan(220);
    expect(l.y!).toBeLessThan(280);
    expect(l.text).toBe('ALPHA');
  });

  test('two names that would overlap are separated by the solver', () => {
    const d = data([feat('island', 'Alpha', 0, 0, 5), feat('island', 'Alphaville', 2, 0.4, 5)]);
    const plan = planLabels(d, proj(1000, 500, 3), style);
    expect(plan.labels).toHaveLength(2);
    expect(plan.stats.initialOverlaps).toBeGreaterThanOrEqual(1);
    const [a, b] = plan.labels.map((l) => inkOf(l));
    for (const p of a!) for (const q of b!) expect(Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > 1 && Math.min(p.y2, q.y2) - Math.max(p.y1, q.y1) > 1).toBe(false);
  });

  test('a path label is set clear of the area names; when the only stretch is under one, it is dropped', () => {
    const long = feat('river', 'Crossing River', 0, 0, 20, [-40, 0, -20, 0, 0, 0, 20, 0, 40, 0]);
    const plan = planLabels(data([feat('continent', 'Alpha', 0, 0, 40), long]), proj(1000, 500), style);
    expect(plan.labels.map((l) => l.kind).sort()).toEqual(['continent', 'river']);
    const [a, b] = [plan.labels.find((l) => l.kind === 'continent')!, plan.labels.find((l) => l.kind === 'river')!].map((l) => inkOf(l));
    for (const p of a!) for (const q of b!) expect(Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > 1 && Math.min(p.y2, q.y2) - Math.max(p.y1, q.y1) > 1).toBe(false);
    const short = feat('river', 'Crossing River', 0, 0, 5, [-14, 0, 14, 0]);
    expect(planLabels(data([feat('continent', 'Alpha', 0, 0, 40), short]), proj(1000, 500), style).labels.map((l) => l.kind)).toEqual(['continent']);
  });

  test('small features appear only when the view is large enough, large ones always', () => {
    const d = data([feat('continent', 'Big', 0, 0, 7), feat('island', 'Tiny', 12, 5, 0.5), feat('sea', 'Small Sea', -12, 3, 3)]);
    expect(planLabels(d, proj(1000, 500), style).labels.map((l) => l.kind)).toEqual(['continent']);
    // Zoomed in 8× about the centre the island and the sea are big enough (sizes are relative to the view's width, so a larger
    // export of the same view shows the same labels; zoom is what reveals more).
    const zoomed = planLabels(d, proj(1000, 500, 8, [-100, 0]), style).labels.map((l) => l.kind).sort();
    expect(zoomed).toContain('island');
    expect(zoomed).toContain('sea');
    expect(planLabels(d, proj(8000, 4000), style).labels.map((l) => l.kind)).toEqual(['continent']);
  });

  test('a path label follows its line, runs left to right and stays within the line; short lines are skipped', () => {
    const river = feat('river', 'Long River', 0, 0, 40, [-60, -5, -30, 8, 0, -4, 30, 6, 60, 0]);
    const short = feat('river', 'Brook', 100, 20, 1, [100, 20, 101, 20.5]);
    const plan = planLabels(data([river, short]), proj(1000, 500), style);
    expect(plan.labels).toHaveLength(1);
    const l = plan.labels[0]!;
    expect(l.pathD!.startsWith('M')).toBe(true);
    expect(l.startOffset).toBeGreaterThanOrEqual(20);
    expect(l.startOffset).toBeLessThanOrEqual(80);
    // The path in pixels runs left to right.
    const xs = [...l.pathD!.matchAll(/[ML]([\d.-]+) /g)].map((m) => Number(m[1]));
    expect(xs[0]!).toBeLessThan(xs[xs.length - 1]!);
  });

  test('a path label is set on a smoothed stretch: a zig-zag river is not written along its zig-zags', () => {
    // 4 px zig-zags: the raw line turns 80° at every vertex; text on it would be unreadable.
    const pts: number[] = [];
    for (let k = 0; k <= 40; k++) pts.push(-40 + 2 * k, k % 2 ? 1.5 : -1.5);
    const plan = planLabels(data([feat('river', 'Zigzag River', 0, 0, 40, pts)]), proj(1000, 500), style);
    expect(plan.labels).toHaveLength(1);
    const p = [...plan.labels[0]!.pathD!.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    let turning = 0;
    for (let k = 2; k < p.length; k++) {
      const a = Math.atan2(p[k - 1]![1] - p[k - 2]![1], p[k - 1]![0] - p[k - 2]![0]), b = Math.atan2(p[k]![1] - p[k - 1]![1], p[k]![0] - p[k - 1]![0]);
      turning = Math.max(turning, Math.abs(b - a));
    }
    expect(turning).toBeLessThan(0.5);
  });

  test('rivers below the drawing threshold are not labelled; the label cap keeps the most important', () => {
    const rv = feat('river', 'Faint River', 0, 0, 40, [-60, 0, 0, 5, 60, 0]);
    expect(planLabels(data([{ ...rv, area: 0.001 }]), proj(1000, 500), style, { riverMinArea: 0.01 }).labels).toHaveLength(0);
    const many = Array.from({ length: 30 }, (_, i) => feat('island', `Isle${i}`, -170 + 11 * i, 30 - (i % 5) * 10, 3));
    const capped = planLabels(data(many.map((f, i) => ({ ...f, area: 30 - i }))), proj(8000, 4000), style, { maxLabels: 5 });
    expect(capped.labels).toHaveLength(5);
    expect(capped.labels.map((l) => l.text)).toEqual(expect.arrayContaining(['Isle0', 'Isle1', 'Isle2', 'Isle3', 'Isle4']));
  });

  test('obstacles are avoided, features off the map are dropped, and the plan is deterministic', () => {
    const d = data([feat('continent', 'Alpha', 0, 0, 30), feat('continent', 'Off', 170, 0, 5)]);
    const obstacle = { x1: 440, y1: 235, x2: 560, y2: 265 };
    const plan = planLabels(d, proj(1000, 500, 2), style, { obstacles: [obstacle] });
    expect(plan.labels).toHaveLength(1);
    expect(plan.stats.remainingOverlaps).toBe(0);
    for (const b of inkOf(plan.labels[0]!)) expect(b.x2 < obstacle.x1 || b.x1 > obstacle.x2 || b.y2 < obstacle.y1 || b.y1 > obstacle.y2).toBe(true);
    expect(JSON.stringify(planLabels(d, proj(1000, 500, 2), style, { obstacles: [obstacle] }))).toBe(JSON.stringify(plan));
  });

  test('an ocean name stays off the land and a continent name stays off the water', () => {
    // A continent in the middle of an ocean basin: the ocean's name must find water on one side, never sit on the continent.
    const d = data([feat('continent', 'Land', 0, 0, 14), feat('ocean', 'Wide Ocean', 0, 0, 80)]);
    const plan = planLabels(d, proj(1000, 500), style);
    const ocean = plan.labels.find((l) => l.kind === 'ocean');
    expect(ocean).toBeDefined();
    const g = d.regions;
    for (const b of inkOf(ocean!)) for (const [x, y] of [[b.x1, b.y1], [b.x2, b.y2], [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2]] as const) {
      const lon = (x / 1000) * 360 - 180, lat = 90 - (y / 500) * 180, i = Math.floor(((lon + 180) / 360) * g.w), j = Math.floor(((90 - lat) / 180) * g.h);
      expect(d.features[g.id[j * g.w + i]!]?.kind).not.toBe('continent');
    }
  });

  test('a continent that fills the view keeps its name, centred in the visible part', () => {
    const d = data([feat('continent', 'Huge', 0, 0, 40)]);
    // Zoomed 6× about a point well east of the anchor: the anchor is out of view, the ground is not.
    const plan = planLabels(d, proj(1000, 500, 6, [-600, 0]), style);
    expect(plan.labels.map((l) => l.text)).toEqual(['HUGE']);
    expect(plan.labels[0]!.x!).toBeGreaterThan(0);
    expect(plan.labels[0]!.x!).toBeLessThan(1000);
  });
});
