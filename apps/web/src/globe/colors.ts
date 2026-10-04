// Per-layer colour mapping for the globe. Original shell code, using orogen's palettes (vendored color-map.js).
import { biomeColor, elevationToColor } from '@mapmaker/gen-orogen/palettes';
import type { TypedArray } from '@mapmaker/core';

export interface LayerChoice { id: string; label: string; /** layer ids the worker must send */ need: string[]; paint(data: Record<string, TypedArray[]>, out: Float32Array): void }

const ramp = (t: number): [number, number, number] => {
  // blue → teal → yellow → red, readable on a dark background
  const x = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [[0.1, 0.15, 0.55], [0.1, 0.55, 0.6], [0.95, 0.9, 0.3], [0.8, 0.15, 0.1]];
  const f = x * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), u = f - i;
  const a = stops[i]!, b = stops[i + 1]!;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};

function percentile(a: ArrayLike<number>, p: number): number {
  const n = a.length, step = Math.max(1, Math.floor(n / 20000));
  const s: number[] = [];
  for (let i = 0; i < n; i += step) s.push(a[i]!);
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

function scalar(id: string, label: string, layer: string, pick: (d: TypedArray[]) => ArrayLike<number> = (d) => d[0]!): LayerChoice {
  return {
    id, label, need: [layer],
    paint(data, out) {
      const v = pick(data[layer]!);
      const lo = percentile(v, 0.02), hi = percentile(v, 0.98), span = hi - lo || 1;
      for (let i = 0; i < v.length; i++) { const c = ramp((v[i]! - lo) / span); out[3 * i] = c[0]; out[3 * i + 1] = c[1]; out[3 * i + 2] = c[2]; }
    },
  };
}

const magnitude = (d: TypedArray[]): ArrayLike<number> => {
  const e = d[0]!, n = d[1]!, m = new Float32Array(e.length);
  for (let i = 0; i < m.length; i++) m[i] = Math.hypot(e[i]!, n[i]!);
  return m;
};

/** A stable pastel colour per id (plates). */
function idColor(id: number): [number, number, number] {
  const h = (Math.imul(id + 1, 2654435761) >>> 0) / 4294967296;
  const f = (k: number) => 0.55 + 0.4 * Math.cos(2 * Math.PI * (h + k / 3));
  return [f(0), f(1), f(2)];
}

export const LAYERS: LayerChoice[] = [
  {
    id: 'elevation', label: 'Elevation', need: ['orogen.elevRaw'],
    paint(data, out) {
      const e = data['orogen.elevRaw']![0]!;
      for (let i = 0; i < e.length; i++) { const c = elevationToColor(e[i]!) as number[]; out[3 * i] = c[0]!; out[3 * i + 1] = c[1]!; out[3 * i + 2] = c[2]!; }
    },
  },
  {
    id: 'koppen', label: 'Köppen climate', need: ['koppen', 'orogen.elevRaw'],
    paint(data, out) {
      const k = data['koppen']![0]!, e = data['orogen.elevRaw']![0]!;
      for (let i = 0; i < k.length; i++) { const c = biomeColor(k[i]!, e[i]!) as number[]; out[3 * i] = c[0]!; out[3 * i + 1] = c[1]!; out[3 * i + 2] = c[2]!; }
    },
  },
  {
    id: 'plate', label: 'Plates', need: ['plate'],
    paint(data, out) {
      const p = data['plate']![0]!;
      for (let i = 0; i < p.length; i++) { const c = idColor(p[i]!); out[3 * i] = c[0]; out[3 * i + 1] = c[1]; out[3 * i + 2] = c[2]; }
    },
  },
  scalar('stress', 'Tectonic stress', 'stress'),
  scalar('temp.summer', 'Temperature, summer', 'temp.summer'),
  scalar('temp.winter', 'Temperature, winter', 'temp.winter'),
  scalar('precip.summer', 'Precipitation, summer', 'precip.summer'),
  scalar('precip.winter', 'Precipitation, winter', 'precip.winter'),
  scalar('pressure.summer', 'Pressure, summer', 'pressure.summer'),
  scalar('pressure.winter', 'Pressure, winter', 'pressure.winter'),
  scalar('wind.summer', 'Wind speed, summer', 'wind.summer', magnitude),
  scalar('wind.winter', 'Wind speed, winter', 'wind.winter', magnitude),
  scalar('current.summer', 'Ocean current speed, summer', 'current.summer', magnitude),
  scalar('current.winter', 'Ocean current speed, winter', 'current.winter', magnitude),
];

export const ALL_NEEDED = [...new Set(LAYERS.flatMap((l) => l.need))];
