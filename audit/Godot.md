# Audit: Godot

## 1. Overview

Godot Engine is a mature, production-grade 2D/3D cross-platform game engine maintained by the Godot Foundation. First released in 2014, it is actively developed with a large open-source community. The codebase comprises ~808k lines of C++ (2,485 .cpp files, 4,335 .h headers), ~133 Python build scripts, and ~718 GDScript files for engine subsystems and tooling. It targets desktop platforms (Windows, macOS, Linux), mobile (iOS, Android), web (WebGL/WASM via Emscripten), and consoles. Licensed MIT.

## 2. Language, runtime, dependencies, build

- **Primary language**: C++ (99%+, ~808k LOC); Python for build scripts; small GDScript editor support modules
- **Runtime**: Cross-platform: native binaries for desktop/mobile; WASM (wasm32 via Emscripten) for web
- **Key dependencies**: Emscripten (for web/WASM), SCons 4.4+, Python 3.9+, optional third-party libraries vendored in `thirdparty/` (freetype, zlib, minizip, openssl, mbedtls, enet, ogg/vorbis/theora, etc.). Exact pinned versions are in individual module `SCsub` files.
- **Build system**: SCons-based (Python). Supports platform-specific build detection and modular compilation.
- **Does it build?** Not attempted (per brief). Inferred buildability from: (1) presence of `platform/web/detect.py` checking for `emcc` availability; (2) comprehensive SCons build files for all platforms; (3) active CI/CD pipelines in `.github/workflows/`. WASM build requires Emscripten (emcc) toolchain, not present on this system. Desktop builds likely require platform-specific toolchains (clang/MSVC for Windows, Xcode for macOS, etc.).
  - **Build command (from docs)**: `scons platform=web target=template_release initial_memory=32 ...` (WASM); similar for other platforms
  - **Red flags for MapMaker**: (a) Massive C++ codebase creates large WASM binary (~15–50 MB uncompressed depending on modules enabled); (b) no pre-built WASM export; (c) requires heavy toolchain setup; (d) compilation time substantial
- **Web/WASM feasibility**: Technically feasible. Godot exports to HTML5/WASM. However, porting Godot *as a wrapper* would require: (1) compiling Godot to WASM; (2) bundling WASM engine (~5–30 MB after compression); (3) embedding MapMaker's simulation logic inside Godot scenes/scripts (via GDScript or embedded C++). This is a heavyweight, framework-level commitment, not a simple library extraction.

## 3. Subsystem inventory

### 3.1 Noise Generation

- **Where**: `modules/noise/` (fastnoise_lite.h/cpp, noise.h/cpp, noise_texture_2d.h/cpp, noise_texture_3d.h/cpp)
- **What it does**: Wraps FastNoiseLite library (third-party, vendored in `thirdparty/`). Provides: Simplex (OpenSimplex2/2S), Perlin, Cellular (Voronoi), Value/ValueCubic noise; fractal modes (FBM, Ridged, PingPong); domain warping (simplex-based); configurable octaves, lacunarity, gain. Output is float noise scalars or 2D/3D textures. No FFT-based Brownian noise or spectral synthesis.
- **Quality & realism rating: 3/5** — FastNoiseLite is well-tested and widely used for procedural terrain in games. Simplex and Perlin are industry-standard for heightmap generation. However: (a) tuned for game aesthetics, not calibrated to real-world terrain statistics; (b) no spectral synthesis or continuous fractal modes; (c) domain warping is for visual effects (flow fields), not physical simulation; (d) no multi-resolution or FFT-based synthesis for coherent noise across scales. Suitable for fantasy terrain, with limits on realism without extensive tuning/calibration.
- **Extractability: loosely coupled** — FastNoiseLite is a standalone C++ library (not Godot-specific). The Godot wrapper (fastnoise_lite.h/cpp) tightly couples it to Godot's property/resource system. Extraction effort: high (would require porting FastNoiseLite to JS/TS or consuming its C++ via WASM). Better approach: use existing JS libraries (FastNoiseLite.js or Simplex noise.js on npm).
- **Requirements capabilities it could serve**: Heightmap generation (basic seed-based terrain)

