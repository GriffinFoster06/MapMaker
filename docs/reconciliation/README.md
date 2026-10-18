# Reconciliation

Documentation-only passes that check what the planning documents claim about each upstream against the source in `upstream/`. This file records why they exist, the method, what is done and what is deferred, and how to run the next one. The results are in `group-1.md`, `group-2.md`, `group-3.md` and `group-6a.md`. `pending-decisions.md` lists changes the passes raised that need a decision. `review.md` is an independent review of the first four passes.

## 1. Why reconciliation exists

The 2026-10-13 planning overhaul (design notes 15–38, the §7.0 roadmap, the new phases in `docs/ARCHITECTURE.md` §7 and the "Expanded scope" section of `audit/CAPABILITY_MATRIX.md`) was written **without `upstream/` checked out**. Every claim in it about an upstream (which file is the pick, whether it exists, what it does, its units, its licence) came from the older per-repo audits and was not verified against source. Reconciliation checks those claims against the commits pinned in `upstream-manifest.json`, corrects the records, and flags anything that would change a phase.

It is documentation only: no code, no `upstream/`, no `packages/gen-orogen/vendor/`, and no dependency changes.

## 2. Method

Used in `group-1.md` through `group-3.md` and `group-6a.md`:

1. **One subagent per repo** reads the source and checks the claims in `audit/<repo>.md`, `audit/CAPABILITY_MATRIX.md`, `docs/ARCHITECTURE.md` and the `docs/design/` notes. Effort goes only to claims that drive a decision: which file or function is the pick, whether it exists, what it does, whether it could run deterministically through `dmath` in a browser worker or is only an algorithm reference, units and frame, and the licence.
2. **The coordinator re-checks the key facts in the source.** First reports contain errors (each group file lists the ones found: reversed composition orders, counts taken from the audit instead of the tree, evidence that contradicts its own verdict, licences confirmed without reading the file). A claim is not recorded until the coordinator has read the cited lines. Even so, the review found one claim that was not re-read (group 6a A6, `review.md` H1), so treat "no such code exists" claims as the weakest kind and grep the whole tree for them.
3. **Verdicts:** each pick is marked **Confirmed**, **Changed** or **Dropped**, with file paths and line numbers at the pinned commit. Feasibility is **dmath**, **Ref** (algorithm or parameter reference) or **Oracle** (native golden data for tests only).
4. **Edits are applied with exact-match scripts:** each replacement must match exactly once or the script stops, so a stale or mistyped quote fails loudly instead of editing the wrong place.
5. **Contradiction grep:** after editing, grep each edited audit (and the matrix and notes) for the superseded claims.
6. **Flags for the phase plan.** Anything that would change a phase is written as a flag in the group file, and anything that needs the user's decision is added to `pending-decisions.md`. **Phase text in `docs/ARCHITECTURE.md` is not edited** except for the Prerequisite lines the user authorised.
7. Commit the group, then summarise and stop.

## 3. Status

"Done" means a group file exists and the corrections were applied. The Prerequisite column matches the **Prerequisite** lines in `docs/ARCHITECTURE.md` §7 (Phases 5b, 5c, 7, 8b, 9b, 9d, 10b, 11b, 13, 18). The group numbers 4, 5 and 6b were never defined in a record, so deferred work is listed by Prerequisite phase instead.

### Manifest repos (30)

| Repo | State | Record | Must be reconciled before |
|---|---|---|---|
| GPlates | Done | group 1 | — |
| tectonics.js | Done | group 1 | — |
| ASPECT | Done | group 1 | — |
| VPLanet | Done | group 1 | — |
| Badlands | Done | group 2 | — |
| ParFlow | Done | group 2 | — |
| WRF-Hydro | Done | group 2 | — |
| PISM | Done | group 2 | — |
| Delft3D | Done | group 2 | — |
| CESM | Done | group 3 | — |
| CTSM | Done | group 3 | — |
| MOM6 | Done | group 3 | — |
| MARBL | Done | group 3 | — |
| Azgaar | **Partly done**: Phases 5 and 5c only | group 6a | The rest (Phase 5b editors and options UI, Phase 7 `lakes.ts` and `features-generator.ts`, notes 5 and 9) has **no Prerequisite line** (`pending-decisions.md` D3) |
| QGIS | **Partly done**: Phases 5 and 5c only | group 6a | The rest (Processing framework, note 37, Phase 17) has **no Prerequisite line** (D3) |
| CesiumJS | **Partly done**: Phases 5 and 5c only | group 6a | The rest (LOD and tiling, note 38, Phase 14; note 36, Phase 16) has **no Prerequisite line** (D3) |
| Godot | Deferred | — | Phase 5b |
| orogen | Deferred (vendored and parity-tested, but its claims in notes 17 and 21 were wrong or unchecked: `review.md` M1, M2) | — | **No Prerequisite line** (D3) |
| LPJmL | Deferred | — | Phase 9b (note 12, Phase 7, cites it earlier: D3) |
| SLiM | Deferred | — | Phase 9b |
| RangeShiftR | Deferred | — | Phase 9b |
| PostGIS | Deferred | — | Phase 11b |
| Eurace | Deferred | — | Phase 13 |
| UrbanSim | Deferred | — | Phase 13 (note 9, Phase 10, cites it earlier: D3) |
| LIAM2 | Deferred | — | Phase 13 |
| MESSAGEix | Deferred | — | Phase 13 (note 17, Phase 5b, cites it earlier: D3) |
| GAMA | Deferred | — | Phase 13 (note 26, Phase 9c, cites it earlier: D3) |
| FLAMEGPU2 | Deferred | — | Phase 13 (notes 26 and 29, Phases 9c and 9e, cite it earlier: D3) |
| OpenSpiel | Deferred | — | Phase 13 |
| SongsOfFOSS | Deferred | — | Phase 13 (note 29, Phase 9e, cites it earlier: D3) |

