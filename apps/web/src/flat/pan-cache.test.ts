// The flat map keeps the overlay's map-bound paths while only the pan changes (map-ui.ts) and moves them with a transform. That
// is exact when the path of a panned view is the path of the pan-0 view with every coordinate shifted by the pan: the commands
// are the same and each coordinate differs by the pan up to d3's rounding (3 decimals).
import { describe, expect, test } from 'vitest';
import { PROJECTIONS, ProjectionView, graticule, pathFor } from '@mapmaker/projection';
import type { MultiLineString } from 'geojson';

const coast: MultiLineString = { type: 'MultiLineString', coordinates: [
  Array.from({ length: 160 }, (_, i) => [-170 + i * 2.1, 40 * Math.sin(i / 9)] as [number, number]),
  Array.from({ length: 80 }, (_, i) => [-30 + i * 0.7, -50 + 30 * Math.cos(i / 7)] as [number, number]),
] };

const tokens = (d: string) => d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];

describe('overlay paths under a pan', () => {
  const W = 1600, H = 900;
  for (const spec of PROJECTIONS) {
    test(`${spec.id}: a pan shifts every coordinate (or the view is clipped to the image and says so)`, () => {
      const base = new ProjectionView({ projection: spec.id, width: W, height: H, rotate: [20, -15, 0], zoom: 4, pan: [0, 0] });
      const pan: [number, number] = [-312.5, 187.25];
      const moved = new ProjectionView({ projection: spec.id, width: W, height: H, rotate: [20, -15, 0], zoom: 4, pan });
      expect(moved.panInvariant).toBe(base.panInvariant);
      if (!base.panInvariant) return;
      for (const geo of [base.outline(), graticule(base, 15), coast] as never[]) {
        const a = tokens(pathFor(base)(geo) ?? ''), b = tokens(pathFor(moved)(geo) ?? '');
        expect(b.length).toBe(a.length);
        let xs = 0, worst = 0;
        for (let i = 0; i < a.length; i++) {
          if (/[A-Za-z]/.test(a[i]!)) { expect(b[i]).toBe(a[i]); xs = 0; continue; }
          const delta = Number(b[i]) - Number(a[i]) - pan[xs % 2]!;
          worst = Math.max(worst, Math.abs(delta));
          xs++;
        }
        // d3 rounds each coordinate to 3 decimals: 0.0005 each way, plus the float sum.
        expect(worst).toBeLessThanOrEqual(0.0011);
      }
    });
  }
});
