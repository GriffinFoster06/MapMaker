// Layer descriptors of the structured pipeline's reference pass (design note 14 §2). Original shell code.
// Reference layers live on the `reference` mesh (L0) under `ref.*` ids, produced only in the `structured` variant.
import type { Dtype, LayerKind, World } from '@mapmaker/core';
import { DEBUG_FIELDS, STAGE, STRUCTURED_DETAIL_STAGE } from '../layers';

export const STRUCTURED = 'structured';
export const REF_STAGE = 'ref.pass';
export const REF_MESH = 'reference';
export const DETAIL_STAGE = STRUCTURED_DETAIL_STAGE;

interface Spec { id: string; dtype: Dtype; unit: string; kind: LayerKind; sample: 'barycentric' | 'nearest' | 'none' }

/** orogen elevation debug fields kept at L0 (the detail pass reads the classification fields). */
export const REF_DEBUG_FIELDS = DEBUG_FIELDS.find((g) => g.stage === STAGE.elevation)!.names;

export function refLayerSpecs(): Spec[] {
  const f = (id: string, unit = 'normalized', extra: Partial<Spec> = {}): Spec => ({ id, dtype: 'f32', unit, kind: 'scalar', sample: 'barycentric', ...extra });
  const specs: Spec[] = [
    { id: 'ref.plate', dtype: 'i32', unit: '1', kind: 'categorical', sample: 'nearest' },
    f('ref.elevPre', '1'), f('ref.elevRaw', '1'), f('ref.elevation', 'm'), f('ref.stress'), f('ref.erosionDelta', '1'),
    f('ref.westness'),
    { id: 'ref.koppen', dtype: 'u8', unit: 'enum:koppen', kind: 'categorical', sample: 'nearest' },
    { id: 'ref.receiver', dtype: 'i32', unit: '1', kind: 'categorical', sample: 'none' },
    { id: 'ref.outlet', dtype: 'i32', unit: '1', kind: 'categorical', sample: 'nearest' },
    { id: 'ref.basin', dtype: 'i32', unit: '1', kind: 'categorical', sample: 'nearest' },
    { id: 'ref.divideBand', dtype: 'u8', unit: '1', kind: 'categorical', sample: 'nearest' },
    f('ref.drainageArea', 'm^2', { dtype: 'f64', sample: 'none' }),
  ];
  for (const season of ['summer', 'winter']) {
    specs.push(
      f(`ref.wind.${season}`, 'normalized', { kind: 'vector-en' }),
      f(`ref.current.${season}`, 'normalized', { kind: 'vector-en' }),
      f(`ref.temp.${season}`), f(`ref.precip.${season}`), f(`ref.pressure.${season}`),
      f(`ref.oceanSpeed.${season}`), f(`ref.oceanWarmth.${season}`),
    );
  }
  for (const n of REF_DEBUG_FIELDS) specs.push(f(`ref.debug.${n}`, '1', { sample: 'none' }));
  return specs;
}

/**
 * Layers the detail pass adds on the `global` mesh besides the canonical ones it takes over from the stock stages
 * (elevation, plate, stress, climate, Köppen): its raw elevation (private) and the constrained drainage.
 */
export function detailLayerSpecs(): (Spec & { priv?: boolean })[] {
  return [
    { id: 'detail.elevRaw', dtype: 'f32', unit: '1', kind: 'scalar', sample: 'barycentric', priv: true },
    { id: 'receiver', dtype: 'i32', unit: '1', kind: 'categorical', sample: 'none' },
    { id: 'basin', dtype: 'i32', unit: '1', kind: 'categorical', sample: 'nearest' },
    { id: 'drainageArea', dtype: 'f64', unit: 'm^2', kind: 'scalar', sample: 'none' },
  ];
}

export function registerStructuredLayers(world: World): void {
  for (const s of refLayerSpecs()) {
    if (world.registry.has(s.id)) continue;
    world.registry.register({ id: s.id, dtype: s.dtype, unit: s.unit, kind: s.kind, producers: { [STRUCTURED]: REF_STAGE }, deps: [], sample: s.sample, timeVarying: false });
  }
  for (const s of detailLayerSpecs()) {
    if (world.registry.has(s.id)) continue;
    world.registry.register({
      id: s.id, dtype: s.dtype, unit: s.unit, kind: s.kind, producers: { [STRUCTURED]: DETAIL_STAGE }, deps: ['ref.elevRaw'], sample: s.sample,
      timeVarying: false, ...(s.priv ? { visibility: 'private' as const } : {}),
    });
  }
}

export const REF_WRITES = (): string[] => [...refLayerSpecs().map((s) => s.id), 'table:plates'];
