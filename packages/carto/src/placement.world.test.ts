// Label placement on a real generated world (20k cells): the invariants a map reader relies on, in several projections and zooms.
import { beforeAll, describe, expect, test } from 'vitest';
import { ProjectionView, type ViewOptions } from '@mapmaker/projection';
import { type CartoData, REGION_LAND, computeCartoData } from './data';
import { regionAt } from './label-mask';
import type { LabelBounds } from './label-spread';
import { furnitureLayout } from './overlay';
import { type LabelPlan, inkOf, planLabels } from './placement';
import { THEMES } from './style';
import { testWorld } from './test-world';

let data: CartoData;
beforeAll(async () => { data = computeCartoData(await testWorld(20000, 12345)); }, 120_000);

type V = Partial<ViewOptions> & { projection: string };
const W = 1000, H = 540;
const make = (v: V, w = W, h = H) => new ProjectionView({ width: w, height: h, ...v } as ViewOptions);
const plan = (v: V, theme = 'atlas', limb = v.projection === 'orthographic', w = W, h = H): { plan: LabelPlan; view: ProjectionView; obstacles: LabelBounds[] } => {
  const view = make(v, w, h), style = THEMES[theme]!, fur = furnitureLayout(w, h, style, { scaleBar: true, legend: true });
  const obstacles = [fur.scale, fur.legend].filter((b): b is LabelBounds => !!b);
  return { plan: planLabels(data, view, style, { obstacles, limb }), view, obstacles };
};

const VIEWS: [string, V][] = [
  ['robinson 1×', { projection: 'robinson' }],
  ['robinson 2×', { projection: 'robinson', zoom: 2 }],
  ['robinson 4× panned', { projection: 'robinson', zoom: 4, pan: [120, -40] }],
  ['equirectangular 1×', { projection: 'equirectangular' }],
  ['mollweide 1×', { projection: 'mollweide' }],
  ['orthographic 1×', { projection: 'orthographic' }],
  ['orthographic rotated', { projection: 'orthographic', rotate: [-40, -20, 0] }],
];
const area = (b: LabelBounds) => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
const inter = (a: LabelBounds, b: LabelBounds) => area({ x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2) });

