# Identified Issues For Next Post-Mortem

This file collects concrete issues discovered after the Ralph loop so a later
post-mortem can analyze what went wrong, why it happened, and what process or
verification changes should carry into the next loop.

**Observed problem:** The scan output shipped without several basic UX affordances
that users reasonably expect from a security scanning CLI. The default table view
sorted only by verdict band, not by the numeric score where lower means more
severe. JSON output preserved discovery/scan order. HTML had its own stronger
sort, but the ordering behavior was inconsistent across output formats. The CLI
also had no first-class way to write JSON, summary, or table results to a file;
only HTML had a dedicated file destination via `--html <file>`.

**Why this matters:** Scan output is not just presentation. It is how users decide
what to fix first and how they integrate the tool into CI, audit archives, and
other automation. A security scanner should put the riskiest results first by
default, especially when it already computes a severity score. Likewise, a
machine-readable `--json` mode should have an obvious file-output path such as
`-o, --output <file>` instead of requiring users to infer shell redirection as the
only option. These are product-quality expectations, not polish.

**User-impact evidence:**

- A user had to ask whether lower score means worse severity, then separately ask
  whether the output was sorted at all. That indicates the output did not make
  the ranking model obvious enough.
- The regular scan table did not prioritize lower scores within a verdict band,
  so a worse `FAIL` could appear below a less severe `FAIL`.
- JSON output did not apply the same risk-first ordering as human output, making
  automation consumers do extra work and creating inconsistent expectations.
- There was no `--output <file>` / `-o <file>` flag for non-HTML formats, even
  though file output is a common CLI affordance for scan reports.

**Implementation evidence:**

- `packages/cli/src/output/table.ts` sorts only by `summary.verdict`
  (`FAIL`, `REVIEW`, `PASS`) and does not sort by `summary.score`.
- `packages/cli/src/output/json.ts` serializes `result.skills` directly without
  applying any output ordering.
- `packages/cli/src/output/html.ts` sorts by verdict and then ascending score,
  so HTML had different ordering semantics from table and JSON output.
- `packages/cli/src/index.ts` exposes `--json`, `--summary`, and
  `--html <file>`, but no destination flag for writing the selected output mode
  to a file.

**Likely process failure:** Ralph appears to have optimized for satisfying the
listed spec/tasks literally: implement renderers, wire flags, make tests pass.
The loop did not include a product-usage review step asking, "Would a real user
understand what to do first, and can they save/share/integrate this output in the
expected way?" Because output behavior was decomposed by renderer, cross-format
consistency and CLI ergonomics fell through the cracks.

**Root cause analysis:**

- Output behavior was split by renderer (`table`, `json`, `html`, `summary`)
  without a shared product contract. Each renderer could pass its own tests
  while the command as a whole gave inconsistent guidance.
- The spec called JSON a schema contract and the TUI a brand asset, but did not
  define global scan ordering as a behavioral invariant.
- Verification asked Ralph to run the binary, but not to inspect the output as
  a user deciding what to fix first or as an automation consumer saving a
  report.
- CLI ergonomics were tested as flag wiring, not as common scanner workflows:
  save a report, consume JSON in CI, compare human and machine output, and open
  the worst finding first.

**Resolution / prevention:**

- `specs/OUTPUT.md` now has a single risk-first ordering contract that applies
  to table, summary, JSON, HTML, and file output.
- `specs/OUTPUT.md`, `AGENT.md`, `CLAUDE.md`, and `PROMPT.md` now require a
  product-sanity pass for user-facing scan/report changes.
- Existing pending tasks cover first-class `--output <file>` and shared
  severity-first ordering; future output tasks should add cross-renderer tests
  for the workflow they change.

**Open post-mortem questions:**

- Why did the output tasks not include an explicit "risk-first ordering" invariant
  shared by table, JSON, HTML, and summary suggestions?
- Why did the CLI flag review stop at the formats named in the spec instead of
  checking common scanner conventions like `-o, --output <file>`?
