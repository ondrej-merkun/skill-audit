# fix_plan.md — skill-audit task list

Ralph picks the **first unchecked task** from this list each iteration.
Order matters — dependencies flow top-to-bottom. Do not reorder.

When all tasks are checked, append `ALL TASKS COMPLETE` on a new line
at the bottom and the loop will stop.

---

## Shared contract for marketplace tasks

Tasks 1-4 define how `skill-audit` treats plugin marketplace inventory.
Marketplace skills are locally available skill payloads under a
`plugins/marketplaces/` directory, but they are not active, installed, or
exposed to an agent until the user installs the containing plugin.

Default behavior:
- `scan`, `list`, and shared discovery must ignore marketplace inventory.
- Discovery must avoid walking or reading files under `plugins/marketplaces/`
  by default, not merely hide those results after reading them.
- The rule applies to every agent discovery path, including broad filesystem
  sweeps and agent-specific plugin scanners.

Opt-in behavior:
- `scan` and `list` get a canonical `--include-marketplaces` flag.
- With the flag, marketplace-only skills are included and clearly labeled as
  locally available but inactive.
- Output should briefly distinguish `installed` skills from `marketplace`
  skills anywhere both can appear. Keep the label compact; do not turn normal
  output into documentation prose.

Path definition:
- Treat a path as marketplace inventory only when its normalized path segments
  contain adjacent `plugins` and `marketplaces` segments.
- Do not match unrelated paths such as `skills/marketplaces/`, a top-level
  `marketplaces/` directory, or a skill named `marketplaces`.
- Preserve the existing `plugins/cache` behavior; marketplace inventory and
  plugin caches are separate concepts.

---

## Shared contract for local LLM review tasks

Tasks 10-14 add an optional local-LLM review layer on top of the deterministic
rule scanner. The built-in rules remain the default security scan and the only
source of existing rule findings unless the user explicitly opts into LLM
review.

Local-first behavior:
- Do not call cloud-hosted model APIs by default.
- Treat local LLM review as disabled unless the user configures at least one
  local model and requests review with an explicit scan flag.
- Default allowed endpoints to loopback URLs such as `http://127.0.0.1:*`,
  `http://localhost:*`, or a local Unix socket if supported by the
  implementation. Any non-loopback endpoint requires an explicit, noisy opt-in.
- Never require API keys for the local path. If a provider supports headers or
  tokens, store them only when the user explicitly configures them and never
  print them in logs, JSON, HTML, or errors.

Review semantics:
- LLM review is a second opinion over discovered skill content and deterministic
  rule findings, not a replacement for the existing rules, scoring, or exit-code
  behavior unless a later task deliberately changes that contract.
- Each configured model produces its own review record with model name,
  provider name, status, findings, confidence, and short rationale. Do not
  collapse multiple models into one anonymous "AI says" result.
- Failed, timed-out, unavailable, or skipped model reviews must be visible as
  per-model status, but they must not hide deterministic findings or fail an
  otherwise complete local scan.
- Send bounded, redacted context to models: relevant file paths, deterministic
  findings, and capped snippets. Do not send entire home directories, unrelated
  files, caches, env vars, or secrets discovered by the scanner.
- Keep prompt templates versioned in code and include the prompt version in
  cache keys and machine-readable output so later prompt changes are auditable.

Output comparison contract:
- When two or more models run, human, JSON, and HTML outputs must show which
  model reported which finding and where models agree or disagree.
- The comparison view should help users prioritize review, not pretend model
  consensus is proof. Deterministic rule severity still anchors ordering unless
  a task explicitly defines an LLM-only ordering rule.
- JSON output remains schema-versioned and deterministic. Any new public fields
  must be specified in `specs/OUTPUT.md` before implementation is marked done.

---

## Pending tasks

