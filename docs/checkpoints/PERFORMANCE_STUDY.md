# Performance study (branch `perf-study`, 2026-10-21)

User request, outside the authorization limit. Documentation and measurement only: no change to the engine, the generator, any hash or the app. The new files are scripts (`scripts/perf-*.mjs`, `scripts/perf-noise-bench/`) and the measured data (`docs/perf-study/`).

## Answers in short

1. **The Electron wrapper does not make generation faster.** Generating 2.56M cells took 28.0 s in Electron, 29.3 s in Chromium and 38.0 s in Firefox (the same engine worker), and 31.5 s in plain Node. Generation uses **one core**: every stage ran at 1.0 to 1.3 cores, and with `node --single-threaded` it is 1.0 and only 15% slower. The extra 0.04 to 0.3 cores are V8's compile and GC helper threads. 17 of this machine's 18 cores are idle during generation.
2. **84% of the time is one stage** (`detail.pass`, elevation at full resolution: tectonics, noise, erosion). Five hot spots make up 57% of the whole run at 2.56M (section 3). All five are plain f64 arithmetic on typed arrays, which is why they can be made faster without changing a bit (section 4). A native `noise3D` ran 1.62 times faster than JS with **0 differing bits in 10 million calls**.
3. **Recommended speed-up path:** worker-parallel per-cell kernels first (bit-identical, no packaging cost, about 3 to 4 s of 31.5 s from the noise loops alone), then WebAssembly for the sequential kernels (erosion, distance fields, Delaunay) after profiling the full scope in Phase 14. A native helper process is not worth its signing and packaging cost unless WASM plus workers falls short. GPU compute cannot be authoritative (f32 only), so preview use only.
4. **Panning lag spikes, measured in all three environments at 500k, 1M and 2.56M:** the only main-thread spike is the **label re-plan** (19 to 30 ms, the same at every size, caused by `Globe.lonLatAt` called for every mask cell), and it only happens when the styled layer and its labels are on. GC pauses are at most 5.3 ms. The globe is **GPU-bound at 7 to 8 ms per frame at 1M and above against an 8.3 ms budget at 120 Hz** (p95 up to 11 ms), which is the most likely reason the lag appeared with every layer. A hidden window cannot show presentation stalls, so this last point is measured, not confirmed on screen.
5. **Order of work** is in section 8: five items before Phase 6, WASM and level of detail in Phase 14, and everything tied to the tectonic kernels after the orogen-evolution and GPlates reconciliation (P5).

## 1. Method and limits

- **Machine:** Apple M5 Pro, 18 cores, 64 GB, macOS (Darwin 27), 120 Hz, hardware GPU. One machine, one OS. Windows was not measured.
- **Generation (Node):** `scripts/perf-pipeline.mjs <N>`: the structured pipeline, seed 12345, one run per size, one heavy job at a time. A sampler thread reads RSS every 25 ms (peak per stage) and `process.cpuUsage()` gives CPU time (cores = CPU time / wall time). Hot functions: `node --cpu-prof --cpu-prof-interval 500` and `scripts/perf-hot.mjs`.
- **Panning:** `scripts/perf-pan.mjs <chromium|firefox|electron> <N>`: a stop-and-go drag (6 segments of 91 pointer moves, one move per 7 ms, rests of 120 to 600 ms between them, because the label plan fires 140 ms after a rest) on the fully zoomed-out globe, device pixel ratio 2, 120 Hz. Recorded: a `requestAnimationFrame` loop (frame gaps), `PerformanceObserver` for `longtask` and `long-animation-frame` (Chromium only; Firefox has neither), timed wrappers of timers, `rAF` callbacks, worker messages, GL uploads and draws, and the SVG write; for Chromium and Electron a Chromium trace (`--trace`: GC, layout, tasks) and a CPU profile (`--prof`), aligned to `performance.now()` by a marker call.
- **Rendering:** `scripts/perf-render.mjs`: a `readPixels` after each draw waits for the GPU, so the figure is draw plus GPU time per frame; variants patch the canvas settings or the draw before the app starts.
- **No window was opened in front of your work.** Electron ran in the hidden test mode (`MAPMAKER_TEST=1`), the browsers headless. The watch mode was not used: its window is 560 by 360 px, too small to say anything about the GPU.
- **Limits, stated plainly.**
  - Scripted input, not a trackpad.
  - A hidden window **does not present frames**, so presentation stalls (compositor, vsync, other apps) are not in these figures.
  - Playwright's default headless Chromium on macOS is a **software renderer (SwiftShader)**; `channel: 'chromium'` is the hardware build and was used here. The earlier benchmark and e2e runs on macOS used the default one, so their web-Chromium frame figures are software-GL figures. Firefox hides the GPU name ("Apple M1, or similar") but ran at hardware speed.
  - Firefox has no trace, no GC log, no long-task API: its spikes are attributed with the wrappers only.
  - The built app used for the pan, render and profile runs was built with `--minify false` (function names in the profile); minification does not change run time.
  - Estimates of WebAssembly, native and GPU speed-ups are **estimates** except where marked measured. This machine has no `wasm32` Rust target, so no WASM kernel was built; the native C kernel is the measured bound.
- Raw data in `docs/perf-study/`: `pipeline-*.json`, `hot-*.json`, `pan-*.json`, `render-*.json`, `trace-*.json` (pan runs with a trace), `prof-*.json`. The raw Chromium traces and profiles (400 MB) are not committed; rerun with `--trace` or `--prof`.

## 2. Generation: time, memory and cores per stage

One run each, structured pipeline, Node.

| stage | 200k s | 1M s | 2.56M s | share at 2.56M | peak RSS at 2.56M | cores (2.56M) |
|---|---|---|---|---|---|---|
| mesh (Delaunay, topology) | 0.16 | 0.94 | 2.96 | 9% | 715 MB | 1.03 |
| ref.pass (20k reference world) | 0.66 | 0.70 | 0.68 | 2% | 764 MB | 1.75 (warm-up) |
| detail: elevation (tectonics, elevation, erosion at N) | 1.98 | 9.71 | **26.51** | **84%** | **1965 MB** | 1.04 |
| detail: climate | 0.07 | 0.32 | 0.80 | 3% | 1375 MB | 1.11 |
| detail: drainage | 0.02 | 0.15 | 0.46 | 1% | 1576 MB | 1.07 |
| **total** | **2.9** | **11.9** | **31.5** | | **1965 MB** | |

Peak RSS of the whole run: 380 MB, 971 MB and 1965 MB. The 1.75 cores in `ref.pass` are JIT compilation at start-up on a 20k mesh (0.7 s of wall time, 1.2 s of CPU); with `--single-threaded` the same stage ran at exactly 1.0 and the whole 200k run took 3.3 s instead of 2.9 s. The stages do not scale equally: the reference pass is constant, everything else is about linear in N (31.5 s / 11.9 s = 2.6 for 2.56 times the cells).

