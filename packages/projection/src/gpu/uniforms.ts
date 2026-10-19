// Shader parameters of a ProjectionView (glsl.ts). Original shell code. Everything is computed here in float64 and
// rounded to float32 once, on upload.
import { dmath } from '@mapmaker/core';
import type { ProjectionView } from '../view';
import { GPU_PROJECTION_IDS, type GpuProjectionId } from './glsl';

const RAD = Math.PI / 180;

export interface MapUniforms {
  projection: GpuProjectionId;
  /** d3 scale and translate, pixels. */
  k: number;
  tx: number;
  ty: number;
  /** Raw frame → canonical frame, column-major 3 × 3 (the columns are the raw axes in canonical coordinates). */
  rot: number[];
  /** cos of the clip angle, or null. */
  cosClip: number | null;
  /** Raw latitude limit (radians), or null. */
  maxLat: number | null;
  /** The rotation has a φ or γ part (d3's rotateRadians then goes through the unit vector). */
  vecRot: boolean;
}

export const isGpuProjection = (id: string): id is GpuProjectionId => (GPU_PROJECTION_IDS as readonly string[]).includes(id);

const unit = ([lon, lat]: [number, number]) => {
  const l = lon * RAD, f = lat * RAD;
  return [dmath.cos(f) * dmath.cos(l), dmath.cos(f) * dmath.sin(l), dmath.sin(f)];
};

export function mapUniforms(view: ProjectionView): MapUniforms {
  if (!isGpuProjection(view.spec.id)) throw new Error(`no GPU shader for ${view.spec.id}`);
  const [tx, ty] = view.projection.translate();
  const inv = (p: [number, number]) => unit(view.toRaw.invert(p) as [number, number]);
  return {
    projection: view.spec.id,
    k: view.projection.scale(),
    tx, ty,
    rot: [...inv([0, 0]), ...inv([90, 0]), ...inv([0, 90])],
    cosClip: view.clipAngle === null ? null : dmath.cos(view.clipAngle * RAD),
    maxLat: view.spec.maxRawLat ?? null,
    vecRot: ((r) => r[1] % 360 !== 0 || r[2] % 360 !== 0)(view.projection.rotate()),
  };
}
