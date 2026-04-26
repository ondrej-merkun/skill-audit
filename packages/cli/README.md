# skillaudit

Scan installed AI agent skills for prompt injection and malicious code.

`skill-audit` is the npm package. `skillaudit` is the command it installs.

```bash
npx skill-audit
```

Or install it globally:

```bash
npm install -g skill-audit
skillaudit scan
```

## Commands

```bash
skillaudit scan
skillaudit scan --json -o skillaudit-report.json
skillaudit list
skillaudit explain <name>
skillaudit ignore <name>
```

Scanning is local-first. Optional enrichment can contact external services;
use `--offline` to skip enrichment network calls.

Repository: <https://github.com/ondrejmerkun/skillaudit>

