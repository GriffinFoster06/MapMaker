// Categorical paint (design note 16 §3.3): set an enum layer (Köppen class, plate id) to a value inside a region, after the
// stage computed it. A pin: the value is fixed there, and anything downstream treats it as given. Original shell code.
import { type Edit, type SphereMesh, SpatialIndex } from '@mapmaker/core';
import { rasterise } from './region';

/** Layers a categorical paint can target. */
export const CATEGORICAL_LAYERS = ['koppen', 'plate'] as const;

/** Applies `paint` edits for `layerId` in log order. A cell is painted where the brush weight is at least 0.5. Returns cells changed. */
export function applyCategoricalEdits(mesh: SphereMesh, layerId: string, values: Uint8Array | Int32Array, edits: readonly Edit[], index = new SpatialIndex(mesh)): number {
  let changed = 0;
  for (const e of edits) {
    if (e.target.kind !== 'layer' || e.target.id !== layerId || e.op !== 'paint') continue;
    const v = e.payload['value'];
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`paint on ${layerId} needs an integer value`);
    const { cells, w } = rasterise(mesh, e.region, index);
    for (let i = 0; i < cells.length; i++) if (w[i]! >= 0.5 && values[cells[i]!] !== v) { values[cells[i]!] = v; changed++; }
  }
  return changed;
}
