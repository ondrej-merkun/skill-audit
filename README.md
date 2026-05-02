# skill-audit

Scan every AI agent skill on your machine for prompt injection and malicious
code. Local rules run by default, with optional local LLM review for deeper
context.

`skill-audit` scans AI-agent skills, plugins, MCP configs, and project
instruction files. It discovers content exposed to Claude Code, OpenAI Codex,
GitHub Copilot, Cursor, Gemini CLI, Windsurf, and cross-agent project files,
then shows the riskiest result first in a colorized verdict table.
When you want a deeper semantic pass, add optional local LLM review over the
same discovered skills, deterministic findings, relevant file paths, and capped
snippets.

Run a one-off scan with `npx`, or install the `skill-audit` binary globally
before using the commands below, including local LLM review.

```bash
# One-off scan
npx @ondrej-merkun/skill-audit

# Install globally
npm install -g @ondrej-merkun/skill-audit
skill-audit
```

Need the deeper local review?

```bash
skill-audit llm add local --base-url http://127.0.0.1:11434/v1 --model llama3.1
skill-audit scan --llm local
```

Default rule scanning runs on your machine with no model calls. Optional local
LLM review uses your loopback OpenAI-compatible server, labels model findings
separately from rule findings, and does not require a cloud account or remote
model. This version does not perform enrichment lookups in the user-facing CLI.

## Read The First Result

The default scan sorts findings by risk, so the first row is the next thing to
review.

```text
AGENT         SKILL                    VERDICT   SCORE   TOP ISSUE
Claude Code   obfuscated-eval-skill    FAIL      50      CODEEXEC-JS-EVAL-FUNCTION
Claude Code   webhook-exfil-skill      FAIL      75      NET-WEBHOOK-KNOWN
Codex         review-helper            REVIEW    82      PI-OVERRIDE
```

- **FAIL** means a high-risk or mandatory-fail rule fired. Remove or review the
  skill before using it.
- **REVIEW** means risky patterns need human context, often in security
  training, test fixtures, or quoted examples.
- **PASS** means no shipped rule fired. It is not a guarantee that the skill is
  safe or current.

Investigate one row with:

```bash
skill-audit explain obfuscated-eval-skill
```

## Common Commands

Scan and filter:

```bash
skill-audit                                          # default scan
skill-audit scan --agent claude-code                 # restrict discovery to one agent
skill-audit scan --include-marketplaces              # include inactive local marketplace inventory
```

Write reports:

```bash
skill-audit scan --json -o skill-audit-report.json   # machine-readable JSON
skill-audit scan --summary -o skill-audit-summary.txt # compact text summary
skill-audit scan --html skill-audit-report.html      # standalone HTML report
```

Add local LLM review:

```bash
skill-audit llm add local --base-url http://127.0.0.1:11434/v1 --model llama3.1
skill-audit llm list                                 # configured local models
skill-audit llm check local                          # local model health check
skill-audit scan --llm local                         # add local LLM review
skill-audit scan --llm local --llm qwen              # compare multiple local models
skill-audit scan --llm all --html skill-audit-report.html
```

Inventory and follow up:

```bash
skill-audit list                                     # inventory without scanning
skill-audit list --include-marketplaces              # show installed and inactive marketplace skills
skill-audit explain <name>                           # inspect one result
skill-audit ignore <name>                            # suppress a reviewed tree hash
```

More workflows: [`docs/EXAMPLES.md`](docs/EXAMPLES.md).

## What It Covers

`skill-audit` scans global and project-local skill locations for Claude Code,
Codex, Copilot, Cursor, Gemini CLI, Windsurf, and cross-agent instruction files
such as `AGENTS.md`. It matches 41 shipped rules across prompt injection, network
exfiltration, filesystem access, code execution, obfuscation, hardcoded
secrets, git-history access, dependency risk, and skill-specific malware
patterns.

Installed or currently exposed skills are the default scan and list surface.
Plugin marketplace payloads under `plugins/marketplaces/` are inactive local
inventory; include them only with `--include-marketplaces`, where output labels
rows as `installed` or `marketplace`.

## Optional Local LLM Review

The deterministic rule scanner is the baseline. If you already run a local
OpenAI-compatible model server, you can add LLM review as a second opinion:

```bash
skill-audit llm add local --base-url http://127.0.0.1:11434/v1 --model llama3.1
skill-audit llm check local
skill-audit scan --llm local
```

`skill-audit llm add` writes model config to
`$XDG_CONFIG_HOME/skill-audit/llms.json`, or `~/.config/skill-audit/llms.json`
when `XDG_CONFIG_HOME` is unset. Base URLs must be loopback URLs such as
`127.0.0.1` or `localhost`; no cloud API key, hosted account, or remote model is
required.

For comparison runs, repeat `--llm`, pass comma-separated names, or use
`--llm all` for every enabled configured local model:

```bash
skill-audit scan --llm local --llm qwen
skill-audit scan --llm local,qwen --summary
skill-audit scan --llm all --html skill-audit-report.html
```

LLM findings are labeled separately from deterministic rule findings. They do
not replace rule results, and model failures, timeouts, or invalid responses do
not hide scanner findings. Review payloads include skill metadata, deterministic
findings, relevant file paths, and capped snippets from files that triggered
findings after obvious secret redaction. `skill-audit` does not send whole home
directories, unrelated files, environment variables, or discovered secrets.

Detailed reference:

- [Discovery paths, scoring, JSON, CI, and FAQ](docs/REFERENCE.md)
- [Examples](docs/EXAMPLES.md)
- [Threat model and network boundary](docs/THREAT_MODEL.md)
- [Rule catalog](specs/RULES.md)
- [Allowlist maintenance](docs/ALLOWLIST.md)

## Use In CI

```bash
npx --yes @ondrej-merkun/skill-audit@latest scan \
  --json \
  --output skill-audit-results.json \
  --fail-on REVIEW
```

`--fail-on REVIEW` exits 1 for REVIEW or FAIL verdicts. The repository also
ships a GitHub Action:

```yaml
- uses: ondrej-merkun/skill-audit@v1
```

See the [CI reference](docs/REFERENCE.md#use-in-ci) for the full workflow.

## Limitations

`skill-audit` is a local scanner. It does not execute skills, sandbox tools, or
prove intent. Optional local LLM review can miss issues and can hallucinate
findings; deterministic rules remain the baseline scanner. The tool can miss
novel jailbreaks, runtime-fetched behavior, split-string obfuscation, and risks
in services that a skill calls later. Treat it as a fast first filter, not a
replacement for code review or dependency review.
