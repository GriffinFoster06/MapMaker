// Tests of the label-spread port. The first three groups are Azgaar's own tests of the solver, the Burg candidates and the
// path offsets (upstream/Azgaars-Fantasy-Map-Generator/src/controllers/label-spread-*.test.ts at 3d94b80, MIT), run against
// the port with the same inputs and expectations; the rest test what the port adds (data-driven requests, determinism).
import { describe, expect, test } from 'vitest';
import {
  type LabelBounds, type LabelPlacementCandidate, type LabelPlacementItem, type LabelRequest, type Measurement,
  getBurgLabelCandidates, getPathStartOffsetCandidates, getPathStartOffsetPreference, isPathTextUpright, optimizeLabelPlacements, spreadLabels,
} from './label-spread';
import { measureText, textWidth } from './font-metrics';

const MAP = { x1: 0, y1: 0, x2: 100, y2: 100 };

/** A 10×10 label box placed at x, kept on a single row so overlaps are easy to reason about. */
function box(x: number, preference = 0): LabelPlacementCandidate {
  const bounds = { x1: x, y1: 0, x2: x + 10, y2: 10 };
  return { placement: { dx: x, dy: 0 }, bounds, collisionBounds: bounds, preference };
}
const solve = (items: LabelPlacementItem[]) => optimizeLabelPlacements(items, MAP, 'seed');

describe('label spread solver (Azgaar tests)', () => {
  test('counts and clears a partial overlap that a hard ratio threshold would have ignored', () => {
    const movable = [box(7.5), box(10, 50)]; // covers a quarter of the blocking label
    const solution = solve([{ id: 'blocking', candidates: [box(0)] }, { id: 'movable', candidates: movable }]);
    expect(solution.initialOverlaps).toBe(1);
    expect(solution.remainingOverlaps).toBe(0);
    expect(solution.selected.get('movable')).toBe(movable[1]);
  });

  test('leaves hairline contact alone', () => {
    const movable = [box(9.8), box(20, 50)];
    const solution = solve([{ id: 'blocking', candidates: [box(0)] }, { id: 'movable', candidates: movable }]);
    expect(solution.initialOverlaps).toBe(0);
    expect(solution.selected.get('movable')).toBe(movable[0]);
  });

  test('moves a collision-free neighbour out of the way to unblock a chain', () => {
    const middle = [box(5), box(15, 100)];
    const last = [box(15), box(25, 100)];
    const solution = solve([{ id: 'blocking', candidates: [box(0)] }, { id: 'middle', candidates: middle }, { id: 'last', candidates: last }]);
    expect(solution.initialOverlaps).toBe(1);
    expect(solution.remainingOverlaps).toBe(0);
    expect(solution.selected.get('middle')).toBe(middle[1]);
    expect(solution.selected.get('last')).toBe(last[1]);
  });

  test('keeps every label put when nothing overlaps', () => {
    const items = [0, 20, 40].map((x) => ({ id: `label${x}`, candidates: [box(x), box(x + 10, 50)] }));
    const solution = solve(items);
    expect(solution.initialOverlaps).toBe(0);
    expect(solution.remainingOverlaps).toBe(0);
    for (const item of items) expect(solution.selected.get(item.id)).toBe(item.candidates[0]);
  });
});

function current(bounds = { x1: 40, y1: 40, x2: 60, y2: 44 }): LabelPlacementCandidate {
  return { placement: { dx: 0, dy: 0 }, bounds, collisionBounds: bounds, preference: 0 };
}

