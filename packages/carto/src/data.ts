// Cartographic data derived from a World: the named features (landmasses, ocean basins, seas, mountain ranges, rivers), the
// river network and the coastline (Phase 5c; design note 18 §3). Original code. It only reads the World; nothing here is
// stored in it (a style never changes a World hash). Everything is a pure function of the elevation layer, the mesh and the
// world's seed, in sphere units (steradians, radians), so the result does not depend on the resolution except through the
// mesh's own detail, and is the same in every browser and in Node.
import type { MultiLineString } from 'geojson';
import { type SphereMesh, type World, EARTH_RADIUS_M, MinHeap, dmath, priorityFlood } from '@mapmaker/core';
import { coastlines, lonLat } from '@mapmaker/projection';
import { nameFeatures } from './names';
import type { LabelKind } from './style';

const FOUR_PI = 4 * Math.PI;

export interface CartoFeature {
  /** Stable within a world: kind and the anchor rounded to 3°. */
  id: string;
  kind: LabelKind;
  name: string;
  /** Anchor in degrees: the pole of inaccessibility of an area, the middle of a path. */
  lon: number;
  lat: number;
  /** Solid angle in steradians (areas) or drainage area (rivers); importance within the kind. */
  area: number;
  /** Angular radius in radians of the cap with the same area (areas), or half the path's angular length. */
  radius: number;
  /** Ranges and rivers: the spine as (lon, lat) pairs in degrees, in flow order for rivers. */
  path?: number[];
}

export interface RiverChain {
  /** (lon, lat) pairs in degrees, downstream last. */
  pts: Float64Array;
  /** Drainage area (steradians) at each point. */
  area: Float32Array;
}

export interface CartoData {
  seed: string;
  /** Land cell → landmass index (the order of `landmasses`), −1 for sea. */
  landmass: Int32Array;
  /** Landmass component sizes (steradians) and anchors (degrees), indexed by landmass index, for colouring. */
  landmasses: { id: string; area: number; lon: number; lat: number }[];
  features: CartoFeature[];
  rivers: RiverChain[];
  coast: MultiLineString;
  radius_m: number;
}

export interface CartoOptions {
  meshId?: string;
  /** A landmass at least this large (fraction of the sphere) is a continent. */
  continentFraction?: number;
  /** Smallest named island (fraction of the sphere). */
  islandFraction?: number;
  /** Drainage area (steradians) a river must reach to be named. */
  riverLabelSr?: number;
}

const DEFAULTS = { continentFraction: 0.014, islandFraction: 4e-5, riverLabelSr: 0.004 };

/** Connected components of `member` over the CSR adjacency: id per cell (−1 outside), count. */
function components(mesh: SphereMesh, member: (i: number) => boolean): { id: Int32Array; count: number } {
  const n = mesh.numRegions, id = new Int32Array(n).fill(-1);
  const off = mesh.adjOffset, adj = mesh.adjList, stack = new Int32Array(n);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (id[s]! >= 0 || !member(s)) continue;
    let sp = 0;
    stack[sp++] = s; id[s] = count;
    while (sp) {
      const c = stack[--sp]!;
      for (let k = off[c]!; k < off[c + 1]!; k++) {
        const nb = adj[k]!;
        if (id[nb]! < 0 && member(nb)) { id[nb] = count; stack[sp++] = nb; }
      }
    }
    count++;
  }
  return { id, count };
}

/**
 * Distance (radians of arc, along the mesh graph) from each cell to the nearest cell of the opposite kind, within its own
 * kind: land cells measure to the coast through land, sea cells through water. The maximum of a landmass or a basin is its
 * pole of inaccessibility, the best place for an area label.
 */