- [x] **1** Exclude marketplace inventory from default discovery for all
  agents.

  Default discovery must return only active, installed, or currently exposed
  skills. Marketplace payloads under `plugins/marketplaces/` are available
  inventory, not installed skills, so the scanner must not read or emit them
  unless a caller explicitly opts in.

  Target behavior:
  - `discoverAll()` and every agent-specific discovery path exclude marketplace
    inventory by default.
  - Recursive walkers prune `plugins/marketplaces/` roots before reading
    `SKILL.md`, `AGENTS.md`, manifests, or any other files below them.
  - A shared final guard prevents marketplace paths from leaking through even
    if an individual discovery plugin misses the early prune.
  - The behavior applies to Claude Code, Codex, Cursor, Copilot, Gemini, Cline,
    Windsurf, cross-agent/AGENTS.md sweeps, and any shared registry discovery.
  - Existing active plugin directories and `plugins/cache/` handling keep their
    current behavior.

  Implementation notes:
  - Add one shared path helper, for example `isPluginMarketplacePath()`, that
    normalizes path separators and checks adjacent path segments.
  - Add a discovery option such as `includeMarketplaces?: boolean`, defaulting
    to `false`.
  - Add an internal skill availability marker such as
    `installState: 'installed' | 'marketplace'`; default non-marketplace skills
    to `installed`.
  - When a deduped skill exists in both an installed location and a marketplace
    location, keep the installed location as primary and label the result
    `installed`.
  - Update `specs/DISCOVERY.md` if it does not already state this marketplace
    distinction.

  Testing and verification:
  - Add helper tests for Unix and Windows-style paths, including false-positive
    cases like `skills/marketplaces/` and a skill directory named
    `marketplaces`.
  - Add discovery tests with marketplace fixtures for multiple agent roots,
    proving default discovery returns no marketplace skills.
  - Add at least one fixture where a marketplace `SKILL.md` contains an obvious
    malicious pattern and verify default `scan` does not report it.
  - Build the CLI and smoke-test default `list` and `scan` against a temp
    project/home containing both installed and marketplace skills.

- [x] **2** Add `list --include-marketplaces` with compact install-state
  labeling.

  The `list` command should keep its installed-only default, then expose a clear
  opt-in view for locally available marketplace skills. Users must be able to
  tell at a glance which rows are active installed skills and which rows are
  inactive marketplace inventory.

  Target behavior:
  - `skill-audit list` excludes marketplace inventory by default.
  - `skill-audit list --include-marketplaces` includes marketplace-only skills.
  - Help text describes marketplace skills as locally available but inactive or
    not installed.
  - Human list output shows a compact state label when marketplace rows are
    included, using values such as `installed` and `marketplace`.
  - Installed rows sort before marketplace-only rows unless an existing
    higher-priority grouping, such as project/user scope, already requires a
    clearer order. Preserve deterministic tie-breakers within each group.
  - JSON list output includes the same state using a stable field such as
    `install_state`, and `specs/OUTPUT.md` is updated if this expands the JSON
    contract.
  - If the same skill content exists in both installed and marketplace
    locations, show it as installed and keep the installed path primary.

  Implementation notes:
  - Reuse the discovery option from task 1 rather than adding command-specific
    filesystem logic.
  - Keep the default list output quiet; do not add a marketplace explanation
    when no marketplace rows are shown.
  - Prefer a small shared formatter/helper for install-state labels so scan and
    list do not drift.

  Testing and verification:
  - Add command tests for default list exclusion and opt-in inclusion.
  - Cover human output and JSON output, including the installed/marketplace
    labels.
  - Assert stdout remains valid JSON in JSON mode and that any warnings or
    notices stay on stderr.
  - Smoke-test the built `node packages/cli/dist/index.js list` and
    `node packages/cli/dist/index.js list --include-marketplaces` against a temp
    fixture.