### 3.2 Navigation and Pathfinding

- **Where**: `modules/navigation_2d/` (~23 files), `modules/navigation_3d/` (~21 files); core navigation data structures in `servers/navigation_2d/` and `servers/navigation_3d/`
- **What it does**: 2D/3D pathfinding using navigation meshes (navmesh). 2D: grid-based A*, avoidance. 3D: navmesh-based A*, obstacle avoidance, RVO (reciprocal collision avoidance). Supports dynamic agent navigation, link-based constraints, region-based navigation. Integrated with physics/collision detection.
- **Quality & realism rating: 3/5** — Mature game AI navigation; industry standard for real-time pathfinding in games. However: (a) optimized for gameplay framerate, not long-term logistics; (b) avoidance is local/reactive, not global trade optimization; (c) no support for multi-modal routing (sea, land, air, cost-based), real-world road networks, or supply chains.
- **Extractability: tangled** — Deeply integrated with Godot's scene graph (nodes, transforms), server architecture, and rendering. Would require extracting both the navigation mesh data structure and the A* + avoidance solver, then re-implementing against raw graph data. Approx. 1000–1500 LOC of core logic, but rebuilding against Godot-free APIs is high effort. Better approach: use existing pathfinding libraries (ThetaStar, JPS, HPA*) or road-network libraries (OSMNX, pgRouting if PostGIS is extracted).
- **Requirements capabilities it could serve**: Partial/indirect support for population dispersal and trade routing (but not well-suited)

### 3.3 Mesh Generation and 3D Geometry

- **Where**: `modules/csg/` (constructive solid geometry); `core/math/` (convex hull, Delaunay 2D/3D, triangulation); `scene/3d/` (mesh nodes, terrain/gridmap)
- **What it does**: CSG: boolean operations on 3D shapes (union, difference, intersection). Delaunay: 2D Delaunay triangulation for procedural meshes. Convex hull: Graham scan / quickhull. Triangulation: ear-clipping for simple polygons. GridMap: 3D grid-based voxel/block placement. No procedural terrain generation (heightmap → mesh). No mesh subdivision or LOD (level-of-detail) synthesis.
- **Quality & realism rating: 2/5** — Geometry utilities are functional for game meshes and basic procedural generation, but: (a) no terrain-specific mesh synthesis (e.g., streaming LOD or geomorphing); (b) Delaunay is bare-bones (no constrained Delaunay for terrains with hard edges); (c) CSG is slow for large models. Not suitable for high-fidelity planet-scale terrain rendering without heavy custom work.
- **Extractability: moderate coupling** — Delaunay and convex hull are relatively standalone (~500 LOC total in `core/math/delaunay_2d.h`, `convex_hull.cpp`). CSG is more tangled (rendering integration). For MapMaker: extraction of Delaunay for Voronoi-cell-based biome generation is feasible (medium effort), but mesh generation for terrain export would require custom code. Better approach: use existing JS libraries (Delaunator.js) or port CGAL/Triangle.
- **Requirements capabilities it could serve**: Biome/settlement placement (Voronoi partitioning), mesh export (basic)

### 3.4 Import/Export Formats

- **Where**: 
  - **3D formats**: `editor/import/3d/` (OBJ via resource_importer_obj.cpp; Collada via collada.cpp/h; FBX via modules/fbx); `modules/gltf/` (glTF 2.0 import/export)
  - **Image formats**: `modules/` (bmp, jpg, png, webp, tga, hdr, dds, ktx, etc.)
  - **SVG**: `modules/svg/` (SVG import for UI/canvas; no SVG export from 3D)
  - **Other**: `core/io/` (file I/O, compression, JSON, text)
- **What it does**: 
  - **3D import**: parses OBJ, Collada (DAE), FBX, glTF; converts to Godot scene/mesh format. 
  - **glTF module**: full glTF 2.0 spec (import/export), including animations, materials, skins.
  - **Image**: decode/encode BMP, JPEG, PNG, WebP, TGA, HDR, etc.
  - **SVG import**: renders SVG as TextureRect or canvas for UI (not vector export).
  - **No STL export**: no built-in STL (stereolithography) mesh export. Would require custom exporter.
  - **Custom save format**: `.tscn` (Godot scene format, text-based), `.tres` (Godot resource format, binary).