describe('placed labels, every view', () => {
  for (const [name, v] of VIEWS) {
    test(`${name}: no overlap beyond the ramp, inside the view and the map, clear of the legend and scale bar`, () => {
      const { plan: p, view, obstacles } = plan(v);
      expect(p.labels.length).toBeGreaterThan(3);
      const ink = p.labels.map((l) => inkOf(l));
      for (let i = 0; i < ink.length; i++) for (let j = i + 1; j < ink.length; j++) {
        for (const a of ink[i]!) for (const b of ink[j]!) {
          const covered = inter(a, b) / Math.min(area(a), area(b));
          expect(covered, `${p.labels[i]!.text} / ${p.labels[j]!.text}`).toBeLessThanOrEqual(0.2);
        }
      }
      for (const [k, boxes] of ink.entries()) for (const b of boxes) {
        const t = p.labels[k]!.text;
        expect(b.x1, t).toBeGreaterThanOrEqual(-0.5);
        expect(b.y1, t).toBeGreaterThanOrEqual(-0.5);
        expect(b.x2, t).toBeLessThanOrEqual(W + 0.5);
        expect(b.y2, t).toBeLessThanOrEqual(H + 0.5);
        expect(view.invert((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2), `${t} is on the map`).not.toBeNull();
        for (const o of obstacles) expect(inter(b, o), `${t} vs the furniture`).toBe(0);
      }
    });

    test(`${name}: ocean and sea names are on water, continent names on land`, () => {
      const { plan: p, view } = plan(v);
      for (const l of p.labels.filter((x) => x.kind === 'ocean' || x.kind === 'sea' || x.kind === 'continent')) {
        let land = 0, n = 0;
        for (const b of inkOf(l)) {
          const ll = view.invert((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2);
          if (!ll) continue;
          const r = regionAt(data.regions, ll[0], ll[1]), onLand = r === REGION_LAND || (r >= 0 && (data.features[r]!.kind === 'continent' || data.features[r]!.kind === 'island'));
          n++; if (onLand) land++;
        }
        if (l.kind === 'continent') expect(land / n, l.text).toBeGreaterThanOrEqual(0.6);
        // At most one glyph run in five: a run of three letters may touch a skerry the coarse raster resolves differently.
        else expect(land / n, l.text).toBeLessThanOrEqual(0.2);
      }
    });

    test(`${name}: the same view and seed give the same plan`, () => {
      expect(JSON.stringify(plan(v).plan)).toBe(JSON.stringify(plan(v).plan));
    });
  }
});

describe('stability', () => {
  for (const zoom of [2, 4]) {
    test(`robinson ${zoom}×: a small pan moves the labels with the map; none flicker in or out`, () => {
      const base = plan({ projection: 'robinson', zoom, pan: [30, 10] }).plan;
      let kept = 0, moved = 0, total = 0;
      // Names within 60 px of the view's edge slide in and out as the area they sit in is cut by the edge; they are left out.
      const interior = (l: (typeof base.labels)[number]) => inkOf(l).every((b) => b.x1 > 60 && b.x2 < W - 60 && b.y1 > 60 && b.y2 < H - 60);
      for (const dx of [2, 5, 9]) {
        const next = plan({ projection: 'robinson', zoom, pan: [30 + dx, 10] }).plan, byId = new Map(next.labels.map((l) => [l.id, l]));
        for (const l of base.labels.filter(interior)) {
          total++;
          const m = byId.get(l.id);
          if (!m) continue;
          kept++;
          // Point labels move by the pan (±2 px); path labels keep their stretch of path (same start offset ±5 %).
          if (l.x !== undefined ? Math.abs(m.x! - l.x - dx) <= 2 && Math.abs(m.y! - l.y!) <= 2 : Math.abs((m.startOffset ?? 0) - (l.startOffset ?? 0)) <= 5) moved++;
        }
      }
      expect(kept / total, 'labels kept').toBeGreaterThanOrEqual(0.9);
      expect(moved / kept, 'labels that moved with the map').toBeGreaterThanOrEqual(0.9);
    });
  }

  test('orthographic: a small rotation keeps the labels; they appear or vanish only at the limb', () => {
    const base = plan({ projection: 'orthographic', rotate: [-20, -10, 0] }, 'atlas', true, 800, 800).plan;
    let kept = 0, total = 0;
    for (const d of [1, 2, 3]) {
      const next = plan({ projection: 'orthographic', rotate: [-20 - d, -10, 0] }, 'atlas', true, 800, 800).plan, ids = new Set(next.labels.map((l) => l.id));
      for (const l of base.labels) { total++; if (ids.has(l.id)) kept++; }
    }
    expect(kept / total).toBeGreaterThanOrEqual(0.85);
  });
});

describe('zoom and the globe', () => {
  test('zoomed into a continent, its name is still on the map and more of the small detail appears', () => {
    const c = data.features.find((f) => f.kind === 'continent')!;
    const at = make({ projection: 'equirectangular', zoom: 4 }).forward(c.lon, c.lat), centre = at ?? [W / 2, H / 2];
    const near = plan({ projection: 'robinson', zoom: 1 }).plan, zoomed = plan({ projection: 'equirectangular', zoom: 4, pan: [W / 2 - centre[0], H / 2 - centre[1]] }).plan;
    expect(zoomed.labels.some((l) => l.kind === 'continent')).toBe(true);
    expect(near.labels.some((l) => l.kind === 'continent')).toBe(true);
    expect(zoomed.labels.some((l) => l.kind === 'river' || l.kind === 'range' || l.kind === 'island')).toBe(true);
  });

  test('on a sphere, names keep off the limb: inside 96% of the radius, faded towards it', () => {
    const size = 800, R = size / 2;
    for (const rotate of [[0, 0, 0], [-60, -25, 0], [110, 30, 0]] as [number, number, number][]) {
      const { plan: p } = plan({ projection: 'orthographic', rotate }, 'atlas', true, size, size);
      for (const l of p.labels) for (const b of inkOf(l)) {
        const cx = (b.x1 + b.x2) / 2 - R, cy = (b.y1 + b.y2) / 2 - R;
        expect(Math.hypot(cx, cy), `${l.text} at ${rotate}`).toBeLessThan(0.96 * R);
      }
      for (const l of p.labels) expect(l.opacity).toBeGreaterThan(0.1);
      expect(p.labels.length).toBeGreaterThan(2);
    }
  });
});
