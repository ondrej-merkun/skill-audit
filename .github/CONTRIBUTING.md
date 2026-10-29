# Contributing

Thanks for helping improve `skill-audit`.

## Development

Use one of these Node.js versions: 22.18 or newer on 22.x, 24.11 or newer on
24.x, or 26 or newer. The build tool, tsdown, needs them. Use the pnpm version
that the `packageManager` field in `package.json` pins. CI uses the same version.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Follow the repo conventions in
[docs/agents/AGENT.md](../docs/agents/AGENT.md). For behavior questions, start
with [specs/SPEC.md](../specs/SPEC.md). Read
[docs/agents/LESSONS.md](../docs/agents/LESSONS.md) before changing scanner
behavior; it records project-specific pitfalls from previous work.

## Pull Requests

- Keep PRs focused on one behavior change.
- Add malicious and benign fixtures for every new rule. If the rule can match
  security docs, scanner/tester packages, quoted hostile prompts, or examples,
  include those benign cases explicitly.
- Do not weaken a rule just to make a test pass.
- Do not commit secrets. Redacted or synthetic fixtures belong under
  `test/fixtures/`.
- Smoke-test the exact documented CLI invocation for command changes.
- For generated HTML reports, test at least one click/keyboard interaction.
- For README screenshots, SVGs, badges, or action examples, render or verify
  the changed target rather than only checking that the file exists.
- Pin each `uses:` in `.github/workflows/` and `action.yml` to a full commit
  SHA with a trailing `# vX.Y.Z` comment. Dependabot keeps both current.
- Run the verification commands above before requesting review.

No contributor license agreement is required. Contributions are accepted under
the Apache-2.0 license.