## 3. Hot functions (CPU profile, 2.56M, 30.1 s sampled)

Self time (the function's own code), then the five hot spots as inclusive time.

| self time | ms | % |
|---|---|---|
| `noise3D` (simplex noise, `port/simplex-noise.ts`) | 4627 | 15.4 |
| `erodeComposite` (`port/terrain-post.ts`) | 2775 | 9.2 |
| `projectCoarsePlates` (`port/coarse-plates.ts`) | 2175 | 7.2 |
| `assignDistanceField` | 1563 | 5.2 |
| `warpTerrain` | 1319 | 4.4 |
| `priorityFloodCarve` | 1241 | 4.1 |
| `propagateStress` | 908 | 3.0 |
| `correct` (multilevel transfer, `core/multilevel/operators.ts`) | 848 | 2.8 |
| Delaunator `_legalize` + `update` | 761 + 474 | 4.1 |
| `MultiLevel` | 751 | 2.5 |

At 200k the order is the same (`noise3D` 13.8%, `projectCoarsePlates` 5.8%, `MultiLevel` 5.3%, `erodeComposite` 5.0%), so the profile of a small world predicts the large one. GC is 0.9% of the run.

**The five hot spots** (inclusive seconds at 2.56M; they overlap a little, so the shares are approximate):

| # | hot spot | where it runs | s | % of run | shape of the work |
|---|---|---|---|---|---|
| H1 | simplex-noise loops: `warpTerrain` 1.96, `applyCoastalDetail` 1.21, `applyTectonicBandNoise` 1.09, `applyDetailNoise` 0.80, `applyUniformLandNoise` 0.37 | detail elevation | 5.4 | 17% | each cell independent: reads its inputs, writes its own cell |
| H2 | `erodeComposite` (stream power, thermal, `priorityFloodCarve` 1.47, a full sort of the land cells every iteration) | detail elevation | 4.7 | 15% | ordered sweeps (flow accumulation in elevation order, implicit solve in the reverse order); receivers and the thermal pass are per cell |
| H3 | `projectCoarsePlates` (three noise samples per octave per cell, then a greedy walk on the coarse mesh) | detail elevation | 2.7 | 9% | per cell; the walk is warm-started from the previous cell |
| H4 | `computeSpatialFields` / `assignDistanceField` (five random-order breadth-first fields) | detail elevation | 2.5 | 8% | each field is sequential (a seeded RNG picks the next cell); the five fields are independent of each other |
| H5 | mesh build: Delaunator 1.46, `SphereMesh` 0.54, `buildTopology` 0.50 | mesh stage | 2.5 | 8% | sequential incremental Delaunay |

Together 17.8 s, 57% of the run. Next in line: `MultiLevel`/`correct` (1.6 s), `propagateStress` (0.9 s), `applyPlatePhysics` (0.6 s), climate (0.8 s). Where `noise3D` is called from (ms): `applyCoastalDetail` 950, `applyTectonicBandNoise` 749, `warpTerrain` 644, `projectCoarsePlates` 505, `applyDetailNoise` 504, `applyUniformLandNoise` 294.

**Measured noise kernel** (`scripts/perf-noise-bench/`, 2M points, 5 octaves, 10M `noise3D` calls): JS 27.3 ns per call, native C (`clang -O2 -ffp-contract=off`) 16.9 ns per call, **1.62 times faster, 0 of 2,000,000 outputs differ in any bit**.

## 4. Four ways to go faster, per hot spot

Times are for 2.56M on this machine and are estimates unless marked measured (about plus or minus 30%). "Workers" means 8 worker threads working on shared memory (a typical user machine; this machine has 18 cores and would do better). The whole run is 31.5 s.

| hot spot (s now) | (a) parallel workers | (b) WebAssembly | (c) native helper process | (d) GPU compute |
|---|---|---|---|---|
| **H1 noise loops** (5.4) | about 6x: **0.9 s**. Bit-identical. | 1.5 to 1.9x: 3.3 s; in workers **0.6 s** | 1.62x measured: 3.3 s; with its own threads 0.45 s | 50x or more, but f32: not the same terrain |
| **H2 erosion** (4.7) | 1.2x (only receivers and thermal are per cell): 3.9 s | 1.5 to 2.5x (typed-array radix sort instead of `Array.sort`, tighter memory): **2.4 s** | 2 to 3x: 1.9 s | needs different algorithms (parallel prefix); f32; not the same bits |
| **H3 coarse plates** (2.7) | about 5x: **0.55 s** (the warm-started walk reaches the true nearest cell on a Delaunay mesh; a tie could differ, the golden hashes would show it) | 1.5x: 1.8 s | 1.6 to 2x: 1.5 s | f32; not the same bits |
| **H4 distance fields** (2.5) | the five fields in parallel: about 2.5x: **1.0 s**. One field cannot be split without changing the RNG order. | 2x on typed-array queues: 1.2 s; with workers 0.5 s | 2 to 3x: 1.0 s | no (order-dependent) |
| **H5 mesh build** (2.5) | **not bit-identical** (splitting the point set changes the triangle numbering), unless a canonical triangle order is imposed and the hashes are refreshed | a WASM port of the same algorithm 1.5 to 2x: **1.4 s** | 2 to 3x: 1.0 s | no |

If the five were done as marked in bold, they would go from 17.8 s to about 5 s and the run from 31.5 s to about 19 s (-40%). The other 13.7 s need the same treatment (the transfer operators, stress propagation, plate physics, climate) to reach 8 to 10 s; Amdahl's law is the limit, not the core count. Memory: each worker adds its own JS heap and JIT (about 60 to 100 MB, estimate), so 8 workers add about 0.6 GB on top of the 2 GB peak.

### Determinism consequence and how the existing tests prove it

| option | same bits as the current golden hashes? | proof with the tests that exist |
|---|---|---|
| (a) workers | **Yes** when each cell's result depends on nothing another worker writes and no sum is re-ordered. The same JS and the same fdlibm run, only in other threads. Not for H5 (changes the triangle numbering). | World-hash goldens and probe keys (`tools/determinism/golden.json`, `npm run probe`, the e2e determinism spec); `port-parity.test.ts`; the nine-world bit comparison (200k, 1M, 2.56M by seeds 1, 777, 12345; OPERATING_GUIDE §5). New test per kernel: parallel result equals serial result for 1, 2, 5, 8 workers (chunk edges must not matter). |
| (b) WebAssembly | **Yes, expected.** WASM f64 add, multiply, divide, square root and floor are exact IEEE-754 and deterministic; the trap is `relaxed-simd` (fused multiply-add differs by CPU): do not use it. `sin`, `cos`, `pow`, `atan2` must be the fdlibm port compiled in (its C reference is in `tools/fdlibm-vectors/`), never the host libm. | The same tests, plus a bitwise differential test of each kernel against its TypeScript port on random and edge inputs (zero, negative zero, NaN, denormals). NaN bit patterns can differ: compare through the canonical NaN the hash already uses, and check. |
| (c) native helper | **Yes with explicit flags:** `-ffp-contract=off`, no `-ffast-math` (clang/gcc); MSVC `/fp:strict`. Compilers contract `a*b+c` into a fused instruction by default on arm64, which changes bits. **Measured: 0 differing bits in 10M calls** with those flags on macOS arm64. | The same tests, run on both macOS and Windows builds (the CI already has both). |
| (d) GPU compute | **No.** WGSL and GLSL have only f32; the terrain would differ and every golden hash with it. ARCHITECTURE §6.3 already says an authoritative GPU result needs integer or fixed-point arithmetic and a cross-GPU bit-equality test. | Preview use only: a tolerance test (the Q7 metrics, hypsometry), never a hash. |

### Packaging cost on macOS and Windows

| option | macOS | Windows | also in a web browser? |
|---|---|---|---|
| (a) workers | None. Electron already serves the page with COOP and COEP (decision E1), so `SharedArrayBuffer` is available. Layers must be allocated in shared memory. | None | Only if the page is cross-origin isolated (out of scope, W7) |
| (b) WebAssembly | One `.wasm` file per kernel set (about 50 to 300 KB) in the bundle. No signing or notarization change. Needs a build toolchain in CI (Rust `wasm32` target or clang with `wasm-ld`; not installed on this machine) and a `PROVENANCE.md` entry. | The same file, nothing else | **Yes**, Firefox and Chromium |
| (c) native helper | A signed helper in the app bundle (hardened runtime, notarized) for arm64, and x64 if Intel Macs are supported. The app is unsigned today (RELEASING.md), and an unsigned helper may be blocked or prompt. Needs `asarUnpack`/`extraResources` (the config has `asar: true`). | An x64 `.exe` (and arm64) beside the app; SmartScreen and Defender can flag a new unsigned executable. Needs `/fp:strict` in the build. | No |
| (d) GPU | WebGPU (Metal) in Electron's Chromium; shader code to write and test. | WebGPU (D3D12); **the Windows CI runner has no GPU**, so it cannot be tested there. | Firefox support unconfirmed |

**Recommendation.** (a) first for H1, H3 and the five distance fields, because it is free to package and bit-identical. (b) for H2, H5 and the rest of the sequential work, decided from a fresh profile of the full scope in Phase 14 (ARCHITECTURE §6.3: "WASM after profiling"). (c) only if (a) plus (b) miss the target, because the signing and certificates are yours to pay for and it only helps the desktop. (d) only for previews, never for stored state.

## 5. Rendering: where the frame time goes

GPU plus draw time per frame, `readPixels` sync, Electron hidden, 2048 by 1216 buffer pixels (device pixel ratio 2), median / 95th percentile in ms. The CPU side of the globe frame is 0.14 ms per frame (profile of 540 draws), so the globe is limited by the GPU, not the page.

| view | 1M | 2.56M |
|---|---|---|
| globe, default distance | 9.3 / 10.8 | 9.5 / 10.4 |
| globe, fully zoomed out | 7.6 / 8.0 | 7.9 / 11.2 |
| flat map, GPU shader only | 6.2 / 6.9 | 12.5 / 13.2 |
| flat map, graticule and coastlines (frame to frame) | 14.4 | 28.3 |
| flat map, styled layer with all overlays and labels (frame to frame) | 32.8 | 57.3 (17 frames per second) |

Chromium gave the same figures within noise (globe far 7.2 and 8.3 ms, flat 5.7 and 12.3 ms); Firefox 6 and 7 ms for the globe, and 5 to 6 ms for the flat shader (1 ms timer resolution).

**Globe: what the 8 ms are.**
- The fixed part (clear, MSAA resolve, sync) is 1.5 ms (no triangles drawn). Drawing all 5.1M triangles brings it to 7.9 ms, a quarter of them to 4.2 ms.
- The cost is **geometry, not pixels**: 1M and 2.56M cost about the same (7.6 and 7.9 ms), and 4 times the pixels (1024 by 560 against 2048 by 1120) costs 8.3 ms against 5.7 ms.
- The frame budget at 120 Hz is 8.33 ms, so the globe is at the limit at every size from 1M up, and its 95th percentile (8 to 11 ms) misses a vsync now and then. A scene with this little slack has no room for the compositor or another app on the GPU.
- Re-measured in one launch, `Back` face culling (what `FrontSide` would give; `DoubleSide` draws both) took 8.4 to 7.3 ms (-13%) and sorting the triangles by their lowest vertex number (vertex-cache locality) 8.1 to 6.8 ms (-16%); both together 7.9 ms (not additive). The rendered image is **identical** (`pixelSum` 745478996 in all three).

| option | measured effect (Electron 2.56M, zoomed out) | full quality? |
|---|---|---|
| face culling (`FrontSide`) | -13% | **yes** (identical pixels) |
| triangle order for vertex-cache locality | -16% | **yes** (identical pixels) |
| level of detail by camera distance: far away, fewer and larger triangles with area-averaged colours, back hemisphere chunks culled | not built; the cost scales with triangles drawn, so large | **only if** measured indistinguishable (pixel difference against the full render); at 18 triangles per visible pixel this is likely, but it must be measured before adoption |
| `preserveDrawingBuffer: false` | no change beyond noise (7.8 against 7.9 ms) | yes, but export and `litFraction` read the buffer |
| MSAA off | about -5% (noise-sized) | **no**: the limb and coast edges alias |
| pixel ratio 1 instead of 2 | -31% (5.7 against 8.3 ms, Chromium) | **no**: halves the resolution |
| draw fewer frames | already done: one draw per pointer move, none when idle | yes |

**Flat map: where the time goes** (Electron, 2.56M, CPU profile of 200 frames).
- The shader costs 12.5 ms at 2.56M but 6.2 ms at 1M: it scales with the cell count (the data textures and the cube-map walk miss the cache more).
- Overlays rebuild the vector layers on every frame on the main thread: d3-geo `path` over the coastline (and rivers) is 2.2 s of 3.4 s for 200 frames (17 ms per frame), the `innerHTML` write of a 1.26M-character SVG 4.2 to 4.9 ms, GC 1.5 ms per frame. With the styled layer: path generation 19 ms, SVG write 8 to 10 ms, GC 10 ms per frame, 2.9M characters of SVG. The string is built by `append2` (path string concatenation) and parsed again by the browser.
- Switching the view from globe to flat at 2.56M stalls the page for **1.8 s once** (the world's data textures are sent and uploaded in one message).

| option | effect | full quality? |
|---|---|---|
| draw overlays on a 2D canvas (`Path2D`) instead of building and parsing an SVG string | removes the 4 to 10 ms write and the GC; estimate half the CPU frame time | yes (same geometry; anti-aliasing differs slightly between SVG and canvas: check) |
| keep the projected geometry while only the pan changes (a translation), re-project on rotation, zoom or projection change | pan frames become a matrix change; estimate 80% less CPU for panning | yes |
| simplify lines to a fraction of a pixel (Douglas-Peucker at 0.1 px) | fewer points; estimate 30 to 50% | yes at 0.1 px (measure the pixel difference first) |
| build paths in a worker (`OffscreenCanvas`) | takes the 17 to 38 ms off the main thread | yes |
| upload the flat map's textures in slices | removes the 1.8 s stall | yes |
| drop overlays and labels while dragging, redraw after | removes all CPU cost while moving | **trades visible detail during the drag** |
| draw at half resolution while dragging | halves the shader cost | **trades visible detail during the drag** |

## 6. Panning lag spikes on the zoomed-out globe

500k, 1M and 2.56M cells, Chromium (hardware GL), Firefox and Electron (hidden), each with the plain elevation layer, the styled layer, labels, overlays and the brush ring on and off, plus an idle run. One 540-move stop-and-go drag per configuration; the table lists the longest frame gap in ms and, in brackets, how many gaps exceeded 25 ms (3 frames at 120 Hz). The frame interval is 8.3 ms; more than 16.7 ms is a missed frame at 60 Hz.

| browser | cells | idle | elevation | elev + overlays | styled | styled + labels | styled + labels + overlays | ring, elevation | ring, styled + labels |
|---|---|---|---|---|---|---|---|---|---|
| Chromium | 500k | 9 (0) | 9 (0) | 9 (0) | 9 (0) | 18 (0) | 26 (1) | 75 (1) | 9 (0) |
| Chromium | 1M | 9 (0) | 9 (0) | 9 (0) | 9 (0) | 25 (2) | 25 (2) | 9 (0) | 9 (0) |
| Chromium | 2.56M | 9 (0) | 9 (0) | 9 (0) | 11 (0) | 17 (0) | 17 (0) | 9 (0) | 9 (0) |
| Firefox | 500k | 9 (0) | 17 (0) | 17 (0) | 11 (0) | 33 (4) | 42 (3) | 17 (0) | 17 (0) |
| Firefox | 1M | 9 (0) | 18 (0) | 17 (0) | 17 (0) | 33 (3) | 26 (3) | 26 (1) | 25 (0) |
| Firefox | 2.56M | 9 (0) | 33 (2) | 42 (2) | 17 (0) | 32 (3) | 33 (3) | 25 (1) | 24 (0) |
| Electron | 500k | 9 (0) | 9 (0) | 9 (0) | 9 (0) | 25 (4) | 25 (3) | 59 (1) | 9 (0) |
| Electron | 1M | 9 (0) | 9 (0) | 11 (0) | 9 (0) | 26 (1) | 24 (0) | 9 (0) | 9 (0) |
| Electron | 2.56M | 9 (0) | 9 (0) | 9 (0) | 9 (0) | 25 (1) | 25 (1) | 9 (0) | 9 (0) |

The average is flat (median gap 8.3 ms in every run; 95th percentile 8.9 to 9.3 ms), as you saw. What happened in the spikes, and its cost:

| what runs | cost | when | evidence |
|---|---|---|---|
| **Label re-plan** (`GlobeLabels.refresh`, the 140 ms timer after the camera rests): `planLabels` → `buildMask` → **`Globe.lonLatAt` called for every cell of the mask grid**, 17 to 20 ms of the 24 | **19 to 30 ms** (median 25), main thread, the same at 500k, 1M and 2.56M; 1 to 3 missed 120 Hz frames when the drag resumes within it | every rest, only with the styled layer and labels on; in all three environments | CPU profile: `refresh` 23.9 to 30.9 ms, `buildMask` 20.7 to 24.0, `lonLatAt` 18.7 to 22.0 of which self 16.7 to 20.5; 100% of the 25 ms gaps in the Chromium and Electron traces are one anonymous call chain of this size |
| Rest of the re-plan: `chamfer` 1 to 2 ms, `updateMatrixWorld` (called per cell) 2 ms, SVG write (868 chars) 0.5 to 2.4 ms, GC 0.7 to 1.3 ms | 4 to 6 ms | same | profile, wrappers |
| **Garbage collection** | at most **5.3 ms** per pause (major GC, once per run); minor GCs 0.5 to 1.3 ms; 30 to 53 ms in total per 12 s run | any time | Chromium and Electron traces at 500k, 1M, 2.56M; none overlaps a frame gap over 25 ms |
| Layout and style | under 1 ms; not among the top costs of any gap | | trace (exclusive time per event name) |
| Messages from the engine worker | none during panning (0 messages in all 63 drag runs). On a **layer switch** they cost 32 to 111 ms each on the main thread at 2.56M (deserializing the layer or the label data), plus the colour fill: **30 to 114 ms per switch, one 108 ms frame** | layer or style change, not panning | `switch` configuration, Chromium trace 2.56M |
| Colour buffer (`bufferSubData`) | 1.1 ms per upload | layer switch | wrapper |
| Overlays on the globe | no effect: graticule, coastlines, Tissot and distortion belong to the flat map only; "overlays" rows equal their no-overlay rows | | |
| Brush ring | per-frame callback under 1 ms (`toolById` 22 ms in total over 546 moves, 40 µs per move). **One-time 59 to 75 ms** frame at the first ring draw at 500k (Chromium and Electron, 2 of 9 runs; shader compile). Not seen at 1M or 2.56M. Pan itself is off while a tool is active (the drag paints), so the ring is only drawn while hovering. | first use | wrapper, trace |
| **GPU** | 7.2 to 8.3 ms median, 8 to 11.3 ms p95 per frame at 1M and above, against 8.33 ms | every frame, any layer | `perf-render`; invisible to frame gaps because a hidden window does not present |
| **Unexplained, Firefox only** | 33 to 42 ms gaps with the elevation layer at 2.56M (2 of 6 drags) and 25 ms with the ring; no instrumented work overlaps them | rare | Firefox cannot be traced; likely GC or cycle collection or the GPU process. Not resolved. |

So the user-visible spike is the label re-plan, and "the layer did not matter" is consistent with a second, GPU-side cause that does not depend on the layer: the zoomed-out globe takes 7 to 8 ms of GPU per frame and the budget is 8.33 ms. The label re-plan only appears with the styled layer and labels. I could not reproduce a lag beyond 26 ms on the main thread; a long frame on screen that is not a main-thread gap would be GPU or compositor time, which this setup cannot see.

### Fixes that keep full quality

1. **Label re-plan, 25 ms to a few ms.** Make `Globe.lonLatAt` cheap for batches: read the camera matrix once per plan (no `updateMatrixWorld` and no array allocation per call), keep `Math.hypot` unless the plan is re-checked for the last bit. Then **time-slice** `buildMask` by rows and yield between slices (`scheduler.yield` or a `MessageChannel`), checking the generation counter between slices so a resumed drag abandons the plan. The plan stays a pure function of data, camera and style, so exports and the page still agree (decision L5). Estimate: 24 ms becomes 6 to 8 ms, in slices of at most 4 ms.
   Trades visible detail (not recommended): a coarser mask grid (labels hop), a longer rest delay than 140 ms (labels return later).
2. **Globe GPU time, 8 ms to about 6.5 ms now, much lower with level of detail.** `FrontSide` culling and index ordering (identical pixels, measured -13% and -16%) are one-line and one-pass changes. Level of detail with horizon culling in Phase 14 (CesiumJS lineage, note 38). Trades visible detail: MSAA off, pixel ratio 1.
3. **Layer switch, 30 to 114 ms.** Fill the colour buffer in the engine worker or from a palette texture in the vertex shader, and receive layers as transferred buffers rather than cloned ones.
4. **Flat map:** the table in section 5.
5. **First brush ring:** compile the ring's shader when the tool is chosen, not at the first hover.

## 7. What each finding says about the Electron wrapper

The wrapper is the same engine: generation, frame cost and the spikes are the same in Electron, Chromium and (within 35%) Firefox. It does give what a browser cannot: shared memory for workers (COOP/COEP in the scheme), a native helper process if one is ever wanted, and no per-tab memory limit. Speed has to come from the work above.

## 8. Recommended order of work

**Pull forward, before Phase 6** (small, quality-neutral, independent of the tectonic choice; they touch the app and carto, not the generator):
1. Label re-plan fix (section 6, item 1). Removes the only measured main-thread spike.
2. Globe `FrontSide` culling and triangle ordering, with a pixel-identity test (same `pixelSum`).
3. Flat-map overlay path: cache projected geometry across pans, draw on a canvas or in a worker, upload textures in slices.
4. Layer-switch cost (colours in the worker, transferred buffers) and the ring's shader warm-up.
5. (Done, section 11.) The shared-memory kernel API: `SharedArrayBuffer`-backed layers, the existing `WorkerPool` used by the pipeline, and the first kernel (the H1 noise loops) behind a parallel equals serial test. This is the one item that changes where code lives, so doing it before Phase 6 adds per-cell physics avoids rewriting that code twice. Its bit-identity is checked by the existing hashes.

**Phase 14** (needs the full scope and the CesiumJS reconciliation that Phase 14 already lists as its prerequisite):
- Globe level of detail with horizon culling, measured for pixel indistinguishability.
- The WASM decision for H2, H5 and the remaining sequential kernels, from a fresh profile of everything built by then (ARCHITECTURE §6.3, §6.6); the fdlibm-in-WASM differential tests.
- The native-helper decision (only if workers plus WASM miss the target) and its signing cost; GPU compute for previews only.
- Re-measure with real trackpad input and a visible window on your screen, and on Windows.

**Wait for the orogen-evolution and GPlates reconciliation (P5)** and do not optimise yet:
- Anything specific to the current tectonic and elevation code: H2 (`erodeComposite`), H3 (`projectCoarsePlates`), H4 (distance fields), `propagateStress`, `applyPlatePhysics`. The reconciliation may replace or extend these (Orogen Evolution adds plate motion over time, GPlates a different plate model); speeding up code that is about to be replaced is wasted work. The parallel-kernel API from item 5 does not depend on them, which is why it can come first.
- Not affected by P5, can go with item 5 or in Phase 14: H1's noise primitive (shared by every noise-based layer), H5 (the mesh build is generic), the transfer operators.

Nothing here changes a phase's scope or the architecture text; these are proposals for your approval (OPERATING_GUIDE §4).

## 9. Reproduce

```
scripts/node24.sh npm run build -w @mapmaker/web -- --minify false && scripts/node24.sh npm run build -w @mapmaker/desktop
scripts/node24.sh npm run preview -w @mapmaker/web -- --host 127.0.0.1 --port 4173 --strictPort     # for the web browsers
NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx scripts/perf-pipeline.mjs 2560000 out.json
scripts/node24.sh node --cpu-prof --cpu-prof-interval 500 --cpu-prof-dir=prof --import tsx scripts/perf-pipeline.mjs 2560000   # then node scripts/perf-hot.mjs prof out.json
scripts/perf-pan-all.sh                                                      # pass A: 3 browsers x 3 sizes x 8 configurations
scripts/node24.sh node scripts/perf-pan.mjs chromium 2560000 out.json styled+labels --trace    # or --prof; electron, firefox (no trace)
node scripts/perf-analyze.mjs docs/perf-study/pan-*.json --spikes            # frame gaps and the work overlapping each
node scripts/perf-trace.mjs <pan.json> <config>     # main-thread time per spike and GC, from the trace
node scripts/perf-prof.mjs <pan.json> <config>      # functions per spike, from the profile
scripts/node24.sh node scripts/perf-render.mjs electron 2560000 out.json base,cull,sortTris
scripts/node24.sh npx tsx scripts/perf-noise-bench/bench.mjs 2000000 5
```

## 10. After the first fixes

Items 1 to 4 of section 8 ("pull forward"), made on branch `perf-fixes` with the study's own scripts, measured before and after on the same machine (Apple M5 Pro, hardware GL, hidden windows) in the same way: `scripts/perf-fixes-all.sh before|after` (`perf-pan.mjs`, `perf-render.mjs`; new configurations `flat-switch`, `flat-pan`, `flat-pan-styled`), both builds unminified as in section 9. Raw data: `docs/perf-study/before/` and `after/`; tables: `node scripts/perf-fixes-summary.mjs`. No engine, generator, hash or golden changed (nothing re-recorded).

**What was changed, and what it costs in quality**
1. *Label re-plan.* `Globe.lonLatSampler` and `projectSampler` read the camera once and allocate nothing per call (bit-identical to the former per-call code; tested, the projector on a 3000-point grid in both browsers); `buildMask` is sliced by rows (2 ms budget) with a yield between slices, the distance transforms, the placement and the SVG write each a slice of their own, and a new camera move cancels the plan. Sliced and unsliced masks and plans are byte-identical (unit tests). Quality: unchanged.
2. *Globe culling and triangle order.* Done as `FrontSide` plus lowest-vertex order, but **only where it draws the same picture**. Measured: the Metal GPU of Chromium and Electron draws it identically (0 differing pixels on real layers at four viewpoints; 1 limb pixel on random colours at the farthest view); software GL (SwiftShader) differs at 350 to 1000 limb pixels (the former path draws far-side triangles at the depth of the front ones), and Firefox differs at 45 000 to 170 000 pixels of 2.3 M with random colours (tie-breaking along shared edges; 16 500 pixels, mean 0.23 of 255, on the real layer). So the faster path is verified at mesh time on the machine itself (random colours, five viewpoints, identical inside 97% of the disc radius and at most 3e-5 of the disc area on the limb) and otherwise the former path stays: Firefox and software GL keep the former path and nothing changes there. The claim in section 5 that `pixelSum` was identical in every variant held for one view only.
3. *Flat map.* The map-bound overlay paths are cached while only the pan changes and moved with an SVG transform (exact: a pan shifts every d3 coordinate by the pan; the unbounded conics clip to the image and still re-project; `pan-cache.test.ts` checks every projection to 0.0011 px). Rasterized, the transform against the baked pan differs only at edge samples (overlay-pan.spec, noise floor recorded in the test annotations). The mesh textures are uploaded in 1 MB row bands with a yield every 4 ms; the GPU-against-exact specs run through it. Exports keep the exact SVG path (`overlaySvg` is unchanged). **Canvas and worker drawing were not adopted**: a canvas drawing of the same path strings is pixel-identical to the SVG (`scripts/perf-overlay-aa.mjs`: 0 differing pixels in Chromium and Firefox), so it stays available, but with the cache the Chromium and Electron pan frames are already at the frame interval (p95 9 ms), so there is nothing measurable to gain there. Correction to section 5: the first switch to the flat map does **not** stall the page for 1.8 s. The page was blocked 87 to 99 ms (message handler: copies and texture objects) plus about 30 ms of GL upload; the 2.6 to 3 s at 2.56M is the engine worker computing the lookup (`projection.gpuLookup`), during which the page stays responsive. That worker time is unchanged and is the remaining cost of the first switch.
4. *Layer switch.* The worker makes the globe colours and the flat layer (`globe.layer`, `carto.styledLayer`, same code as before, byte-identical colours tested for all 15 layers and three themes) and transfers them; the page adopts the colour array. `carto.data` now transfers instead of cloning. The brush ring's program is compiled when a tool is chosen.

#### Label re-plan: main-thread cost of one stretch of work (ms)

Before: the whole re-plan is one task (the 140 ms timer: plan and SVG write); n, median, max. After: each slice (n, median, p95, max). Styled layer with labels, 540-move stop-and-go drag.

| browser | cells | before: re-plans, median, max | after: slices, median, p95, max | after: re-plans (slice 1 of each) | 
| --- | --- | --- | --- | --- |
| chromium | 500k | 6, 22.1, 28.5 | 30, 1.4, 4.3, 7.0 | 6 |
| chromium | 1M | 6, 23.0, 27.6 | 30, 1.4, 4.3, 6.1 | 6 |
| chromium | 2.56M | 6, 19.1, 22.7 | 30, 1.5, 4.7, 7.5 | 6 |
| firefox | 500k | 4, 10.0, 25.0 | 19, 1.0, 5.0, 5.0 | 1 |
| firefox | 1M | 4, 27.0, 28.0 | 20, 1.0, 4.0, 5.0 | 3 |
| firefox | 2.56M | 4, 25.0, 26.0 | 20, 2.0, 6.0, 7.0 | 1 |
| electron | 500k | 6, 19.1, 31.1 | 30, 1.5, 4.3, 5.4 | 6 |
| electron | 1M | 6, 18.3, 20.4 | 29, 1.8, 4.0, 5.9 | 6 |
| electron | 2.56M | 6, 24.0, 33.8 | 33, 2.1, 7.4, 8.4 | 6 |

#### Panning the zoomed-out globe: longest frame gap in ms (gaps over 25 ms), before -> after

| browser | cells | styled+labels | styled+labels+ov | elev | ring-elev | ring-styled+labels | 
| --- | --- | --- | --- | --- | --- | --- |
| chromium | 500k | 25 (1) -> 10 (0) | 26 (4) -> 10 (0) | 10 (0) -> 10 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) |
| chromium | 1M | 25 (0) -> 10 (0) | 25 (1) -> 10 (0) | 9 (0) -> 11 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) |
| chromium | 2.56M | 17 (0) -> 10 (0) | 25 (0) -> 11 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) |
| firefox | 500k | 25 (2) -> 10 (0) | 25 (1) -> 10 (0) | 9 (0) -> 10 (0) | 17 (0) -> 10 (0) | 17 (0) -> 17 (0) |
| firefox | 1M | 25 (2) -> 10 (0) | 25 (1) -> 10 (0) | 10 (0) -> 10 (0) | 9 (0) -> 17 (0) | 9 (0) -> 16 (0) |
| firefox | 2.56M | 26 (2) -> 17 (0) | 25 (1) -> 222 (1) | 24 (0) -> 10 (0) | 25 (0) -> 17 (0) | 17 (0) -> 333 (1) |
| electron | 500k | 25 (0) -> 10 (0) | 25 (1) -> 10 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) |
| electron | 1M | 17 (0) -> 10 (0) | 17 (0) -> 10 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) | 9 (0) -> 10 (0) |
| electron | 2.56M | 25 (1) -> 9 (0) | 25 (2) -> 9 (0) | 9 (0) -> 11 (0) | 9 (0) -> 9 (0) | 9 (0) -> 9 (0) |

