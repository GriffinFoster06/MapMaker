// Rebuilds the stock orogen `generate` result shape (the arrays of planet-worker.js's `done` message) from a World, for
// the parity test and the probe. Original shell code.
import type { TypedArray, World } from '@mapmaker/core';
import { computeTriangleElevations } from './orchestration';
import { DEBUG_ALIASES, DEBUG_FIELDS, debugId } from './layers';
import { getScratch, peekScratch } from './scratch';
import { generateTriangleCenters } from './vendor';

export type OrogenArrays = Record<string, TypedArray>;

/**
 * Typed arrays keyed as spike 1a's `collectArrays` keys them: top-level result fields, then `debug.<name>`.
 * ITCZ tables live only in the scratch of the process that ran the climate stage; they are omitted after a load.
 */
export function orogenView(world: World, meshId = 'global'): OrogenArrays {
  const out: OrogenArrays = {};
  const s = getScratch(world, meshId);
  const m = s.mesh;
  const has = (id: string) => world.layers.has(meshId, id);
  const arr = (id: string, which: 'east' | 'north' | '' = ''): TypedArray => world.layers.get(meshId, which ? `${id}.${which}` : id);

  out['triangles'] = m.triangles;
  out['halfedges'] = m.halfedges;
  out['r_xyz'] = s.r_xyz;
  out['t_xyz'] = generateTriangleCenters(m, s.r_xyz);
  out['r_plate'] = arr('plate');
  out['prePostElev'] = arr('orogen.elevPre');
  out['r_elevation'] = arr('orogen.elevRaw');
  out['t_elevation'] = computeTriangleElevations(m, out['r_elevation'] as Float32Array);
  out['r_stress'] = arr('stress');
  for (const season of ['summer', 'winter']) {
    out[`r_wind_east_${season}`] = arr(`wind.${season}`, 'east');
    out[`r_wind_north_${season}`] = arr(`wind.${season}`, 'north');
  }
  const c = peekScratch(world)?.climate;
  if (c) { out['itczLons'] = c.itczLons; out['itczLatsSummer'] = c.itczLatsSummer; out['itczLatsWinter'] = c.itczLatsWinter; }
  for (const season of ['summer', 'winter']) {
    out[`r_ocean_current_east_${season}`] = arr(`current.${season}`, 'east');
    out[`r_ocean_current_north_${season}`] = arr(`current.${season}`, 'north');
  }
  for (const season of ['summer', 'winter']) out[`r_ocean_speed_${season}`] = arr(`orogen.oceanSpeed.${season}`);
  for (const season of ['summer', 'winter']) out[`r_ocean_warmth_${season}`] = arr(`orogen.oceanWarmth.${season}`);
  for (const season of ['summer', 'winter']) out[`r_precip_${season}`] = arr(`precip.${season}`);
  for (const season of ['summer', 'winter']) out[`r_temperature_${season}`] = arr(`temp.${season}`);

  for (const g of DEBUG_FIELDS) for (const n of g.names) if (has(debugId(n))) out[`debug.${n}`] = arr(debugId(n));
  for (const [n, id] of Object.entries(DEBUG_ALIASES)) if (has(id)) out[`debug.${n}`] = arr(id);
  return out;
}