- Should every user-facing command task include a short "expected user workflow"
  review before implementation is considered done?
- Should output tests assert product behavior across all renderers, not just
  schema shape and snapshot-like text?
- Should `PROMPT.md` or `AGENT.md` add a product-sanity checkpoint for Ralph:
  run the command as a user, inspect the first screen, and verify that the most
  important action/result is obvious?

**Suggested prevention for future Ralph loops:**

- Add a done-criteria item for user-facing commands: "Review output as product
  behavior, not just rendering. Verify ordering, prioritization, file/export
  ergonomics, and consistency across machine and human formats."
- For scanner/reporting features, require a shared ordering contract documented
  near the output model and tested in every renderer.
- During task planning, include explicit UX acceptance criteria for common CLI
  workflows: save report to file, consume JSON in CI, inspect worst result first,
  and compare outputs across formats.

---

## Newly identified issues (2026-04-27)

### CLI

- **Enrichment column is always empty in CLI scan results.**

- **Strong false positives on security-related skills/packages.**
  Examples: `skill-security-auditor`, `ai-security`, `skill-tester`, etc.
  Reproducible via the `explain` command against these packages on this
  machine — outputs show clearly benign code being flagged.

- **`skillaudit` with no arguments does nothing.**
  Running `skillaudit` (or, for local builds,
  `node packages/cli/dist/index.js`) without a subcommand should behave
  the same as `skillaudit scan` — `scan` should be the default. Today
  it produces no output.

### HTML report

- **Agent sidebar entries are not interactive.**
  Clicking an agent in the "Agents" left sidebar does nothing. Expected:
  clicking an agent filters the report to that agent.

### README

- **Header screenshot is broken.**
  Text in the screenshot at the top of the README is overflowing and
  covering itself, some spills past the right edge of the terminal in
  the picture, and some spills past the edge of the picture itself.

- **CI badge link is 404.**
  The CI badge at the top of the README links to a "page not found".

- **README is too wordy / too long.**
  Especially the tables — they should be simple, minimal, and fun to
  look at. The README carries a lot of weight for first impressions,
  user acquisition, feedback, and virality/sharing, so density and tone
  matter as much as accuracy.

## Root-cause analysis for newly identified issues

### Enrichment column is always empty in CLI scan results

**How it happened:** the enrichment work was split into three seams: source
selection in `scan`, fetch/aggregation in `enrich`, and display in the table.
The tests proved those seams separately: the command asked for `skillsSh` and
`depsdev`, and the table could render hand-built enrichment objects. That did
not prove a realistic discovered skill could supply metadata, survive scanning,
receive enrichment, and show a non-empty table cell. Because enrichment is
optional and fail-silent by design, missing repository/dependency metadata,
lookup failures, skipped modes, and true "no data" all collapsed into `-`.

**Root cause:** renderer-level confidence substituted for product-flow
verification. The agent made the UI look implemented without proving the data
path that should populate it in real output.

**Prevention:** any visible output data must have at least one realistic
populated-path test from command/pipeline to renderer, plus one explicit
empty/unavailable/offline state. The spec and agent docs now call this a visible
data contract rather than a renderer detail.

### Strong false positives on security-related skills/packages

**How it happened:** early rules leaned on high-signal words and phrases from
the spec: jailbreak, developer mode, ignore previous instructions, sudo/root,
hidden comments, hardcoded keys, and similar. The fixture discipline required
one malicious and one benign example per rule, but those benign examples were
too narrow. They did not represent scanner packages, security-auditor skills,
red-team training, quoted hostile prompts, fenced examples, or documentation
that discusses attacks as data.

**Root cause:** the agent optimized for catching the malicious phrase, not for
classifying whether the phrase was an operative instruction to the agent. This
is a category error: security docs naturally contain the same vocabulary as
attacks.

**Prevention:** prompt-injection and code-risk rules must include security
education/tester/documentation benign fixtures before landing. Future tuning
should narrow to operative intent or add context masking; it must not weaken a
real malicious detector just to silence a benign fixture.