function coastDistance(mesh: SphereMesh, isLand: Uint8Array): Float64Array {
  const n = mesh.numRegions, off = mesh.adjOffset, adj = mesh.adjList, P = mesh.points;
  const dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  const heap = new MinHeap(adj.length + n);
  for (let c = 0; c < n; c++) {
    for (let k = off[c]!; k < off[c + 1]!; k++) if (isLand[adj[k]!] !== isLand[c]) { dist[c] = 0; heap.push(0, c); break; }
  }
  while (heap.n) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    for (let k = off[c]!; k < off[c + 1]!; k++) {
      const nb = adj[k]!;
      if (done[nb] || isLand[nb] !== isLand[c]) continue;
      const dot = P[3 * c]! * P[3 * nb]! + P[3 * c + 1]! * P[3 * nb + 1]! + P[3 * c + 2]! * P[3 * nb + 2]!;
      const nd = dist[c]! + dmath.acos(Math.min(1, dot));
      if (nd < dist[nb]!) { dist[nb] = nd; heap.push(nd, nb); }
    }
  }
  return dist;
}

/** Angular radius (radians) of the spherical cap with solid angle `sr`. */
const capRadius = (sr: number): number => dmath.acos(Math.max(-1, 1 - sr / (2 * Math.PI)));

const ll = (mesh: SphereMesh, c: number): [number, number] => lonLat(mesh.points[3 * c]!, mesh.points[3 * c + 1]!, mesh.points[3 * c + 2]!);
const fid = (kind: string, lon: number, lat: number) => `${kind}:${Math.round(lon / 3)}:${Math.round(lat / 3)}`;

/** The seed string names are drawn from: the master seed and orogen's seed parameter. */
export function worldNameSeed(world: World): string {
  const p = world.params['orogen'] as { seed?: number } | undefined;
  return `${world.params.masterSeed}|${p?.seed ?? ''}`;
}

