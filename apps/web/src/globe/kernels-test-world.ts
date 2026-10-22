// A small generated world for the globe kernel test (20k cells, the structured pipeline).
import { type TypedArray, type World, arrayIds } from '@mapmaker/core';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';

export { type TypedArray, type World, arrayIds };

export async function createOrogenFor(N = 20000, seed = 12345): Promise<World> {
  const w = createOrogenWorld({ N, seed });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  return w;
}
