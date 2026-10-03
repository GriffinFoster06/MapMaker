# Design note 7: STL export

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 12 |
| Depends on | `SphereMesh`, the patch meshes (note 6), §3.7 projection (flat-slab option only) |

## 1. Problem

The requirement is STL export of the sphere or a patch as a **watertight** mesh, suitable for 3-D printing. It needs vertical exaggeration, an optional base plate and size limits. No upstream repo has this (matrix gap 8). orogen exports PNG heightmaps only.

## 2. Canonical inputs and outputs

**Inputs**
- **Source:** whole planet (L1) or a patch (L2+).
- **Options:**
  - exaggeration k (default 20× for planets, 2× for patches);
  - ocean mode: bathymetry, or a sea-level shell;
  - target size (diameter or longest side, in mm);
  - base thickness (mm);
  - patch form: `curved` (the spherical shell cap) or `flat` (a slab, using a projection);
  - triangle budget.

**Output:** a binary STL (little-endian, 80-byte header, 50 bytes per triangle). An optional 3MF writes the same geometry with units and metadata.

The export reads `World` and writes nothing back. It is a view (§3.7).

## 3. Approach and algorithm choice

### 3.1 Whole planet

- **Vertices** are the cell centres, displaced radially: r = R_print·(1 + k·e/R_planet).
  - e is `elevation` in metres; in sea-level-shell mode, e = max(e, 0).
  - R_print comes from the target diameter.
- **Triangles** are the mesh's Delaunay triangles. On a closed sphere they already form a closed 2-manifold. The writer checks this: V − E + F = 2, and every edge is shared by exactly two triangles with opposite orientation.
- **Orientation:** outward normals, checked by a positive signed volume.
- **Rendering detail:** cell-centre vertices give a faceted look at low N, so the exporter can resample to a finer **print mesh** through the exact sampler (barycentric) on a geodesic subdivision. That is the same as rendering the world at a chosen resolution.

### 3.2 Patch, curved form

1. Top surface: patch core triangles, displaced radially as in §3.1.
2. A **skirt** joins each boundary edge of the core to its projection on an inner shell at radius R_print − base thickness.
3. A **base:** the inner-shell cap, triangulated by fan or ear clipping in the patch's azimuthal plane, then mapped back to the shell.

The result is watertight by construction. Every boundary edge is used once by the top and once by the skirt.

### 3.3 Patch, flat form

The patch core is projected into the plane through a `ProjectionView` (default azimuthal equidistant about the patch centre, the lowest-distortion choice for a small cap). Height is z = k·e, and the slab has a flat base and vertical walls. The projection is recorded in the STL header comment.

This is the only export that bends the sphere into a plane, and it is explicit in the UI that it is a projection.

### 3.4 Size limits and decimation

- Binary STL costs 50 bytes per triangle. A 2.56M-cell planet has about 5.1M triangles, which is about 256 MB.
- **Default budget: 2M triangles (about 100 MB).**
- Above budget, the exporter either:
  - **resamples** to a lower-resolution print mesh through the exact sampler (preferred for planets, because it keeps the mesh uniform); or
  - **decimates** with quadric error metrics (Garland & Heckbert 1997), with boundary edges locked, which is preferred for patches with large flat areas.

  Watertightness is re-checked after either one.
- The export runs in a worker and streams the output with fflate, or as raw chunks to the File System Access API, so the full file never sits in memory twice.

### 3.5 Units and metadata

- STL has no units. The exporter writes millimetres, and the header says so.
- 3MF carries units, plus the world code and seed in its metadata.

## 4. Upstream references (algorithm level)

- **orogen** `planet-mesh.js`: the globe displacement idea and the 16-bit PNG encoder (for the parallel heightmap export).
- Garland & Heckbert (1997), "Surface simplification using quadric error metrics", *SIGGRAPH*.
- **Formats:** the STL format (3D Systems, public); the 3MF Core Specification (3MF Consortium, open).

## 5. Validation

- **Watertight:**
  - every edge has exactly two incident triangles with opposite orientation;
  - V − E + F = 2 for planets, and also for closed patch solids;
  - positive signed volume.
- **Geometry:**
  - with k = 0 and the sea-level shell, enclosed volume is within 0.5% of (4/3)πR_print³ at N ≥ 200k;
  - patch top-surface vertices equal the exact-sampler values.
- **Size:** the triangle count respects the budget; the file streams in under the memory budget at 2.56M.
- **Round trip:** parse the written STL in the test and re-run the manifold checks.

## 6. Open questions

1. Should a coloured format (3MF with per-triangle colour, or OBJ with vertex colours) be included in Phase 12 for full-colour printing?

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Planet writer | ~200 |
| Patch skirt and base | ~300 |
| Flat slab | ~150 |
| Decimation | ~400 |
| Streaming writer | ~100 |
| 3MF | ~200 |
| Tests | ~400 |
| **Total** | **~1,750** |
