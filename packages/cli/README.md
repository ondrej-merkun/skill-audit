# skill-audit

Scan installed AI agent skills for prompt injection and malicious code.

`@ondrej-merkun/skill-audit` is the npm package. `skill-audit` is the command it
installs.

```bash
npx @ondrej-merkun/skill-audit
```

Or install it globally:

```bash
npm install -g @ondrej-merkun/skill-audit
skill-audit scan
```

## Commands

```bash
skill-audit scan
skill-audit scan --json -o skill-audit-report.json
skill-audit scan --skill <name-or-id>
skill-audit list
skill-audit explain <name>
skill-audit explain <name> --llm local
skill-audit ignore <name>
```

Scanning is local-first. This version does not perform enrichment lookups in
the user-facing CLI.

Repository: <https://github.com/ondrej-merkun/skill-audit>
