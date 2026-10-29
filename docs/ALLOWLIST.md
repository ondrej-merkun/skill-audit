# Allowlist Maintenance

`skill-audit` uses exact `treeSha256` matches for trusted bundled skills. An
allowlist match only demotes `PI-*` findings to `info`; non-PI findings and
mandatory-fail rules still report normally. The exception is the `PI-*` +
credential-store compounds: they need a `PI-*` finding that the allowlist did
not demote, so a demoted `PI-*` finding does not trigger them.

Refresh the manifest after updating a bundled trusted skill payload:

```bash
node scripts/vendor-allowlist.mjs
pnpm test test/scoring.test.ts
```

The manifest must contain real 64-character SHA-256 tree hashes only. Do not
commit placeholder values such as all-zero hashes, and do not add entries based
only on a skill name, vendor name, or install path.