Totals: 13 done, 3 partly done, 14 deferred (30).

### Candidate upstreams and datasets (not in the manifest; audit with prompt 2)

| Candidate | State | Audit before |
|---|---|---|
| redblobgames mapgen4 | Deferred | Phase 5c |
| mewo2/terrain | Deferred | Phase 5c |
| FastScape | Deferred | Phase 7 |
| GISS ModelE / ROCKE-3D, ExoCAM | Deferred | Phase 8b |
| gen3sis | Deferred | Phase 9d |
| CC0 map-asset packs (symbols, textures, fonts) | Deferred | Phase 10b |
| watabou TownGeneratorOS | Deferred | Phase 11b |
| Glottolog, Seshat, HYDE (datasets) | Deferred | Phase 18 (record access route and licence in `PROVENANCE.md`) |

### Other open items

- `pending-decisions.md` holds the decisions the passes raised (A: plan and estimate changes, B: optional phase-text clarifications, C: record corrections, D: observations).
- The independent review (`review.md`) found one wrong claim (H1), the missing README (H2) and the placement gaps summarised in D3. Each finding has a Resolution line.

## 4. How to run a reconciliation session

- **Models:** Opus 5.5 at medium effort for the coordinator, Sonnet 5.5 for the per-repo subagents.
- **One commit per group**, and **push after each**.
- **Never update dependencies.** Do not upgrade, update or audit-fix anything, and do not edit `upstream/`, `packages/` or `packages/gen-orogen/vendor/`.
- Start from the Prerequisite line of the phase the group serves, use prompt 1 for manifest repos and prompt 2 for candidates, and add the group to the table in §3.
- Read `review.md` first: it lists the failure modes seen so far (unchecked absence claims, line-number drift, a record that contradicts another).

## 5. Reusable prompts

### Prompt 1: group reconciliation

```
Reconciliation pass, documentation only. Don't change code, upstream/ or packages/gen-orogen/vendor/. Do not update, upgrade or audit-fix any dependency. For this group: [REPOS], needed by [PHASES]. Follow the method in docs/reconciliation/group-1.md through group-3.md: one subagent per repo (Sonnet is fine), then re-check the key facts in the source yourself before editing, because subagent first reports contain errors. Spend effort only on claims that drive a decision: which file or function is the pick, whether it exists, what it does, whether it could run deterministically through dmath in a browser worker or is only an algorithm reference, units and frame, and the licence. Check claims in audit/<repo>.md, audit/CAPABILITY_MATRIX.md, docs/ARCHITECTURE.md and the docs/design/ notes. Mark each pick Confirmed / Changed / Dropped with file paths and line numbers. Correct wrong claims in the audits, the matrix and the notes. Write results to docs/reconciliation/group-[ID].md in the same format. Grep each edited audit for contradictions. Flag anything that would change a phase, but don't edit phase text. Commit, then summarise and stop.
```

### Prompt 2: candidate audits

```
Audit candidate upstreams, documentation only. For [CANDIDATES]: clone each into upstream/, record its commit and licence in upstream-manifest.json, and write audit/<name>.md in the same format as the existing audits. For datasets, record source, licence, access method and size only. Base every claim on source you read. Don't extract code. State for each whether it beats the current pick for its capability in audit/CAPABILITY_MATRIX.md, and why. Run `scripts/node24.sh npm run provenance:check` after editing the manifest. Commit and summarise.
```
