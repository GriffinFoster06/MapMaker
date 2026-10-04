// Layer descriptors for the orogen adapter (ARCHITECTURE §3.2, §3.6). Original shell code.
//
// Public layers are canonical. `orogen.*` layers are adapter-private (F2): orogen's raw elevation, intermediate climate
// fields and orogen's debug fields. Stages outside gen-orogen cannot read them (runner check).
import type { Dtype, LayerKind, World } from '@mapmaker/core';

export const STAGE = {
  mesh: 'mesh',
  tectonics: 'orogen.tectonics',
  elevation: 'orogen.elevation',
  erosion: 'orogen.erosion',
  climate: 'orogen.climate',
  koppen: 'orogen.koppen',
} as const;

/** orogen debug fields, by the stage that produces them. `required` ones are inputs of later stages and are always kept. */
export const DEBUG_FIELDS: { stage: string; names: string[]; required?: string[] }[] = [
  { stage: STAGE.tectonics, names: ['continentalDrag', 'sizeVelocity', 'plateSpeed', 'velChange', 'mantleFlow'] },
  {
    stage: STAGE.elevation,
    names: ['base', 'tectonic', 'noise', 'interior', 'coastal', 'ocean', 'hotspot', 'lip', 'tecActivity', 'margins', 'backArc', 'phasorRidge', 'orogenicPower', 'uniformNoise', 'dynamicTopo', 'basin', 'noiseAmp', 'foldBeltWeight', 'cratonWeight', 'basinWeight', 'skeleton', 'superPlates'],
    required: ['hotspot', 'cratonWeight', 'basinWeight', 'orogenicPower'],
  },
  { stage: STAGE.erosion, names: ['erosionDelta'] },
  { stage: STAGE.climate, names: ['windSpeedSummer', 'windSpeedWinter', 'continentality', 'rainShadowSummer', 'rainShadowWinter', 'tempContinentality'] },
];

export const debugId = (name: string): string => `orogen.debug.${name}`;

/** debug names that are the same array as a public layer (pressure, precip, temp, koppen); the view maps them back. */
export const DEBUG_ALIASES: Record<string, string> = {
  pressureSummer: 'pressure.summer', pressureWinter: 'pressure.winter',
  precipSummer: 'precip.summer', precipWinter: 'precip.winter',
  tempSummer: 'temp.summer', tempWinter: 'temp.winter',
  koppen: 'koppen',
};

export function isRequiredDebug(name: string): boolean {
  return DEBUG_FIELDS.some((g) => g.required?.includes(name));
}

interface Spec { id: string; dtype: Dtype; unit: string; kind: LayerKind; stage: string; deps: string[]; sample?: 'barycentric' | 'nearest' | 'none'; priv?: boolean }

export function orogenLayerSpecs(): Spec[] {
  const f = (id: string, stage: string, deps: string[], extra: Partial<Spec> = {}): Spec => ({ id, dtype: 'f32', unit: 'normalized', kind: 'scalar', stage, deps, sample: 'barycentric', ...extra });
  const specs: Spec[] = [
    f('elevation', STAGE.erosion, ['orogen.elevPre'], { unit: 'm' }),
    { id: 'plate', dtype: 'i32', unit: '1', kind: 'categorical', stage: STAGE.tectonics, deps: [], sample: 'nearest' },
    f('stress', STAGE.elevation, ['plate']),
    f('orogen.elevPre', STAGE.elevation, ['plate'], { unit: '1', priv: true }),
    f('orogen.elevRaw', STAGE.erosion, ['orogen.elevPre'], { unit: '1', priv: true }),
  ];
  for (const season of ['summer', 'winter']) {
    specs.push(
      f(`wind.${season}`, STAGE.climate, ['orogen.elevRaw', 'plate'], { kind: 'vector-en' }),
      f(`current.${season}`, STAGE.climate, ['orogen.elevRaw', 'plate'], { kind: 'vector-en' }),
      f(`temp.${season}`, STAGE.climate, ['orogen.elevRaw', 'plate']),
      f(`precip.${season}`, STAGE.climate, ['orogen.elevRaw', 'plate']),
      f(`pressure.${season}`, STAGE.climate, ['orogen.elevRaw', 'plate']),
      f(`orogen.oceanSpeed.${season}`, STAGE.climate, ['orogen.elevRaw'], { priv: true }),
      f(`orogen.oceanWarmth.${season}`, STAGE.climate, ['orogen.elevRaw'], { priv: true }),
    );
  }
  specs.push(
    f('orogen.westness', STAGE.climate, ['orogen.elevRaw'], { priv: true }),
    { id: 'koppen', dtype: 'u8', unit: 'enum:koppen', kind: 'categorical', stage: STAGE.koppen, deps: ['temp.summer', 'temp.winter', 'precip.summer', 'precip.winter', 'orogen.elevRaw'], sample: 'nearest' },
  );
  for (const g of DEBUG_FIELDS) for (const n of g.names) specs.push(f(debugId(n), g.stage, [], { sample: 'none', priv: true, unit: '1' }));
  return specs;
}

/** Registers every layer the orogen stages write. Safe to call once per world. */
export function registerOrogenLayers(world: World): void {
  for (const s of orogenLayerSpecs()) {
    if (world.registry.has(s.id)) continue;
    world.registry.register({
      id: s.id, dtype: s.dtype, unit: s.unit, kind: s.kind, producers: { '*': s.stage }, deps: s.deps,
      sample: s.sample ?? 'barycentric', timeVarying: false, ...(s.priv ? { visibility: 'private' as const } : {}),
    });
  }
}

/** Layer ids written by a stage (what its `writes` lists). */
export function writesOf(stage: string): string[] {
  return orogenLayerSpecs().filter((s) => s.stage === stage).map((s) => s.id);
}