### Bare `skillaudit` does nothing

**How it happened:** `specs/SPEC.md` documented `skillaudit` and
`skillaudit scan` as equivalent defaults, but the Commander setup only
registered subcommands. Tests exercised `runScan({})` and scan subcommand
options, which proved default scan options, not the CLI parser behavior when no
subcommand is supplied.

**Root cause:** the agent treated command implementation as the contract and
missed the command-line invocation table as its own contract.

**Prevention:** every documented invocation, alias, and default command must be
smoke-tested through the built binary exactly as written. Unit tests of command
functions are not sufficient for parser defaults.

### HTML agent sidebar entries are not interactive

**How it happened:** the spec required a clickable left rail, and the output
could include anchor tags or even inline script text that looked plausible in a
string test. But no verification opened the generated file, executed the script,
clicked an agent, and asserted rows were filtered. Any selector mismatch,
script error, missing listener, or file-mode browser issue could pass markup
tests while failing for the user.

**Root cause:** static HTML rendering was confused with interactive report
behavior.

**Prevention:** generated HTML reports need DOM/browser smoke coverage for
interactive controls. At minimum, click an agent filter and assert visible row
state changes; also verify row/detail and toolbar controls when those are part
of the task.

### README header screenshot is broken

**How it happened:** the demo image is a hand-authored SVG with fixed
coordinates. Later output changes added columns and longer text, but the asset
was only checked for existence as a markdown path. No one rendered it at the
README width to see text overlap, clipping, or stale layout.

**Root cause:** markdown-path verification was treated as image verification.
It proves the file exists, not that the visual still works.

**Prevention:** README screenshots, SVGs, and recordings must be rendered at
their embedded dimensions before commit. Prefer generating them from real built
CLI output; when hand-authored, re-check text widths after any output-column
change.

### CI badge link is 404

**How it happened:** repository links and badges were assembled from partial
identity fields and local assumptions: a GitHub handle, an npm package name, a
repository-looking slug, and the existence of `.github/workflows/ci.yml`. That
does not prove the public owner/repo/workflow URL exists. The badge looked
mechanically correct but pointed to a missing external target.

**Root cause:** internal metadata and local files were treated as sufficient
evidence for external GitHub URLs.

**Prevention:** badges, action examples, repository URLs, trusted-publishing
settings, and package metadata must be verified against the exact public
owner/repo/workflow/package target. If the canonical repo slug is not in the
identity docs, the agent must verify it or ask instead of composing URLs.

### README is too wordy / too long

**How it happened:** many docs tasks added correct, defensible sections:
comparison tables, privacy tables, examples, limitations, CI instructions, and
finding samples. Each change was reasonable in isolation and passed the
"accurate and linked" checks. No later pass asked whether the first page still
served the README's job: quick comprehension, trust, install, first scan, and
shareability.

**Root cause:** the loop optimized for cumulative completeness rather than
front-page information architecture.

**Prevention:** README changes need a first-screen budget. Keep install,
purpose, supported scope, and first result interpretation near the top; move
deep comparison, privacy detail, examples, and maintainer material into linked
docs unless they clearly improve the first impression.

## Documentation changes made from this analysis

- `LESSONS.md` now records concrete lessons for exact CLI invocation smoke
  tests, HTML interaction testing, README image rendering, external GitHub URL
  verification, visible output data paths, README front-page budget, and
  security-education benign fixtures.
- `AGENT.md`, `CLAUDE.md`, `AGENTS.md`, and `PROMPT.md` now make those checks
  part of future agent workflow.
- `specs/OUTPUT.md` now treats documented invocations, visible data states,
  generated HTML interactions, and README hero assets as output contracts.
- `specs/RULES.md` now states the operative-intent rule for risky vocabulary and
  requires benign security-education/tester/documentation cases.
- `.github/PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, and
  `docs/RELEASE_CHECKLIST.md` now surface the same checks during review and
  release.
