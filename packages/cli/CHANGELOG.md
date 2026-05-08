# Changelog

## 0.2.1

- Preserve multi-agent skill ownership in table, JSON, and HTML output so
  skills discovered through more than one agent keep their full source context.
- Let `skill-audit scan --html` write to `scan.html` by default while preserving
  custom `--html <file>` output.
- Suppress inert false positives in scanner-oriented examples and supporting
  docs while keeping malicious execution, filesystem, network, and memory-write
  fixtures covered.

## 0.2.0

- Add targeted skill review with `skill-audit scan --skill <name-or-id>` and
  `skill-audit explain <name> --llm <model>` so users can scan or locally
  LLM-review one matching skill instead of the full inventory.
- Show skill provenance in scan results and HTML reports with a new SOURCE
  column that distinguishes direct installs, plugins, marketplace inventory,
  MCP entries, and extensions, including plugin names when available.
- Replace terse rule IDs in top-issue summaries with readable finding labels
  and keep those labels consistent across README examples, table output, and
  HTML reports.
- Treat unreferenced supporting Markdown docs as inert context for
  prompt-injection verdicts by default, while adding
  `--scan-all-supporting-files` for stricter scans of every supporting file.
- Improve local LLM review reliability by sharing scan/explain review logic,
  accepting broader finding categories, repairing narrow malformed JSON cases,
  skipping empty review payloads, and allowing slower local models more time.
- Reduce markdown-obfuscation false positives in scanner docs, examples, and
  rule documentation while preserving detection for executable base64/eval
  payloads.
- Improve scan progress copy so discovery can report active skill-search work
  instead of stale broad agent-check labels.
- Refresh the README, package README, examples, demo GIF, badges, and social
  preview around the fully local scan boundary and localhost-only optional LLM
  review.

## 0.1.3

- Resolve GitHub code scanning alerts by tightening CI permissions and avoiding
  executable unsafe-regex test payloads.
- Resolve Dependabot dependency alerts and update runtime dependencies to
  Commander 14 and Ora 9.
- Refresh package docs, issue templates, release docs, README wording, and
  report terminology after recent review findings.
- Keep public agent/rule documentation aligned with the current Cline,
  Windsurf, and 46-rule scanner surface.

## 0.1.2

- Add discovery support for Windsurf and Cline agents.
- Add root-scan shortcuts so `skill-audit` can run default scan flow directly.
- Keep CLI agent help synchronized with supported agent IDs.
- Tighten rule/risk behavior by aligning regex safety paths and adding deterministic
  threat detectors.
- Refresh documentation and social proof surface (README, social preview, badges,
  and demo image rendering guidance) with related test/readme updates.
- Improve verification loop performance through a lighter local loop and updated tests.

## 0.1.1

- Publish under the scoped npm package `@ondrej-merkun/skill-audit`.
- Highlight optional local LLM review in the README.
- Keep CLI runtime version metadata aligned with package metadata.

## 0.1.0

- Initial MVP package for scanning installed AI agent skills.
