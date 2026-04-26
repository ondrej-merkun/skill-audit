# Release Checklist

Use this checklist before publishing a `skill-audit` npm package or tagging an
action release. The release workflow performs the automated gates, but the
maintainer should run the local checks first so a bad tag is not the first place
a problem appears.

## Before Tagging

- Confirm the release contents are final in [`CHANGELOG.md`](../CHANGELOG.md).
- Confirm package metadata in
  [`packages/cli/package.json`](../packages/cli/package.json) still points to
  `https://github.com/ondrejmerkun/skillaudit`.
- Confirm npm trusted publishing is configured as described in
  [`docs/PUBLISHING.md`](PUBLISHING.md).
- Confirm public docs changed in the release have working local links and image
  paths.

## Local Verification

Run these from the repository root:

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm build 2>&1 | grep -iE 'warn|error'
```

The final command must print nothing. If it prints a warning or error line, fix
the build output before releasing. With plain `grep`, exit status 1 means no
matching warning or error lines were found.

Run a built-CLI smoke check against an isolated home and project directory:

```bash
TMP_HOME="$(mktemp -d)"
TMP_PROJECT="$(mktemp -d)"
HOME="$TMP_HOME" \
USERPROFILE="$TMP_HOME" \
SKILLAUDIT_CWD="$TMP_PROJECT" \
node packages/cli/dist/index.js scan --summary --offline
```

The command should complete without stack traces or unexpected stderr. A
nonzero verdict exit code is acceptable only when the smoke input intentionally
contains findings.

Verify the packed npm contents:

```bash
pnpm --filter skill-audit pack --dry-run
```

The dry run must include `dist/`, `package.json`, `README.md`, `LICENSE`, and
`CHANGELOG.md`, and must not include loop-driver files such as `fix_plan.md`,
`PROMPT.md`, `AGENT.md`, or test fixtures.

## Markdown Links And Paths

For any release that changes markdown, check local file links and image paths in
the changed files. At minimum, verify links to these required files still
resolve:

- [`README.md`](../README.md)
- [`LICENSE`](../LICENSE)
- [`SECURITY.md`](../SECURITY.md)
- [`CHANGELOG.md`](../CHANGELOG.md)
- [`docs/THREAT_MODEL.md`](THREAT_MODEL.md)
- [`docs/PUBLISHING.md`](PUBLISHING.md)

External links can be checked manually. Do not publish with broken local
references.

## Trusted Publishing And Provenance

Before pushing the release tag, verify:

- [`release.yml`](../.github/workflows/release.yml) grants `id-token: write`.
- The release job installs npm with trusted-publishing support.
- The publish step runs from `packages/cli`.
- The publish step does not require a long-lived `NPM_TOKEN`.
- The npm package has a trusted publisher for GitHub Actions configured for
  repository `ondrejmerkun/skillaudit` and workflow `release.yml`.

After the workflow finishes, inspect the npm package version and confirm the
package page shows provenance or trusted-publishing metadata for the release.

## Tagging

Create and push a version tag only after the checks above pass:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Use the actual package version from
[`packages/cli/package.json`](../packages/cli/package.json). If the GitHub
Action wrapper is released from the same repository tag, use the same tag in
workflow examples.
