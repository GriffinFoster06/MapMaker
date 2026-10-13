// Provenance: original code. Ported from this project's tools/tuning/ab/sphere.mjs `basins` and `MinHeap` (Phase 1
// spike code, original to MapMaker), which implement priority-flood depression routing (Barnes, Lehman & Mulla 2014,
// "Priority-flood: an optimal depression-filling and watershed-labeling algorithm"). Adds receivers and drainage area.

/** Binary min-heap of (key, cell). Ties pop in a fixed order, so results are deterministic. */
export class MinHeap {
  private readonly k: Float64Array;
  private readonly v: Int32Array;
  n = 0;
  constructor(cap: number) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); }

  push(key: number, val: number): void {
    let i = this.n++;
    const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p]! <= key) break; k[i] = k[p]!; v[i] = v[p]!; i = p; }
    k[i] = key; v[i] = val;
  }

  pop(): number {
    const k = this.k, v = this.v, top = v[0]!, key = k[--this.n]!, val = v[this.n]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && k[c + 1]! < k[c]!) c++;
      if (k[c]! >= key) break;
      k[i] = k[c]!; v[i] = v[c]!; i = c;
    }
    k[i] = key; v[i] = val;
    return top;
  }
}

export interface Drainage {
  /** Cell each land cell drains to (towards the sea); −1 for sea cells and for land with no path to the sea. */
  receiver: Int32Array;
  /** Coastal land cell where each land cell's water reaches the sea; −1 for sea cells and unreachable land. */
  outlet: Int32Array;
  /** Area draining through each cell, itself included (units of `area`); 0 for sea cells. */
  drainageArea: Float64Array;
  /** Land cells in flood order (outlets first); every cell comes after its receiver. */
  order: Int32Array;
}

/**
 * Priority-flood routing on a mesh graph. Land is `elev > 0`. Coastal land cells (with a sea neighbour) seed the
 * flood; each other land cell drains to the cell it was reached from, so depressions drain over their lowest spill
 * point. `adjOffset`/`adjList` is the CSR neighbour list; `area` the cell areas.
 */
export function priorityFlood(elev: ArrayLike<number>, adjOffset: Int32Array, adjList: Int32Array, area: ArrayLike<number>): Drainage {
  const n = elev.length;
  const receiver = new Int32Array(n).fill(-1);
  const outlet = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const order = new Int32Array(n);
  let m = 0;
  const heap = new MinHeap(adjList.length + n);
  for (let r = 0; r < n; r++) if (elev[r]! <= 0) seen[r] = 1;
  for (let r = 0; r < n; r++) {
    if (elev[r]! <= 0) continue;
    for (let i = adjOffset[r]!; i < adjOffset[r + 1]!; i++) {
      if (elev[adjList[i]!]! <= 0) { outlet[r] = r; seen[r] = 1; heap.push(elev[r]!, r); break; }
    }
  }
  while (heap.n) {
    const r = heap.pop();
    order[m++] = r;
    for (let i = adjOffset[r]!; i < adjOffset[r + 1]!; i++) {
      const nb = adjList[i]!;
      if (seen[nb]) continue;
      seen[nb] = 1; outlet[nb] = outlet[r]!; receiver[nb] = r;
      heap.push(Math.max(elev[nb]!, elev[r]!), nb);
    }
  }
  const drainageArea = new Float64Array(n);
  for (let j = 0; j < m; j++) drainageArea[order[j]!] = area[order[j]!]!;
  for (let j = m - 1; j >= 0; j--) {
    const r = order[j]!, d = receiver[r]!;
    if (d >= 0) drainageArea[d]! += drainageArea[r]!;
  }
  return { receiver, outlet, drainageArea, order: order.slice(0, m) };
}

export interface MajorBasins {
  /** Major-basin id (the outlet cell) per land cell; −1 for sea, unreachable land and land in minor basins. */
  basin: Int32Array;
  /** 1 on land cells with a neighbour in a different major basin (or a minor one): the divide band. */
  divideBand: Uint8Array;
}

/** Basins whose outlet drains at least `minArea` are major; the rest are minor (−1). */
export function majorBasins(d: Drainage, adjOffset: Int32Array, adjList: Int32Array, minArea: number): MajorBasins {
  const n = d.outlet.length;
  const basin = new Int32Array(n).fill(-1);
  for (let r = 0; r < n; r++) {
    const o = d.outlet[r]!;
    if (o >= 0 && d.drainageArea[o]! >= minArea) basin[r] = o;
  }
  const divideBand = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    if (d.outlet[r]! < 0) continue;
    for (let i = adjOffset[r]!; i < adjOffset[r + 1]!; i++) {
      const nb = adjList[i]!;
      if (d.outlet[nb]! >= 0 && basin[nb] !== basin[r]) { divideBand[r] = 1; break; }
    }
  }
  return { basin, divideBand };
}
