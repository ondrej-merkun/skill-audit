## Summary

- Scope:
- Linked issue/task:

## Tests Run

- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm build 2>&1 | grep -iE 'warn|error'`
- Other:

## CLI Smoke Output

Paste the first screen of built CLI output when this changes commands,
discovery, scanning, reports, or user-facing output. Use the exact
documented invocation, including bare `skillaudit` if this PR affects the
default command.

```text
N/A
```

## Checklist

- [ ] This PR is focused on one behavior change.
- [ ] New or tuned rules include malicious fixtures and benign security-doc /
      quoted-example fixtures where relevant.
- [ ] User-facing output changes were checked with the built CLI.
- [ ] Visible output data has both populated and empty/unavailable coverage.
- [ ] Generated HTML interactions were clicked/tested when HTML changed.
- [ ] Markdown links and image paths resolve when docs are touched.
- [ ] README screenshots/SVGs/badges render correctly and external badge/action
      targets were verified when docs changed them.
- [ ] No secrets are included.
