---
description: Continue MapMaker autonomously from where docs/RESUME.md says, up to the authorized limit
---

You are continuing MapMaker with no instructions from the user. Do not ask what to do; the repo says. Keep chat messages to a few lines.

## 1. Orient (read, do not re-derive)

1. Read `AGENTS.md`, `docs/OPERATING_GUIDE.md`, `docs/RESUME.md` and `docs/DECISIONS_LOG.md`. Read `docs/RELEASING.md` only when shipping or testing the desktop app is relevant.
2. Run `git status --short --branch`, `git log --oneline -15` and `gh pr list --state all --limit 8`. Preserve existing edits; a change of agent or session is not a reason to redo work.
3. Work out the branch and the next unfinished item:
   - "Authorized through" and "Next" in `docs/RESUME.md` say what is allowed and what comes next. Nothing beyond the limit is ever started.
   - If the previous phase's PR was merged (`git fetch`, check `main`), create the next phase branch from updated `main`. If it was not merged, create the next phase branch from the current branch. Open or update a draft PR for it with `gh pr create` or `gh pr edit` at the first push.
   - If the user's `authorize-*` PR is the only change on `main` since your branch, merge `main` into your branch and continue.
4. If `docs/ARCHITECTURE.md` §7 lists a **Prerequisite** for the next phase, do it first: documentation only, following `docs/reconciliation/README.md` (method §4 and the reusable prompts in §5; read `docs/reconciliation/review.md` first). Use Sonnet subagents for per-repo sweeps and check the key facts yourself before editing. Record the result in `docs/reconciliation/` (a `group-<phase>.md`, and update the status tables) and make one commit per group. Never change code, `upstream/` or `packages/gen-orogen/vendor/` in a reconciliation.
5. If the next phase needs a prompt, write it yourself from `docs/reconciliation/README.md`, `docs/ARCHITECTURE.md` §7 and the design notes. Never ask the user for one.

## 2. Work

Work through "Next" in `docs/RESUME.md` up to the "Authorized through" limit, following the operating guide: decide rather than ask (record non-obvious choices in `docs/DECISIONS_LOG.md`), stop only at its §4 hard stops, lean checks (§5), the milestone cycle (§7), commit and push each milestone, update `docs/RESUME.md` at each milestone. At each earlier phase checkpoint write the checkpoint report (§9), push, and continue.

## 3. Standing rules

- Never poll: no sleep or until loops, no repeated status checks. Start a long job in the background, do other work, check once.
- Commit before any `git checkout`, `git switch`, `git restore` or other command that overwrites files.
- Do not update, upgrade or audit-fix dependencies unless a check fails because of them.
- Supported targets (W7): Firefox and Chromium; macOS and Windows desktop only. No WebKit, no Linux target, no hosting.
- Do not run heavy jobs in parallel (full tests, e2e, builds, benchmarks, the Electron smoke test).
- For changes touching `apps/web`, the engine or `apps/desktop`, run the Electron smoke test before the checkpoint (`scripts/node24.sh npm run desktop:smoke` after a build; details in `docs/RELEASING.md`).
- Building and testing the desktop app is your job. Publishing releases, signing and spending money are the user's: never do them.
- Never push to `main`, never merge a PR, never edit the "Authorized through" line, never run `scripts/authorize.sh` (they are the user's).
- Never skip, loosen or disable a test, and never refresh a hash to get green; investigate.

## 4. At the authorized limit

1. Write the checkpoint report (`docs/checkpoints/CHECKPOINT_<n>.md`), add the `STATUS.md` checkpoint line, and update `docs/RESUME.md`.
2. Rewrite "What the user does next" at the top of `docs/RESUME.md` (see its format there): the PR to merge as a merge commit, what to check in CI first, and the exact `scripts/authorize.sh <checkpoint>` command for the next checkpoint, chosen as a natural review point.
3. Push, mark the PR ready for review, and stop. Final chat message: at most 15 lines, ending with what the user does next.

"What the user does next" is also updated at every milestone and at every stop (including a hard stop), never left stale.
