import { describe, expect, test } from 'vitest';
import type { CartoData, CartoFeature } from './data';
import { planLabels, type Projector } from './placement';
import { THEMES } from './style';

/** An equirectangular projector over `w × h` pixels. */
const proj = (w: number, h: number, zoom = 1): Projector => ({
  width: w, height: h,
  forward: (lon, lat) => (Math.abs(lat) > 90 ? null : [w / 2 + (((lon + 180) / 360) * w - w / 2) * zoom, h / 2 + (((90 - lat) / 180) * h - h / 2) * zoom]),
});

const feat = (kind: CartoFeature['kind'], name: string, lon: number, lat: number, radiusDeg: number, path?: number[]): CartoFeature => ({
  id: `${kind}:${Math.round(lon / 3)}:${Math.round(lat / 3)}`, kind, name, lon, lat, area: radiusDeg, radius: (radiusDeg * Math.PI) / 180, ...(path ? { path } : {}),
});
const data = (features: CartoFeature[]): CartoData => ({ seed: 's', landmass: new Int32Array(0), landmasses: [], features, rivers: [], coast: { type: 'MultiLineString', coordinates: [] }, radius_m: 6_371_000 });
const style = THEMES['atlas']!;

describe('label plan', () => {
  test('a continent label is centred near its anchor and an overlapping neighbour is pushed apart', () => {
    const d = data([feat('continent', 'Alpha', 0, 0, 30), feat('continent', 'Alphaville', 4, 1, 28)]);
    const plan = planLabels(d, proj(1000, 500), style);
    expect(plan.labels).toHaveLength(2);
    expect(plan.stats.remainingOverlaps).toBeLessThanOrEqual(plan.stats.initialOverlaps);
    expect(plan.stats.initialOverlaps).toBe(1);
    expect(plan.stats.remainingOverlaps).toBe(0);
    for (const l of plan.labels) { expect(l.x).toBeGreaterThan(300); expect(l.x).toBeLessThan(700); expect(l.text).toBe(l.text.toUpperCase()); }
  });

  test('small features appear only when the view is large enough, large ones always', () => {
    const d = data([feat('continent', 'Big', 0, 0, 30), feat('island', 'Tiny', 20, 10, 0.5), feat('sea', 'Small Sea', -20, 5, 1)]);
    expect(planLabels(d, proj(1000, 500), style).labels.map((l) => l.id).sort()).toEqual(['continent:0:0']);
    // Zoomed in 8× about the centre the island and the sea are big enough (sizes are relative to the view's width, so a larger
    // export of the same view shows the same labels; zoom is what reveals more).
    const zoomed = planLabels(d, proj(1000, 500, 8), style).labels.map((l) => l.kind).sort();
    expect(zoomed).toContain('island');
    expect(zoomed).toContain('sea');
    expect(planLabels(d, proj(8000, 4000), style).labels.map((l) => l.id).sort()).toEqual(['continent:0:0']);
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

  test('rivers below the drawing threshold are not labelled; the label cap keeps the most important', () => {
    const rv = feat('river', 'Faint River', 0, 0, 40, [-60, 0, 0, 5, 60, 0]);
    expect(planLabels(data([{ ...rv, area: 0.001 }]), proj(1000, 500), style, { riverMinArea: 0.01 }).labels).toHaveLength(0);
    const many = Array.from({ length: 30 }, (_, i) => feat('island', `Isle${i}`, -170 + 11 * i, 30 - (i % 5) * 10, 3));
    const capped = planLabels(data(many.map((f, i) => ({ ...f, area: 30 - i }))), proj(8000, 4000), style, { maxLabels: 5 });
    expect(capped.labels).toHaveLength(5);
    expect(capped.labels.map((l) => l.text)).toEqual(expect.arrayContaining(['Isle0', 'Isle1', 'Isle2', 'Isle3', 'Isle4']));
  });

  test('obstacles are avoided, features off the map are dropped, and the plan is deterministic', () => {
    const d = data([feat('continent', 'Alpha', 0, 0, 30), feat('continent', 'Off', 0, 95, 30)]);
    const obstacle = { x1: 440, y1: 235, x2: 560, y2: 265 };
    const plan = planLabels(d, proj(1000, 500), style, { obstacles: [obstacle] });
    expect(plan.labels).toHaveLength(1);
    expect(plan.stats.remainingOverlaps).toBe(0);
    expect(JSON.stringify(planLabels(d, proj(1000, 500), style, { obstacles: [obstacle] }))).toBe(JSON.stringify(plan));
  });
});
