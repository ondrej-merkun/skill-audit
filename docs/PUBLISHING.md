# Publishing

Public npm releases use trusted publishing from GitHub Actions instead of a
long-lived npm write token.

Before tagging a release, complete the project-specific checks in
[`docs/RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

## npm package settings

Before pushing a release tag, configure the `@ondrej-merkun/skill-audit` package
on npm with a trusted publisher:

- Publisher: GitHub Actions
- Organization or user: `ondrej-merkun`
- Repository: `skill-audit`
- Workflow filename: `release.yml`

The package `repository.url` in `packages/cli/package.json` must continue to
point to `git+https://github.com/ondrej-merkun/skill-audit.git`. The release
workflow runs on GitHub-hosted Ubuntu with Node 24, grants `id-token: write`,
and publishes from `packages/cli` with `npm publish --access public`. Trusted
publishing should provide the provenance metadata for the package release.

After a trusted-publishing release succeeds, keep npm package publishing access
restricted to trusted publishers and revoke any unused automation write tokens.
