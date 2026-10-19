// Edit records (ARCHITECTURE §3.8, design note 16 §2). Original shell code. An edit is data: it never mutates a layer
// directly, it is an input to the stage that produces its target.

export type EditMode = 'pin' | 'soft' | 'seed';

export type EditTarget =
  | { kind: 'layer'; id: string; mesh?: string }
  | { kind: 'entity'; table: string; id: number }
  | { kind: 'param'; key: string }
  | { kind: 'event'; axis: 'geo' | 'history'; at: number };

/**
 * Where an edit applies. Geometry, never cell ids, so an edit re-rasterises onto any mesh (note 16 §3.4).
 * `brush`: a stroke as a polyline of unit vectors (flat x, y, z), a radius in radians of arc and a falloff in [0, 1]
 * (0 = hard edge, 1 = smooth from the centre line to the rim). `polygon`: a ring of unit vectors (flat), no falloff.
 * `cells` is reserved for edits made on an imported cell set.
 */
export type EditRegion =
  | { kind: 'brush'; path: number[]; radius: number; falloff: number }
  | { kind: 'polygon'; ring: number[] }
  | { kind: 'cells'; runs: number[] }
  | null;

export interface Edit {
  /** Stable id, never reused within a log. */
  id: number;
  /** Position in the log (0-based); equals the index while the log is append-only. */
  seq: number;
  branch: string;
  target: EditTarget;
  region: EditRegion;
  /** Operation name, interpreted by the stage that consumes the edit (for terrain: raise, lower, smooth, flatten, noise, set, paint, hotspot, ridge). */
  op: string;
  payload: Record<string, number | string | boolean | number[]>;
  mode: EditMode;
  /** Blend weight for `soft` edits, in (0, 1]. */
  weight?: number;
  /** Strokes of one gesture share an id so that undo removes the whole gesture (never wall-clock merging). */
  gesture?: number;
  /** Wall-clock text. Informational: excluded from every hash. */
  createdAt: string;
  author?: string;
  label?: string;
}

/** What a caller supplies; the log assigns id, seq and branch. */
export type EditDraft = Omit<Edit, 'id' | 'seq' | 'branch' | 'createdAt'> & { createdAt?: string };
