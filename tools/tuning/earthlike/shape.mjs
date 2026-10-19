// Landmass shape metrics for the rectangular-continent defect (decision P3; docs/checkpoints/RECT_CONTINENTS.md) and the
// Earth-likeness sweep (decision P2). Original code. Input: a SphereMesh (canonical frame, +Z north) and a per-cell land
// flag. The mesh is rasterised to an equirectangular grid (nearest cell by a greedy walk on the Delaunay graph, which is
// exact for the nearest site), then:
//   boxFill     per landmass: area / area of its axis-aligned lat/lon bounding box (equal-area weighted). A rectangle is 1;
//               Earth's continents are well below 1. Reported area-weighted over landmasses >= minArea, and the maximum.
//   straight    share of coastline length (km) lying in near-straight stretches: a window of K consecutive coast edges whose
//               corners stay within DEV pixels of their chord and whose chord is >= 0.7 of the path length.
//   axisStraight  the subset of those stretches that run along a parallel or meridian (corner coordinate in one axis varies
//               by <= 1 pixel over the window): the look of a rectangle on a lat/lon map.
// Pixel size 0.25 degrees (27.8 km); coast windows K = 24 edges (about 480 to 670 km). Rows above 75 degrees of latitude are
// ignored. The metric is relative: compare simulated worlds with Earth computed the same way, never with a number alone.
const R_KM = 6371;

export function rasterise(mesh, isLand, W = 1440, H = 720) {
  const p = mesh.points, adjO = mesh.adjOffset, adj = mesh.adjList;
  const grid = new Uint8Array(W * H);
  let cur = 0;
  const dot = (c, x, y, z) => p[3 * c] * x + p[3 * c + 1] * y + p[3 * c + 2] * z;
  for (let j = 0; j < H; j++) {
    const lat = (90 - (j + 0.5) * 180 / H) * Math.PI / 180, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = (-180 + (i + 0.5) * 360 / W) * Math.PI / 180;
      const x = cl * Math.cos(lon), y = cl * Math.sin(lon), z = sl;
      let best = dot(cur, x, y, z);
      for (;;) {
        let nb = -1;
        for (let k = adjO[cur]; k < adjO[cur + 1]; k++) { const d = dot(adj[k], x, y, z); if (d > best) { best = d; nb = adj[k]; } }
        if (nb < 0) break;
        cur = nb;
      }
      grid[j * W + i] = isLand[cur] ? 1 : 0;
    }
  }
  return { grid, W, H };
}

/** Landmasses (4-connected, wrapping in longitude): area (km2) and bounding-box fill. */
export function landmasses({ grid, W, H }, minAreaKm2 = 2e5) {
  const seen = new Uint8Array(W * H), out = [];
  const dl = 2 * Math.PI / W, dphi = Math.PI / H;
  const rowArea = new Float64Array(H);
  for (let j = 0; j < H; j++) rowArea[j] = R_KM * R_KM * dl * (Math.sin(Math.PI / 2 - j * dphi) - Math.sin(Math.PI / 2 - (j + 1) * dphi));
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!grid[s] || seen[s]) continue;
    let area = 0, jmin = H, jmax = -1;
    const cols = new Uint8Array(W);
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const q = stack.pop(), j = (q / W) | 0, i = q - j * W;
      area += rowArea[j]; cols[i] = 1;
      if (j < jmin) jmin = j; if (j > jmax) jmax = j;
      const nbs = [j * W + (i + 1) % W, j * W + (i + W - 1) % W, j > 0 ? q - W : -1, j < H - 1 ? q + W : -1];
      for (const n of nbs) if (n >= 0 && grid[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
    }
    if (area < minAreaKm2) continue;
    // Longitude extent: everything except the longest empty circular gap.
    let gap = 0, run = 0;
    const first = cols.indexOf(1);
    for (let k = 0; k < 2 * W; k++) { if (cols[(first + k) % W]) run = 0; else { run++; if (run > gap) gap = run; } }
    const span = (W - Math.min(gap, W - 1)) * dl;
    const bbox = R_KM * R_KM * span * (Math.sin(Math.PI / 2 - jmin * dphi) - Math.sin(Math.PI / 2 - (jmax + 1) * dphi));
    out.push({ areaKm2: area, boxFill: Math.min(1, area / bbox) });
  }
  return out;
}

