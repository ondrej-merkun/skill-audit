<p align="center">
  <img src="docs/demo.svg" alt="skill-audit terminal demo showing scan results" width="800" />
</p>

<h1 align="center">skill-audit</h1>

<p align="center">
  Scan every AI agent skill on your machine for prompt injection and malicious code.<br/>
  Local scanning, zero-config.
</p>

<p align="center">
  <a href="https://github.com/ondrej-merkun/skill-audit/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ondrej-merkun/skill-audit/ci.yml" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0" /></a>
</p>

---

> **36% of agent skills ship with a security flaw. 13% with a critical one.**
> — [Snyk ToxicSkills study, Feb 2026](https://snyk.io/blog/toxic-skills)

`skill-audit` is a fast local first pass for AI-agent skills, plugins, MCP
configs, and project instruction files. It discovers content exposed to Claude
Code, OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI, and cross-agent project
files, then shows the riskiest result first in a colorized verdict table.

```bash
npx skill-audit
```

Core rule scanning runs on your machine. Optional enrichment can query
`skills.sh`, GitHub, and `deps.dev`; use `--offline` for a no-network scan.

## Install

```bash
# One-off scan
npx skill-audit

# Or install globally
npm install -g skill-audit
skill-audit
```

## Read The First Result

The default scan sorts findings by risk, so the first row is the next thing to
review.

```text
AGENT         SKILL                    VERDICT   SCORE   ENRICHMENT   TOP ISSUE
Claude Code   obfuscated-eval-skill    FAIL      50      -            CODEEXEC-JS-EVAL-FUNCTION
Claude Code   webhook-exfil-skill      FAIL      75      -            NET-WEBHOOK-KNOWN
Codex         review-helper            REVIEW    82      -            PI-OVERRIDE
```

- **FAIL** means a high-risk or mandatory-fail rule fired. Remove or review the
  skill before using it.
- **REVIEW** means risky patterns need human context, often in security
  training, test fixtures, or quoted examples.
- **PASS** means no shipped rule fired. It is not a guarantee that the skill is
  safe or current.

Investigate one row with:

```bash
skill-audit explain obfuscated-eval-skill --offline
```

## Common Commands

```bash
skill-audit scan                                      # default scan
skill-audit scan --offline                           # local-only, no enrichment
skill-audit scan --agent claude-code                 # restrict discovery
skill-audit scan --include-marketplaces              # include inactive local marketplace inventory
skill-audit scan --json -o skill-audit-report.json   # machine-readable report
skill-audit scan --html skill-audit-report.html      # standalone HTML report
skill-audit list                                     # inventory without scanning
skill-audit list --include-marketplaces              # show installed and inactive marketplace skills
skill-audit ignore <name>                            # suppress a reviewed tree hash
```

More workflows: [`docs/EXAMPLES.md`](docs/EXAMPLES.md).

## What It Covers

`skill-audit` scans global and project-local skill locations for Claude Code,
Codex, Copilot, Cursor, Gemini CLI, and cross-agent instruction files such as
`AGENTS.md`. It matches 41 shipped rules across prompt injection, network
exfiltration, filesystem access, code execution, obfuscation, hardcoded
secrets, git-history access, dependency risk, and skill-specific malware
patterns.

Installed or currently exposed skills are the default scan and list surface.
Plugin marketplace payloads under `plugins/marketplaces/` are inactive local
inventory; include them only with `--include-marketplaces`, where output labels
rows as `installed` or `marketplace`.

Detailed reference:

- [Discovery paths, comparison, scoring, JSON, CI, and FAQ](docs/REFERENCE.md)
- [Examples](docs/EXAMPLES.md)
- [Threat model and network boundary](docs/THREAT_MODEL.md)
- [Rule catalog](specs/RULES.md)
- [Allowlist maintenance](docs/ALLOWLIST.md)

## Use In CI

```bash
npx --yes skill-audit@latest scan \
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

`skill-audit` is a local, rule-based scanner. It does not execute skills, run an
LLM review, sandbox tools, or prove intent. It can miss novel jailbreaks,
runtime-fetched behavior, split-string obfuscation, and risks in services that a
skill calls later. Treat it as a fast first filter, not a replacement for code
review or dependency review.