#### Layer switches (elevation, styled, koppen): latency of `setLayer` (ms, median of 5; the worker now does the colouring, so latency can rise) and what the page felt: longest frame gap in ms (gaps over 25 ms), before -> after

| browser | cells | setLayer latency | longest frame gap (n over 25 ms) | 
| --- | --- | --- | --- |
| chromium | 500k | 14 -> 15 | 33 (1) -> 10 (0) |
| chromium | 1M | 23 -> 24 | 50 (1) -> 10 (0) |
| chromium | 2.56M | 44 -> 47 | 108 (4) -> 9 (0) |
| firefox | 500k | 26 -> 21 | 33 (1) -> 10 (0) |
| firefox | 1M | 36 -> 34 | 50 (3) -> 10 (0) |
| firefox | 2.56M | 63 -> 61 | 100 (5) -> 231 (2) |
| electron | 500k | 10 -> 14 | 17 (0) -> 10 (0) |
| electron | 1M | 24 -> 23 | 50 (1) -> 10 (0) |
| electron | 2.56M | 33 -> 45 | 92 (2) -> 9 (0) |

#### Render cost: GPU plus draw per frame, ms (median / p95), before -> after

| browser | cells | globe, zoomed out | flat, elevation shader | globe pixelSum | 
| --- | --- | --- | --- | --- |
| chromium | 1M | 6.80 / 7.70 -> 4.90 / 6.00 | 5.70 / 6.40 -> 5.60 / 6.60 | 682973225 -> 682973181 |
| chromium | 2.56M | 6.00 / 11.10 -> 7.40 / 8.70 | 12.50 / 12.80 -> 12.20 / 12.70 | 682905042 -> 682905105 |
| electron | 1M | 7.15 / 7.94 -> 5.13 / 6.27 | 5.53 / 6.24 -> 5.77 / 6.34 | 745545104 -> 745545104 |
| electron | 2.56M | 7.88 / 11.27 -> 7.60 / 9.19 | 12.23 / 12.69 -> 12.57 / 13.09 | 745478996 -> 745478996 |
| firefox | 1M | 7.00 / 8.00 -> 6.00 / 8.00 | 5.00 / 6.00 -> 5.00 / 7.00 | 682970299 -> 682970299 |
| firefox | 2.56M | 6.00 / 8.00 -> 7.00 / 8.00 | 6.00 / 7.00 -> 6.00 / 7.00 | 682901239 -> 682901239 |