- **Quality & realism rating: 4/5** — Strong, industry-standard support for glTF and OBJ. FBX is proprietary but well-integrated. Image codecs are mature. However: (a) Godot scene format is engine-specific and not portable; (b) no STL export (needed for 3D printing/CAD); (c) SVG is import-only for UI, not a viable export target for maps.
- **Extractability: tangled** — Each importer is deeply coupled to Godot's resource/scene system. Extracting glTF logic requires separating from Godot's mesh/animation/material classes. Effort: high for glTF (1000+ LOC), medium for OBJ (200 LOC). Better approach: use standalone glTF libraries (three.js, Babylon.js, glTF-Transform) or libassimp (multi-format, C++, but also heavy).
- **Requirements capabilities it could serve**: Import heightmaps/layers (via PNG/OpenEXR), export to glTF/OBJ (with custom STL addition)

### 3.5 Web Platform and WASM Export

- **Where**: `platform/web/` (~40 files: C++ runtime, Emscripten helpers, JavaScript bridge, export templates)
- **What it does**: Compiles Godot engine to WebAssembly (wasm32) via Emscripten. Provides: HTML5 canvas display, WebGL 2 rendering, JavaScript-C++ bindings (godot_js.h), web input handling (mouse, keyboard, touch, gamepad), audio via Web Audio API, networking (WebSockets, WebRTC), export template packaging. Can generate self-contained .html and accompanying .js/.wasm files for deployment on static web hosts.
- **Quality & realism rating: 3/5** — Mature, production-ready web export. However: (a) large default binary footprint (~20–50 MB WASM uncompressed); (b) designed for interactive games, not data-intensive simulations; (c) memory constraints (browser sandbox, typical 1–2 GB limit); (d) no built-in support for heavy number-crunching (would need separate WebWorkers or Wasm modules).
- **Extractability: not applicable** — This is infrastructure, not a reusable subsystem. Extracting it means using Godot as the runtime, which requires committing to Godot's architecture.
- **Requirements capabilities it could serve**: Desktop/web wrapper (if UI framework is chosen to be Godot)

### 3.6 Physics Engines

- **Where**: `modules/godot_physics_2d/` (~36 files), `modules/godot_physics_3d/` (~40 files), alternative `modules/jolt_physics/` (Jolt Physics integration)
- **What it does**: Rigid body dynamics, collision detection (SAT in 2D, shape-based in 3D), soft body simulation, constraints (joints), contact resolution. Real-time, framerate-locked integration.
- **Quality & realism rating: 1/5 for MapMaker** — World-class for games. Completely unsuitable for geological/climate simulation. No support for: continuum mechanics, fluid dynamics, multiphase flow, plasticity, viscoelasticity. Not relevant to MapMaker's requirements.
- **Extractability: N/A**
- **Requirements capabilities it could serve**: None

### 3.7 Rendering and Graphics

