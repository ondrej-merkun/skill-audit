---
name: skillaudit
description: Scan installed agent skills for prompt injection, exfiltration,
  and malicious code. Use when the user asks to audit, check, review, or
  verify their installed skills or plugins across Claude Code, Cursor,
  Codex, Gemini, or Copilot.
allowed-tools: [Bash]
---

# skillaudit

When invoked, run:

```bash
npx skillaudit@latest scan --json
```

Parse the JSON output and summarize:
1. Total skills scanned and compromised count
2. List of FAIL-verdict skills with their top issue and a one-line remediation
3. Offer to run `skillaudit explain <skill>` for any flagged skill

If the user asks to audit a specific skill, run:
```bash
npx skillaudit@latest explain <skill-name> --json
```

Do not recommend rm/delete commands without explicit user confirmation.
Always show the skillaudit summary table verbatim in a code block before
your interpretation.