#### Flat map: first switch from the globe (ms to drawn, longest frame gap, longest worker-message handler ms), before -> after

| browser | cells | time to drawn | longest frame gap | main-thread handler of the lookup message | 
| --- | --- | --- | --- | --- |
| chromium | 1M | 897 -> 994 | 25 -> 9 | 34 -> 4 |
| firefox | 1M | 1774 -> 1811 | 42 -> 17 | 47 -> 4 |
| electron | 1M | 788 -> 935 | 33 -> 9 | 34 -> 4 |
| chromium | 2.56M | 3063 -> 3081 | 83 -> 25 | 88 -> 6 |
| firefox | 2.56M | 6061 -> 6165 | 67 -> 25 | 99 -> 15 |
| electron | 2.56M | 2634 -> 2698 | 75 -> 25 | 87 -> 4 |

#### Flat map, drag-panning at 4x zoom with overlays: gap p50/p95/max in ms (gaps over 25 ms), rAF callback ms (median), SVG writes (count, median ms), before -> after

| browser | cells | configuration | before | after | 
| --- | --- | --- | --- | --- |
| chromium | 1M | flat-pan | 8.3/16.6/25 (1); raf 0.0; svg 364, 3.1 | 8.3/9.0/9 (0); raf 0.0; svg 0, 0.0 |
| chromium | 1M | flat-pan-styled | 8.4/41.6/59 (355); raf 0.0; svg 364, 7.7 | 8.3/9.0/25 (0); raf 0.0; svg 11, 0.3 |
| firefox | 1M | flat-pan | 8.3/25.0/33 (13); raf 0.0; svg 187, 3.0 | 8.3/16.7/33 (1); raf 0.0; svg 0, 0.0 |
| firefox | 1M | flat-pan-styled | 8.3/50.0/67 (189); raf 2.0; svg 188, 7.0 | 8.3/41.7/43 (170); raf 2.0; svg 31, 1.0 |
| electron | 1M | flat-pan | 8.3/9.1/35 (5); raf 0.0; svg 364, 3.3 | 8.3/8.9/9 (0); raf 0.0; svg 0, 0.0 |
| electron | 1M | flat-pan-styled | 8.3/41.6/67 (364); raf 0.0; svg 364, 7.5 | 8.3/9.2/17 (0); raf 0.0; svg 0, 0.0 |
| chromium | 2.56M | flat-pan | 8.4/24.9/50 (21); raf 0.0; svg 364, 4.9 | 8.3/9.0/9 (0); raf 0.0; svg 0, 0.0 |
| chromium | 2.56M | flat-pan-styled | 8.4/58.4/83 (364); raf 0.0; svg 364, 13.0 | 8.3/9.1/18 (0); raf 0.0; svg 10, 0.3 |
| firefox | 2.56M | flat-pan | 8.4/33.3/50 (101); raf 0.0; svg 187, 5.0 | 8.3/25.0/42 (40); raf 0.0; svg 0, 0.0 |
| firefox | 2.56M | flat-pan-styled | 8.4/83.3/100 (189); raf 2.0; svg 188, 12.0 | 8.3/66.7/75 (186); raf 0.0; svg 27, 1.0 |
| electron | 2.56M | flat-pan | 8.3/17.4/42 (23); raf 0.0; svg 364, 5.2 | 8.3/8.7/9 (0); raf 0.0; svg 0, 0.0 |
| electron | 2.56M | flat-pan-styled | 8.3/66.6/84 (364); raf 0.0; svg 364, 12.5 | 8.3/8.8/17 (0); raf 0.0; svg 0, 0.0 |


