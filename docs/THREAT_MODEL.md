# Threat Model

This document describes the security boundaries for `skillaudit`: what the CLI
reads, what it trusts, what may leave the machine, and how users should treat
scan results.

## Scope

`skillaudit` inventories and scans local AI agent instructions, skills,
commands, plugin payloads, MCP configuration, and project-level agent guidance
that supported agents may expose to a coding assistant.

The scanner is designed to answer a narrow question: "Does this installed or
project-local agent content match known risky patterns?" It does not sandbox,
execute, quarantine, uninstall, or prove runtime behavior.

## Local Skill Contents

Skill and instruction files are untrusted input. `skillaudit` reads them from
disk and applies local deterministic rules to their text and nearby dependency
manifests.

The scanner must not execute skill code, install dependencies, follow arbitrary
commands found in a skill, or trust manifests as proof of benign behavior. A
skill that passes all rules may still fetch code later, depend on a compromised
service, or hide behavior behind inputs the static scanner cannot see.

## Environment Variables

The CLI inherits the user's process environment like any local command. Rules
look for patterns that read or exfiltrate environment variables, but
`skillaudit` should not print environment variable values as part of findings.

`GITHUB_TOKEN`, when present, may be used only as an API token for optional
GitHub metadata enrichment. It is not sent to skills, written into reports, or
used during local rule evaluation.

## Network Enrichment

Core scanning is local. Optional enrichment may contact external metadata
services when the selected output mode displays or serializes that data:

- `skills.sh` may receive a GitHub repository slug.
- GitHub may receive a repository slug and, if set, `GITHUB_TOKEN` as an API
  credential.
- `deps.dev` may receive dependency package names from scanned manifests.

`--offline` disables all enrichment network calls. Enrichment failures must not
block scanning; stale cache fallback or omitted metadata is safer than making
scan verdicts depend on a network service.

## Rule Updates

Rules are shipped with the package. The CLI must not fetch new detection logic
at runtime, because a remote rule feed would become executable policy over
local files.

Rule changes should be reviewed like code changes, include malicious and benign
fixtures, and keep false-positive handling explicit. A rule should not be
silently weakened to make a test pass.

## Allowlists And Ignores

Allowlists and local ignores reduce noise; they are not proof that content is
safe. Bundled allowlist entries rely on exact tree hashes for trusted payloads.
Local ignores should be used only after reviewing the exact installed tree.

Changing a skill's content changes the tree hash and should require review
again. Reports should keep allowlisted or ignored state visible so users know
why findings were suppressed.

## GitHub Action Execution

The GitHub Action runs `skillaudit` in CI against repository content and any
agent files present in the checked-out workspace. It should use the same local
rule engine and optional enrichment boundaries as the CLI.

Action runs should not require long-lived publish or scan secrets. If a token is
available through GitHub Actions, it should be scoped to the job need and used
only for the documented metadata or publishing operation. Reports generated in
CI should be treated as potentially sensitive because snippets and file paths
can reveal repository internals.

## False Positives

False positives are expected around security training material, documentation
that quotes exploit strings, red-team examples, and intentionally malicious test
fixtures. Users should review the rule ID, file path, snippet, and fix text
before suppressing a finding.

Suppression should be narrow: prefer exact tree-hash ignores or documented
allowlist entries over broad rule removal. Public issues are appropriate for
non-exploitable false positives with minimized examples and real secrets
removed.

## False Negatives

A PASS verdict means no shipped rule matched the scanned content. It is not a
guarantee that the skill is safe.

The scanner can miss novel prompt-injection phrasing, split-string or encoded
payloads below rule thresholds, behavior fetched at runtime, malicious services
called by otherwise normal code, and risks introduced after a scan. Treat
`skillaudit` as a fast local first pass, not a replacement for code review,
runtime isolation, provenance checks, or dependency review.
