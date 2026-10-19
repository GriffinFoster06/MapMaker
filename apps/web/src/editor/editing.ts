// Editing tools as data (Phase 5b, design note 16 §3.3): what each tool is, and how a brush stroke becomes an edit record.
// Original shell code. Pure functions, so they are unit-tested without a browser.
import type { EditDraft, EditMode } from '@mapmaker/core';

export interface ToolParam { key: string; label: string; min: number; max: number; step: number; value: number; unit: string }

export interface Tool {
  id: string;
  label: string;
  /** Layer the edit targets. */
  target: 'elevation' | 'koppen' | 'plate';
  op: string;
  /** Seed tools replace a random draw with the user's (note 16 §3.2): always mode `seed`. */
  seed?: boolean;
  /** `point`: one click (the stroke's first point). `stroke`: the whole drag. */
  brush: 'stroke' | 'point';
  params: ToolParam[];
  hint: string;
  /** Not available in the stock (parity) pipeline. */
  structuredOnly?: boolean;
}

const p = (key: string, label: string, min: number, max: number, step: number, value: number, unit = ''): ToolParam => ({ key, label, min, max, step, value, unit });

export const TOOLS: Tool[] = [
  { id: 'raise', label: 'Raise', target: 'elevation', op: 'raise', brush: 'stroke', params: [p('amount', 'Amount', 50, 3000, 50, 400, 'm')], hint: 'Raises the land under the brush; the falloff shapes the rim.' },
  { id: 'lower', label: 'Lower', target: 'elevation', op: 'lower', brush: 'stroke', params: [p('amount', 'Amount', 50, 3000, 50, 400, 'm')], hint: 'Lowers the land under the brush.' },
  { id: 'smooth', label: 'Smooth', target: 'elevation', op: 'smooth', brush: 'stroke', params: [p('strength', 'Strength', 0.1, 1, 0.05, 0.6), p('iterations', 'Passes', 1, 8, 1, 3)], hint: 'Blends each cell towards its neighbours.' },
  { id: 'flatten', label: 'Flatten', target: 'elevation', op: 'flatten', brush: 'stroke', params: [], hint: 'Brings the area to its own mean height.' },
  { id: 'terrace', label: 'Terrace', target: 'elevation', op: 'terrace', brush: 'stroke', params: [p('step', 'Step', 100, 1000, 50, 300, 'm')], hint: 'Snaps heights to steps, making terraces.' },
  { id: 'noise', label: 'Noise', target: 'elevation', op: 'noise', brush: 'stroke', params: [p('amplitude', 'Amplitude', 20, 600, 10, 150, 'm'), p('frequency', 'Frequency', 4, 40, 1, 12)], hint: 'Adds seeded relief; replays identically.' },
  { id: 'set', label: 'Set height', target: 'elevation', op: 'set', brush: 'stroke', params: [p('to', 'Height', -6000, 6000, 100, 0, 'm')], hint: 'Pins the height under the brush.' },
  { id: 'land', label: 'Paint land', target: 'elevation', op: 'land', brush: 'stroke', params: [p('height', 'At least', 10, 1000, 10, 150, 'm')], hint: 'Raises sea to at least this height above sea level.' },
  { id: 'sea', label: 'Paint sea', target: 'elevation', op: 'sea', brush: 'stroke', params: [p('depth', 'At least', 100, 5000, 100, 1000, 'm deep')], hint: 'Lowers land to at least this depth below sea level.' },
  { id: 'hotspot', label: 'Hotspot seed', target: 'elevation', op: 'hotspot', seed: true, brush: 'point', params: [p('height', 'Peak', 500, 6000, 100, 3000, 'm')], hint: 'Places a volcanic dome at the click; the radius is its footprint.' },
  { id: 'ridge', label: 'Plate-boundary seed', target: 'elevation', op: 'ridge', seed: true, brush: 'stroke', params: [p('height', 'Height', -4000, 4000, 100, 2500, 'm'), p('roughness', 'Roughness', 0, 1, 0.05, 0.35)], hint: 'Draws a mountain belt (or a trench, if negative) along the stroke, as at a plate boundary.' },
  { id: 'paint-koppen', label: 'Paint climate class', target: 'koppen', op: 'paint', brush: 'stroke', params: [p('value', 'Class id', 1, 30, 1, 4)], hint: 'Fixes the Köppen class (1 Af … 30 EF) under the brush.' },
  { id: 'paint-plate', label: 'Paint plate', target: 'plate', op: 'paint', brush: 'stroke', params: [p('value', 'Plate id', 0, 119, 1, 0)], hint: 'Assigns a plate id under the brush.', structuredOnly: true },
];