describe('label spread Burg candidates (Azgaar tests)', () => {
  const icon = { x1: 45, y1: 45, x2: 55, y2: 55 };
  test('creates six placements around the icon without covering it', () => {
    const candidates = getBurgLabelCandidates({ current: current(), iconBounds: icon, gap: 2 });
    expect(candidates).toHaveLength(7);
    for (const { bounds } of candidates) {
      const overlapsIcon = Math.min(bounds.x2, icon.x2) > Math.max(bounds.x1, icon.x1) && Math.min(bounds.y2, icon.y2) > Math.max(bounds.y1, icon.y1);
      expect(overlapsIcon).toBe(false);
    }
  });

  test('offers a centered slot above and below plus the four diagonals', () => {
    const slots = getBurgLabelCandidates({ current: current(), iconBounds: icon, gap: 2 }).slice(1).map((c) => [c.bounds.x1, c.bounds.y1]);
    expect(new Set(slots.map(String))).toEqual(new Set([[40, 39], [40, 57], [23, 46], [57, 46], [23, 50], [57, 50]].map(String)));
  });

  test('measures the gap from the text ink rather than the text box', () => {
    const bounds = { x1: 40, y1: 36, x2: 60, y2: 48 };
    const candidates = getBurgLabelCandidates({
      current: { placement: { dx: 0, dy: 0 }, bounds, collisionBounds: bounds, preference: 0, inkBounds: [{ x1: 40, y1: 40, x2: 60, y2: 44 }] },
      iconBounds: icon, gap: 2,
    });
    expect(candidates.find((c) => c.placement.dy === -1)?.bounds).toEqual({ x1: 40, y1: 35, x2: 60, y2: 47 });
  });

  test('keeps wide diagonal labels close to the icon center', () => {
    const candidates = getBurgLabelCandidates({ current: current({ x1: 10, y1: 40, x2: 70, y2: 44 }), iconBounds: icon, gap: 2 });
    expect(new Set(candidates.slice(1).map((c) => c.bounds.x1))).toEqual(new Set([20, -17, 57]));
  });

  test('moves a Burg name off the icon it is covering', () => {
    const burgCandidates = getBurgLabelCandidates({ current: current({ x1: 40, y1: 46, x2: 60, y2: 54 }), iconBounds: icon, gap: 2 });
    const solution = optimizeLabelPlacements(
      [{ id: 'name', kind: 'burg', candidates: burgCandidates }, { id: 'icon', obstacle: true, candidates: [{ placement: {}, bounds: icon, collisionBounds: icon, preference: 0 }] }],
      MAP, 'seed',
    );
    expect(solution.initialOverlaps).toBe(1);
    expect(solution.remainingOverlaps).toBe(0);
    expect(solution.selected.get('name')).not.toBe(burgCandidates[0]);
  });

  test('keeps a collision-free current placement', () => {
    const burgCandidates = getBurgLabelCandidates({ current: current(), iconBounds: icon, gap: 2 });
    const solution = optimizeLabelPlacements([{ id: 'burg', candidates: burgCandidates }, { id: 'other', candidates: [current({ x1: 70, y1: 70, x2: 80, y2: 75 })] }], MAP, 'seed');
    expect(solution.initialOverlaps).toBe(0);
    expect(solution.selected.get('burg')).toBe(burgCandidates[0]);
    expect(solution.selected.get('burg')?.placement).toEqual({ dx: 0, dy: 0 });
  });

  test('keeps the current placement first so the optimizer can judge the collision', () => {
    const candidates = getBurgLabelCandidates({ current: current({ x1: 40, y1: 40, x2: 60, y2: 50 }), iconBounds: icon, gap: 2 });
    expect(candidates).toHaveLength(7);
    expect(candidates[0]!.placement).toEqual({ dx: 0, dy: 0 });
    expect(candidates.slice(1).every((c) => c.preference >= 120)).toBe(true);
  });

  test('ranks Burg slots by screen-space distance', () => {
    const candidates = getBurgLabelCandidates({ current: current(), iconBounds: icon, gap: 2, changePenalty: 300, displacementScale: 6 });
    const bottomRight = candidates.find((c) => c.placement.dx === 17 && c.placement.dy === 10);
    expect(bottomRight?.preference).toBeCloseTo(300 + Math.hypot(17, 10) * 6, 12);
  });

  test('uses a free nearby slot instead of retaining a Burg collision', () => {
    const burgCandidates = getBurgLabelCandidates({ current: current(), iconBounds: icon, gap: 2, displacementScale: 6 });
    const solution = optimizeLabelPlacements([{ id: 'moving', kind: 'burg', candidates: burgCandidates }, { id: 'blocking', kind: 'burg', candidates: [current({ x1: 40, y1: 40, x2: 60, y2: 44 })] }], MAP, 'seed');
    expect(solution.remainingOverlaps).toBe(0);
    expect(solution.selected.get('moving')).not.toBe(burgCandidates[0]);
  });
});

function fakePath(points: [number, number][]) {
  const segments = points.slice(1).map(([x, y], index) => {
    const [previousX, previousY] = points[index]!;
    return { previousX, previousY, x, y, length: Math.hypot(x - previousX, y - previousY) };
  });
  const totalLength = segments.reduce((total, segment) => total + segment.length, 0);
  return {
    getTotalLength: () => totalLength,
    getPointAtLength: (distance: number) => {
      let remaining = Math.min(Math.max(distance, 0), totalLength);
      for (const segment of segments) {
        if (remaining > segment.length) { remaining -= segment.length; continue; }
        const ratio = segment.length ? remaining / segment.length : 0;
        return { x: segment.previousX + (segment.x - segment.previousX) * ratio, y: segment.previousY + (segment.y - segment.previousY) * ratio };
      }
      const [x, y] = points.at(-1)!;
      return { x, y };
    },
  };
}

describe('label spread path candidates (Azgaar tests)', () => {
  test('clamps candidate offsets to 20–80 while retaining an in-range current offset', () => {
    expect(getPathStartOffsetCandidates(10)).toEqual([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80]);
    expect(getPathStartOffsetCandidates(40)).toEqual([40, 20, 25, 30, 35, 45, 50, 55, 60, 65, 70, 75, 80]);
    expect(getPathStartOffsetCandidates(90)).toEqual([80, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]);
  });
  test('penalizes only offsets outside the preferred 30–70 range', () => {
    expect([20, 25, 30, 50, 70, 75, 80].map(getPathStartOffsetPreference)).toEqual([100, 25, 0, 0, 0, 25, 100]);
  });
  test('rejects a path whose occupied text interval runs right-to-left', () => {
    expect(isPathTextUpright(fakePath([[100, 0], [0, 0]]), 30, 50)).toBe(false);
  });
  test('rejects a local reversal inside the occupied text interval', () => {
    expect(isPathTextUpright(fakePath([[0, 0], [60, 0], [40, 10], [100, 10]]), 50, 50)).toBe(false);
  });
  test('accepts a left-to-right occupied interval', () => {
    expect(isPathTextUpright(fakePath([[0, 0], [30, -10], [70, 10], [100, 0]]), 40, 50)).toBe(true);
  });
});