export function computeCartoData(world: World, opts: CartoOptions = {}): CartoData {
  const o = { ...DEFAULTS, ...opts };
  const meshId = opts.meshId ?? 'global';
  const rec = world.meshes.get(meshId);
  if (!rec) throw new Error(`no such mesh: ${meshId}`);
  const mesh = rec.mesh, elev = world.layers.get(meshId, 'elevation'), n = mesh.numRegions;
  const radius_m = (world.planet['radius_m'] as number | undefined) ?? EARTH_RADIUS_M;
  const area = mesh.cellArea_sr, P = mesh.points, off = mesh.adjOffset, adj = mesh.adjList;
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = elev[i]! > 0 ? 1 : 0;
  const dist = coastDistance(mesh, land);

  const raw: Omit<CartoFeature, 'name' | 'id'>[] = [];

  // Landmasses.
  const lc = components(mesh, (i) => land[i] === 1);
  const lArea = new Float64Array(lc.count), lBest = new Int32Array(lc.count).fill(-1);
  for (let i = 0; i < n; i++) {
    const c = lc.id[i]!;
    if (c < 0) continue;
    lArea[c]! += area[i]!;
    if (lBest[c]! < 0 || dist[i]! > dist[lBest[c]!]!) lBest[c] = i;
  }
  // Landmass index order: by area descending, ties by anchor cell (stable).
  const lOrder = Array.from({ length: lc.count }, (_, i) => i).sort((a, b) => lArea[b]! - lArea[a]! || lBest[a]! - lBest[b]!);
  const remap = new Int32Array(lc.count);
  lOrder.forEach((c, rank) => { remap[c] = rank; });
  const landmass = new Int32Array(n);
  for (let i = 0; i < n; i++) landmass[i] = lc.id[i]! < 0 ? -1 : remap[lc.id[i]!]!;
  const landmasses = lOrder.map((c) => {
    const [lon, lat] = ll(mesh, lBest[c]!);
    return { id: fid('landmass', lon, lat), area: lArea[c]!, lon, lat };
  });
  const maxIslands = 40;
  let islands = 0;
  for (const c of lOrder) {
    const frac = lArea[c]! / FOUR_PI;
    const [lon, lat] = ll(mesh, lBest[c]!);
    if (frac >= o.continentFraction) raw.push({ kind: 'continent', lon, lat, area: lArea[c]!, radius: capRadius(lArea[c]!) });
    else if (frac >= o.islandFraction && islands < maxIslands) { islands++; raw.push({ kind: 'island', lon, lat, area: lArea[c]!, radius: capRadius(lArea[c]!) }); }
  }

  // Water: the open sea of each connected body is divided into basins by farthest-point seeds over open water; small
  // enclosed bodies are seas.
  const sc = components(mesh, (i) => land[i] === 0);
  const sArea = new Float64Array(sc.count), sBest = new Int32Array(sc.count).fill(-1);
  for (let i = 0; i < n; i++) {
    const c = sc.id[i]!;
    if (c < 0) continue;
    sArea[c]! += area[i]!;
    if (sBest[c]! < 0 || dist[i]! > dist[sBest[c]!]!) sBest[c] = i;
  }
  const dotc = (a: number, b: number) => P[3 * a]! * P[3 * b]! + P[3 * a + 1]! * P[3 * b + 1]! + P[3 * a + 2]! * P[3 * b + 2]!;
  for (let c = 0; c < sc.count; c++) {
    const frac = sArea[c]! / FOUR_PI;
    if (frac < 4e-4) continue;
    if (frac < 0.02) { const [lon, lat] = ll(mesh, sBest[c]!); raw.push({ kind: 'sea', lon, lat, area: sArea[c]!, radius: capRadius(sArea[c]!) }); continue; }
    // An ocean body: K basins, each ~12% of the sphere at most.
    const K = Math.max(1, Math.min(6, Math.round(sArea[c]! / (0.12 * FOUR_PI))));
    const cells: number[] = [];
    let dmax = 0;
    for (let i = 0; i < n; i++) if (sc.id[i] === c) { cells.push(i); dmax = Math.max(dmax, dist[i]!); }
    const open = cells.filter((i) => dist[i]! >= 0.3 * dmax);
    const seeds = [sBest[c]!];
    while (seeds.length < K && open.length) {
      let best = -1, bestD = -1;
      for (const i of open) {
        let nearest = Infinity;
        for (const s of seeds) nearest = Math.min(nearest, dmath.acos(Math.min(1, dotc(i, s))));
        if (nearest > bestD) { bestD = nearest; best = i; }
      }
      if (best < 0 || bestD < 0.35) break; // no open water far enough from the others
      seeds.push(best);
    }
    const terr = new Float64Array(seeds.length);
    for (const i of cells) {
      let bs = 0, bd = -2;
      for (let s = 0; s < seeds.length; s++) { const d = dotc(i, seeds[s]!); if (d > bd) { bd = d; bs = s; } }
      terr[bs]! += area[i]!;
    }
    seeds.forEach((s, k) => { const [lon, lat] = ll(mesh, s); raw.push({ kind: 'ocean', lon, lat, area: terr[k]!, radius: capRadius(terr[k]!) }); });
  }

  // Mountain ranges: connected high ground, each reduced to a spine of bin centres along its principal axis.
  const landElev: number[] = [];
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 20000))) if (land[i]) landElev.push(elev[i]!);
  landElev.sort((a, b) => a - b);
  const high = Math.max(1200, landElev.length ? landElev[Math.floor(0.88 * landElev.length)]! : 1200);
  const rc = components(mesh, (i) => elev[i]! >= high);
  const members: number[][] = Array.from({ length: rc.count }, () => []);
  for (let i = 0; i < n; i++) if (rc.id[i]! >= 0) members[rc.id[i]!]!.push(i);
  const ranges = members.map((m) => ({ m, a: m.reduce((s, i) => s + area[i]!, 0) })).filter((r) => r.a >= 0.0012).sort((a, b) => b.a - a.a).slice(0, 10);
  for (const r of ranges) {
    const spine = rangeSpine(mesh, r.m);
    if (!spine) continue;
    const mid = spine[Math.floor(spine.length / 2)]!;
    const len = spine.reduce((s, p, k) => (k ? s + dmath.acos(Math.min(1, p[0] * spine[k - 1]![0] + p[1] * spine[k - 1]![1] + p[2] * spine[k - 1]![2])) : 0), 0);
    const [lon, lat] = lonLat(mid[0], mid[1], mid[2]);
    raw.push({ kind: 'range', lon, lat, area: r.a, radius: len / 2, path: spine.flatMap((p) => lonLat(p[0], p[1], p[2])) });
  }

  // Rivers: priority-flood drainage on the land; chains from heads and confluences to the next confluence or the sea.
  const fl = priorityFlood(elev, off, adj, area);
  const riverData = extractRivers(mesh, fl, land);
  for (const f of riverFeatures(mesh, fl, o.riverLabelSr)) raw.push(f);

  // Names and ids; features ordered by kind then importance so names do not depend on discovery order.
  const kindOrder: Record<LabelKind, number> = { continent: 0, ocean: 1, sea: 2, island: 3, range: 4, river: 5 };
  raw.sort((x, y) => kindOrder[x.kind] - kindOrder[y.kind] || y.area - x.area || x.lon - y.lon || x.lat - y.lat);
  const seed = worldNameSeed(world);
  const names = nameFeatures(seed, raw);
  const features: CartoFeature[] = raw.map((f, i) => ({ ...f, id: fid(f.kind, f.lon, f.lat), name: names[i]! }));
  return { seed, landmass, landmasses, features, rivers: riverData, coast: coastlines(mesh, (i) => elev[i]! > 0), radius_m };
}