- [x] **3** Add `scan --include-marketplaces` with compact scan-result
  labeling.

  The `scan` command should scan only installed skills by default. When users
  explicitly opt in, it should also scan marketplace inventory and label those
  results so inactive marketplace findings are not confused with active
  installed skill findings.

  Target behavior:
  - `skill-audit scan` excludes marketplace inventory by default and does not
    read files below `plugins/marketplaces/`.
  - `skill-audit scan --include-marketplaces` includes marketplace-only skills
    in discovery, rule evaluation, summaries, and the final verdict.
  - Because the user opted in, marketplace findings participate in scan counts,
    risk ordering, and exit code decisions, but output labels them as inactive
    marketplace inventory.
  - Human scan output shows a compact installed/marketplace label when
    marketplace results are included.
  - Scan overview or summary output briefly reports separate counts, for
    example installed skills vs marketplace skills, without adding noisy prose.
  - JSON scan output includes the same state using the field chosen in task 2,
    and `specs/OUTPUT.md` is updated if this expands the JSON contract.
  - `--agent`, `--offline`, `--summary`, `--json`, and file-output modes compose
    cleanly with `--include-marketplaces`.

  Implementation notes:
  - Reuse the discovery option and install-state formatter from tasks 1 and 2.
  - Preserve existing risk-first ordering; install state is a display/filtering
    dimension, not a replacement for risk sorting.
  - Keep marketplace wording short and explicit: locally available, inactive,
    or not installed. Avoid implying the agent currently uses marketplace-only
    skills.

  Testing and verification:
  - Add command tests proving default scan ignores a malicious marketplace-only
    skill, while `--include-marketplaces` reports it with the marketplace label.
  - Cover human output, JSON output, and summary/file modes where the scan
    result shape changes.
  - Cover composition with `scan --agent <agent> --include-marketplaces` using a
    fixture that has installed and marketplace skills for multiple agents.
  - Smoke-test the built `node packages/cli/dist/index.js scan` and
    `node packages/cli/dist/index.js scan --include-marketplaces` against a temp
    fixture and inspect the first screen for clear labels.

- [ ] **4** Consolidate marketplace docs, help, and cross-command regression
  coverage.

  After both commands support the opt-in flag, make the user-facing contract
  consistent everywhere: installed skills are the default scan/list surface;
  marketplace skills are inactive local inventory shown only when requested.

  Target behavior:
  - `README.md`, command help, `specs/DISCOVERY.md`, and `specs/OUTPUT.md` agree
    on the marketplace distinction and the `--include-marketplaces` flag.
  - Docs do not suggest marketplace skills are active, installed, or scanned by
    default.
  - Human output examples, if present, briefly show the installed vs marketplace
    labels.
  - JSON examples, if present, include the chosen install-state field.
  - No stale references to old default behavior remain in tests, docs, or
    scripts.

  Implementation notes:
  - Keep docs changes compact; this is a behavioral clarification, not a new
    marketplace tutorial.
  - Verify any markdown links or file references touched by this task resolve
    on disk.
  - Do not add dependencies.

  Testing and verification:
  - Add or update an end-to-end regression that exercises both `list` and `scan`
    defaults plus both `--include-marketplaces` forms against the same fixture.
  - Verify the exact documented invocations with the built CLI.
  - Run the full verification suite required by `AGENT.md`: build, test, lint,
    typecheck, and the clean build-output warning check.

- [ ] **5** Make enrichment source outcomes truthful in progress and summaries.

  Postmortem issue 1 reports that `skills.sh` and `deps.dev` show success
  checkmarks even when the user sees no enrichment data and no explanation. The
  CLI should distinguish "lookup completed" from "source returned useful
  metadata" so users can tell whether enrichment was found, unavailable, skipped,
  or lacked enough local input to query.

  Target behavior:
  - Track enrichment outcome per requested source, not only the current aggregate
    `found` / `no-metadata` / `unavailable` status.
  - Do not show a success checkmark for a source unless that source produced
    displayable enrichment data or served valid cached data.
  - When a source has no input metadata, no remote metadata, a timeout/error, or
    is skipped by `--offline`, render a compact neutral state instead of a
    misleading checkmark.
  - Pretty scan output, summary footer, `explain`, and interactive progress use
    the same source labels and outcome rules.
  - Machine-readable `enrichment` objects continue to contain only actual data.
    If source outcomes are exposed in JSON, update `specs/OUTPUT.md` deliberately
    and keep field ordering deterministic.
  - Enrichment remains fail-silent for scan correctness: failed optional metadata
    must not make the scan fail or hide local findings.

  Implementation notes:
  - Prefer a small result type such as
    `{ source, status, data?, reason? }` returned by the enrichment layer, then
    derive the existing `Enrichment` payload from successful data.
  - Preserve stale-cache fallback behavior, but label stale cached data clearly
    if it is displayed.
  - Keep source names canonical and compact: `skills.sh`, `GitHub`, and
    `deps.dev`.
  - Avoid source-specific filesystem or API probing in renderers; rendering
    should consume normalized enrichment outcomes from the pipeline.

  Testing and verification:
  - Add unit tests for per-source outcome aggregation covering data found,
    no local query input, no remote metadata, timeout/error, stale cache, and
    offline skip.
  - Add command tests proving the progress completion line and scan summary do
    not print `skills.sh ✓` or `deps.dev ✓` when those sources return no data.
  - Cover `explain` output for the same no-data and unavailable states.
  - Verify stdout stays valid JSON in `scan --json` while any human diagnostics
    stay out of the JSON payload unless the schema is intentionally updated.