**Reading the tables**
- *Label re-plan:* the one 19 to 34 ms task is now slices with a median of 1.0 to 2.1 ms and p95 of 4.0 to 4.7 ms up to 1M cells (5.0 to 7.4 at 2.56M); the longest slice is 5.4 to 8.4 ms (the placement, `planLabels`, 3 to 4 ms of it on the first run, plus garbage collection). The target of slices of at most 4 ms is met for the median and nearly for the p95, **not for the longest slice**. Total work per re-plan fell from 19 to 30 ms to about 7 ms. No frame gap over 25 ms in Chromium and Electron at any size (before: 0 to 4 per run); the largest is 9 to 11 ms.
- *Layer switch:* the longest frame gap per switch fell from 33 to 108 ms to 9 to 10 ms in Chromium and Electron; the latency of `setLayer` is unchanged to slightly higher at 2.56M (the colouring moved to the worker).
- *Render:* the globe's GPU time at 1M fell 28 to 30% (7.0 to 4.9 ms Chromium, 7.15 to 5.13 ms Electron), at 2.56M 6 to 8% in the median (p95 11.3 to 9.2 ms in Electron): culling and ordering measured separately gave 13% and 16%, but together they are not additive (section 5 already said 7.9 ms). Firefox keeps the former path (unchanged). The flat shader is unchanged (not touched). Chromium's `pixelSum` differs by 44 and 63 of 6.8e8 (a few limb pixels, inside the tolerance above); Electron's is identical.
- *Flat map:* dragging the zoomed flat map with overlays: p95 frame gap 41 to 67 ms (styled, 364 gaps over 25 ms in 364 frames) became 9 ms with none over 25 ms in Chromium and Electron at 1M and 2.56M; without the styled layer 17 to 25 ms became 9 ms. Firefox improves less and still misses frames with the styled layer (170 to 186 gaps over 25 ms; unexplained, Firefox cannot be profiled here).
- *Open:* Firefox at 2.56M shows single gaps of 222, 231 and 333 ms in this run (one each in three configurations; the section 6 "unexplained, Firefox only" item, likely garbage or cycle collection); the layer switch's 231 ms is above the 100 ms before and I could not tell a regression from the same unexplained spikes with one run. The flat label plan (per frame in the flat view) is not sliced; it is not among the four items.