/** The spine of a range: unit vectors at the centres of up to 7 bins along the cells' principal axis; null if too short. */
function rangeSpine(mesh: SphereMesh, cells: number[]): [number, number, number][] | null {
  const P = mesh.points;
  let cx = 0, cy = 0, cz = 0;
  for (const i of cells) { cx += P[3 * i]!; cy += P[3 * i + 1]!; cz += P[3 * i + 2]!; }
  const cl = dmath.hypot(cx, cy, cz) || 1;
  const c: [number, number, number] = [cx / cl, cy / cl, cz / cl];
  const h: [number, number, number] = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1: [number, number, number] = [c[1] * h[2] - c[2] * h[1], c[2] * h[0] - c[0] * h[2], c[0] * h[1] - c[1] * h[0]];
  const l1 = dmath.hypot(...e1);
  e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2: [number, number, number] = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
  const xy = cells.map((i) => [P[3 * i]! * e1[0] + P[3 * i + 1]! * e1[1] + P[3 * i + 2]! * e1[2], P[3 * i]! * e2[0] + P[3 * i + 1]! * e2[1] + P[3 * i + 2]! * e2[2]] as const);
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of xy) { sxx += x * x; sxy += x * y; syy += y * y; }
  const th = 0.5 * dmath.atan2(2 * sxy, sxx - syy), ct = dmath.cos(th), st = dmath.sin(th);
  const t = xy.map(([x, y]) => x * ct + y * st);
  let lo = Infinity, hi = -Infinity;
  for (const v of t) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (hi - lo < 0.05) return null; // shorter than ~3°: a blob, not a range
  const bins = Math.max(3, Math.min(7, Math.round((hi - lo) / 0.03)));
  const sum = Array.from({ length: bins }, () => [0, 0, 0, 0]);
  cells.forEach((i, k) => {
    const b = Math.min(bins - 1, Math.floor(((t[k]! - lo) / (hi - lo)) * bins)), s = sum[b]!;
    s[0]! += P[3 * i]!; s[1]! += P[3 * i + 1]!; s[2]! += P[3 * i + 2]!; s[3]! += 1;
  });
  const out: [number, number, number][] = [];
  for (const s of sum) {
    if (!s[3]) continue;
    const l = dmath.hypot(s[0]!, s[1]!, s[2]!) || 1;
    out.push([s[0]! / l, s[1]! / l, s[2]! / l]);
  }
  return out.length >= 3 ? out : null;
}

type Flood = ReturnType<typeof priorityFlood>;

/** Smallest drainage area (steradians) extracted as a river chain: about 16,000 km² on an Earth-size planet. */
export const RIVER_MIN_SR = 0.0004;