- **Where**: `servers/rendering/` (~hundreds of files); drivers for Vulkan, OpenGL; shaders (GLSL, SPIR-V)
- **What it does**: Deferred/forward rendering pipeline, material system, lighting (PBR), post-processing (bloom, AO, etc.), particle systems, skeletal animation, UI rendering. Multi-threaded command buffer generation.
- **Quality & realism rating**: 4/5 for games, not applicable to MapMaker's scientific visualization
- **Extractability: N/A** — Tightly coupled to scene graph and engine lifecycle
- **Requirements capabilities it could serve**: None (MapMaker's visualization will use canvas/WebGL directly or Three.js, not Godot)

### 3.8 Scene Graph and Editor Infrastructure

- **Where**: `scene/` (~dozens of subdirs); `editor/` (~45 subdirs)
- **What it does**: Node-based scene tree, property inspector, scene serialization, undo/redo, asset pipeline, visual editor UI. Editor is feature-complete 2D/3D level designer.
- **Quality & realism rating**: High for game development, not applicable to MapMaker
- **Extractability: N/A** — Entirely engine-specific
- **Requirements capabilities it could serve**: None directly, though editor could theoretically be extended for custom map editing (not practical)

## 4. Internal data representation

- **Grid/mesh type**: Primarily scene graph (node tree). For geometry: triangular meshes (indexed arrays). For navigation: navigation meshes (static), agent-based (dynamic). For terrain: heightmap texture + mesh deformation in shader, or GridMap (3D grid of voxel/block references). No native support for unstructured FEM grids, icosahedral meshes, or cubed-sphere grids; these would require custom implementation.
- **Resolution**: User-configurable per-use. Heightmaps are typically texture resolution (512–4096px). Navmeshes are baked from geometry at authoring time. No automatic multi-resolution/LOD synthesis built-in (LOD manually created or generated externally).
- **Units**: Godot uses abstract "units" (typically 1 unit = 1 meter in 3D). No inherent geospatial units (lat/lon, UTM, etc.). CRS (coordinate reference system) is not built-in; would need custom code to track.
- **Coordinate conventions**: Right-handed Cartesian (X right, Y up, Z back in 3D). No spherical/geodetic coordinates natively; would require math library.
- **Time**: Discrete frame-based (_process delta time). No built-in calendar/date system. For long-run history sim, would need custom time representation.
- **Serialization**: Godot's `.tscn` (scene, text) and `.tres` (resource, binary) formats. These are engine-specific. For MapMaker, would require custom serialization/deserialization to/from a portable format (JSON, protocol buffers, HDF5, NetCDF).
- **RNG/seed**: Godot's global RandomNumberGenerator with set_seed(). Deterministic if seed is set consistently. Suitable for same-seed preview requirement (seed preview at low fidelity, full sim at high fidelity, same seed → reproducible).

## 5. License

- **SPDX**: MIT (verified from LICENSE.txt)
- **File path**: `/LICENSE.txt` (root)
- **Mixed/vendored licenses**: Godot core is MIT. Third-party vendored libraries in `thirdparty/` retain their original licenses: zlib (Zlib), minizip (zlib), freetype (FTL/GPL2), openssl (Apache 2.0 / SSLeay), mbedtls (Apache 2.0), enet (MIT), ogg/vorbis/theora (BSD), libogg/libvorbis (BSD), libtheora (BSD), fastNoiseLite (MIT), etc. None of these create license conflicts (all permissive or GPL-compatible with MIT).
- **Matches manifest**: Yes. Manifest says "MIT"; LICENSE.txt confirms MIT.
- **Practical notes**: MIT is very permissive; allows commercial use, modification, distribution. No copyleft requirements (unlike GPL). Safe to extract any module for use in MapMaker without license entanglement, though extracted C++ code would require WASM compilation or a rewrite to be web-accessible.

## 6. Capability coverage summary (machine-readable table)

| Capability | Present? | Rating | Extractability | Key files | One-line note |
|---|---|---|---|---|---|
| Tectonics | no | — | — | — | Game engine; no geodynamics or plate tectonics simulation |
| Heightmap generation | partial | 3/5 | loose | modules/noise/ | FastNoiseLite noise (Perlin, Simplex, cellular); no spectral synthesis or terrain calibration |
| Erosion | no | — | — | — | Not a terrain simulation tool |
| Hydrology (rivers/lakes/watersheds) | no | — | — | — | No hydrologic flow or accumulation algorithms |
| Climate – temperature | no | — | — | — | No climate/atmospheric simulation |
| Climate – wind | no | — | — | — | No CFD or wind field simulation |
| Climate – ocean currents | no | — | — | — | No oceanographic model |
| Climate – precipitation | no | — | — | — | No weather/precipitation model |
| Climate – seasons | no | — | — | — | No calendar or orbital mechanics |
| Biomes | no | — | — | — | No biome classification or distribution model |
| Soils | no | — | — | — | No soil physics or classification |
| Resources | no | — | — | — | No mineral/resource placement logic |
| Population & settlement | no | — | — | — | No agent-based population or settlement growth |
| Cities & towns | no | — | — | — | No urban simulation |
| Languages & names | no | — | — | — | No procedural naming or linguistic model |
| Political borders | no | — | — | — | No political simulation or border generation |
| Trade | no | — | — | — | No economic or trade simulation |
| Long-run history/war/economics/politics sim | no | — | — | — | Game logic exists (not long-run history sim) |
| Planet-scale + regional patches (multi-resolution/zoom consistency) | no | — | — | — | No multi-scale consistency engine; scene graph is single-scale |
| Globe view | partial | 2/5 | tangled | servers/rendering/, scene/3d/ | Can render 3D spheres with shaders; no geodetic/geographic globe integration |
| Flat projections | no | — | — | — | Godot projection.h is for perspective/orthogonal camera matrices, not geographic projections (Mercator, etc.) |
| Partial-world inference | no | — | — | — | No surroundings inference logic |
| Import of heightmaps/layers | yes | 4/5 | tangled | modules/gltf/, editor/import/3d/, modules/ | glTF, OBJ, PNG/images via image loaders; requires Godot resource pipeline |
| Fidelity/speed slider with same-seed preview | no | — | — | — | No built-in fidelity control; RNG is seeded (reproducible), but no preview mode |
| Export (PNG/SVG/STL/other) | partial | 3/5 | tangled | modules/svg/, editor/export/, core/io/ | PNG/glTF/OBJ export; no STL; SVG import-only, no vector export |
| Full-state save/resume format | partial | 2/5 | tangled | core/io/, scene/ | .tscn/.tres formats; engine-specific, not portable for simulation state |
| Earth-data calibration (elevation/climate/Köppen) | no | — | — | — | No real-world calibration; generic noise only |
| Planet-parameter derivation | no | — | — | — | No planet formation or geophysics |

## 7. Verdict

- **Not recommended for core simulation**: Godot is a game engine, not a scientific simulator. It lacks every subsystem MapMaker needs for climate, hydrology, tectonics, erosion, biomes, soils, resources, population dynamics, and civilization simulation. Extracting individual modules (noise, pathfinding, mesh math) is possible but higher-effort than using standalone, browser-native libraries already available.

- **Desktop wrapper potential (low priority)**: If a native desktop GUI becomes necessary (beyond browser + Electron), Godot could wrap the core web-based simulator as a fallback. However: (a) adds ~20–50 MB to bundle size; (b) requires learning GDScript or embedding C++ logic; (c) overkill for data visualization. Better alternatives: Electron (lightweight web wrapper) or Qt (native desktop framework if scientific UI is the goal).

- **Extractable subsystems** (low-to-medium value):
  - **Noise** (FastNoiseLite): Extract via npm/JS wrapper; no need to pull from Godot.
  - **glTF/OBJ import/export**: Use Three.js, Babylon.js, or glTF-Transform; Godot's implementation is tangled with scene graph.
  - **Mesh Delaunay**: Use Delaunator.js or CGAL.js; Godot's Delaunay is bare-bones.
  - **Pathfinding**: Use existing libraries (ThetaStar, pgRouting); Godot navigation is game-focused.

- **Biggest risks**:
  - **Language barrier**: C++ core; WASM compilation adds complexity and toolchain dependency.
  - **Scope mismatch**: Game engine vs. scientific simulator; architectural assumptions are incompatible.
  - **Licensing**: MIT is clean, but no blocking risk.

- **Open questions / Unverified**:
  - (Unverified) Whether Godot's WASM export supports shared memory (SharedArrayBuffer) for multi-threaded simulation. Likely not by default (for security), so multi-threaded processing would be restricted.
  - (Unverified) Performance of Godot WASM vs. native browser JS for number-crunching (heightmap generation, flow routing, climate calc). Unlikely to match native JS for these workloads.
  - (Unverified) Whether extracting FastNoiseLite from Godot's wrapper is faster than using an existing JS library.

**Recommendation**: Do not extract code from Godot for MapMaker's core simulation. If a desktop native wrapper becomes a hard requirement after the web version is complete, re-evaluate then. For now, prioritize browser-first development using existing JS/TS libraries for noise, projections, mesh I/O, and UI frameworks (React, Svelte, or custom canvas).