/** A point label of `text` at screen position (x, y) (baseline left). */
function pointRequest(id: string, text: string, x: number, y: number, size = 12): LabelRequest {
  const m = measureText(text, { size });
  const t = (b: LabelBounds): LabelBounds => ({ x1: b.x1 + x, y1: b.y1 + y, x2: b.x2 + x, y2: b.y2 + y });
  return { type: 'point', id, bounds: t(m.bounds), inkBounds: m.ink.map(t) };
}
const VP = { bounds: { x1: 0, y1: 0, x2: 400, y2: 300 }, scale: 1 };

describe('spreadLabels (data-driven requests)', () => {
  test('two labels on top of each other are separated and neither leaves the map', () => {
    const r = spreadLabels([pointRequest('a', 'Northmark', 150, 150), pointRequest('b', 'Southmark', 152, 151)], [], VP, 's1');
    expect(r.initialOverlaps).toBe(1);
    expect(r.remainingOverlaps).toBe(0);
    for (const l of r.labels) expect(l.candidate.bounds.x1).toBeGreaterThanOrEqual(0);
  });

  test('the same input gives the same placement; a different seed string may differ but stays nearly collision-free', () => {
    const reqs = [0, 1, 2, 3].map((i) => pointRequest(`l${i}`, `Province ${i}`, 100 + 6 * i, 100 + 3 * i));
    const a = spreadLabels(reqs, [], VP, 'world-1'), b = spreadLabels(reqs, [], VP, 'world-1');
    expect(JSON.stringify(a.labels.map((l) => [l.id, l.placement]))).toBe(JSON.stringify(b.labels.map((l) => [l.id, l.placement])));
    // The candidate set is discrete (rings in label heights), so a tight stack of four may keep one graze; the solver
    // cuts the six initial overlaps to at most one, whatever the seed.
    expect(a.initialOverlaps).toBe(6);
    expect(a.remainingOverlaps).toBeLessThanOrEqual(1);
    expect(spreadLabels(reqs, [], VP, 'world-2').remainingOverlaps).toBeLessThanOrEqual(1);
  });

  test('an obstacle (an icon) is avoided', () => {
    const icon = { x1: 150, y1: 140, x2: 200, y2: 152 };
    const r = spreadLabels([pointRequest('a', 'Harbour', 152, 150)], [icon], VP, 's');
    expect(r.initialOverlaps).toBe(1);
    expect(r.remainingOverlaps).toBe(0);
  });

  test('a path label picks an upright offset that fits and avoids a point label on its line', () => {
    const pts: [number, number][] = [[20, 100], [120, 90], [220, 110], [380, 100]];
    const path = fakePath(pts);
    const textLen = textWidth('River Aln', { size: 12 });
    const measure = (startOffset: number): Measurement | null => {
      const len = path.getTotalLength(), centre = (len * startOffset) / 100, start = centre - textLen / 2;
      const upright = isPathTextUpright(path, textLen, startOffset);
      if (start < 0 || start + textLen > len) return { bounds: { x1: 0, y1: 0, x2: 0, y2: 0 }, inkBounds: [{ x1: 0, y1: 0, x2: 1, y2: 1 }], textLength: textLen, pathLength: len, upright: false };
      const ink: LabelBounds[] = [];
      for (let k = 0; k < 3; k++) {
        const a = path.getPointAtLength(start + (textLen * k) / 3), b = path.getPointAtLength(start + (textLen * (k + 1)) / 3);
        ink.push({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y) - 8, x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) + 3 });
      }
      return { bounds: ink.reduce((u, b) => ({ x1: Math.min(u.x1, b.x1), y1: Math.min(u.y1, b.y1), x2: Math.max(u.x2, b.x2), y2: Math.max(u.y2, b.y2) })), inkBounds: ink, textLength: textLen, pathLength: len, upright };
    };
    const req: LabelRequest = { type: 'path', id: 'river', path, startOffset: 50, measure };
    const blocker = pointRequest('town', 'Westerly Crossing', 140, 96);
    const r = spreadLabels([req, blocker], [], VP, 's');
    expect(r.remainingOverlaps).toBe(0);
    const river = r.labels.find((l) => l.id === 'river')!;
    expect(river.placement.startOffset).toBeGreaterThanOrEqual(20);
    expect(river.placement.startOffset).toBeLessThanOrEqual(80);
  });
});
