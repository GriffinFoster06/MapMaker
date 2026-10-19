// Engine host for the orogen pipeline: the entry that browser and Node workers call. Original shell code.
import { initRealm } from '@mapmaker/core';
import { type HostOptions, type PortLike, attachHost } from '@mapmaker/engine';
import { type OrogenParams } from './params';
import { createOrogenWorld } from './create';
import { orogenStages } from './stages';
import { structuredStages } from './structured/stages';

/** Call first thing in a worker: asserts dmath is in its default fdlibm mode, then serves the engine protocol. */
export function startOrogenHost(port: PortLike, engine: string, extra: Pick<HostOptions, 'worldKernels'> = {}): void {
  initRealm();
  attachHost(port, {
    stages: [...orogenStages, ...structuredStages],
    engine,
    ...extra,
    create: (params) => createOrogenWorld((params ?? {}) as Partial<OrogenParams>),
  });
}
