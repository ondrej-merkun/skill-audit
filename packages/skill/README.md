# skill-audit — Claude Code Skill

Lets Claude Code run `npx skill-audit` on your behalf to audit installed
agent skills for prompt injection, exfiltration, and malicious code.

## Install

**Option A — manual copy (works now):**

```bash
mkdir -p ~/.claude/skills/skill-audit
cp SKILL.md ~/.claude/skills/skill-audit/
```

**Option B — via `skills.sh` (once published):**

```bash
npx skills.sh install skill-audit
```

## Usage

After installing, ask Claude Code:

> "Audit my installed skills"
> "Check my skills for anything suspicious"
> "Run skill-audit on my Cursor rules"

Claude will run `npx skill-audit@latest scan --json`, parse the output,
and summarize compromised skills with one-line remediations.

To audit a specific skill:

> "Explain the findings for my git-helper skill"

## What it does

Invokes `npx skill-audit` (no install required — runs via npx) and
interprets the structured JSON output. Claude will:

1. Report total skills scanned and how many are compromised
2. List FAIL-verdict skills with their top issue and remediation
3. Offer to deep-dive any flagged skill with `skill-audit explain`

Claude will never suggest deleting a skill without your explicit
confirmation.

## Requirements

- Node.js 18+ (for `npx`)
- Internet access for `npx skill-audit@latest` on first run (cached
  afterward by npm)

## Source

This skill is part of the [skill-audit](https://github.com/ondrej-merkun/skill-audit)
project. The CLI it invokes (`npx skill-audit`) runs entirely locally —
no skill content is sent to any server unless you opt into enrichment.
