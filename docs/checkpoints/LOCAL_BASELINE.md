# Local baseline: 2026-10-18

Read-only audit of the checkout against `STATUS.md`. No code, golden hash or baseline file was changed or refreshed. Only this file was added.

- **Branch / HEAD:** `catchup/reconciliation` at `121dc1e` (merge of PR #5). The working tree was clean before the checks and clean after them.
- **Machine:** macOS (Darwin), Node through `scripts/node24.sh` (project-local Node 24).
- **Optional inputs present:** `upstream/` is fully present, so the upstream-parity tests ran. Earth ground-truth data was not confirmed present; the opt-in `REQUIRE_UPSTREAM` preflight test was skipped (see below).

## Check results

| Check | Result | Counts |
|---|---|---|
| `npm run lint` | **Pass** | exit 0, no diagnostics |
| `npm run typecheck` | **Pass** | `tsc -b` exit 0, no diagnostics |
| `npm test` (Vitest) | **Pass** | **258 passed, 0 failed, 1 skipped** (259 tests); 29 files passed, 1 skipped (30 files); 31 s wall clock |
| `npm run build` | **Pass** | `vite build` exit 0, 65 modules transformed |
| `npm run provenance:check` | **Pass** | 24 vendored files, 41 files with Provenance headers, 18 direct / 246 total npm packages |
| `npm run e2e` (Playwright) | **Pass** | **18 passed, 0 failed** across Chromium, Firefox and WebKit (6 specs each); 1.7 min |

The one skipped test is `tools/provenance/upstream-required.test.ts`, the opt-in `REQUIRE_UPSTREAM` preflight. It was not run with `REQUIRE_UPSTREAM=1`, so the nightly-style strict path is **unverified** here.

## `upstream/` against `upstream-manifest.json`

- **30 of 30 repos present, each at its pinned commit** (`git rev-parse HEAD` equals the manifest `commit`). No extra directories in `upstream/`.
- No repo reported a dirty working tree (`git status --porcelain` empty for each).
- Not done: I did not run `scripts/restore-upstream.sh`, and I did not check licence files or remotes.

## Phase 4a open items

`STATUS.md` lists three open items. All three are resolved in the tree.

| Item | Status | Evidence |
|---|---|---|
| **A/B river-mouth bug** | **Resolved** | Fixed in `16796dc` (2026-10-13): `greatCircleKm` in `tools/tuning/ab/ab.mjs` now uses `atan2(|cross|, dot)`, so it ignores vector length and is exact at zero. `ab.test.ts` now asserts a zero self-distance, a length-independent result and πR/2 for orthogonal vectors. The two tests that failed in the Codex handoff pass in this run (258/0). The fix corrects the `acos(dot)` on unnormalised Float32 vectors that `STATUS.md` suspected. |
| **`tools/tuning/ab-baseline.json`** | **Resolved** | Present and committed (`5f6b9be`, metadata updated in `16796dc`). Stock orogen, reference L0, seeds 1/777/12345, previews 50k and 200k, finals 1M and 2.56M. The coverage test in `ab.test.ts` passes, so all ten Q7 metrics are finite for every seed/final/preview combination. Its `commit` field is `b370476`, which postdates the river-mouth fix, so the river-mouth values were not produced by the buggy metric. It was generated on a Linux x64 Xeon (Node 24.21.0, 2026-10-13), not on this Mac. I did not regenerate or compare it. |
| **`docs/benchmarks` reports** | **Resolved** | `PHASE4A.md` and `phase4a-{chromium,firefox,webkit}-linux.json` exist (Chromium, WebKit and Firefox, 4-core Linux VM, 2026-10-13). Phase 4b added `phase4b-*-linux.json` and a "Phase 4b" section in `NOTES.md`. I did not re-run `npm run bench`, and I did not read the per-tier `ok`/`error` fields in every JSON file. `CHECKPOINT_4B.md` states that all 15 structured tier runs passed. That is its claim, not something I verified. |

Phase 4a is no longer the open phase: `docs/checkpoints/CHECKPOINT_4B.md` records Phase 4b (the structured pipeline) as built and accepted on 2026-10-14.

Not re-verified here (CI or nightly work): the `ab-gate` against `ab-baseline.structured.json`, the nightly `ab-gate-full` at 2.56M, and the nightly realism gate (`tools/tuning/realism/gate.mjs`). Whether they pass depends on data this run did not exercise, so I make no claim either way.

## What in `STATUS.md` is stale or contradicted

1. **Phase table.** The "4a … **In progress**" row is contradicted by the tree. There is no 4b row at all, although 4b is built and accepted (`CHECKPOINT_4B.md`). The same stale "4a | in progress" and empty 4b status appear in the `docs/ARCHITECTURE.md` §7 phase table (lines 676–677).
2. **Current handoff (2026-10-13, planning overhaul).** Its "Next" says "fix the A/B river-mouth metric, generate the Q7 baseline, collect the browser benchmark report, then Checkpoint 4a". All three are done, and 4b has already completed. The handoff predates the work from `16796dc` through `121dc1e`.
3. **"Remote CI on PR #1 was red … on the two known `ab.test.ts` failures".** Those two failures no longer reproduce locally. I did not check remote CI.
4. **Codex handoff validation table.** The test count "143 passed, 2 failed, 1 skipped (146)" is historical. The current local count is 258 passed, 0 failed, 1 skipped (259). The e2e count "12 passed" is now 18. Provenance "20 source headers" is now 41. Lint, typecheck, build and provenance still pass.
5. **Codex "Findings" bullets.** These are contradicted:
   - "A/B metric correctness … `ab.test.ts:38` reports 0.8176 km": fixed.
   - "Missing Q7 baseline … `ab-baseline.json` is absent": present.
   - "Missing benchmark evidence … no `phase4a-*.json` or `PHASE4A.md`": present.
   - "The reference/detail restructure and regression gate belong to Phase 4b": done.
   - "The adapter accepts only Earth radius" and "the displayed cell tiers are stock orogen … not yet faithful previews": not re-checked, and 4b plus the PR #5 world-settings panel may have changed them.
6. **Phase 3 results:** "117 pass locally", "9 Playwright runs". These are labelled historical and are superseded by the numbers above.
7. **Missing sections.** `STATUS.md` has nothing on Phase 4b, the Checkpoint 4b acceptance, the structured pipeline, the Q7 structured gate, the realism gate, or the world-settings panel (PR #5). `AGENTS.md` says to update it only when the user announces an agent switch, so this may be intended, but the result is a file describing a state two merged PRs ago.
8. **Items that still hold:** the Checkpoint 3b `dmath` section and its 'fdlibm' default note, the new-upstreams section (30 repos, including tectonics.js and SongsOfFOSS, match the manifest), the `CI coverage` note, and "Open decision 2" (the Checkpoint 3 deviations) are unchanged by anything I found. The "Known issues for later phases" list (Phase 12 save streaming, Phase 13 `pow`) was not tested.

## Caveats on this baseline

- All numbers above are from one local run on one machine on 2026-10-18; nothing was compared with remote CI.
- Test and e2e output contained a lot of stdout noise from the vendored orogen stages and determinism probe logs (probe diffs for native-mode `Math.*` keys are report-only by design). I counted only the pass/fail summary lines.
- Raw logs are in the session scratchpad, not in the repo.
