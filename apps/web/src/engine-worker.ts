// Engine worker (ARCHITECTURE §6.1): owns the World during generation and runs the orogen stages. The main thread never
// runs a stage.
import type { PortLike } from '@mapmaker/engine';
import { startOrogenHost } from '@mapmaker/gen-orogen';

startOrogenHost(self as unknown as PortLike, navigator.userAgent);
