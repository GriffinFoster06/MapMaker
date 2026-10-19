import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH, TOOLS, addStrokePoint, brushRadiusRad, buildDraft, lonLatDegToUnit, ringPoints, toolById, unitToLonLatDeg } from './editing';

describe('editing tools', () => {
  it('every tool has unique id, in-range defaults, and a known target', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(['elevation', 'koppen', 'plate']).toContain(t.target);
      for (const p of t.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
    }
    expect(() => toolById('nope')).toThrow(/unknown tool/);
  });
  it('a stroke becomes a brush edit with radius in radians, clamped values and a gesture id', () => {
    const t = toolById('raise');
    const d = buildDraft(t, { ...DEFAULT_BRUSH, radiusDeg: 10, falloff: 2 }, { amount: 99999 }, [1, 0, 0, 0, 1, 0], 7);
    expect(d.target).toEqual({ kind: 'layer', id: 'elevation' });
    expect(d.region).toEqual({ kind: 'brush', path: [1, 0, 0, 0, 1, 0], radius: (10 * Math.PI) / 180, falloff: 1 });
    expect(d.payload).toEqual({ amount: 3000 });
    expect(d).toMatchObject({ op: 'raise', mode: 'pin', gesture: 7, label: 'Raise' });
    expect(d.weight).toBeUndefined();
  });
  it('soft edits carry a weight; seed tools are always seed mode; point tools use only the first point', () => {
    expect(buildDraft(toolById('raise'), { ...DEFAULT_BRUSH, mode: 'soft', weight: 0.3 }, {}, [1, 0, 0], 1)).toMatchObject({ mode: 'soft', weight: 0.3 });
    const h = buildDraft(toolById('hotspot'), { ...DEFAULT_BRUSH, mode: 'soft' }, {}, [1, 0, 0, 0, 1, 0, 0, 0, 1], 2);
    expect(h.mode).toBe('seed');
    expect(h.region).toMatchObject({ kind: 'brush', path: [1, 0, 0] });
    expect(() => buildDraft(toolById('raise'), DEFAULT_BRUSH, {}, [], 1)).toThrow(/at least one point/);
  });
  it('stroke sampling drops points closer than the minimum angle', () => {
    const path: number[] = [];
    expect(addStrokePoint(path, [1, 0, 0], 0.1)).toBe(true);
    expect(addStrokePoint(path, lonLatDegToUnit(1, 0), 0.1)).toBe(false);
    expect(addStrokePoint(path, lonLatDegToUnit(10, 0), 0.1)).toBe(true);
    expect(path).toHaveLength(6);
  });
  it('longitude and latitude map to the canonical frame', () => {
    const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 12));
    near(lonLatDegToUnit(0, 0), [1, 0, 0]);
    near(lonLatDegToUnit(90, 0), [0, 1, 0]);
    near(lonLatDegToUnit(0, 90), [0, 0, 1]);
  });
  it('the brush ring: unit vectors at exactly the brush radius from the centre, evenly spaced, at the poles and the antimeridian too', () => {
    const r = brushRadiusRad(9);
    expect(r).toBeCloseTo((9 * Math.PI) / 180, 15);
    expect(brushRadiusRad(1000)).toBeCloseTo(Math.PI / 3, 15);
    expect(brushRadiusRad(0)).toBeCloseTo((0.05 * Math.PI) / 180, 15);
    for (const c of [[1, 0, 0], [0, 0, 1], [0, 0, -1], [-1, 0, 0], lonLatDegToUnit(179.9, 33), lonLatDegToUnit(-45, -80)] as [number, number, number][]) {
      const ring = ringPoints(c, r, 64);
      expect(ring).toHaveLength(192);
      const steps: number[] = [];
      for (let i = 0; i < 64; i++) {
        const x = ring[3 * i]!, y = ring[3 * i + 1]!, z = ring[3 * i + 2]!;
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
        expect(Math.acos(Math.min(1, x * c[0] + y * c[1] + z * c[2]))).toBeCloseTo(r, 10);
        const j = (i + 1) % 64;
        steps.push(Math.acos(Math.min(1, x * ring[3 * j]! + y * ring[3 * j + 1]! + z * ring[3 * j + 2]!)));
      }
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-9);
    }
  });
  it('unit vectors convert back to longitude and latitude', () => {
    const [lon, lat] = unitToLonLatDeg(...lonLatDegToUnit(-123.5, 47.25));
    expect(lon).toBeCloseTo(-123.5, 10);
    expect(lat).toBeCloseTo(47.25, 10);
  });
});
