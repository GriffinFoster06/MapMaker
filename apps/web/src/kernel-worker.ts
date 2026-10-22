// Kernel worker (decision PK1): one of the engine worker's pool. It runs the generator's per-cell kernels on shared
// memory and nothing else; the engine worker owns the World.
import { initRealm } from '@mapmaker/core';
import { type PortLike, attachHost } from '@mapmaker/engine';
import '@mapmaker/gen-orogen/kernels';

initRealm();
attachHost(self as unknown as PortLike, { stages: [], engine: navigator.userAgent });
