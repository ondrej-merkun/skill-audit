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

- **L1.12 — Smoke-test the exact documented CLI invocation.** _Post-mortem
  issue: the spec said bare `skill-audit` was equivalent to `skill-audit scan`,
  but Commander had no root action and the binary did nothing._
  If a command table, README, action, or example documents an invocation, run
  that exact built binary invocation before calling the task done.

- **L1.13 — String checks do not prove HTML interactions work.** _Post-mortem
  issue: the HTML report had agent-sidebar links, but clicking them did not
  filter the report for the user._
  For generated HTML controls, execute the page script in a browser/DOM smoke
  test and assert the visible state changes after click/keyboard events.

- **L1.14 — README images need browser-rendered proof, not just existing paths.** _Post-mortem
  issue: a README SVG existed, then task 20 hand-edited it again after reading
  CLI output, but unmeasured SVG text still overlapped in the README._
  Render changed docs images at their embedded README/GitHub dimensions in a
  browser or image renderer. If the asset is hand-authored, check text bounds
  for every label/line; no renderer means the task is blocked, not done.

- **L1.15 — Faked TTY tests need TTY cursor methods, not just `isTTY`.** _Task
  8 progress tests set `process.stderr.isTTY = true`, then `ora` crashed because
  the sandbox stream lacked `cursorTo`._
  When testing interactive spinners, either exercise the reporter directly or
  stub `cursorTo`, `clearLine`, and `moveCursor` with the TTY flag.

- **L1.16 — Public README contract snippets may be intentionally duplicated.**
  _Task 19 moved dense CI docs out of README and `test/e2e.test.ts` caught the
  missing `uses: ondrej-merkun/skill-audit@v1` snippet._
  When slimming docs, keep compact public install/action snippets where tests
  assert them, or update the product contract deliberately.

- **L1.17 — Status taxonomy tests must prove each status is produced.** _Task 5
  initially added `no-input` as a type/formatter state without wiring any
  provider path to emit it._
  For source-status work, add aggregation tests that force every public status
  through the production producer, not only renderer/unit formatting tests.

- **L1.18 — Undocumented enrichment endpoints must be live-checked before patching mocks.** _Task 7 found `add-skill.vercel.sh/audit` had drifted from POST body to GET query parameters._
  Record the observed request/response shape in tests and keep stale provider
  failures from becoming successful zero-value enrichment.

- **L1.19 — Fake HTTP servers need async CLI children.** _Task 14 local LLM docs
  smoke test first reported timeouts because `spawnSync` blocked the same Node
  event loop that was supposed to serve `/v1/chat/completions`._
  When a smoke test starts an in-process server, use async child processes or a
  separate server process so the server can answer while the CLI runs.

- **L1.20 — Do not run multiple Vitest invocations in parallel.** _LLM review
  reliability bug verification launched two `pnpm test -- <file>` commands at
  once; each expanded to the full configured suite and produced unrelated temp
  directory/cache noise in enrichment tests._
  Use `pnpm exec vitest run <file>` for focused tests, and run full-suite
  verification as one sequential `pnpm test`.

- **L1.21 — Run `npm publish --dry-run`, not only `pack --dry-run`.** _The
  first public package preflight showed `pnpm pack --dry-run` passing while
  `npm publish --dry-run --access public` warned that npm would auto-correct the
  `bin` and repository metadata._
  Before publishing, run the publish dry-run from `packages/cli` and fix any
  manifest normalization warnings so the packed CLI still installs a working bin.

- **L1.22 — Re-run package metadata tests after manifest normalization.** _Commit
  `525b3df` normalized npm `bin` and repository metadata after publish dry-run,
  but pushed before `pnpm test`, leaving CI with stale e2e expectations._
  After changing package metadata, rerun `pnpm exec vitest run test/e2e.test.ts`
  or the full suite and update the documented package contract before pushing.

- **L1.23 — Root CLI shortcuts must not duplicate subcommand option parsers.** _The
  root `skill-audit --agent claude-code` fix first accepted root flags by adding
  scan options to the root command, but full e2e showed `skill-audit scan --json`
  silently fell back to table output._
  Route root shortcuts into the real subcommand parser and run both bare and
  explicit-subcommand e2e coverage before calling CLI flag work done.

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
  "Decisions made during implementation" in `.ralph/fix_plan.md`.

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