- [ ] **6** Share and harden enrichment metadata extraction.

  Postmortem issue 1 also reports that most skills never receive GitHub or
  registry enrichment. Before provider-specific fixes, the CLI needs one shared
  metadata extraction path that reliably finds GitHub repository slugs and
  dependency manifests from realistic skill layouts.

  Target behavior:
  - `skills.sh` and GitHub enrichment use the same GitHub slug resolver so they
    cannot drift.
  - Repository extraction handles common `package.json` shapes:
    `repository` string, `repository.url`, `homepage`, and `bugs.url`.
  - Repository extraction handles common URL forms:
    `https://github.com/owner/repo`, `git+https://...`, `git@github.com:owner/repo.git`,
    `ssh://git@github.com/owner/repo.git`, trailing slashes, `.git`, and links
    that include paths such as `/tree/main`.
  - `SKILL.md` fallback extraction ignores example prose when a stronger
    manifest source exists, and normalizes the chosen slug deterministically.
  - Dependency extraction finds npm and Python manifests from the actual skill
    payload root, including nested package directories when a skill wraps a
    tool rather than putting `package.json` beside `SKILL.md`.
  - Extraction failures produce explicit source outcomes from task 5 instead of
    silently looking like successful empty enrichment.

  Implementation notes:
  - Put shared helpers under `packages/cli/src/enrich/` and keep provider files
    thin.
  - Do not fetch remote git metadata in this task; use local manifests and local
    skill files only.
  - Cap manifest walking to avoid scanning unrelated large trees or
    `node_modules`.
  - Reuse existing dependency parser behavior where it is correct; this task is
    about realistic input discovery, not adding a new package manager matrix.

  Testing and verification:
  - Add helper tests for every supported GitHub URL shape and false positives
    such as `github.com` documentation pages that are not `owner/repo` slugs.
  - Add fixtures where one skill has only `SKILL.md`, one has package metadata,
    and one has nested dependency manifests.
  - Add a pipeline-level test showing a realistic discovered skill reaches the
    enrichment layer with a repository slug and dependency list.
  - Smoke-test the built CLI against a temp skill that contains package metadata
    and confirm the first screen no longer reports enrichment as a successful
    empty phase.

