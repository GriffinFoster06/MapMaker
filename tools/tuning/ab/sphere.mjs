// Provenance: MapMaker spikes/lib/sphere.mjs (Phase 1 spike code, original to this project), moved here unchanged except this header.
// Sphere-mesh helpers for the Q7 A/B harness. All positions are orogen-frame unit vectors (lat = asin(y), lon = atan2(x, z)).

export const R_KM = 6371;

/** CSR adjacency from a closed Delaunay triangulation (triangles/halfedges). */
export function adjacency(triangles, halfedges, nR) {
  const next = (s) => (s % 3 === 2 ? s - 2 : s + 1);
  const rS = new Int32Array(nR).fill(-1);
  for (let s = 0; s < triangles.length; s++) if (rS[triangles[s]] === -1) rS[triangles[s]] = s;
  const cnt = new Int32Array(nR);
  for (let r = 0; r < nR; r++) {
    const s0 = rS[r]; if (s0 < 0) continue;
    let s = s0; do { cnt[r]++; s = next(halfedges[s]); } while (s !== s0);
  }
  const off = new Int32Array(nR + 1);
  for (let r = 0; r < nR; r++) off[r + 1] = off[r] + cnt[r];
  const list = new Int32Array(off[nR]);
  for (let r = 0; r < nR; r++) {
    const s0 = rS[r]; if (s0 < 0) continue;
    let s = s0, i = off[r];
    do { list[i++] = triangles[next(s)]; s = next(halfedges[s]); } while (s !== s0);
  }
  return { off, list };
}

/** Barycentric dual area per cell (steradians): 1/3 of each incident spherical triangle. */
export function dualArea(triangles, xyz, nR) {
  const area = new Float64Array(nR);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = 3 * triangles[t], b = 3 * triangles[t + 1], c = 3 * triangles[t + 2];
    const ax = xyz[a], ay = xyz[a + 1], az = xyz[a + 2];
    const bx = xyz[b], by = xyz[b + 1], bz = xyz[b + 2];
    const cx = xyz[c], cy = xyz[c + 1], cz = xyz[c + 2];
    const trip = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const den = 1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az);
    const E = 2 * Math.atan2(Math.abs(trip), den);
    area[triangles[t]] += E / 3; area[triangles[t + 1]] += E / 3; area[triangles[t + 2]] += E / 3;
  }
  return area;
}

/**
 * Nearest-site locator by greedy walk on the Delaunay graph (converges to the
 * Voronoi cell on a Delaunay triangulation). Warm-started: call in a spatially
 * coherent order for O(1) amortised cost. Falls back to brute force if stuck.
 */
export function makeLocator(xyz, adj, nR) {
  let cur = 0;
  const cap = Math.ceil(4 * Math.sqrt(nR));
  return (px, py, pz) => {
    let best = px * xyz[3 * cur] + py * xyz[3 * cur + 1] + pz * xyz[3 * cur + 2];
    let improved = true, steps = 0;
    while (improved && steps++ < cap) {
      improved = false;
      for (let i = adj.off[cur]; i < adj.off[cur + 1]; i++) {
        const n = adj.list[i];
        const d = px * xyz[3 * n] + py * xyz[3 * n + 1] + pz * xyz[3 * n + 2];
        if (d > best) { best = d; cur = n; improved = true; }
      }
    }
    if (steps >= cap) for (let c = 0; c < nR; c++) {
      const d = px * xyz[3 * c] + py * xyz[3 * c + 1] + pz * xyz[3 * c + 2];
      if (d > best) { best = d; cur = c; }
    }
    return cur;
  };
}

/** Unit vector (orogen frame) for a lat/lon in radians. */
export const llToXyz = (lat, lon) => [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];

