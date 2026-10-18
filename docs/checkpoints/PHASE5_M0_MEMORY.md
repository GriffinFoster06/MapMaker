# Phase 5 M0: peak browser memory at 2.56M cells

Date: 2026-10-18. Branch `phase-5`. This is the item Checkpoint 4b carried into Phase 5 (decision 8): measure and break down peak browser memory at 2.56M cells, then reduce it without changing any output. Approved reductions R1–R6 and the bench changes are done; **M0 stops here for review**.

## Verdict

- **Outputs are bit-identical.** Every layer hash and the world hash are unchanged for 9 worlds: 200k, 1M and 2.56M cells × seeds 1, 777 and 12345 (structured pipeline). No golden hash or baseline was touched.
- **The structured detail pass now allocates 2.65 GB of typed arrays instead of 7.43 GB (−64%)** at 2.56M (Node, seed 12345).
- **WebKit peak drops by about 0.8 GB:** with the engine worker alone, the mean of three runs went from 6,718 MB to 5,909 MB. With the full app, a single run went from 7,002 MB to 6,120 MB.
- **Chromium, Firefox and Node barely change.** Chromium and Firefox move by −220 to +113 MB, within run-to-run noise (stock, which these changes barely touch, moves by as much). Node's peak goes from 2,120 to 1,922 MB.
- **WebKit is still about 1.5 GB above stock** (5,909 MB against 4,383 MB, engine worker alone). Where that goes is measured below, with two proposed follow-ups (R7, R8) that need your approval.

## Method

- **Machine:** Apple M5 Pro, 18 cores, 64 GB, macOS (Darwin 27.0). Playwright's Chromium, Firefox and WebKit, as installed in `.tools/ms-playwright`. Seed 12345, 2.56M cells.
  - These are not the Checkpoint 4b numbers, which came from a 4-core Linux VM with software WebGL. The absolute values differ (WebKit structured was 4,625 MB there and 7,002 MB here); the pattern is the same.
- **Before:** `b51bd40` (the Phase 5 base) with only the two bench commits cherry-picked, in a separate worktree with its own `npm ci`. **After:** `4435279` (R1–R6 plus the bench). Both use the same bench code.
- **Bench** (`npm run bench`, `apps/web/bench/bench.spec.ts`):
  - It samples the RSS of every process of the Playwright browser install with `ps` every 100 ms.
  - It now also records each process kind's peak (content, gpu, network, browser, other).
  - `BENCH_MODE=worker` runs the generation in a fresh engine worker (`window.__globe.generateInWorker`), with no globe and no transfers, so the engine worker's memory can be told apart from the page's.
  - Files: `docs/benchmarks/phase5-m0/{before,after}/<mode>-<variant>-<browser>.json`.
- **Node** (scratch harnesses, not committed):
  - per-stage live set (forced GC) and peak RSS (sampled from a worker thread every 25 ms);
  - a tally of every typed array of ≥ 1 MB by call site, made by wrapping the typed-array constructors (values unchanged).
- **Single runs** except where stated. Repeating the same configuration varies by about ±150 MB in Chromium and Firefox and up to ±300 MB in WebKit.

## Results

### Browsers: peak RSS (MB), 2.56M

"Content" is the page process that runs the engine worker; "total" is all browser processes.

| Mode, browser, pipeline | Total before | Total after | Δ | Content before | Content after | Δ |
|---|---|---|---|---|---|---|
| app, WebKit, structured | 7,002 | 6,120 | **−882** | 6,589 | 5,847 | −742 |
| app, WebKit, stock | 4,704 | 4,514 | −190 | 4,433 | 4,123 | −310 |
| app, Chromium, structured | 1,791 | 1,836 | +45 | 1,564 | 1,609 | +45 |
| app, Chromium, stock | 1,668 | 1,666 | −2 | 1,352 | 1,418 | +66 |
| app, Firefox, structured | 2,410 | 2,468 | +58 | 1,964 | 1,935 | −29 |
| app, Firefox, stock | 2,198 | 2,311 | +113 | 1,755 | 1,783 | +28 |
| worker, WebKit, structured | 6,855 | 5,975 | **−880** | 6,586 | 5,703 | −883 |
| worker, WebKit, stock | 4,453 | 4,383 | −70 | 4,182 | 4,110 | −72 |
| worker, Chromium, structured | 2,005 | 1,785 | −220 | 1,778 | 1,558 | −220 |
| worker, Chromium, stock | 1,582 | 1,647 | +65 | 1,355 | 1,420 | +65 |
| worker, Firefox, structured | 2,387 | 2,475 | +88 | 1,942 | 1,940 | −2 |
| worker, Firefox, stock | 2,162 | 2,201 | +39 | 1,715 | 1,671 | −44 |