Reproduce the before and after tables: `scripts/perf-fixes-all.sh before` on the previous commit and `after` on this one (preview on 127.0.0.1:4173, `apps/desktop/dist` built), then `node scripts/perf-fixes-summary.mjs`.

## 11. After the parallel kernels

Item 5 of section 8, on branch `parallel-kernels` (decisions PK1 to PK5): the shared-memory kernel API and the first parallel kernels, the five H1 noise loops. Measured with `scripts/perf-pipeline.mjs` on the same machine as section 2 (Apple M5 Pro, 18 cores, Node 24), structured pipeline, seed 12345, one run per size, one heavy job at a time. "Before" is the unchanged code (`07b7cb3`), run in this session; "after" is `--parallel` (17 kernel workers, hardware threads − 1).

**What was built.** `runCells(name, n, args, outputs)` (core) runs a registered per-cell kernel either in the calling thread over all cells (the serial fallback) or through `ParallelCells` (engine): every worker of the existing `WorkerPool` gets one message, the threads claim chunks of 2048 cells from a shared counter, the calling thread takes chunks too and then waits in `Atomics.wait`. Layers, the mesh positions and the adjacency live in `SharedArrayBuffer`s while a pool is up; other arguments go through a reused shared arena. The engine worker starts the pool at the first run, only where `SharedArrayBuffer` exists (the desktop app always; the plain dev server is not isolated and runs serially, with the same result). The five loops: `warpTerrain` (the walk; its blend stays serial), `applyDetailNoise` (both calls), `applyTectonicBandNoise`, `applyCoastalDetail`, and the noise of `applyUniformLandNoise` (its slope term reads neighbours the loop has already changed, so that part stays sequential, PK3). Twelve kernel calls per world (six on the reference mesh, six at N), none declined.

