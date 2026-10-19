// The styled exports through the kernels, in Node: every theme renders, the result is deterministic and the World is never
// changed (a style is a view, like a projection).
import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { type World, hashWorld } from '@mapmaker/core';
import { biomeColor } from '@mapmaker/gen-orogen/palettes';
import { cartoKernels } from './kernels';
import { THEMES, THEME_IDS } from './style';
import { testWorld } from './test-world';

let world: World, hash0: string;
const kernels = cartoKernels({ biome: { color: biomeColor as never, rawElevation: 'detail.elevRaw' } });
beforeAll(async () => { world = await testWorld(); hash0 = await hashWorld(world); }, 120_000);

const view = { projection: 'robinson', width: 480, height: 260 };
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const dim = (png: Uint8Array) => [new DataView(png.buffer, png.byteOffset + 16, 8).getUint32(0), new DataView(png.buffer, png.byteOffset + 16, 8).getUint32(4)];
const DUMP = process.env['CARTO_DUMP'];

describe('styled exports', () => {
  test('every theme renders a PNG of the right size, deterministically, with real content', () => {
    const seen = new Set<string>();
    for (const id of THEME_IDS) {
      const png = kernels['carto.png'](world, { view, style: THEMES[id]! });
      expect([...png.subarray(0, 8)]).toEqual(PNG_SIG);
      expect(dim(png)).toEqual([480, 260]);
      expect(kernels['carto.png'](world, { view, style: THEMES[id]! })).toEqual(png);
      expect(png.length).toBeGreaterThan(4000);
      seen.add(Array.from(png.subarray(33, 200)).join());
      if (DUMP) writeFileSync(`${DUMP}/${id}.png`, png);
    }
    expect(seen.size).toBe(THEME_IDS.length);
  });

  test('the SVG has the raster, the vector layers, labels, a scale bar and a legend; it is deterministic', () => {
    const svg = kernels['carto.svg'](world, { view: { projection: 'robinson', width: 1000, height: 540 }, style: THEMES['atlas']! });
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<image');
    expect(svg).toContain('class="carto-coast"');
    expect(svg).toContain('class="carto-river"');
    expect(svg).toContain('class="carto-graticule"');
    expect(svg).toContain('class="carto-legend"');
    expect(svg).toContain('class="carto-scale"');
    const labels = svg.match(/<text [^>]*class="carto-label/g) ?? [];
    expect(labels.length).toBeGreaterThan(5);
    expect((svg.match(/<text[ >]/g) ?? []).length).toBe((svg.match(/<\/text>/g) ?? []).length);
    expect(kernels['carto.svg'](world, { view: { projection: 'robinson', width: 1000, height: 540 }, style: THEMES['atlas']! })).toBe(svg);
    if (DUMP) writeFileSync(`${DUMP}/atlas.svg`, svg);
  });

  test('layers can be switched off', () => {
    const svg = kernels['carto.svg'](world, { view, style: THEMES['atlas']!, layers: { raster: false, labels: false, rivers: false, legend: false, scaleBar: false, graticule: false } });
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('carto-label');
    expect(svg).not.toContain('carto-river');
    expect(svg).not.toContain('carto-legend');
    expect(svg).toContain('carto-coast');
  });

  test('conic and polar views export too, and a style never changes the World', async () => {
    for (const projection of ['conicConformal', 'conicEqualArea', 'orthographic', 'mollweide']) {
      const png = kernels['carto.png'](world, { view: { projection, width: 300, height: 200 }, style: THEMES['physical']! });
      expect(dim(png)).toEqual([300, 200]);
      const svg = kernels['carto.svg'](world, { view: { projection, width: 600, height: 400 }, style: THEMES['parchment']! });
      expect(svg).toContain('</svg>');
    }
    expect(await hashWorld(world)).toBe(hash0);
  });
});