export interface BrushSettings {
  /** Brush radius in degrees of arc on the sphere. */
  radiusDeg: number;
  /** 0 = hard edge, 1 = smooth from the centre line to the rim. */
  falloff: number;
  mode: EditMode;
  /** For soft edits. */
  weight: number;
}

export const DEFAULT_BRUSH: BrushSettings = { radiusDeg: 6, falloff: 0.6, mode: 'pin', weight: 0.5 };

export function toolById(id: string): Tool {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tool: ${id}`);
  return t;
}

/** Appends `v` (a unit vector) to a flat stroke unless it is within `minAngle` radians of the last point. */
export function addStrokePoint(path: number[], v: readonly [number, number, number], minAngle: number): boolean {
  const n = path.length;
  if (n >= 3) {
    const d = path[n - 3]! * v[0] + path[n - 2]! * v[1] + path[n - 1]! * v[2];
    if (Math.acos(Math.min(1, Math.max(-1, d))) < minAngle) return false;
  }
  path.push(v[0], v[1], v[2]);
  return true;
}

/** The brush radius in radians as an edit records it: the slider's degrees, kept within 0.05° to 60°. */
export const brushRadiusRad = (radiusDeg: number): number => (Math.min(60, Math.max(0.05, radiusDeg)) * Math.PI) / 180;

/**
 * The brush ring (Phase 5c): `n` unit vectors on the small circle of angular radius `radius` about the unit vector
 * `centre`, xyz interleaved, the first point not repeated. Shown under the pointer, so it is exactly the edge of the
 * region a stroke point would rasterise (hard edge; the falloff shapes the weights inside it).
 */
export function ringPoints(centre: readonly [number, number, number], radius: number, n = 96): Float64Array {
  const [cx, cy, cz] = centre;
  const len = Math.hypot(cx, cy, cz) || 1;
  const c: [number, number, number] = [cx / len, cy / len, cz / len];
  // A helper axis not parallel to the centre, then an orthonormal pair in the tangent plane.
  const h: [number, number, number] = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1: [number, number, number] = [c[1] * h[2] - c[2] * h[1], c[2] * h[0] - c[0] * h[2], c[0] * h[1] - c[1] * h[0]];
  const l1 = Math.hypot(...e1);
  e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2: [number, number, number] = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
  const out = new Float64Array(3 * n), cr = Math.cos(radius), sr = Math.sin(radius);
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n, a = Math.cos(t) * sr, b = Math.sin(t) * sr;
    for (let k = 0; k < 3; k++) out[3 * i + k] = cr * c[k]! + a * e1[k]! + b * e2[k]!;
  }
  return out;
}

/** Longitude and latitude in degrees of a canonical unit vector. */
export function unitToLonLatDeg(x: number, y: number, z: number): [number, number] {
  return [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];
}

/** The edit record of one stroke (note 16 §2). `gesture` groups strokes for undo. */
export function buildDraft(tool: Tool, brush: BrushSettings, values: Record<string, number>, path: readonly number[], gesture: number): EditDraft {
  if (path.length < 3) throw new Error('an edit needs at least one point');
  const mode: EditMode = tool.seed ? 'seed' : brush.mode;
  const payload: Record<string, number> = {};
  for (const prm of tool.params) {
    const v = values[prm.key] ?? prm.value;
    payload[prm.key] = Math.min(prm.max, Math.max(prm.min, v));
  }
  const radius = brushRadiusRad(brush.radiusDeg);
  const pts = tool.brush === 'point' ? path.slice(0, 3) : path.slice();
  return {
    target: { kind: 'layer', id: tool.target },
    region: { kind: 'brush', path: pts, radius, falloff: Math.min(1, Math.max(0, brush.falloff)) },
    op: tool.op,
    payload,
    mode,
    ...(mode === 'soft' ? { weight: Math.min(1, Math.max(0.05, brush.weight)) } : {}),
    gesture,
    label: tool.label,
  };
}

/** Canonical unit vector of a longitude and latitude in degrees (+X at 0°N 0°E, +Y at 0°N 90°E, +Z north). */
export function lonLatDegToUnit(lon: number, lat: number): [number, number, number] {
  const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
  return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
}
