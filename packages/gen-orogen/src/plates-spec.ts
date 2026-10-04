// Shape of the canonical `plates` entity table written by the tectonics stage and by the heightmap import. Original shell code.
import type { TableSpec } from '@mapmaker/core';

export const PLATES_SPEC: TableSpec = {
  name: 'plates', timeAxis: 'geo',
  columns: { plateId: 'i32', oceanic: 'u8', density: 'f32', poleX: 'f64', poleY: 'f64', poleZ: 'f64', omega: 'f64' },
};
