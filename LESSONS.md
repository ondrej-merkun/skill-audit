# LESSONS.md — things the loop learned the hard way

Ralph (and any human contributor) MUST read this file at the start of every
session, before picking a task. When you finish a task and notice something
that belongs here — a surprise, a near-miss, a "next time I'll…" — append it
as a new numbered lesson in the appropriate section. One lesson per bullet,
terse, with the concrete rule + the incident that proved it.

**Format per lesson:**
> **LN.M — One-line rule.** _What went wrong (commit/task if known)._
> What to do instead.

New lessons go at the bottom of the relevant section. Never delete a lesson
without a commit message explaining why it no longer applies.

---

## 1. Verification — "tests pass" is not "it works"

- **L1.1 — Run the damn binary.** _Task 3.1 rule engine passed all tests
  and shipped a 5-minute scan hang because no iteration ever ran
  `node packages/cli/dist/index.js scan` against a real `~/.claude`._
  For any task touching `src/commands/` or output code, execute the built
  binary against real input before committing. Paste 5–10 lines of
  observed output into the commit body.

- **L1.2 — `pnpm typecheck` is non-optional, even when CI is "green".**
  _CI failed on Node 22 × macOS from task 11.1 onward; no iteration ran
  `pnpm typecheck` locally after task 1.4._
  Run `pnpm typecheck` before every commit. It's cheap and catches
  version/tsconfig drift that `pnpm build` misses.

- **L1.3 — Build warnings are failures.** _The `"types"` after `"import"`
  warning from tsup was visible on every build for 50 iterations and
  went unreported because "no compile error" was treated as "clean"._
  `pnpm build 2>&1 | grep -iE 'warn|error'` must emit nothing. Fix
  warnings the same iteration they appear.

- **L1.4 — Chalk-styled output must be ANSI-stripped in tests.** _Task
  5.3 `renderSummaryCompact` asserted `toContain('2 compromised')` but
  the runtime output was `\x1b[38;2;255;68;68m2\x1b[39m compromised`.
  Vitest's non-TTY child process hid it; `FORCE_COLOR=1` surfaced it.
  Task 12.2/root `42ac1fb` proved the same audit must cover all
  chalk-styled command/output assertions, not just the failing line._
  Use `stripAnsi(out)` around every chalk assertion. Tests must pass
  with AND without `FORCE_COLOR=1`.

- **L1.5 — Verify every markdown link/image resolves on disk.** _README
  linked to `docs/logo.svg` and `LICENSE`, neither existed._
  Before committing any markdown change, confirm each referenced path
  exists. If you reference it, create it (or delete the reference).

- **L1.6 — Typecheck repo-level tests, not just package src.** _Task
  12.5 added root `tsconfig.json` coverage and immediately caught an
  over-broad `process.exit` spy type in `test/explain.test.ts`._
  Keep test/config files in the root typecheck surface so CI sees
  assertion-helper drift before runtime.

- **L1.7 — Do not `process.exit(1)` immediately after writing machine output.** _Task
  12.8 remote CI passed locally but Node 20 on macOS truncated `scan --json`
  stdout before Vitest could parse it._
  Set `process.exitCode` for normal verdict exits so stdout/stderr can flush.

- **L1.8 — Do not run build and e2e tests in parallel.** _Task 13.2 saw
  `--help` exit 1 because `pnpm build` cleaned `dist/` while Vitest was
  executing the built binary._
  Run build and test as separate sequential verification steps.

- **L1.9 — Capture built-CLI e2e output through files when Node pipe stdio is unreliable.** _Task 0.1 saw `execFile('node', ...)` exit 0 with empty stdout/stderr under the local sandbox while file-backed stdio captured the real output._
  Keep e2e helpers executing the built binary, but avoid depending on piped
  Node child stdout when the environment drops it.

- **L1.10 — `scan` does not take a positional fixture path.** _Task 16 first ran `node packages/cli/dist/index.js scan test/fixtures/...` and accidentally scanned the real discovered home skills._
  For built-CLI fixture checks, create a temp home/project and use `HOME`,
  `USERPROFILE`, and `SKILLAUDIT_CWD` discovery overrides.

- **L1.11 — Documented maintenance commands must exist and run.** _Task 22 found `anthropic-skills.json` pointing at missing `scripts/vendor-allowlist.ts` and unavailable `tsx`._
  Run any command you document for regenerating shipped data before committing
  the data it produces.

## 2. Discovery & spec-reading — disambiguate depth explicitly

- **L2.1 — "Plugins" paths are multi-level; walk the full tree.** _Task
  2.2 `discoverPluginDirs` treated `~/.claude/plugins/<marketplace>/` as
  one skill. Real layout is `plugins/<marketplace>/<plugin>/skills/
  <skill>/SKILL.md`. User with hundreds of installed skills saw 20._
  When a spec says `~/.claude/plugins/` without depth, walk recursively
  and emit one Skill per leaf SKILL.md / plugin.json. Never interpret
  the shallowest reading of an ambiguous path.

- **L2.2 — If the spec is ambiguous, ask or write a Decision.** _Task
  2.2 chose the shallow reading silently. Logged no decision. No human
  review surfaced it until scan results were wrong._
  When you face a path/format ambiguity, either (a) ask the user, or
  (b) pick the more thorough interpretation AND log the choice under
  "Decisions made during implementation" in `fix_plan.md`.

