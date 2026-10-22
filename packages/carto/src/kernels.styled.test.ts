// `carto.styledLayer` (one message for a switch to the styled map) against the loop the page used to run on its main thread.
import { beforeAll, describe, expect, test } from 'vitest';
import type { World } from '@mapmaker/core';
import { biomeColor } from '@mapmaker/gen-orogen/palettes';
import { buildLut, lutColor } from './colour';
import { cartoKernels } from './kernels';
import { THEMES } from './style';
import { testWorld } from './test-world';

let world: World;
const kernels = cartoKernels({ biome: { color: biomeColor as never, rawElevation: 'detail.elevRaw' } });
beforeAll(async () => { world = await testWorld(); }, 120_000);

describe('carto.styledLayer', () => {
  for (const id of ['atlas', 'satellite', 'political']) {
    test(`${id}: the globe colours are the former page loop's, bit for bit; the flat inputs are the kernels' own`, () => {
      const style = THEMES[id]!, r = kernels['carto.styledLayer'](world, { style }), cs = kernels['carto.cellStyle'](world, { style });
      const elev = world.layers.get('global', 'elevation') as Float32Array, lut = buildLut(style), c = [0, 0, 0];
      const want = new Float32Array(3 * elev.length);
      for (let i = 0; i < elev.length; i++) {
        if (cs.colors && elev[i]! > 0) { c[0] = cs.colors[3 * i]!; c[1] = cs.colors[3 * i + 1]!; c[2] = cs.colors[3 * i + 2]!; } else lutColor(lut, elev[i]!, c);
        const f = cs.factor[i]!;
        want[3 * i] = c[0]! * f; want[3 * i + 1] = c[1]! * f; want[3 * i + 2] = c[2]! * f;
      }
      expect(Buffer.from(r.globe.buffer)).toEqual(Buffer.from(want.buffer));
      expect(r.factor).toEqual(cs.factor);
      expect(r.colors).toEqual(cs.colors);
      expect(r.elevation).toEqual(Float32Array.from(elev));
      expect(r.lut.rgba).toEqual(lut.rgba);
      // Copies, so transferring them cannot detach the World's or the cache's arrays.
      expect(r.elevation.buffer).not.toBe(elev.buffer);
      expect(r.factor.buffer).not.toBe(cs.factor.buffer);
      expect(elev.byteLength).toBeGreaterThan(0);
    });
  }
});
