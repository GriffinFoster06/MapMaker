// Shared types for the orogen ports (Phase 4b M2). Original shell code.
import type { SphereMesh } from './sphere-mesh';

/** orogen's dual mesh (the port of its SphereMesh class), as every ported module receives it. */
/**
 * The mesh as the port functions take it. The optional fields carry the planet (design note 10): the radius in km that
 * orogen hard-codes as 6371 (F3) and the peak-compression exponent that depends on gravity. Absent means Earth.
 */
export type PortMesh = SphereMesh & { radiusKm?: number; peakCompressPower?: number };

/** The planet radius in km for this mesh (6371 when none is set). */
export const radiusKmOf = (mesh: { radiusKm?: number }): number => mesh.radiusKm ?? 6371;

/** Positions as orogen passes them: Float32Array xyz triples in orogen's frame (or Float64 in fdlibm callers). */
export type Xyz = Float32Array | Float64Array;