- **L2.3 — Spec invariants must become types and cross-boundary tests.** _Post-mortem
  issue 1: dedupe by `treeSha256` lived in `specs/DISCOVERY.md`, but
  `Skill` had no `alsoInstalledAt` field and `discoverAll()` only concatenated
  plugin output._
  When a spec says "always" or "must", update the shared type/output contract
  and add a test at the layer that owns the invariant, not only per-plugin
  fixture tests.

## 3. Identity & author metadata — never guess

- **L3.1 — Never transcribe filesystem paths into author identity.**
  _Task 10.4 README used the wrong GitHub handle in several URL
  references, deduced from the `/Users/ondra/` path._
  Identity lives in `CLAUDE.md § Identity`. Pull the handle, package
  name, and byline from there verbatim. If the field doesn't exist
  yet, ask — don't guess from paths or git metadata.

## 4. Architecture & performance — think before locking in

- **L4.1 — Performance is emergent; design for it before coding.** _Task
  3.1 picked worker-thread-per-pattern without a back-of-envelope cost
  calc. At 500 skills that's ~200k worker spin-ups (~50–100 ms each),
  dwarfing the actual regex work._
  For any task whose output is called in a tight loop (per file, per
  pattern, per skill), do the multiplication first. If the product
  exceeds the spec's performance budget (< 10 s for 500 skills), pick
  a different architecture BEFORE writing code.

- **L4.2 — Fixture sizes hide emergent pathologies.** _10-file fixtures
  masked the worker-spin-up cost that destroyed real-world runs._
  E2E tests must include at least one run against a "realistic" fixture
  size (100+ files). Catching 10× headroom is the point of e2e tests.

- **L4.3 — Regex safety heuristics must run against all rule fixtures.** _Task
  12.7 initially skipped PI-OVERRIDE and PI-EXFIL-TRIGGER-CLAUSE because
  optional groups looked like catastrophic nested quantifiers._
  After changing regex execution safety, run the full rule-fixture suite before
  trusting scan performance.

## 5. Orphans, cleanup, and the one-task-per-loop rule

- **L5.1 — Delete direct predecessors in the same commit.** _Task 1.7
  created `test/smoke.test.ts` with the same purpose as `packages/cli/
  test/smoke.test.ts` from task 1.3. Ralph logged "Both smoke tests
  pass" and left both in place._
  "One task per loop" forbids freelance cleanup, but NOT cleanup of a
  file that THIS task directly supersedes. Delete the predecessor in
  the same commit. See `PROMPT.md § Orphan exception`.

## 6. Loop hygiene

- **L6.1 — Iteration logs should record falsifiable claims, not vibes.**
  _Roughly 20/54 iterations emitted "★ Insight" blocks justifying
  design choices retroactively. These are post-hoc reassurance, not
  measurement._
  Either move insight blocks to an appendix file, or require they be
  falsifiable ("chose X over Y; Y measured at 3× overhead"). Kill the
  "the DRY extraction here isn't just style — it ensures…" pattern.

- **L6.2 — Branches and CI are not optional loop targets.** _The loop
  committed straight to `main`. CI only ever ran on GitHub, which
  Ralph never checked. Type errors on Node 22 shipped to master._
  Run CI equivalents locally (`act` if feasible, or at minimum the
  exact commands CI runs: `pnpm install && pnpm build && pnpm test &&
  pnpm lint && pnpm typecheck`) before pushing.

- **L6.3 — Output is product behavior, not renderer text.** _Post-mortem issue
  2: table, JSON, and HTML scan outputs used different ordering semantics, and
  non-HTML formats had no first-class file destination._
  For user-facing command/output tasks, check whether the first screen tells
  users what to fix first, whether machine and human outputs agree, and whether
  users can save/share the result through normal CLI affordances.

## 7. Rule fixtures

- **L7.1 — Malicious secret fixtures must not use provider placeholder keys.** _Task
  20 found `SEC-HARDCODED-KEY` treating AWS's `AKIAIOSFODNN7EXAMPLE` docs
  placeholder as malicious evidence._
  Use plausible non-placeholder values in malicious fixtures; reserve canonical
  docs/test values for benign placeholder coverage.

- **L7.2 — Do not rewrite benign rule fixtures as package-facing docs.** _Task
  24 changed a benign `DEPS-INLINE-INSTALL` install example and made the fixture
  look like runtime skill installation._
  Keep fixture wording tied to the rule scenario unless the task is explicitly
  changing that rule.

---

## How to add a new lesson

1. In the task where you learned it, before committing, append one bullet
   to the appropriate section above. Use the next `LN.M` number.
2. Keep it terse. One rule, one incident, one instruction. If you need
   three paragraphs, you're writing a design doc — put that elsewhere
   and link to it.
3. Commit the LESSONS.md change in the SAME commit as the fix that
   prompted it (not the checkbox-flip commit). This keeps the lesson
   married to the evidence.

## What does NOT belong here

- Generic best-practice advice ("write tests"). Only hard-won, project-
  specific lessons.
- Things already enforced by `CLAUDE.md` / `AGENT.md` / `PROMPT.md`. If
  the rule is mechanical and can be checked, codify it there — LESSONS.md
  is the narrative companion, not the enforcement mechanism.
- Resolved bugs with no general lesson. Those belong in commit messages.
