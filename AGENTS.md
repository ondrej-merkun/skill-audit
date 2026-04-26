# AGENTS.md — entry point for any AI coding agent

This file is the auto-loaded entry point for Codex CLI, OpenAI agents,
and any other tool that follows the AGENTS.md convention. Claude Code
auto-loads `CLAUDE.md` instead, but reads the same canonical files
listed below.

## Read these in order, every session

1. **`LESSONS.md`** — hard-won lessons from prior runs. Mandatory skim
   at session start. Append a new bullet whenever a task teaches
   something a future run would benefit from (see the format
   instructions at the top of that file).
2. **`AGENT.md`** — repo conventions: tech stack, build/test/lint
   commands, TypeScript style, testing rules, commit format, and the
   "what done means" checklist.
3. **`CLAUDE.md`** — project overview, identity (`ondrejmerkun` /
   `skill-audit`), spec-revision marker, gotchas, and the same
   done-means checklist. The Identity section is canonical — never
   guess handles or names from filesystem paths.
4. **`PROMPT.md`** — Ralph loop protocol. Read in full at the start of
   each iteration. Step 4b ("Capture any new lesson") is the hook
   that keeps `LESSONS.md` current.
5. **`fix_plan.md`** — the prioritized task list. Pick the **first
   unchecked task** (`- [ ]`), implement only that one, commit, exit.

## Spec & task references

- Full spec: `specs/SPEC.md` (current rev: 2026-04-26 post-mortem v2).
- `fix_plan.md` contains the current post-mortem fix queue ordered by
  implementation dependency.

## Build / test / lint commands (verbatim)

```bash
pnpm install          # only if you changed package.json
pnpm build            # tsup — must produce clean dist/, NO warnings
pnpm test             # vitest run — all tests must pass
pnpm lint             # biome check — may warn, must not error
pnpm typecheck        # tsc --noEmit — must pass on every package
```

## Hard rules (loop-driver agnostic)

- **One task per iteration.** No freelance refactoring, no
  "while I'm here". The orphan exception in `PROMPT.md` is the only
  permitted cleanup.
- **Never weaken a rule to make a test pass.**
- **Never delete a failing test** — fix it.
- **Never commit secrets.** Test fixtures under `test/fixtures/`
  intentionally look like secrets — those are expected.
- **Never push to `main` without `pnpm typecheck` passing locally.**
  CI runs it on Node 20 + 22; you should too.

## Loop driver scripts

- Claude Code: `scripts/run-ralph.sh`
- Codex CLI: `scripts/run-ralph-codex.sh`

Both are time-bounded; both stop cleanly between iterations once the
budget elapses or `fix_plan.md` reaches `ALL TASKS COMPLETE`. They
never kill an iteration mid-flight.
