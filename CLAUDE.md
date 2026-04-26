# skillaudit

A CLI that scans installed AI agent skills (Claude Code, Cursor, Copilot,
Codex, Gemini, Windsurf, Cline) for prompt injection and malicious code.
Local-first, zero-auth, published as `npx skillaudit`.

Full spec: **`specs/SPEC.md`**. Ralph loop protocol: **`PROMPT.md`**.
Workflow conventions: **`AGENT.md`**. Task list / progress: **`fix_plan.md`**.
**Hard-won lessons (READ AT SESSION START): `LESSONS.md`.** Append a new
bullet there whenever a task teaches something a future run would benefit
from — see the instructions at the top of that file.

> **Spec rev: 2026-04-26 (post-mortem v2)** — discovery dedupe contract,
> Codex active-cache guardrail, and output product-sanity criteria added.

## Identity

- GitHub handle: `ondrejmerkun`
- npm package name: `skill-audit`
- Author byline (README, blog, HN): "Ondrej Merkun"

Never guess these from paths, filesystem layout, or commit metadata.
If a task needs a URL like `github.com/<handle>/skillaudit`, pull
the handle from this section verbatim.

## Tech stack

TypeScript (strict) on Node 20+, pnpm workspaces, tsup (CJS+ESM+dts),
commander, chalk v5, cli-table3, ora, listr2, vitest, biome.

Do NOT add: ink, react, yargs, jest, eslint, prettier, axios (use native
fetch), lodash, or anything needing `node-gyp`. If a new dep is genuinely
needed, note it in `fix_plan.md` under "Dependencies added".

## Commands (exact strings — use verbatim)

```bash
pnpm install          # install deps
pnpm build            # tsup — must produce clean dist/
pnpm test             # vitest run — all tests must pass
pnpm lint             # biome check — may warn, must not error
pnpm typecheck        # tsc --noEmit — must pass
```

One top-level `pnpm test` runs everything. Do not introduce additional
test runners or split the test command.

## Directory map

```
packages/cli/          @skillaudit/cli — the npm package that becomes `npx skillaudit`
  src/commands/        scan, list, explain, ignore
  src/discovery/       per-agent plugins (claude-code, cursor, copilot, agents-md-sweep)
  src/rules/           27 rules grouped by category (pure regex)
  src/enrich/          skills.sh, github, deps.dev + cache
  src/output/          table (TUI), json, html, summary
  src/score.ts         scoring + verdict bands + mandatory-fail overrides
  src/allowlist/       anthropic-skills.json tree-hash allowlist
packages/skill/        SKILL.md wrapper (meta: skillaudit's own Claude Code skill)
test/fixtures/         malicious-* and benign-* skill trees (one pair per rule)
specs/                 SPEC.md (full spec) + focused extracts (RULES, OUTPUT, DISCOVERY)
```

## Project gotchas (the things that burn time if you don't know)

- **Every rule ships with ≥2 fixtures**: one malicious (must fire) and one
  benign (must not fire). Without both, the rule doesn't land. Put them
  under `test/fixtures/<rule-id>/{malicious,benign}/`.
- **Never weaken a rule to make a test pass.** If a rule is too aggressive,
  adjust the fixture, add an allowlist entry, or lower severity — don't
  silently narrow the regex until failure stops.
- **Regex patterns use Node's native `RegExp` with a 500ms per-pattern
  timeout wrapper** (see `src/rules/engine.ts`). This prevents catastrophic
  backtracking. Do not call `.exec()` / `.test()` directly on user-sourced
  content outside that wrapper.
- **Discovery plugins run against temp dirs in tests**, not the real home
  dir. Use the `HOME` / `USERPROFILE` env override in tests — never touch
  `os.homedir()` in the plugin itself without that indirection.
- **Allowlist (`src/allowlist/anthropic-skills.json`) is a static file
  regenerated manually** per release via `scripts/vendor-allowlist.ts`.
  Do not fetch it at runtime. Do not edit entries by hand except to add
  new allowlisted vendors.
- **Discovery dedupes by content, not by path.** `discoverAll()` owns
  cross-plugin normalization: non-empty `treeSha256` duplicates collapse
  into one skill, with duplicate paths preserved in `alsoInstalledAt`.
  Empty hashes are config-derived entries and must stay separate.
- **Plugin caches are not automatically active skills.** Do not scan a
  cache subtree just because it exists. Codex and other plugin discovery
  must prove a cached payload is enabled/exposed before treating it as a
  scan target.
- **Enrichment always fails silently with stale-cache fallback.** Network
  timeouts are 5 seconds, never blocking. Offline is a first-class mode.
- **JSON output is a contract** — schema version 1.0, deterministic field
  order, see `specs/OUTPUT.md`. Do not add, rename, or reorder fields.
- **Scan output is product behavior.** Table, summary, JSON, HTML, and
  file output must agree on risk-first ordering and should make the next
  action obvious from the first screen.

## What "done" means for any task

1. Feature implemented per the relevant spec section.
2. New code has tests; `pnpm test` passes.
3. `pnpm build` produces a clean `dist/`.
4. `pnpm lint` produces no errors (warnings fine).
5. `pnpm typecheck` passes (no `tsc --noEmit` errors on ANY package).
6. `pnpm build 2>&1 | grep -iE 'warn|error'` emits nothing. Build
   warnings count as failures — fix them before committing.
7. For any task that ships a user-facing command or artefact: execute it
   against a real input (`node packages/cli/dist/index.js scan` against
   `$HOME`, or open the generated HTML / README / action.yml). Paste the
   observed output into the commit message or reject the task.
8. For scanner/reporting output changes: verify product behavior, not
   just rendering. Check ordering, prioritization, file/export
   ergonomics, and consistency across human and machine formats.
9. For any task that adds a file reference (image, link, badge) to a
   markdown file: verify the referenced path resolves on disk. Broken
   links block the commit.
10. `fix_plan.md` checkbox flipped to `- [x]`.
11. Two conventional commits: one for the feature, one for the checkbox.

## Never

- Commit secrets (test fixtures in `test/fixtures/` are fine — those are
  meant to look like secrets, for detection testing).
- Delete a failing test — fix it.
- Add a dependency without recording it in `fix_plan.md`.
- Fetch rules from the internet at runtime — rules ship in the bundle.
- Touch `scripts/run-ralph.sh` unless Ralph is explicitly asked to.

## When spec and conventions disagree

`specs/SPEC.md` wins on *what* to build. `CLAUDE.md` / `AGENT.md` win on
*how* to structure the code. Genuine conflicts go in `fix_plan.md` under
"Spec-vs-convention conflicts" and default to the spec.
