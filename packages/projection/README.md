# @mapmaker/projection

Projection and distortion layer (Phase 5; ARCHITECTURE §3.7). Projection is a view: nothing here writes a `World`.

- `registry.ts`: the projection set (d3-geo 3.1.1, d3-geo-projection 4.0.0, unmodified), each with its pole class.
- `view.ts`: `ProjectionView`, a d3 projection fitted to an output size, with the inverse and its domain check.
- `distortion.ts`: areal scale, maximum angular deformation and the meridian and parallel scales at any point, with the pole rules of §3.7.
- `sampler.ts`: the exact CPU inverse sampler (invert, domain check, unit vector, nearest cell, containing triangle, sample rule), tiled in row bands.
- `png.ts`: 16-bit PNG heightmaps (orogen's encoder, fflate zlib): absolute −5..6 km, land-only 0..6 km, or a custom metre range, recorded as tEXt.
- `exact/`: the exact path. `EXACT_PROJECTIONS` and `exactView` use a dmath-backed copy of d3 built by the alias in `alias/d3-dmath.mjs` (Vite/Vitest plugin; Node hooks via `tsx --import ./packages/projection/alias/register.mjs`); `kernels.ts` serves sampling and export from the engine worker (`worldKernel` op). Every export goes through this path; interactive display uses the stock registry with native math.

Planned in Phase 5: the vector path and Tissot overlay (M3), GPU shaders (M4), UI (M5).
