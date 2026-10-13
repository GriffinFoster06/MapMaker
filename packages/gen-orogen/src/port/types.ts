// Shared types for the orogen ports (Phase 4b M2). Original shell code.
import type { SphereMesh } from './sphere-mesh';

/** orogen's dual mesh (the port of its SphereMesh class), as every ported module receives it. */
export type PortMesh = SphereMesh;

/** Positions as orogen passes them: Float32Array xyz triples in orogen's frame (or Float64 in fdlibm callers). */
export type Xyz = Float32Array | Float64Array;
