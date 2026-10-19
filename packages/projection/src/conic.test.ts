// Conic projections (Phase 5c, decision 5c-1): standard parallels as a view parameter, the three scale properties,
// the Lambert conformal cut, and the exact path.
import { describe, expect, it } from 'vitest';
import { distortion } from './distortion';
import { PROJECTIONS, ProjectionView, clampParallels } from './index';

const W = 600, H = 400;
const view = (projection: string, parallels?: [number, number], rotate?: [number, number, number]) =>
  new ProjectionView({ projection, width: W, height: H, ...(parallels ? { parallels } : {}), ...(rotate ? { rotate } : {}) });
const CONICS = ['conicEqualArea', 'conicConformal', 'conicEquidistant'];

describe('conic projections', () => {
  it('are registered with default parallels and no shader', () => {
    for (const id of CONICS) {
      const s = PROJECTIONS.find((p) => p.id === id)!;
      expect(s.conic?.defaultParallels, id).toEqual([30, 60]);
      expect(s.gpu, id).toBeFalsy();
      expect(view(id).parallels).toEqual([30, 60]);
    }
    expect(view('mollweide').parallels).toBeNull();
  });

  it('the parallels change the map; invert of a pixel moves with them', () => {
    for (const id of CONICS) {
      const a = view(id, [20, 50]).invert(W / 2, H / 2)!, b = view(id, [10, 70]).invert(W / 2, H / 2)!;
      expect(a, id).toBeTruthy();
      expect(b, id).toBeTruthy();
      expect(Math.abs(a[1] - b[1]) + Math.abs(a[0] - b[0]), id).toBeGreaterThan(0.1);
    }
  });

  it('keeps parallels within ±89.9° and tolerates garbage', () => {
    expect(clampParallels([-120, 95])).toEqual([-89.9, 89.9]);
    expect(clampParallels([NaN, 10])).toEqual([0, 10]);
  });

  it('scale along both standard parallels is true (k = 1) for every conic and several pairs', () => {
    for (const id of CONICS) for (const ps of [[30, 60], [20, 50], [-40, -10], [15, 45]] as [number, number][]) {
      const v = view(id, ps);
      for (const lat of ps) for (const lon of [-120, 0, 77]) {
        const d = distortion(v, lon, lat);
        if (d.outside) continue;
        expect(d.k, `${id} ${ps} lat ${lat}`).toBeCloseTo(1, 4);
      }
    }
  });

  it('Albers is equal-area, Lambert conformal is conformal, the equidistant has h = 1 along meridians', () => {
    for (const ps of [[30, 60], [20, 50], [-45, -15]] as [number, number][]) for (const lat of [-40, -5, 25, 55]) for (const lon of [-150, -20, 90]) {
      const ea = distortion(view('conicEqualArea', ps), lon, lat);
      if (!ea.outside) expect(ea.areal, `Albers ${ps} ${lon},${lat}`).toBeCloseTo(1, 4);
      const lc = distortion(view('conicConformal', ps), lon, lat);
      if (!lc.outside) { expect(lc.omega, `LCC ${ps} ${lon},${lat}`).toBeLessThan(1e-3); expect(lc.h).toBeCloseTo(lc.k, 4); }
      const eq = distortion(view('conicEquidistant', ps), lon, lat);
      if (!eq.outside) expect(eq.h, `equidistant ${ps} ${lon},${lat}`).toBeCloseTo(1, 4);
    }
  });

  it('Lambert conformal conic stops 30° short of the far pole and outlines the cut cap', () => {
    const north = view('conicConformal', [30, 60]);
    expect(north.inDomain(0, -59)).toBe(true);
    expect(north.inDomain(0, -61)).toBe(false);
    expect(north.inDomain(40, 89)).toBe(true);
    const south = view('conicConformal', [-60, -30]);
    expect(south.inDomain(0, 59)).toBe(true);
    expect(south.inDomain(0, 61)).toBe(false);
    expect((north.outline() as { type: string }).type).toBe('Polygon');
    expect((view('conicEqualArea').outline() as { type: string }).type).toBe('Sphere');
    // The fitted outline fills the image box.
    let inside = 0;
    for (let j = 0; j < H; j += 9) for (let i = 0; i < W; i += 9) if (north.invert(i + 0.5, j + 0.5)) inside++;
    expect(inside).toBeGreaterThan(300);
  });

  it('rotation moves the cone: a rotated Lambert view keeps its cut about the rotated apex', () => {
    const v = view('conicConformal', [30, 60], [0, -90, 0]);
    // With φ rotation −90° the raw frame's north is geographic (lon 180, lat 0)... whichever side, the cap is half-sized consistently.
    let inside = 0, tested = 0;
    for (let lat = -80; lat <= 80; lat += 10) for (let lon = -170; lon <= 170; lon += 20) { tested++; if (v.inDomain(lon, lat)) inside++; }
    expect(inside).toBeGreaterThan(tested * 0.5);
    expect(inside).toBeLessThan(tested);
  });

  it('a pixel inverts and re-projects within the round-trip tolerance for several parallels', () => {
    for (const id of CONICS) for (const ps of [[30, 60], [-20, 40], [0, 0]] as [number, number][]) {
      const v = view(id, ps);
      let n = 0;
      for (let j = 0; j < H; j += 13) for (let i = 0; i < W; i += 13) {
        const ll = v.invert(i + 0.5, j + 0.5);
        if (!ll) continue;
        n++;
        const xy = v.forward(ll[0], ll[1])!;
        expect(Math.hypot(xy[0] - i - 0.5, xy[1] - j - 0.5), `${id} ${ps}`).toBeLessThanOrEqual(0.5);
      }
      expect(n, `${id} ${ps}`).toBeGreaterThan(40);
      if (id === 'conicConformal' && ps[0] === 0) expect(v.parallels![0] + v.parallels![1]).toBeGreaterThan(0);
    }
  });
});
