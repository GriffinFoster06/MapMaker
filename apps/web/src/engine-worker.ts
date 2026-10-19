// Engine worker (ARCHITECTURE §6.1): owns the World during generation and runs the orogen stages. The main thread never
// runs a stage.
import type { PortLike } from '@mapmaker/engine';
import { startOrogenHost } from '@mapmaker/gen-orogen';
import { projectionKernels } from '@mapmaker/projection/exact/kernels';

// The exact projection path (sampler, heightmap export) runs here, next to the World (§3.7).
startOrogenHost(self as unknown as PortLike, navigator.userAgent, { worldKernels: projectionKernels });
