// Engine worker (ARCHITECTURE §6.1): owns the World during generation and runs the orogen stages. The main thread never
// runs a stage.
import type { PortLike } from '@mapmaker/engine';
import { startOrogenHost } from '@mapmaker/gen-orogen';
import { biomeColor } from '@mapmaker/gen-orogen/palettes';
import { cartoKernels } from '@mapmaker/carto/kernels';
import { projectionKernels } from '@mapmaker/projection/exact/kernels';

// The exact projection path (sampler, heightmap export) and the styled map (Phase 5c) run here, next to the World (§3.7).
// The satellite-like theme colours land by Köppen class and raw elevation with orogen's own biome colours.
const carto = cartoKernels({ biome: { color: biomeColor as never, rawElevation: (w) => (w.pipeline.variant === 'structured' ? 'detail.elevRaw' : 'orogen.elevRaw') } });
startOrogenHost(self as unknown as PortLike, navigator.userAgent, { worldKernels: { ...projectionKernels, ...carto } });