/** Sample a run onto a W×H equirectangular grid of cell centres (inverse sampling). */
export function gridIndex(xyz, adj, nR, W = 360, H = 180) {
  const loc = makeLocator(xyz, adj, nR);
  const idx = new Int32Array(W * H);
  for (let j = 0; j < H; j++) {
    const lat = Math.PI / 2 - (j + 0.5) * Math.PI / H;
    for (let i0 = 0; i0 < W; i0++) {
      const i = j % 2 ? W - 1 - i0 : i0;   // boustrophedon keeps the walk warm
      const lon = -Math.PI + (i + 0.5) * 2 * Math.PI / W;
      const [x, y, z] = llToXyz(lat, lon);
      idx[j * W + i] = loc(x, y, z);
    }
  }
  return idx;
}

/** Point set with nearest-distance queries (3D bucket grid on the unit cube). */
export function pointSet(pts) {
  const n = pts.length / 3, G = Math.max(8, Math.min(256, Math.round(Math.cbrt(n) * 1.5)));
  const h = 2 / G, key = (i, j, k) => (i * G + j) * G + k;
  const cell = (v) => Math.min(G - 1, Math.max(0, Math.floor((v + 1) / h)));
  const buckets = new Map();
  for (let p = 0; p < n; p++) {
    const k = key(cell(pts[3 * p]), cell(pts[3 * p + 1]), cell(pts[3 * p + 2]));
    let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(p);
  }
  return {
    /** angular distance (radians) from (x,y,z) to the nearest point */
    nearest(x, y, z) {
      const ci = cell(x), cj = cell(y), ck = cell(z);
      let bestChord2 = Infinity;
      for (let ring = 0; ring < G; ring++) {
        for (let i = ci - ring; i <= ci + ring; i++) for (let j = cj - ring; j <= cj + ring; j++) for (let k = ck - ring; k <= ck + ring; k++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== ring) continue;
          if (i < 0 || j < 0 || k < 0 || i >= G || j >= G || k >= G) continue;
          const b = buckets.get(key(i, j, k)); if (!b) continue;
          for (const p of b) {
            const dx = pts[3 * p] - x, dy = pts[3 * p + 1] - y, dz = pts[3 * p + 2] - z;
            const d2 = dx * dx + dy * dy + dz * dz; if (d2 < bestChord2) bestChord2 = d2;
          }
        }
        // every point in an unvisited shell is at least ring*h away (chord)
        if (bestChord2 <= (ring * h) ** 2) break;
      }
      return 2 * Math.asin(Math.min(1, Math.sqrt(bestChord2) / 2));
    },
  };
}

/** Binary min-heap keyed by Float64 priority (for priority-flood). */
export class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], key = k[--this.n], val = v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.n) break;
      if (c + 1 < this.n && k[c + 1] < k[c]) c++;
      if (k[c] >= key) break;
      k[i] = k[c]; v[i] = v[c]; i = c;
    }
    k[i] = key; v[i] = val; return top;
  }
}

/**
 * Drainage basins by priority-flood from the ocean (depressions filled):
 * every land cell gets the id of the ocean-adjacent outlet cell it drains to.
 * Returns Int32Array basin (−1 for ocean).
 */
export function basins(elev, adj, nR) {
  const basin = new Int32Array(nR).fill(-1), seen = new Uint8Array(nR);
  const heap = new MinHeap(adj.list.length + nR);
  for (let r = 0; r < nR; r++) if (elev[r] <= 0) seen[r] = 1;
  for (let r = 0; r < nR; r++) {
    if (elev[r] <= 0) continue;
    for (let i = adj.off[r]; i < adj.off[r + 1]; i++) if (elev[adj.list[i]] <= 0) { basin[r] = r; seen[r] = 1; heap.push(elev[r], r); break; }
  }
  while (heap.n) {
    const r = heap.pop();
    for (let i = adj.off[r]; i < adj.off[r + 1]; i++) {
      const n = adj.list[i]; if (seen[n]) continue;
      seen[n] = 1; basin[n] = basin[r]; heap.push(Math.max(elev[n], elev[r]), n);
    }
  }
  return basin;   // land cells with no path to ocean (none on a closed sphere with ocean) stay −1
}
