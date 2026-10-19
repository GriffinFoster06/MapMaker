// A small generated world for the carto tests (20k cells, the structured pipeline), built once per test file.
import type { World } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';

export async function testWorld(N = 20000, seed = 12345): Promise<World> {
  const w = createOrogenWorld({ N, seed });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  return w;
}
