# Examples

These examples use the published package name, `@ondrej-merkun/skill-audit`, and
the installed binary, `skill-audit`. Use `npx @ondrej-merkun/skill-audit` for
one-off runs, or `skill-audit` after a global install.

## Local Scan

Run the default scan from any project directory:

```bash
npx @ondrej-merkun/skill-audit
```

The default view is a risk-first table. Skills with lower scores and worse
verdicts appear first:

```text
AGENT         SKILL                            SOURCE           VERDICT   SCORE   TOP ISSUE
claude-code   🔴 obfuscated-eval-skill         Direct           FAIL      50      JavaScript eval() or new Function() (minify.js:10)
claude-code   🔴 webhook-exfil-skill           Plugin - alerts  FAIL      75      Known webhook endpoint (notify.py:5)
claude-code   🟡 code-execution-skill          Direct           REVIEW    75      Python eval() call (repl.py:5)
```

Restrict discovery to one agent when you already know where the change came
from:

```bash
skill-audit scan --agent claude-code
skill-audit scan --agent codex
skill-audit scan --agent cursor
skill-audit scan --agent cline
```

Scan a single row by name or id when you already know which skill needs review:

```bash
skill-audit scan --skill obfuscated-eval-skill
skill-audit scan --skill obfuscated-eval-skill --llm local
```

Marketplace payloads under `plugins/marketplaces/` are inactive local
inventory and are skipped by default. Include them only when you want to inspect
uninstalled marketplace content:

```bash
skill-audit list --include-marketplaces
skill-audit scan --include-marketplaces
```

Opt-in output labels rows as `installed` or `marketplace`.

## JSON Output

Emit schema-versioned JSON to stdout for another tool to consume:

```bash
skill-audit scan --json
```

For review in a shell, combine it with `jq`:

```bash
skill-audit scan --json | jq '.summary'
```

Example summary shape:

```json
{
  "skills_scanned": 10,
  "compromised": 2,
  "percent_compromised": 20,
  "verdict": "FAIL"
}
```

## File Output

Write the selected non-HTML output mode directly to a file with
`-o, --output`:

```bash
skill-audit scan --json -o skill-audit-report.json
skill-audit scan --summary -o skill-audit-summary.txt
skill-audit scan -o skill-audit-report.txt
```

When `--output` is present, the report payload is written to the file and is not
also printed to stdout. Verdict exit codes still apply after the file is
flushed, so a FAIL result can still exit nonzero.

## HTML Reports

Use the dedicated HTML destination flag for a standalone report:

```bash
skill-audit scan --html skill-audit-report.html
```

Open the generated file in a browser or upload it as a CI artifact. `--html`
and `--output` are separate destination modes; use only one of them in the same
command.

## Explain One Skill

Use `explain` when a table row needs investigation:

```bash
skill-audit explain obfuscated-eval-skill
```

Shortened output:

```text
obfuscated-eval-skill
───────────────────────
  Agent:     claude-code
  Verdict:   FAIL ❌   Score 50/100   (1 mandatory-fail trigger)

  🔴 CRITICAL  CODEEXEC-JS-EVAL-FUNCTION
     ~/.claude/skills/obfuscated-eval-skill/minify.js:10
     │ eval(atob(_b));
     → JavaScript eval() or new Function() — arbitrary code execution risk.

  Next steps
  ────────────────────────────────────────
  →  rm -rf ~/.claude/skills/obfuscated-eval-skill     # remove now
  →  skill-audit scan --agent claude-code --json
```

Machine-readable detail is also available:

```bash
skill-audit explain obfuscated-eval-skill --json
```

If you have configured a loopback local model, `explain` can add model review
for only that selected skill:

```bash
skill-audit explain obfuscated-eval-skill --llm local
```

## CI

For generic CI, write JSON to a file and choose the verdict threshold that
should fail the job:

```bash
npx --yes @ondrej-merkun/skill-audit@latest scan \
  --json \
  --output skill-audit-results.json \
  --fail-on REVIEW
```

`--fail-on FAIL` fails only when the overall verdict is FAIL. `--fail-on
REVIEW` fails for REVIEW or FAIL.

For GitHub Actions, use the repository action and upload the JSON artifact:

```yaml
name: Skill audit

on:
  pull_request:
  workflow_dispatch:

jobs:
  scan-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: ondrej-merkun/skill-audit@v1
        with:
          fail-on: REVIEW
          results-file: skill-audit-results.json
```