#### Time per stage in seconds, before -> after (cores used, after)

| stage | 200k | 1M | 2.56M |
|---|---|---|---|
| mesh | 0.15 -> 0.16 (1.3) | 0.87 -> 0.84 (1.1) | 2.68 -> 2.57 (1.0) |
| ref.pass (20k reference world) | 0.65 -> 0.65 (2.1) | 0.66 -> 0.63 (2.1) | 0.65 -> 0.64 (2.1) |
| detail: elevation | 1.93 -> **1.61** (1.9) | 8.68 -> **6.82** (1.6) | 23.62 -> **18.78** (1.5) |
| detail: climate | 0.07 -> 0.07 | 0.29 -> 0.31 | 0.78 -> 0.76 |
| detail: drainage | 0.02 -> 0.02 | 0.12 -> 0.11 | 0.33 -> 0.34 |
| **total** | **2.83 -> 2.51 (-11%)** | **10.64 -> 8.73 (-18%)** | **28.13 -> 23.18 (-18%)** |
| pool start-up (before the run) | 0.10 | 0.09 | 0.09 |

The elevation stage lost 4.8 s at 2.56M, close to the 5.4 s the H1 loops took in the section 3 profile (the rest of their time, about 0.3 to 0.6 s, is now spread over 18 threads). Everything else in that stage is still one core, which is why it averages 1.5 cores: the remaining 18.8 s are H2 to H4 and the rest of section 3, held for the P5 reconciliation or Phase 14. Section 2's figures (31.5 s at 2.56M) came from an earlier run; this session's "before" is 28.1 s on the same machine, and both before and after here are from this session.