- [ ] **7** Repair `skills.sh` and `deps.dev` provider contracts.

  The current `skills.sh` implementation posts a single `{ "slug": "owner/repo" }`
  shape, while `specs/SPEC.md` describes `{ "owner", "repo", "skill" }` and a
  response with `socket.alerts`. The `deps.dev` provider should also be checked
  against the current API path and response shape because users see no
  `deps.dev` data in practice.

  Target behavior:
  - `skills.sh` requests use the currently valid audit endpoint contract,
    including owner, repository, and skill identity when required by the API.
  - `skills.sh` parsing accepts the documented response shape, including nested
    Socket alert counts, without manufacturing `unknown` values that look like
    useful data.
  - If the audit endpoint returns 404 or no registry record, label the source as
    no metadata rather than unavailable.
  - If the audit endpoint fails or times out, serve stale cache if present and
    otherwise label the source unavailable.
  - `deps.dev` requests use the currently valid package endpoint for npm and
    PyPI dependencies, including scoped npm packages.
  - `deps.dev` parsing counts OSV advisories correctly and exposes Scorecard
    data only when the API response actually provides it.
  - Provider fixes feed the source-outcome model from task 5 and the shared
    extraction helpers from task 6.

  Implementation notes:
  - Verify the external API shapes before coding. Prefer official `deps.dev`
    documentation for `deps.dev`; for `skills.sh`, record the observed contract
    in a short code comment or test fixture because the endpoint is
    reverse-engineered.
  - Keep tests mocked; do not require network access for the normal test suite.
  - Do not add new dependencies.
  - Preserve 5 second timeouts and cache behavior.

  Testing and verification:
  - Add provider tests for successful `skills.sh` responses, no-registry-record
    responses, malformed-but-200 responses, timeout/failure, and stale-cache
    fallback.
  - Add provider tests for npm, scoped npm, and PyPI `deps.dev` dependencies,
    including zero-advisory and nonzero-advisory cases.
  - Add an end-to-end scan pipeline test with mocked `skills.sh` and `deps.dev`
    responses proving the pretty table, summary, JSON, and HTML report receive
    the same enrichment data.
  - If live-network smoke testing is possible in the implementation
    environment, run one built-CLI scan against a temp skill that references a
    known public package/repository and document the observed first-screen
    enrichment output. If live network is unavailable, record the exact blocker
    under `Blockers`.

- [ ] **8** Fix GitHub enrichment reliability and contributor counts.

  Postmortem issue 1 says GitHub enrichment is missing for most skills, and when
  it appears the collaborator/contributor count can be incorrectly shown as
  zero. Public GitHub metadata should be populated when a repository slug is
  available, and unknown contributor counts must not be reported as real zeroes.

  Target behavior:
  - GitHub enrichment uses the shared slug resolver from task 6.
  - Repository lookups keep returning stars and age when available.
  - Contributor counts are correct for one-page and multi-page contributor API
    responses.
  - If contributor lookup is rate-limited, forbidden, timed out, or otherwise
    unavailable while repository metadata succeeds, render contributors as
    unavailable/unknown instead of `0 contributors`.
  - A true empty contributor list may render as zero only when GitHub returned a
    successful empty contributor response.
  - Human output consistently calls the public signal `contributors`, not
    `collaborators`, unless an authenticated collaborator-specific API is
    deliberately added in a separate task.
  - Cache entries preserve enough information to avoid turning unknown
    contributor counts into zero on later runs.

  Implementation notes:
  - Consider changing `GitHubEnrichment.contributors` to `number | null` or
    adding a small status field. Update JSON serialization and
    `specs/OUTPUT.md` if the public contract changes.
  - Respect unauthenticated rate limits and continue using `GITHUB_TOKEN` when
    present.
  - Keep contributor failures non-fatal and source-outcome-aware: partial GitHub
    data should be visible without overstating missing fields.
  - Do not call private collaborator endpoints without an explicit token and
    separate product decision.

  Testing and verification:
  - Add tests for single-page contributors, paginated contributors via `Link`,
    successful empty contributors, contributor fetch failure after repo success,
    403/rate-limit, and stale cache.
  - Add output tests proving unknown contributors do not render as
    `0 contributors`.
  - Add a scan pipeline test where a realistic skill with a GitHub URL produces
    GitHub table, summary, JSON, and HTML enrichment consistently.
  - Smoke-test the built CLI against a temp skill with a known GitHub repository
    fixture or seeded cache and inspect the first-screen GitHub enrichment.

