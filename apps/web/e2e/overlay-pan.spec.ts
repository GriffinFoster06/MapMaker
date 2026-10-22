import { expect, test } from '@playwright/test';
import { ProjectionView, graticule, pathFor } from '@mapmaker/projection';
import type { MultiLineString } from 'geojson';

// The flat map keeps its map-bound overlay paths while only the pan changes and moves them with an SVG transform (map-ui.ts).
// The path of the pan-0 view moved by the pan is rasterized and compared with the path d3 makes for the panned view (what the
// page drew before). The two differ by d3's rounding (0.0005 px per coordinate) and by how the rasterizer applies a transform; its
// anti-aliasing quantizes coordinates, so such a difference flips a few edge samples. That is measured against the noise floor:
// the baked path against itself moved by 0.0005 px, which is as small a change of the geometry as there is.
const coast: MultiLineString = { type: 'MultiLineString', coordinates: [
  Array.from({ length: 400 }, (_, i) => [-175 + i * 0.87, 45 * Math.sin(i / 11) + 10] as [number, number]),
  Array.from({ length: 200 }, (_, i) => [-60 + i * 0.6, -45 + 30 * Math.cos(i / 9)] as [number, number]),
] };

for (const projection of ['robinson', 'mercator', 'orthographic']) {
  test(`overlay under a transform rasterizes like the panned path (${projection})`, async ({ page, browserName }, info) => {
    const W = 1600, H = 900, pan: [number, number] = [-312.37, 187.61];
    const mk = (p: [number, number]) => new ProjectionView({ projection, width: W, height: H, rotate: [20, -15, 0], zoom: 3, pan: p });
    const base = mk([0, 0]), moved = mk(pan);
    const geos = [base.outline(), graticule(base, 15), coast] as never[];
    const attrs = ['stroke="#222" stroke-width="2.2"', 'stroke="#222" stroke-width="1.2"', 'stroke="#222" stroke-width="3"'];
    const paths = (v: ProjectionView) => geos.map((g, i) => `<path d="${pathFor(v)(g) ?? ''}" fill="none" ${attrs[i]}/>`).join('');
    const svgBaked = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${paths(moved)}</svg>`;
    const nudged = mk([pan[0] + 0.0005, pan[1] + 0.0005]);
    const svgNudged = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${paths(nudged)}</svg>`;
    const svgMoved = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g transform="translate(${pan[0]} ${pan[1]})">${paths(base)}</g></svg>`;
    await page.goto('./');
    const r = await page.evaluate(async ([a, b, c, w, h]) => {
      const raster = async (svg: string) => {
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await img.decode();
        const cv = document.createElement('canvas'); cv.width = w as number; cv.height = h as number;
        const x = cv.getContext('2d')!; x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w as number, h as number).data;
      };
      const [p, q, n] = [await raster(a as string), await raster(b as string), await raster(c as string)];
      const diff = (u: Uint8ClampedArray, v: Uint8ClampedArray) => {
        let max = 0, differing = 0, sum = 0;
        for (let i = 0; i < u.length; i += 4) {
          const d = Math.max(Math.abs(u[i]! - v[i]!), Math.abs(u[i + 1]! - v[i + 1]!), Math.abs(u[i + 2]! - v[i + 2]!));
          if (d > 0) differing++;
          sum += d;
          if (d > max) max = d;
        }
        return { max, differing, mean: sum / (u.length / 4) };
      };
      let drawn = 0;
      for (let i = 0; i < p.length; i += 4) if (p[i]! < 250) drawn++;
      return { drawn, moved: diff(p, q), floor: diff(p, n) };
    }, [svgBaked, svgMoved, svgNudged, W, H] as const);
    info.annotations.push({ type: `overlay-pan-${projection}`, description: `${browserName}: transform vs baked: max ${r.moved.max}/255, ${r.moved.differing} of ${r.drawn} drawn pixels differ, mean ${r.moved.mean.toExponential(2)}; noise floor (baked vs baked+0.0005 px): max ${r.floor.max}, ${r.floor.differing} differ` });
    expect(r.drawn).toBeGreaterThan(5000);
    expect(r.moved.max, `${browserName}: ${r.moved.differing} pixels differ`).toBeLessThanOrEqual(Math.max(8, r.floor.max));
    expect(r.moved.differing, 'edge samples that flip').toBeLessThanOrEqual(0.01 * r.drawn);
    expect(r.moved.mean).toBeLessThan(0.01);
  });
}
