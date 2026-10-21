# Operating guide: working without the user in the loop

The user has moved from cloud sessions to local work and does not want to be consulted between milestones. This file is the contract that lets a local agent (Claude Code or Codex) carry the project forward alone, cheaply, and safely. It sits under `AGENTS.md` (rules) and above `docs/RESUME.md` (current state). If this file and `AGENTS.md` disagree on a *rule*, `AGENTS.md` wins; on *how to proceed*, this file wins.

## 1. Start of every session

1. Read `AGENTS.md` (rules), this file, then `docs/RESUME.md` (where to continue, what is authorized).
2. `git status --short --branch` and `git log --oneline -15`. Preserve existing edits. Do not redo finished work.
3. Read only what the next milestone needs: its section in `docs/ARCHITECTURE.md` §7, the design notes it cites, `docs/DECISIONS_LOG.md` entries for that area. Do not re-read the whole plan.
4. Continue from "Next" in `docs/RESUME.md`. Do not ask the user what to do next; the file says.

## 2. Authorization and the stop rule

`docs/RESUME.md` has one line, **Authorized through**, naming the last checkpoint the agent may complete. The agent:

- finishes every milestone and phase up to and including that checkpoint without asking;
- at each earlier phase boundary writes the checkpoint report (§9), pushes, updates `docs/RESUME.md`, and **continues** to the next phase;
- at the authorized limit, stops, leaves the repo clean and pushed, and says so in `docs/RESUME.md` under "Waiting on the user".

Only the user extends the limit (by editing that line). Never start a phase beyond it.

## 3. Decide, do not ask

Within the authorized range the agent makes the call and records it. Default rules, in order:

1. The plan decides. If `docs/ARCHITECTURE.md`, the phase text or a design note specifies it, do that.
2. If the plan is silent or ambiguous, pick the option that (a) keeps outputs deterministic, (b) does not trade quality for speed or size (`AGENTS.md`), (c) reuses an upstream per the reconciliation records, (d) is simplest to test. Record it in `docs/DECISIONS_LOG.md` (one entry: what, why, alternatives, reversible?) and continue.
3. Prefer reversible choices. If two options are close, take the one that is cheaper to change later.
4. New dependencies: allowed only for a planned deliverable, exact-pinned, logged in `PROVENANCE.md`. Never update, upgrade or audit-fix an existing dependency unless a check fails because of it.
5. Golden hashes and baselines: *adding* new keys for new output is fine and is explained in the commit. *Changing* an existing value is a hard stop (§4) unless the cause is understood, it is an intended improvement under the gate rules, and the explanation is in the commit and `docs/DECISIONS_LOG.md`.
6. Cosmetic and naming choices are the agent's. Do not ask about them.

## 4. Hard stops (the only reasons to wait for the user)

Stop, record the question in `docs/RESUME.md` under "Waiting on the user" with what you tried and a recommended answer, and move on to any independent work. If nothing independent remains, stop the session.

- A change to the phase order, a phase's scope, or an upstream pick that is not already ruled on in `docs/DECISIONS_LOG.md` or `docs/reconciliation/pending-decisions.md`.
- A determinism break you cannot explain (a strict probe key or a world hash changes without an intended cause).
- A required change to an existing golden hash, baseline or gate tolerance that fails the test in §3 rule 5.
- Anything outward-facing or hard to reverse: pushing to `main`, force-pushing, deleting branches or tags, publishing releases, deploying, changing GitHub settings, spending money, contacting anyone.
- Modifying `upstream/` or `packages/gen-orogen/vendor/`.
- A licence or provenance doubt you cannot resolve from the records.
- Three different approaches to the same blocking problem have failed (log all three).

## 5. Usage budget (the user's plan has limits; waste is the main risk)

Phase 5 M0 spent most of its effort on a one-off measurement item (about 24 browser runs, repeated before/after matrices, probes, monitors). That was the exception. The default is lean:

- **Measure only to decide.** Benchmarks run only when a milestone or gate names them. Never repeat a full browser matrix to answer a question one browser or one tier answers. No "before" re-runs unless the baseline is missing. Three-run averages only when the effect is within noise and the decision depends on it.
- **Checks by cost.**
  - After each edit: type-check and run the *touched package's* tests only (`scripts/node24.sh npx vitest run <path>`, `tsc -b`).
  - Once per milestone, before the commit: `lint`, `typecheck`, full `test`, `provenance:check`.
  - `build` and `e2e` only when `apps/web`, the engine protocol, the probe or the build config changed, and at each phase checkpoint.
  - The nine-world bit-identity comparison (200k, 1M, 2.56M × seeds 1, 777, 12345) only when code under `packages/core/src/mesh`, `multilevel`, `packages/gen-orogen` or `packages/engine` changed; one run per milestone, not per edit.
  - CI on GitHub covers macOS and Windows (Windows: Node checks only, no GPU) plus Ubuntu for main CI; Playwright e2e runs on macOS and Ubuntu in Chromium and Firefox (decision W7). Do not try to reproduce other OSes locally.