/** River chains: from each head and each confluence down to the next confluence or the sea. */
function extractRivers(mesh: SphereMesh, fl: Flood, land: Uint8Array): RiverChain[] {
  const n = mesh.numRegions, off = mesh.adjOffset, adj = mesh.adjList, P = mesh.points;
  const major = new Uint8Array(n);
  for (let c = 0; c < n; c++) if ((fl.receiver[c]! >= 0 || fl.outlet[c] === c) && fl.drainageArea[c]! >= RIVER_MIN_SR) major[c] = 1;
  const upstream = new Int32Array(n);
  for (let c = 0; c < n; c++) if (major[c] && fl.receiver[c]! >= 0 && major[fl.receiver[c]!]) upstream[fl.receiver[c]!]!++;
  const isStart = (c: number) => major[c] === 1 && upstream[c] !== 1;
  const rivers: RiverChain[] = [];
  for (let c = 0; c < n; c++) {
    if (!isStart(c)) continue;
    const cells = [c];
    let cur = c, end: [number, number] | null = null;
    for (;;) {
      const r = fl.receiver[cur]!;
      if (r < 0) {
        // Reached the coast: finish at the boundary with the sea (midway to the first sea neighbour).
        for (let k = off[cur]!; k < off[cur + 1]!; k++) {
          const nb = adj[k]!;
          if (!land[nb]) { end = lonLat(P[3 * cur]! + P[3 * nb]!, P[3 * cur + 1]! + P[3 * nb + 1]!, P[3 * cur + 2]! + P[3 * nb + 2]!); break; }
        }
        break;
      }
      cells.push(r);
      if (!major[r] || isStart(r)) break;
      cur = r;
    }
    const pts: number[] = [], ar: number[] = [];
    for (const k of cells) { pts.push(...lonLat(P[3 * k]!, P[3 * k + 1]!, P[3 * k + 2]!)); ar.push(fl.drainageArea[k]!); }
    if (end) { pts.push(end[0], end[1]); ar.push(ar[ar.length - 1]!); }
    if (pts.length >= 4) rivers.push({ pts: Float64Array.from(pts), area: Float32Array.from(ar) });
  }
  return rivers;
}

/** Features for the largest rivers: the main stem (largest tributary at every fork) upstream from each outlet. */
function riverFeatures(mesh: SphereMesh, fl: Flood, minSr: number): Omit<CartoFeature, 'name' | 'id'>[] {
  const n = mesh.numRegions, P = mesh.points;
  const outlets: number[] = [];
  for (let c = 0; c < n; c++) if (fl.outlet[c] === c && fl.drainageArea[c]! >= minSr) outlets.push(c);
  outlets.sort((x, y) => fl.drainageArea[y]! - fl.drainageArea[x]! || x - y);
  // The upstream neighbour with the largest drainage area, per cell (one pass; ties to the lower index).
  const best = new Int32Array(n).fill(-1);
  for (let c = 0; c < n; c++) {
    const r = fl.receiver[c]!;
    if (r < 0) continue;
    const b = best[r]!;
    if (b < 0 || fl.drainageArea[c]! > fl.drainageArea[b]! || (fl.drainageArea[c] === fl.drainageArea[b] && c < b)) best[r] = c;
  }
  const out: Omit<CartoFeature, 'name' | 'id'>[] = [];
  for (const o of outlets.slice(0, 12)) {
    const cells = [o];
    for (let cur = best[o]!; cur >= 0; cur = best[cur]!) cells.push(cur);
    if (cells.length < 6) continue;
    cells.reverse(); // source first
    const path: number[] = [];
    let len = 0;
    cells.forEach((c, k) => {
      path.push(...lonLat(P[3 * c]!, P[3 * c + 1]!, P[3 * c + 2]!));
      if (k) { const p = cells[k - 1]!; len += dmath.acos(Math.min(1, P[3 * p]! * P[3 * c]! + P[3 * p + 1]! * P[3 * c + 1]! + P[3 * p + 2]! * P[3 * c + 2]!)); }
    });
    const m = cells[Math.floor(cells.length / 2)]!;
    const [lon, lat] = lonLat(P[3 * m]!, P[3 * m + 1]!, P[3 * m + 2]!);
    out.push({ kind: 'river', lon, lat, area: fl.drainageArea[o]!, radius: len / 2, path });
  }
  return out;
}
