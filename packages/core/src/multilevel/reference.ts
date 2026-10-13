// Provenance: original code (design note 14 §2). The L0 reference mesh is built exactly as orogen's coarse mesh
// (upstream/orogen/js/coarse-plates.js @ cc2662b: buildSphere(N_COARSE, COARSE_JITTER, makeRng(seed + 137))),
// through the extracted SphereMesh and OrogenLcg, so the reference pass and stock orogen share one mesh.
import { SphereMesh } from '../mesh/sphere-mesh';
import { OrogenLcg } from '../rng/orogen-lcg';

/** Reference cell count N_ref (orogen N_COARSE). Fixed for every fidelity: changing it changes every world. */
export const N_REF = 20000;
/** Fibonacci jitter of the reference mesh (orogen COARSE_JITTER). */
export const REF_JITTER = 0.75;
/** orogen seeds its coarse mesh with makeRng(seed + 137). */
export const REF_SEED_OFFSET = 137;
/** Mesh id of L0 in World.meshes. */
export const REF_MESH_ID = 'reference';

/** L0 for orogen integer seed `seed`. Returns the LCG too, so a stage can adopt its state into the world. */
export function buildReferenceMesh(seed: number): { mesh: SphereMesh; rng: OrogenLcg } {
  const rng = new OrogenLcg('mesh.reference', seed + REF_SEED_OFFSET);
  const mesh = SphereMesh.build({ N: N_REF, jitter: REF_JITTER, rng: () => rng.next(), precision: 'f32' });
  return { mesh, rng };
}
