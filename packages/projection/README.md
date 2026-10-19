# @mapmaker/projection

Projection and distortion layer (Phase 5; ARCHITECTURE §3.7). Projection is a view: nothing here reads or writes a `World`.

- `registry.ts`: the projection set (d3-geo 3.1.1, d3-geo-projection 4.0.0, unmodified), each with its pole class.
- `view.ts`: `ProjectionView`, a d3 projection fitted to an output size, with the inverse and its domain check.
- `distortion.ts`: areal scale, maximum angular deformation and the meridian and parallel scales at any point, with the pole rules of §3.7.

Planned in Phase 5: the exact CPU inverse sampler and 16-bit PNG heightmap export (M2), the vector path and Tissot overlay (M3), GPU shaders (M4).