/** Coastline edges as closed or open chains of corners, then the straight-stretch shares. */
export function coastStraightness({ grid, W, H }, K = 24, DEV = 1.5) {
  const dl = 2 * Math.PI / W, dphi = Math.PI / H;
  const rows = [Math.floor(H * (90 - 75) / 180), Math.ceil(H * (90 + 75) / 180)];
  const at = (i, j) => grid[j * W + ((i % W) + W) % W];
  // Corner (x, y) with x in [0, W), y in [0, H]; edges: horizontal between (x,y)-(x+1,y), vertical (x,y)-(x,y+1).
  const edges = []; // [x0, y0, x1, y1, weightKm, axis]
  const byVertex = new Map();
  const vid = (x, y) => ((x % W) + W) % W + y * W;
  const add = (x0, y0, x1, y1, wKm) => {
    const id = edges.length; edges.push([x0, y0, x1, y1, wKm]);
    for (const v of [vid(x0, y0), vid(x1, y1)]) { const a = byVertex.get(v); if (a) a.push(id); else byVertex.set(v, [id]); }
  };
  for (let j = rows[0]; j < rows[1]; j++) for (let i = 0; i < W; i++) {
    const lat = (90 - (j + 0.5) * 180 / H) * Math.PI / 180;
    if (at(i, j) !== at(i + 1, j)) add(i + 1, j, i + 1, j + 1, R_KM * dphi); // vertical edge between columns i and i+1
    if (j + 1 < rows[1] && at(i, j) !== at(i, j + 1)) add(i, j + 1, i + 1, j + 1, R_KM * Math.cos(lat) * dl); // horizontal edge below
  }
  const used = new Uint8Array(edges.length);
  let total = 0, straight = 0, axis = 0;
  for (const e of edges) total += e[4];
  for (let s0 = 0; s0 < edges.length; s0++) {
    if (used[s0]) continue;
    // Walk from s0 in one direction, collecting unwrapped corners and edge weights.
    const pts = [], ws = [];
    let e = s0, x = edges[e][0], y = edges[e][1], ux = x;
    pts.push([ux, y]);
    for (;;) {
      used[e] = 1;
      const [x0, y0, x1, y1, w] = edges[e];
      const fwd = vid(x0, y0) === vid(x, y);
      const nx = fwd ? x1 : x0, ny = fwd ? y1 : y0;
      // Unwrapped step in x (edges are one pixel long; handle the seam).
      let dx = nx - x; if (dx > 1) dx -= W; if (dx < -1) dx += W;
      ux += dx; x = ((nx % W) + W) % W; y = ny;
      pts.push([ux, y]); ws.push(w);
      const nbrs = byVertex.get(vid(x, y)).filter((k) => !used[k]);
      if (!nbrs.length) break;
      e = nbrs[0];
    }
    const M = ws.length;
    if (M < K) continue;
    const mark = new Uint8Array(M), markAxis = new Uint8Array(M);
    const closed = pts.length > 2 && vid(pts[0][0], pts[0][1]) === vid(x, y);
    const lim = closed ? M : M - K + 1;
    for (let a = 0; a < lim; a++) {
      const P = (k) => pts[closed ? (a + k) % M : a + k];
      const p0 = P(0), pk = P(K);
      const cx = pk[0] - p0[0], cy = pk[1] - p0[1], cl = Math.hypot(cx, cy);
      if (cl < 0.7 * K) continue;
      let dev = 0, minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (let k = 0; k <= K; k++) {
        const q = P(k), d = Math.abs((q[0] - p0[0]) * cy - (q[1] - p0[1]) * cx) / cl;
        if (d > dev) dev = d;
        minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]);
      }
      if (dev > DEV) continue;
      const ax = (maxx - minx <= 1 || maxy - miny <= 1);
      for (let k = 0; k < K; k++) { const idx = closed ? (a + k) % M : a + k; mark[idx] = 1; if (ax) markAxis[idx] = 1; }
    }
    for (let k = 0; k < M; k++) { if (mark[k]) straight += ws[k]; if (markAxis[k]) axis += ws[k]; }
  }
  return { coastKm: Math.round(total), straight: straight / total, axisStraight: axis / total };
}

export function shapeMetrics(mesh, isLand, opts = {}) {
  const r = rasterise(mesh, isLand, opts.W, opts.H);
  const lm = landmasses(r, opts.minAreaKm2);
  const A = lm.reduce((s, m) => s + m.areaKm2, 0);
  const cs = coastStraightness(r);
  const big = lm.filter((m) => m.areaKm2 >= 1e6);
  return {
    landmasses: lm.length, bigLandmasses: big.length,
    boxFillWeighted: A ? lm.reduce((s, m) => s + m.boxFill * m.areaKm2, 0) / A : 0,
    boxFillMax: big.length ? Math.max(...big.map((m) => m.boxFill)) : 0,
    ...cs,
  };
}