- **L3.2 — External GitHub URLs need repository verification, not string assembly.**
  _Post-mortem issue: a README CI link pointed to a GitHub Actions URL that
  returned 404._
  Treat action examples, repository URLs, and npm trusted-publisher
  settings as external contracts. Verify the exact owner/repo/workflow target
  before changing them; if the canonical slug is missing from `CLAUDE.md`, ask.

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

- **L4.4 — Do not disable Vitest isolation without proving state cannot leak.**
  _The Ralph-loop perf pass tried `pnpm exec vitest run --no-isolate`; it was
  faster but failed scan, enrichment, and cache tests because mocks/env/cache
  state leaked between files._
  Keep isolation on unless the suite is first split so mock-heavy tests remain
  isolated and the no-isolate tier is proven green.

- **L4.5 — Rename contracts when performance fixes change guarantees.** _The
  regex worker hot path was replaced by safety preflight checks, but the engine
  API and docs still claimed a hard regex timeout._
  When replacing hard isolation/timeouts with heuristics, update names, tests,
  and docs in the same change so security guarantees stay explicit.

## 5. Orphans, cleanup, and the one-task-per-loop rule

- **L5.1 — Delete direct predecessors in the same commit.** _Task 1.7
  created `test/smoke.test.ts` with the same purpose as `packages/cli/
  test/smoke.test.ts` from task 1.3. Ralph logged "Both smoke tests
  pass" and left both in place._
  "One task per loop" forbids freelance cleanup, but NOT cleanup of a
  file that THIS task directly supersedes. Delete the predecessor in
  the same commit. See `.ralph/PROMPT.md § Orphan exception`.

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
  users can save or export the result through normal CLI affordances.

- **L6.4 — Re-check release-tool minimums before changing publish workflows.** _Task
  40 found npm trusted publishing needs newer Node/npm than the existing Node 20
  release job._
  Verify the current registry docs before editing OIDC/provenance release steps.

- **L6.5 — A visible output column needs a real populated-path test.** _Post-mortem
  issue: the default scan table shipped an enrichment column that was empty in
  real output while renderer tests used synthetic enrichment objects._
  For any new column, footer, or panel, test a realistic end-to-end populated
  path and a clear empty/unavailable path, not only the renderer helper.

- **L6.6 — The README first screen has a budget.** _Post-mortem issue: repeated
  docs tasks made the README accurate but too long and table-heavy for a first
  impression._
  Put concise install, scan, and interpretation content above the fold; move
  deep comparisons, privacy detail, and examples into `docs/` unless they earn
  their space on the front page.

- **L6.7 — Enrichment checkmarks must mean data, not "the batch did not throw".**
  _Post-mortem issue: skills.sh and deps.dev appeared successful in progress
  output even when they returned no displayable metadata, and GitHub contributor
  lookup failures were rendered as `0 contributors`._
  Track source-level states. Distinguish not-applicable, no metadata,
  unavailable, stale-cache, and found-data; render unknown numeric metadata as
  unavailable/unknown, never as zero.

- **L6.8 — External enrichment mocks must be contract-derived.** _Post-mortem
  issue: enrichment tests mocked the response shapes the implementation already
  expected, while the spec and public API docs used different paths/payloads._
  Before shipping skills.sh, GitHub, or deps.dev changes, verify the current
  endpoint/client contract or docs and make tests mirror that contract plus one
  realistic installed-skill fixture.

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

- **L7.3 — Security education is a first-class benign corpus.** _Post-mortem
  issue: security-auditor and skill-testing packages triggered strong false
  positives because rules matched attack vocabulary in explanations/examples._
  Prompt-injection and code-risk rules must include benign fixtures for quoted
  attacks, red-team training, scanner docs, and test fixtures; fire on
  operative instructions or executable behavior, not vocabulary alone.

- **L7.4 — "Malicious" fixtures are not automatically compromised.** _Task 2
  initially used a malicious fixture that produced findings but no FAIL verdict
  for a compromised-percentage regression._
  Tests for compromised counts must use a mandatory-fail rule or assert the
  fixture's verdict before relying on it.

- **L7.5 — Fenced markdown in `SKILL.md` can be active instructions.** _Task 15
  initially masked all fenced blocks and silenced the malicious pipe-to-shell
  fixture._
  Only suppress fenced content for rules where fenced examples are truly inert;
  command snippets in skill instructions may still be intended to run.

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
- Things already enforced by `CLAUDE.md` / `docs/agents/AGENT.md` / `.ralph/PROMPT.md`. If
  the rule is mechanical and can be checked, codify it there — LESSONS.md
  is the narrative companion, not the enforcement mechanism.
- Resolved bugs with no general lesson. Those belong in commit messages.