#### Memory: peak RSS of the whole process in MB, before -> after

| | 200k | 1M | 2.56M |
|---|---|---|---|
| peak RSS | 373 -> 760 (+387) | 932 -> 1378 (+446) | 1952 -> 2360 (+408) |
| of which the idle pool (17 workers, measured before the run) | +299 | +302 | +299 |
| shared argument arena (freed after the run) | 6 | 28 | 71 |
| arguments copied into the arena per run | 16 | 76 | 192 |

**Cost of the workers:** about 18 MB per idle worker (its own V8 heap, the bundled kernels and their JIT code), so 300 MB for 17, plus 90 to 150 MB while they work (their heaps and the arena). With 8 workers (`--parallel=8`) the 2.56M run took 23.3 s with a 2172 MB peak: 0.1 s slower and 188 MB smaller. The pool size stays at the plan's hardware threads − 1 (PK4); later kernels (H3, the five distance fields) gain more from the extra workers than the noise loops do. The layers themselves cost nothing extra in shared memory (same bytes, another kind of buffer).

#### Proof that nothing changed

- **Parallel equals serial:** `packages/engine/src/cells.test.ts` (a test kernel that reads a neighbour and accumulates in place, for 1, 2, 5 and 8 workers, chunk sizes 1, 7, 333 and 4097, at 1, 4095 and 20001 cells; shared inputs are not copied; declined calls; a worker's error reaches the caller and the pool keeps working) and `packages/gen-orogen/src/structured/parallel.test.ts` (the structured pipeline at 30011 cells: every layer hash and the World hash equal the serial run for 1, 2, 5 and 8 workers with chunks 333, 1021, 4093 and 7; all 12 kernel calls ran in parallel, none declined).
- **Goldens:** no golden, hash, probe key or baseline was changed or re-recorded. Full unit suite 529 passed (1 skipped, as before), including the port-parity tests (the serial path in dmath `native` mode) and every World-hash test; `npm run probe`: 481 hashes, 0 mismatches, both serially and with the pool (`npm run probe -- --parallel`, 24 parallel calls).
- **Nine worlds** (200k, 1M, 2.56M by seeds 1, 777, 12345; `scripts/nine-worlds.mjs`, run once): the hashes recorded on the unchanged code before any edit against this branch with 17 kernel workers: 9 World hashes and 675 layer-array hashes, **0 differences** (108 parallel calls, none declined).
- **Desktop app:** the Electron smoke test generates in the app, asserts that the pool ran (`stats.kernelWorkers > 0`, `kernelCalls > 0`) and that the World hash equals Node's serial one: passed.
- **Browsers:** the new `apps/web/e2e/kernels.spec.ts`, Chromium and Firefox: made cross-origin isolated by the `?coi` shim the engine worker runs all 12 kernel calls in its pool; without the shim the pool is used exactly where the host isolates the page (not the local preview, which runs them in the engine worker, `kernelWorkers` 0; yes on the Cloudflare preview, which sends the headers); every World hash equals Node's. The full e2e suite (38 tests, Chromium and Firefox) passed.
- **Not touched** (held for the P5 reconciliation, section 8): `erodeComposite`, `projectCoarsePlates`, the distance fields, `propagateStress`, `applyPlatePhysics`.

Reproduce: `NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx scripts/perf-pipeline.mjs <N> out.json [--parallel[=<workers>]]`; `scripts/node24.sh npx tsx scripts/nine-worlds.mjs a.json` on the old commit, `... b.json --parallel` on this one, then `node scripts/nine-worlds.mjs --compare a.json b.json`.
