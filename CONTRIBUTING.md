# Contributing

Thanks for helping improve `skill-audit`.

## Development

Use Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Follow the repo conventions in [AGENT.md](AGENT.md). For behavior questions,
start with [specs/SPEC.md](specs/SPEC.md). Read [LESSONS.md](LESSONS.md)
before changing scanner behavior; it records project-specific pitfalls from
previous work.

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
- Run the verification commands above before requesting review.

No contributor license agreement is required. Contributions are accepted under
the Apache-2.0 license.
