# MapMaker

Shared project instructions for Claude Code and Codex:

@AGENTS.md

Read `docs/OPERATING_GUIDE.md` and `docs/RESUME.md` at session start (they say what is authorized and where to continue), then `STATUS.md`. Update the full `STATUS.md` handoff only when the user says they are switching agents (see `AGENTS.md`). Keep shared rules in `AGENTS.md`, rather than duplicating them here.

## Every session starts as `/go`

On the user's first message, however short ("go", "continue", "hi"), behave exactly as if `/go` had been typed: follow `.claude/commands/go.md` (orient from `AGENTS.md`, `docs/OPERATING_GUIDE.md`, `docs/RESUME.md`, work up to "Authorized through", stop with a summary of at most 15 lines). A message that is a specific request still gets done, but read the same files first.

Standing rule: the user never writes prompts. Write any prompt a later phase needs yourself, from `docs/reconciliation/README.md` (its reusable prompts), `docs/ARCHITECTURE.md` §7 and the design notes; never ask the user for one. The user's only actions are in "What the user does next" at the top of `docs/RESUME.md`; keep it current at every milestone and every stop. The agent never runs `scripts/authorize.sh` and never edits the "Authorized through" line.