- **WebKit, structured, worker mode, three runs each:** before 6,855 / 6,919 / 6,379 MB (mean 6,718); after 5,975 / 5,829 / 5,922 MB (mean 5,909).
- **The globe is not the problem.** In every browser, app mode and worker mode peak within about 150 MB of each other; the page side (mesh copies, globe buffers, GPU process) never sets the peak.
- **Timing** is unchanged within noise (WebKit structured 30.3 → 30.0 s in worker mode).

### Node, structured, 2.56M

| | Before | After |
|---|---|---|
| Peak RSS, whole run | 2,120 MB | 1,922 MB |
| Typed arrays allocated by the detail pass | 7,426 MB | 2,654 MB |
| Typed arrays allocated, whole run | 8,103 MB | 3,326 MB |
| Arrays live after the run | 582 MB | 582 MB |

## Where the memory went (before)

1. **WebKit holds dead typed arrays in proportion to what is live.**
   - In a test worker, 3.7 GB of 20 MB arrays were created and dropped in a loop.
   - With nothing else live, WebKit grew by 84–121 MB.
   - With 1.5 GB held live, WebKit grew by 2,875 MB against Chromium's 1,336 MB (the live set itself).
   - So in WebKit, allocation volume becomes resident memory. Its RSS also never falls during a run.
2. **The detail pass allocated 7.4 GB over its run while keeping about 250 MB.** By call site, at 2.56M:

   | Source | MB | Reduction |
   |---|---|---|
   | `MultiLevel.correct`: a new 20 MB Float64 array per trial iteration (187) | 3,850 | R1 |
   | anchoring and sign-lock rounds: a new output array per call | 769 | R2 |
   | climate downscaling: 3N Float64 temporaries and scalar prolongations | 646 | R3 |
   | drainage heap with capacity adjList.length + n ≈ 7n | 216 | R4 |
   | `sha256` copying every layer before hashing | 228 | R5 |
   | orogen ports at N, stage 1–3 fields at N, operator tables | ≈ 1,290 | partly R6 (released earlier, not allocated less) |
3. **Timeline:** the WebKit trace showed +2.3 GB in 0.9 s just before "Detail: climate", where the sign-lock rounds run `correct()` repeatedly. That jump is gone after R1 and R2.

## The reductions (one commit each)

| Commit | Change | Why the output cannot change |
|---|---|---|
| `1d3e9be` R1 | `correct()` keeps its trial iterate in one scratch array on the `MultiLevel`, swapped with x on acceptance; new `prolongInto` | Same operations on the same operands, in the same order; only the destination array differs |
| `8b0e1d0` R2 | `zeroMeanPerParent` and `anchorAdditive` write into their fresh correction array; new `anchorAdditiveInPlace` (used by the 8 sign-lock rounds and the temperature anchor); `anchorMultiplicative` prolongs into the free scratch | Same sums and differences, `fine[i] + corr[i]` and `detail[i] − corr[i]`; the old arrays were not read afterwards |
| `7678f21` R3 | `prolongVector` takes an optional cell range; `prolongEastNorth` runs in chunks of 65,536 cells; scalar prolongations share one buffer | Per-cell code unchanged; each value is computed from the same inputs |
| `7f9c370` R4 | Detail drainage heap capacity n | Each cell is marked seen before its only push, so at most n entries; heap order does not depend on capacity |
| `264b8e5` R5 | `sha256` copies only SharedArrayBuffer-backed views | Same bytes hashed; new `hash.test.ts` checks the FIPS 180-2 vector and that shared, offset and multi-part views agree |
| `4f4f021` R6 | `runElevationDetail({ keepIntermediates })` (default true); the stage passes false, writes the elevation layers first, and keeps only what climate and drainage read | No values change; only lifetimes. Layer values do not depend on write order |
| `4435279`, `7435aa3` | Bench: per-process peaks, `BENCH_MODE=worker`, and process matching through symlinked browser paths | Measurement only |