- [ ] **9** Repair the README header demo image and prove it visually in a
  browser.

  Postmortem issue 2 reports that the README header image text is overflowing
  and overlapping again. The replacement visual must be readable at the exact
  embedded README size and should reflect the current CLI output instead of a
  stale hand-tuned approximation.

  Target behavior:
  - `README.md`'s header image renders without overlapping text, clipped text,
    or text spilling outside the terminal frame at the embedded `width="800"`.
  - The image reflects the current built CLI command name, table columns,
    summary lines, and next-command footer.
  - Long values such as `TOP ISSUE`, skill names, enrichment labels, and agent
    names are truncated, wrapped, or laid out so they cannot collide at the
    README render size.
  - The image remains legible on a normal desktop browser viewport and a narrow
    mobile README viewport.
  - Markdown image references still resolve on disk.

  Implementation notes:
  - Prefer generating the asset from real built CLI output or from the same
    column-width constants used by the renderer. If the asset stays hand-authored
    SVG, check text widths explicitly after every edited line.
  - Keep the first README screen focused; do not introduce a larger hero section
    just to make the asset easier to fit.
  - Keep the visual self-contained and repository-local.
  - Update `docs/RELEASE_CHECKLIST.md` or another existing maintenance document
    only if the implementation adds a new repeatable verification command or
    workflow that future agents should run.

  Testing and verification:
  - Render `README.md` or `docs/demo.svg` in a browser at the embedded README
    width and inspect the screenshot for overlap, clipping, stale columns, and
    unreadable text.
  - Use the Playwright/browser verification path required by `AGENTS.md` for
    visual changes; do not rely on string checks alone.
  - Verify the image reference in `README.md` resolves locally.
  - Run the relevant docs/CLI verification for any command output used to
    generate the image, including the built CLI invocation if the asset is based
    on live output.
  - Include the visual proof path or screenshot reference in the commit message
    or task notes so the next iteration can audit what was actually inspected.

- [ ] **10** Add local LLM connection configuration and health checks.

  Users who already downloaded and started a local model server need a smooth
  way to connect it to `skill-audit` without editing TypeScript, setting up
  cloud credentials, or guessing JSON shapes. This task establishes the local
  model registry and verifies configured models before any scan integration.

  Target behavior:
  - Add a user-facing command or subcommand such as `skill-audit llm add` that
    stores a named local model configuration.
  - Add `skill-audit llm list` and `skill-audit llm check <name>` or equivalent
    commands so users can see configured models and verify connectivity before
    running a scan.
  - Support OpenAI-compatible chat-completions endpoints as the first provider
    shape because Ollama, LM Studio, and many local servers can expose it.
  - Store model configs under the existing user config root, for example
    `~/.config/skill-audit/llms.json`, respecting `XDG_CONFIG_HOME` as the
    ignore list already does.
  - A model config includes a stable local name, provider type, base URL,
    model id, optional timeout, optional context/token budget, and optional
    disabled flag.
  - Reject duplicate names, empty model ids, invalid URLs, and non-loopback base
    URLs by default. If remote URLs are allowed later, require an explicit
    per-model opt-in field and warning text.
  - Health checks call the smallest safe provider request available, report
    provider/model/status/latency, and do not scan any skill content.
  - Command output never prints configured secrets, headers, or full request
    bodies.

  Implementation notes:
  - Keep config parsing and validation in a small module such as
    `packages/cli/src/llm/config.ts`.
  - Prefer plain JSON for the registry unless an existing config format already
    exists by the time this task runs.
  - Do not add a heavyweight SDK. Use native `fetch` against the
    OpenAI-compatible endpoint.
  - Keep the provider interface narrow enough for future adapters:
    `checkConnection()` and `reviewSkill()` are enough for this phase.
  - Document the exact request/response subset the OpenAI-compatible adapter
    relies on, including how `baseUrl` is joined with `/v1/chat/completions`.

  Testing and verification:
  - Add config validation tests for valid loopback URLs, invalid remote URLs,
    duplicate model names, malformed JSON, and secret redaction.
  - Add command tests for add/list/check using a mocked local HTTP server or
    fetch stub. Cover success, connection refused, timeout, and malformed model
    response.
  - Verify stdout stays valid JSON for any JSON mode and human diagnostics stay
    on stderr where appropriate.
  - Smoke-test the built CLI with a temporary config root:
    `node packages/cli/dist/index.js llm add ...`,
    `node packages/cli/dist/index.js llm list`, and
    `node packages/cli/dist/index.js llm check <name>`.

