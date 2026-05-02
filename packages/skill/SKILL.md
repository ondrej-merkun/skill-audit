---
name: skill-audit
description: Scan installed agent skills, plugins, and cross-agent instruction
  files for prompt injection, exfiltration, malicious code, and dependency risk.
  Use when the user asks to audit, check, review, inventory, or verify skills
  for Claude Code, Codex, Cursor, Copilot, Gemini, or AGENTS.md-style project
  instructions.
allowed-tools: [Bash]
---

# skill-audit

Use the published CLI unless the user explicitly asks to test a local checkout:

```bash
npx --yes @ondrej-merkun/skill-audit@latest
```

The bare command is the default scan and is equivalent to `skill-audit scan`.
It scans installed or currently exposed skill surfaces by default, keeps all
rule scanning local, and does not execute skill code.

## Recommended Workflow

For a normal audit, run the human-readable scan first:

```bash
npx --yes @ondrej-merkun/skill-audit@latest scan
```

Then summarize:

1. Total skills scanned, compromised count, and overall verdict.
2. FAIL-verdict skills first, with the top issue and one-line remediation.
3. REVIEW-verdict skills that need human judgment.
4. Suggested follow-up commands, usually `explain`, `ignore`, or a JSON/HTML
   report.

Always show the `skill-audit` table or summary output verbatim in a code block
before interpreting it. For automation or CI-style requests, use `--json` and
summarize the parsed JSON instead.

Do not recommend `rm`, `delete`, uninstall, or file-editing commands without
explicit user confirmation. Prefer `skill-audit explain <skill>` first, and
use `skill-audit ignore <skill>` only after the user has reviewed the exact
installed tree and wants to suppress a false positive.

## Commands

Global options:

| Option | Use |
|---|---|
| `-V, --version` | Print the installed CLI version. |
| `-h, --help` | Print command help. |

### Default Scan

```bash
npx --yes @ondrej-merkun/skill-audit@latest
npx --yes @ondrej-merkun/skill-audit@latest scan
```

Scans discovered skills with deterministic local rules and prints the table
output. Exit codes: `0` PASS, `1` threshold failure, `2` usage/runtime error,
`3` incomplete scan without a threshold failure.

### `scan`

```bash
npx --yes @ondrej-merkun/skill-audit@latest scan [options]
```

Options:

| Option | Use |
|---|---|
| `--json` | Emit schema v1.0 JSON to stdout. |
| `--summary` | Emit compact one-line summary output. |
| `--html <file>` | Write a standalone HTML report and still print the selected scan payload. |
| `-o, --output <file>` | Write the selected non-HTML output to a file instead of stdout. |
| `--strict` | Treat REVIEW as FAIL for exit-code purposes. |
| `--fail-on <band>` | Set exit threshold to `FAIL` or `REVIEW`; default is `FAIL`. |
| `--agent <id>` | Restrict scan to one agent id. |
| `--include-marketplaces` | Include inactive local marketplace inventory as well as installed/exposed skills. |
| `--llm <name>` | Add optional local LLM review; repeat, comma-separate, or pass `all`. |
| `--offline` | Hidden maintenance option; skip enrichment and LLM review. Use only when explicitly requested. |

Supported `--agent` ids are `claude-code`, `codex`, `cross-agent`, `cursor`,
`gemini`, `copilot`, `windsurf`, and `cline`.

Output combinations:

```bash
npx --yes @ondrej-merkun/skill-audit@latest scan --json
npx --yes @ondrej-merkun/skill-audit@latest scan --summary
npx --yes @ondrej-merkun/skill-audit@latest scan --json --output skill-audit-results.json
npx --yes @ondrej-merkun/skill-audit@latest scan --summary --output skill-audit-summary.txt
npx --yes @ondrej-merkun/skill-audit@latest scan --output skill-audit-report.txt
npx --yes @ondrej-merkun/skill-audit@latest scan --html skill-audit-report.html
```

Do not combine `--html` and `--output`; that is a usage error.

Scope examples:

```bash
npx --yes @ondrej-merkun/skill-audit@latest scan --agent claude-code
npx --yes @ondrej-merkun/skill-audit@latest scan --agent codex --json
npx --yes @ondrej-merkun/skill-audit@latest scan --include-marketplaces
npx --yes @ondrej-merkun/skill-audit@latest scan --json --fail-on REVIEW
npx --yes @ondrej-merkun/skill-audit@latest scan --strict
```

Local LLM review examples:

```bash
npx --yes @ondrej-merkun/skill-audit@latest scan --llm local
npx --yes @ondrej-merkun/skill-audit@latest scan --llm local --llm qwen
npx --yes @ondrej-merkun/skill-audit@latest scan --llm local,qwen --summary
npx --yes @ondrej-merkun/skill-audit@latest scan --llm all --html skill-audit-report.html
```

