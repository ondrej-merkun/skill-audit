# skillaudit — Claude Code Skill

Lets Claude Code run `npx skillaudit` on your behalf to audit installed
agent skills for prompt injection, exfiltration, and malicious code.

## Install

**Option A — manual copy (works now):**

```bash
mkdir -p ~/.claude/skills/skillaudit
cp SKILL.md ~/.claude/skills/skillaudit/
```

**Option B — via `skills.sh` (once published):**

```bash
npx skills.sh install skillaudit
```

## Usage

After installing, ask Claude Code:

> "Audit my installed skills"
> "Check my skills for anything suspicious"
> "Run skillaudit on my Cursor rules"

Claude will run `npx skillaudit@latest scan --json`, parse the output,
and summarize compromised skills with one-line remediations.

To audit a specific skill:

> "Explain the findings for my git-helper skill"

## What it does

Invokes `npx skillaudit` (no install required — runs via npx) and
interprets the structured JSON output. Claude will:

1. Report total skills scanned and how many are compromised
2. List FAIL-verdict skills with their top issue and remediation
3. Offer to deep-dive any flagged skill with `skillaudit explain`

Claude will never suggest deleting a skill without your explicit
confirmation.

## Requirements

- Node.js 18+ (for `npx`)
- Internet access for `npx skillaudit@latest` on first run (cached
  afterward by npm)

## Source

This skill is part of the [skillaudit](https://github.com/skillaudit/skillaudit)
project. The CLI it invokes (`npx skillaudit`) runs entirely locally —
no skill content is sent to any server unless you opt into enrichment.