- **Never take the user's focus.** Tests and scripts use hidden windows and headless browsers only (desktop app: `MAPMAKER_TEST=1`). The only exception is the rare visible-mode check for frame rate, graphics status or layout (`MAPMAKER_TEST_VISIBLE=1`, `showInactive()`, once per checkpoint at most); see `docs/RELEASING.md`.
- **Read narrowly.** `grep -n` and `sed -n 'a,bp'` instead of whole files; do not re-read a file already in context; pipe command output through `tail`/`grep`.
- **Batch tool calls.** Independent reads and commands in one step.
- **No polling.** No monitors, sleep loops or repeated status checks. Start a long job, do other work, check once.
- **Keep chat short.** Status messages of a few lines. Details go in commit messages, `docs/RESUME.md` and checkpoint reports, not in chat.
- **Context hygiene.** `/compact` after each milestone commit. State lives in the repo, so `/clear` between unrelated tasks is free.
- **Subagents** only for broad read-only sweeps (reconciliation, audits). Use Sonnet. Give each a narrow question.
- **Scratch work** (harnesses, probes) goes in the scratchpad directory, not the repo, unless it becomes a maintained tool.
- **Plan once.** Write a 5 to 10 line plan in `docs/RESUME.md` at the start of a milestone, then implement. Do not narrate options you will not take.

## 6. Models and effort

The agent cannot switch its own model. It states the suggestion for the next batch in `docs/RESUME.md` ("Suggested model/effort"); the user can change it between sessions, but the work must succeed on the defaults.

| Work | Model, effort |
|---|---|
| Implementation, tests, docs, mechanical refactors | Sonnet 5.5, medium |
| New algorithms, pole/antimeridian math, GLSL, determinism-sensitive code, anything that failed once | Opus 5.5, medium; high only after one failed attempt |
| Reconciliation coordinator, design notes, architecture changes | Opus 5.5, high |
| Per-repo subagent sweeps | Sonnet 5.5 |

## 7. The milestone cycle

1. Plan (short, in `docs/RESUME.md`).
2. Implement with tests for each new behaviour; log extractions and dependencies in `PROVENANCE.md`.
3. Targeted checks while working; the per-milestone checks in §5 before committing.
4. Commit (one logical change per commit; message says what changed and which checks ran), push.
5. Update `docs/RESUME.md`: Next, last milestone, 2 to 4 lines in the work log. Record non-obvious decisions in `docs/DECISIONS_LOG.md`.
6. `/compact`, then the next milestone. Do not wait for review.

Branches: one long-lived branch per phase (`phase-5`, `phase-5b`, `phase-5c`, ...), created from `main`. Open a draft PR at the first push (use `gh` if installed; otherwise put the compare URL in `docs/RESUME.md`). Never wait for a merge: when `main` moves, merge `main` into the phase branch and continue. At a checkpoint mark the PR ready and say so in `docs/RESUME.md`. Never push to `main`.

## 8. Failure handling

- A failing check is investigated, not silenced: no skipped, disabled or loosened tests, no refreshed hashes to get green.
- Flaky CI: re-run once. A second failure is real.
- If a blocker is independent of other work, log it under "Waiting on the user", and continue with whatever is unblocked.
- If the usage limit is hit mid-task, nothing is lost: everything is committed and `docs/RESUME.md` says where to continue. The user resumes with `claude --continue` and types "continue".

## 9. Checkpoint report (keep it to one page)

Write `docs/checkpoints/CHECKPOINT_<n>.md`:

1. What was built (a bullet per deliverable, with paths).
2. Checks run and results (counts, not logs), including any not run and why.
3. Decisions made (links to `docs/DECISIONS_LOG.md` entries).
4. Deviations from the plan, and any plan text that should change (propose, do not edit phase order or scope).
5. Known gaps and the next phase's prerequisites.
6. Anything waiting on the user (usually empty).

Update the checkpoint table in `STATUS.md` (one line) and `docs/RESUME.md`.

## 10. Safety and permissions

- `.claude/settings.json` allows routine development commands and denies force-push, pushes to `main`, `git reset --hard`, `git clean`, `rm -rf`, `sudo`, and edits to `upstream/` and `packages/gen-orogen/vendor/`. If a routine command prompts, run `/permissions` and allow it; do not work around a deny.
- Scope (decision W7): personal project, desktop software for macOS and Windows; Firefox and Chromium only. No WebKit/Safari, no Linux support target, no public hosting. This supersedes any three-browser or web-hosting wording in earlier checkpoints.
- The user should enable branch protection on `main` on GitHub (require a pull request) as the backstop.
- Nothing here lets the agent contact other people, publish, or deploy.