- [ ] **11** Add opt-in single-model LLM review to `scan`.

  Once a local model can be configured and checked, `scan` should be able to ask
  exactly one selected local model for a bounded second opinion on discovered
  skills. The deterministic rule scan stays authoritative and must still work
  with no model configured.

  Target behavior:
  - Add an explicit scan flag such as `--llm <name>` or
    `--llm-review <name>` that selects one configured local model.
  - Running `skill-audit scan` with no LLM flag behaves exactly as it does
    today: no model discovery, no model requests, no new network calls.
  - For each scanned skill, build a bounded review payload containing skill
    metadata, deterministic findings, relevant file paths, and capped snippets
    from the files that drove those findings.
  - Redact obvious secrets from snippets before sending them to the model, using
    the scanner's existing secret-awareness where possible.
  - The local model returns structured review findings with severity,
    category, confidence, short rationale, and optional suggested fix.
  - Invalid model output is captured as a model-status error for that skill and
    does not crash the whole scan.
  - LLM-only findings are labeled separately from deterministic rule findings.
    They do not change the existing scan exit code in this task.
  - `--offline` disables LLM review unless the task deliberately defines a
    separate `--local-llm-in-offline` policy; default to no model calls in
    offline mode for least surprise.

  Implementation notes:
  - Add a prompt module such as `packages/cli/src/llm/prompt.ts` with a stable
    prompt version constant.
  - Keep the prompt concise and specific to skill-security review: prompt
    injection, unsafe filesystem/network behavior, credential handling,
    persistence, and dependency risk.
  - Parse model responses through a strict validator. Do not trust free-form
    markdown as the internal result shape.
  - Cap per-skill review time and total concurrent model requests so a slow
    local model cannot make normal scans appear hung.
  - Reuse existing progress/status conventions and write model progress to
    stderr only.

  Testing and verification:
  - Add prompt/payload tests proving context is capped, unrelated files are not
    sent, and obvious secrets are redacted.
  - Add scan command tests with a fake local model response producing one
    LLM-only finding and one model parse failure.
  - Cover `scan --json`, pretty output, `--summary`, and `--html` enough to
    prove LLM review data is either rendered deliberately or omitted
    deliberately with no schema corruption.
  - Cover `--offline --llm <name>` so the behavior is explicit and tested.
  - Smoke-test the built CLI against a temp skill and a fake local
    OpenAI-compatible endpoint.

- [ ] **12** Support multiple local LLMs in the same scan run.

  Users should be able to connect several local models and ask `skill-audit` to
  run them side by side. The implementation must preserve per-model identity,
  bounded runtime, deterministic output ordering, and graceful partial failure.

  Target behavior:
  - Accept multiple model selections, for example repeated `--llm <name>` flags,
    a comma-separated list, and/or `--llm all` for all enabled configured local
    models.
  - Run the same normalized review payload and prompt version for each selected
    model so comparisons are meaningful.
  - Display and serialize per-model status for every selected model:
    `not-run`, `ok`, `unavailable`, `timeout`, `invalid-response`, or
    `skipped-offline`.
  - A slow or failed model does not block completed results from other models
    beyond the configured per-model timeout.
  - Preserve deterministic result ordering by configured model name, then skill
    identity, regardless of request completion order.
  - Deduplicate repeated model selections and report unknown model names as
    usage errors before scanning starts.
  - Add an on-disk cache for local LLM review results if needed for runtime.
    Cache keys must include skill tree hash, model provider/name/id, prompt
    version, and the normalized review payload hash.

  Implementation notes:
  - Keep concurrency conservative by default, for example one or two model
    requests at a time per local endpoint.
  - Do not assume all local models share one server or one context window.
    Respect per-model timeout and context budget.
  - If adding cache storage, use `~/.cache/skill-audit/llm/` and the same
    best-effort cache-write policy as enrichment.
  - Keep multi-model orchestration separate from output rendering so table,
    JSON, and HTML comparison views consume normalized review records.

  Testing and verification:
  - Add orchestration tests with two successful fake models, one timeout, one
    invalid response, and one unavailable endpoint.
  - Add ordering tests proving output is deterministic even when fake models
    respond out of order.
  - Add command tests for repeated flags, `all`, duplicate model names, and
    unknown model names.
  - Add a runtime guard test proving a timed-out model does not prevent another
    model's completed review from appearing in results.
  - Smoke-test the built CLI against two fake local endpoints in the same run.

