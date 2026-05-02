# skill-audit

A CLI that scans installed AI agent skills (Claude Code, Cursor, Copilot,
Codex, Gemini, Windsurf, Cline) for prompt injection and malicious code.
Local-first, zero-auth, published as `@ondrej-merkun/skill-audit` with the
`skill-audit` bin.

Full spec: **`specs/SPEC.md`**. Ralph loop protocol: **`PROMPT.md`**.
Workflow conventions: **`AGENT.md`**. Task list / progress: **`fix_plan.md`**.
**Hard-won lessons (READ AT SESSION START): `LESSONS.md`.** Append a new
bullet there whenever a task teaches something a future run would benefit
from — see the instructions at the top of that file.

> **Spec rev: 2026-04-26 (post-mortem v2)** — discovery dedupe contract,
> Codex active-cache guardrail, and output product-sanity criteria added.

## Identity

- GitHub handle: `ondrej-merkun`
- GitHub repository: `https://github.com/ondrej-merkun/skill-audit`
- npm package name: `@ondrej-merkun/skill-audit`

Never guess these from paths, filesystem layout, or commit metadata.
If a task needs a personal handle, package name, or byline, pull it
from this section verbatim.
Repository URLs, badges, action examples, and trusted-publishing settings
need the exact public owner/repo/workflow target, not just a handle and
package name. If that target is not explicitly present here, verify it
against the actual GitHub repository before editing those docs, or ask.

## Tech stack

TypeScript (strict) on Node 20+, pnpm workspaces, tsup (dev CJS+ESM,
release CJS+ESM+dts),
commander, chalk v5, cli-table3, ora, listr2, vitest, biome.

Do NOT add: ink, react, yargs, jest, eslint, prettier, axios (use native
fetch), lodash, or anything needing `node-gyp`. If a new dep is genuinely
needed, note it in `fix_plan.md` under "Dependencies added".

## Commands (exact strings — use verbatim)

```bash
pnpm install          # install deps
pnpm build            # tsup — must produce clean dist/
pnpm build:release    # tsup release build — includes declaration files
pnpm test             # vitest run — all tests must pass
pnpm lint             # biome check — may warn, must not error
pnpm typecheck        # tsc --noEmit — must pass
```

One top-level `pnpm test` runs everything. Do not introduce additional
test runners or split the test command.

## Directory map

```
packages/cli/          @ondrej-merkun/skill-audit — npm package, exposes the `skill-audit` bin
  src/commands/        scan, list, explain, ignore
  src/discovery/       per-agent plugins (claude-code, cursor, copilot, agents-md-sweep)
  src/rules/           27 rules grouped by category (pure regex)
  src/enrich/          skills.sh, github, deps.dev + cache
  src/output/          table (TUI), json, html, summary
  src/score.ts         scoring + verdict bands + mandatory-fail overrides
  src/allowlist/       anthropic-skills.json tree-hash allowlist
packages/skill/        SKILL.md wrapper (meta: skill-audit's own Claude Code skill)
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
- **Enrichment status must not lie.** A source is not successful just because
  the enrichment batch completed. Keep source-level states distinct enough to
  show found data, no metadata, not applicable, unavailable, and stale cache.
  Unknown counts are not zero counts: if GitHub contributors or deps.dev
  advisories cannot be fetched, render unavailable/unknown rather than `0`.
- **External enrichment contracts drift.** Before changing skills.sh, GitHub, or
  deps.dev code/tests, verify the current API docs, official client behavior, or
  a live response shape. Mocks that only reflect the implementation's current
  assumptions do not prove the integration works.
- **JSON output is a contract** — schema version 1.0, deterministic field
  order, see `specs/OUTPUT.md`. Do not add, rename, or reorder fields.
- **Scan output is product behavior.** Table, summary, JSON, HTML, and
  file output must agree on risk-first ordering and should make the next
  action obvious from the first screen.
- **Documented invocations are contracts.** If the spec, README, examples,
  or action says `skill-audit` works without a subcommand, or documents any
  other exact command string, the built binary must be smoke-tested with that
  exact invocation.
- **Generated HTML must be tested as an interactive file.** Sidebar filters,
  toolbar buttons, copy/download actions, and detail panels need DOM/browser
  verification; string containment only proves markup exists.
- **Rule fixtures need security-education benign cases.** Scanner docs,
  red-team examples, quoted attacks, and test fixtures often contain hostile
  vocabulary without being hostile instructions.
- **README visuals are product surface.** SVGs, screenshots, badges, and demo
  assets must be rendered in a browser or image renderer at their embedded size
  and checked for clipping, overlap, stale output, and broken external targets.
  Hand-authored SVG text needs explicit bounds/spacing checks; do not mark a
  visual task done when no renderer is available.

## What "done" means for any task

1. Feature implemented per the relevant spec section.
2. New code has tests; `pnpm test` passes.
3. `pnpm build` produces a clean `dist/`.
4. `pnpm lint` produces no errors (warnings fine).
5. `pnpm typecheck` passes (no `tsc --noEmit` errors on ANY package).
6. `pnpm build 2>&1 | grep -iE 'warn|error'` emits nothing. Build
   warnings count as failures — fix them before committing.
7. For any task that ships a user-facing command or artefact: execute it
   against a real input using the exact documented invocation (`node
   packages/cli/dist/index.js`, `node packages/cli/dist/index.js scan`
   against `$HOME`, or open the generated HTML / README / action.yml).
   Paste the observed output into the commit message or reject the task.
8. For scanner/reporting output changes: verify product behavior, not
   just rendering. Check ordering, prioritization, file/export
   ergonomics, and consistency across human and machine formats.
9. For any task that adds a file reference (image, link, badge) to a
   markdown file: verify the referenced path resolves on disk. Broken
   links block the commit.
10. For any task that changes external links, badges, action examples,
    package metadata, or trusted-publishing settings: verify the external
    target exists and matches the canonical repository/package target.
11. For any task that changes README screenshots, SVGs, or visual docs
    assets: render them in a browser or image renderer at their embedded
    README/GitHub size and inspect for overflow, clipping, overlap, stale
    output, and unreadable text. For hand-authored SVGs, check text bounds
    against adjacent labels and the visible frame.
12. For any task that changes generated HTML interactions: verify a
    click/keyboard interaction in a DOM/browser environment.
13. `fix_plan.md` checkbox flipped to `- [x]`.
14. Two conventional commits: one for the feature, one for the checkbox.

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