## What remains in WebKit (after)

WebKit trace on the after build, engine worker alone, with stage progress timestamps:

| Phase | Time | RSS at end |
|---|---|---|
| mesh | 3.4 s | 715 MB |
| reference pass | 0.6 s | 911 MB |
| detail: elevation at N | 24.9 s | 4,299 MB (+3.4 GB) |
| detail: climate downscaling | 0.6 s | 5,272 MB (+973 MB) |
| detail: drainage, output hashes, layer writes | 0.4 s | 5,549 MB |

- **Climate (+973 MB in 0.6 s).** Only 275 MB of typed arrays are allocated there now. The rest is plain JS garbage: `basis()` in `detail.ts` returns a new 6-element array for every cell, 4 fields × 2.56M cells ≈ 10 million arrays. V8 discards these cheaply; WebKit does not.
  - **Proposed R7:** write the basis into scalars or a reused Float64Array (same arithmetic).
  - **Expected:** about −0.8 to −1.0 GB in WebKit.
  - **Not done:** it was not in the approved R1–R6.
- **Elevation at N (+3.4 GB).** Most of this is orogen's own work at N, which stock also does: tectonics, elevation, erosion. Stock's whole run peaks at 4.1–4.4 GB in WebKit's content process.
  - A JavaScriptCore shell probe (system `jsc`, full GC at each step) attributes the structured-specific steps: `new MultiLevel` (+494 MB of RSS for about 130 MB of arrays) and the stage 1–3 fields at N.
  - orogen first computes its own stage 1–3 fields at N; the detail pass then replaces most of them with prolonged ones. Live typed arrays reach 1,481 MB at that point.
  - **Proposed R8:** investigate, without code changes yet, whether orogen's own fields at N can be skipped where they are replaced, keeping the port bit-identical to stock where it is not hooked. That would cut both memory and time. It touches `port/elevation.ts`, so it needs its own approval and parity tests.
  - **Caveat:** the system `jsc` shell is not Playwright's WebKit build. It does not reproduce the browser's structured-over-stock gap (shell: structured 4,032 MB vs stock 4,843 MB), so its step attribution is indicative only.

## Checks run (2026-10-18, this machine)

| Check | Result |
|---|---|
| Per-layer and world hashes, 200k / 1M / 2.56M × seeds 1, 777, 12345, before vs after | **0 differences** (and 0 at 200k after each of R1–R6 separately) |
| `npm run lint`, `npm run typecheck`, `npm run provenance:check` | Passed (24 vendored files, 41 headers, 18 direct / 246 total packages) |
| `npm test` | 260 passed, 1 skipped (the opt-in `REQUIRE_UPSTREAM` preflight); the 2 new tests are `hash.test.ts` |
| `npm run e2e` | 18 passed (Chromium, Firefox, WebKit) |
| `npm run bench` at 2.56M, both pipelines, app and worker modes, three browsers, before and after | All 24 runs `ok` |
| `ab-gate`, realism gate, `REQUIRE_UPSTREAM=1` | **Not run.** Outputs are bit-identical, so they cannot change; that is an inference, not a run |

## Decisions for review

1. Accept M0 as is, or ask for changes.
2. **R7** (allocation-free `basis()` in the climate downscaling): approve or not.
3. **R8** (investigate skipping orogen's own stage 1–3 fields at N where the detail pass replaces them): approve as an investigation, or defer to Phase 7.
