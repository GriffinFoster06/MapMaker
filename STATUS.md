# Status

Updated at every checkpoint.

| Checkpoint | State |
|---|---|
| 1 (Phase 1 spikes) | Done |
| 2 (Phase 2 design notes) | Done |
| 3 (Phase 3 shell) | **Reached. Waiting for review.** Phase 4a not started. |

## Phase 3 results (2026-10-04)

- **Unit tests:** 87 passing (core 49, engine 31, tools 7). Lint, `tsc -b` and `provenance:check` clean.
- **Cross-engine tests:** 9 Playwright runs (determinism and COOP/COEP shim, in Chromium 140, Firefox 141 and WebKit 26) pass locally, in CI on ubuntu, macOS and **Windows x64**, and against the live site.
- **CI:** `checks` (ubuntu) and `determinism` (ubuntu, macOS, Windows) green; Pages deployed to https://griffinfoster06.github.io/MapMaker/ with a live smoke test.
- **Determinism:** all strict probe keys match everywhere. Float64 libm-dependent keys diverge by 1–2 ULP across engines and across arm64/x64. See Q3 in `docs/ARCHITECTURE.md` and the Checkpoint 3 report.

## Open decisions for review

1. Whether to switch `dmath` to a vendored fdlibm port now, for Float64 results that must be cross-engine exact.
2. The deviations listed in the Checkpoint 3 report.