- [ ] **13** Show per-LLM finding comparison in scan outputs.

  Multi-model review is only useful if users can see which local model found
  which issue. Human, JSON, and HTML outputs should make agreement and
  disagreement visible without obscuring deterministic rule results.

  Target behavior:
  - Pretty scan output includes a compact LLM review area when LLM review is
    enabled, showing each selected model's status and highest finding severity.
  - Skill detail output groups LLM findings by model and labels them with model
    name, provider, severity, confidence, and rationale.
  - Summary output includes a small comparison overview, such as model status
    counts and per-model counts by severity.
  - JSON output includes deterministic fields for `llm_reviews` or equivalent,
    preserving per-model identity, status, findings, prompt version, and cache
    status if caching is implemented.
  - HTML reports include a model comparison view that can be inspected from a
    local `file://` report without network access.
  - When two or more models produce similar findings for the same skill/file,
    show consensus compactly, but keep the underlying per-model records visible
    in JSON and detail views.
  - When models disagree, do not hide the disagreement or average it away. Show
    the model-specific finding and confidence values.
  - If every selected model is skipped or unavailable, output says that clearly
    and still shows deterministic scanner findings normally.

  Implementation notes:
  - Define the public output contract in `specs/OUTPUT.md` before wiring JSON
    or HTML fields.
  - Prefer a small normalized type such as `LlmReviewResult` on `ScannedSkill`
    rather than renderer-specific ad hoc structures.
  - Keep table output compact. Large rationales belong in `explain`, JSON, or
    HTML detail panels, not the first-screen table.
  - Ensure model names are escaped in HTML and sanitized in filenames/anchors.

  Testing and verification:
  - Add output tests for one model, two agreeing models, two disagreeing models,
    one unavailable model, and zero LLM findings.
  - Add JSON schema/order tests for the new LLM review fields.
  - Add a DOM/browser smoke test for the HTML comparison view, including model
    filter or detail expansion if the UI adds controls.
  - Verify stdout remains valid JSON for `scan --json --llm ...` and that
    progress/status text stays on stderr.
  - Smoke-test the built CLI with two fake local model responses and inspect the
    first screen for clear model labels.

- [ ] **14** Document the local LLM workflow and end-to-end safety boundaries.

  After the local LLM connection, scan integration, multi-model orchestration,
  and comparison output exist, docs and specs need to explain the complete
  workflow without overselling model judgments or implying cloud calls are
  required.

  Target behavior:
  - `README.md` shows a compact local LLM setup path for a user who already has
    a local OpenAI-compatible model server running.
  - Command help lists the LLM config commands and scan flags with short,
    accurate descriptions.
  - `specs/SPEC.md` and `specs/OUTPUT.md` document local LLM review as optional,
    local-first, disabled by default, and separate from deterministic findings.
  - Docs explain how to configure multiple local models and how to read the
    comparison output.
  - Docs state clearly that LLM review can miss issues and can hallucinate
    findings; deterministic rules remain the baseline scanner.
  - Docs state what content is sent to the local model and what is never sent.
  - No docs imply that a cloud API key, hosted model, or account is required.
  - Any changed examples are backed by built-CLI smoke tests.

  Implementation notes:
  - Keep README additions short. Put longer setup examples in a focused doc if
    needed, then link to it from README.
  - Verify all local markdown links and referenced paths.
  - Do not add screenshots or README visuals unless the implementation also
    includes browser-rendered proof at the embedded size.
  - If the feature adds new cache/config files, document their exact paths and
    how to remove or inspect them.

  Testing and verification:
  - Smoke-test the exact documented commands with a temporary config root and a
    fake local model endpoint.
  - Run command help for every new or changed command and compare it against the
    docs.
  - Verify markdown links and file references touched by the docs resolve.
  - Run the full verification suite required by `AGENT.md`: build, test, lint,
    typecheck, and the clean build-output warning check.

## Dependencies added

(Append to this list when Ralph adds anything beyond the list in `AGENT.md`.)

## Decisions made during implementation

(If Ralph makes a choice that is not obvious from the task text or specs,
document it here.)

## Blockers

(If Ralph hits something it cannot proceed past, document the exact error
output and what was attempted.)
