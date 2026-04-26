# Publishing

Public npm releases use trusted publishing from GitHub Actions instead of a
long-lived npm write token.

## npm package settings

Before pushing a release tag, configure the `skill-audit` package on npm with a
trusted publisher:

- Publisher: GitHub Actions
- Organization or user: `ondrejmerkun`
- Repository: `skillaudit`
- Workflow filename: `release.yml`

The package `repository.url` in `packages/cli/package.json` must continue to
match `https://github.com/ondrejmerkun/skillaudit` exactly. The release workflow
runs on GitHub-hosted Ubuntu with Node 24, grants `id-token: write`, and publishes
from `packages/cli` with `npm publish --access public --provenance`.

After a trusted-publishing release succeeds, keep npm package publishing access
restricted to trusted publishers and revoke any unused automation write tokens.