LLM review is a second opinion. It does not replace deterministic findings or
change the deterministic rule results. Model failures, timeouts, and invalid
responses must be reported as LLM review status, not treated as scanner PASS.

### `list`

```bash
npx --yes @ondrej-merkun/skill-audit@latest list [options]
```

Lists discovered skills without scanning their contents.

Options:

| Option | Use |
|---|---|
| `--agent <id>` | Restrict inventory to one agent id. |
| `--include-marketplaces` | Include inactive marketplace inventory and label install state. |
| `--json` | Emit a JSON array with agent, name, path, tree hash, scope, install state, and format. |

Examples:

```bash
npx --yes @ondrej-merkun/skill-audit@latest list
npx --yes @ondrej-merkun/skill-audit@latest list --agent codex
npx --yes @ondrej-merkun/skill-audit@latest list --include-marketplaces
npx --yes @ondrej-merkun/skill-audit@latest list --json
```

### `explain`

```bash
npx --yes @ondrej-merkun/skill-audit@latest explain <skill-name-or-id> [options]
```

Shows the full detail view for one skill, including findings and remediation.
Use this before suggesting any destructive cleanup.

Options:

| Option | Use |
|---|---|
| `--json` | Emit the detail payload as JSON. |
| `--offline` | Hidden maintenance option; skip disabled network enrichment. |

Examples:

```bash
npx --yes @ondrej-merkun/skill-audit@latest explain obfuscated-eval-skill
npx --yes @ondrej-merkun/skill-audit@latest explain obfuscated-eval-skill --json
```

### `ignore`

```bash
npx --yes @ondrej-merkun/skill-audit@latest ignore <skill-name-or-id>
```

Adds the selected skill's current `treeSha256` to the local ignore list so
subsequent scans skip it. Use only for a reviewed false positive. A changed
skill tree gets a different hash and must be reviewed again.

### `llm add`

```bash
npx --yes @ondrej-merkun/skill-audit@latest llm add <name> --base-url <url> --model <id> [options]
```

Stores a named local OpenAI-compatible review model. The base URL must be a
loopback HTTP(S) URL such as `http://127.0.0.1:11434/v1` or
`http://localhost:1234/v1`; credentials in URLs and non-loopback hosts are
rejected.

Required options:

| Option | Use |
|---|---|
| `--base-url <url>` | Local OpenAI-compatible server base URL. |
| `--model <id>` | Local model id to send to `/v1/chat/completions`. |

Optional options:

| Option | Use |
|---|---|
| `--provider <provider>` | Provider type; only `openai-compatible` is supported. |
| `--timeout <ms>` | Positive integer health-check timeout in milliseconds. |
| `--context-tokens <tokens>` | Positive integer token budget for LLM review payloads. |
| `--disabled` | Store the model but exclude it from `--llm all` and scan review. |

Example:

```bash
npx --yes @ondrej-merkun/skill-audit@latest llm add local --base-url http://127.0.0.1:11434/v1 --model llama3.1
```

Configs are written to `$XDG_CONFIG_HOME/skill-audit/llms.json`, or
`~/.config/skill-audit/llms.json` when `XDG_CONFIG_HOME` is unset.

### `llm list`

```bash
npx --yes @ondrej-merkun/skill-audit@latest llm list [--json]
```

Lists configured local review models and whether each is enabled.

### `llm check`

```bash
npx --yes @ondrej-merkun/skill-audit@latest llm check <name> [--json]
```

Health-checks one configured model by sending a minimal local
OpenAI-compatible chat-completions request. Status values are `ok`,
`unavailable`, `timeout`, or `invalid-response`.

## Discovery Surface

Default `scan` and `list` include installed or currently exposed skills and
project instruction files. Marketplace cache payloads are inactive inventory
unless `--include-marketplaces` is set.

Current built-in discovery covers:

- Claude Code skills, commands, agents, plugins, MCP config, and project files.
- Codex global/project instructions, skills, prompts, plugins, and config.
- Cursor, GitHub Copilot, and Gemini skill/instruction surfaces.
- Cross-agent project instruction files such as `AGENTS.md`.

## Reporting Guidance

When presenting results:

- Keep deterministic rule findings authoritative.
- State when LLM review was requested and whether each model returned `ok`,
  `unavailable`, `timeout`, or `invalid-response`.
- Treat PASS as "no shipped rule matched", not proof of safety.
- For FAIL findings, recommend reviewing the detail view and removing the risky
  instruction/code, then rerunning `scan` or `explain`.
- For REVIEW findings, explain what human judgment is needed.
- For false positives, ask whether the user wants to run `ignore`; do not
  suppress automatically.
