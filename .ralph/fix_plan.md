# .ralph/fix_plan.md — skill-audit task list

Ralph picks the **first unchecked task** from this list each iteration.
Order matters — dependencies flow top-to-bottom. Do not reorder.

When all tasks are checked, append `ALL TASKS COMPLETE` on a new line
at the bottom and the loop will stop.

---

## Pending tasks

- [ ] **8.4** Migrate Biome 2 separately from broad npm major updates.

  Dependabot PR #6 bundled `@biomejs/biome` 2.4.13 with TypeScript 6,
  Vitest 4, Commander 14, Listr 10, Ora 9, and Node 25 types. That shape
  failed CI and local validation before tests completed. The first replacement
  migration should isolate Biome so formatter/linter config drift is solved
  without mixing in TypeScript, test-runner, or runtime-library behavior
  changes.

  Target behavior:
  - Update only `@biomejs/biome` from 1.9.4 to 2.4.13 in the root and
    `packages/cli` manifests plus `pnpm-lock.yaml`.
  - Migrate `packages/cli/biome.json` from the Biome 1 schema to the Biome 2
    schema and replace removed keys such as `files.include` with the current
    equivalent or remove them if `biome check src` already scopes the lint
    surface correctly.
  - Keep the existing lint command and code style behavior as close as possible
    to the current repo conventions.
  - Do not include TypeScript 6, Vitest 4, Commander, Listr, Ora, or
    `@types/node` changes in this migration.

  Testing and verification:
  - Run `pnpm install --frozen-lockfile`.
  - Run `pnpm lint` and verify Biome 2 accepts the migrated config.
  - Run `pnpm build`, `pnpm test`, and `pnpm typecheck` to catch any toolchain
    side effects.
  - Verify GitHub CI on Node 20 and 22 before merging.

- [ ] **8.5** Repair enrichment provenance, provider dedupe, and visible source
  diagnostics.

  Follow-up investigation on 2026-05-02 found that a real scan of 634 local
  skills produced enrichment for only 60 skills: 53 with GitHub data, 10 with
  `deps.dev` data, and 0 with `skills.sh` data. The root problem is not one
  provider outage. Most local skills expose no package/repository metadata,
  the current `SKILL.md` free-text fallback often enriches documentation links
  rather than the skill package, unauthenticated GitHub lookups burn the 60/hour
  core rate limit quickly, and the reverse-engineered `skills.sh` audit endpoint
  no longer returns usable audit data even for known audited skills.

  Target behavior:
  - Enrichment provenance prefers explicit package/plugin/source metadata over
    arbitrary GitHub links embedded in `SKILL.md` prose.
  - Discovery preserves plugin/package-level metadata that can identify the
    containing skill bundle, such as `plugin.json`, package metadata, repository
    fields, marketplace owner/name/version, and original source URLs when they
    exist.
  - `SKILL.md` GitHub fallback is either disabled by default or limited to
    clearly labeled source/provenance fields; documentation/example links must
    not silently become the skill's repository.
  - GitHub and `skills.sh` share the same normalized provenance object, not just
    a best-effort slug string.
  - Provider requests are deduped by canonical source key within a scan so ten
    skills from the same plugin do not issue ten identical GitHub repository
    lookups.
  - GitHub enrichment is quota-aware: rate-limit responses should become
    `unavailable` source outcomes with a useful reason, while cached repository
    data remains usable when present.
  - `skills.sh` enrichment uses a verified current public contract. If no
    stable API is available, use an explicit scraper fallback for the visible
    skill page or mark `skills.sh` unavailable/no-metadata with a reason; do
    not keep calling a stale endpoint that always returns `{}`.
  - `deps.dev` keeps working for actual dependency manifests, but output makes
    clear when no local dependency manifests exist.
  - Human output and JSON expose enough per-source diagnostics to explain why a
    source did not return data, without implying optional enrichment failure is
    a scan failure.

  Implementation notes:
  - Start by adding a small provenance extraction model under
    `packages/cli/src/enrich/` instead of expanding renderers or provider files.
  - Consider adding fields such as `sourceRepository`, `sourceUrl`,
    `provenanceSource`, or equivalent to the internal `Skill` metadata contract;
    update `specs/OUTPUT.md` only if those fields become user-visible.
  - Keep provider clients thin: they should consume normalized provenance and
    dependency refs, not search the filesystem independently.
  - Preserve local-first/fail-silent behavior. Enrichment should improve
    diagnostics and cache reuse, not block scans.
  - Do not add dependencies unless a verified `skills.sh` replacement path
    genuinely requires one and the dependency is documented in this file.

  Testing and verification:
  - Add fixtures for plugin-level repository metadata, package-level repository
    metadata, SKILL.md documentation links, placeholder links such as
    `OWNER/REPO`, and skills with no provenance.
  - Add tests proving documentation/example GitHub links no longer populate
    GitHub enrichment as if they were the skill source.
  - Add scan-level tests proving duplicate skills from the same plugin share one
    GitHub/provider lookup and one cached result.
  - Add live-contract or recorded-shape tests for the current `skills.sh`
    behavior using at least one known public skill page; if the only reliable
    contract is HTML, test the parser against a captured minimal page fragment.
  - Add source-outcome tests for GitHub rate-limit responses, stale cache
    fallback, no local provenance, no dependency manifests, and verified
    no-metadata provider responses.
  - Smoke-test the built CLI against a realistic temp fixture with: one plugin
    containing multiple skills and a plugin repository, one skill with only docs
    links, one skill with dependency manifests, and one skill with no metadata.
  - If live network is available, run a bounded real scan against a small subset
    of local skills and document the observed enrichment counts before and after
    the change.

## Dependencies added

(Append to this list when Ralph adds anything beyond the list in `AGENT.md`.)

## Decisions made during implementation

(If Ralph makes a choice that is not obvious from the task text or specs,
document it here.)

## Blockers

(If Ralph hits something it cannot proceed past, document the exact error
output and what was attempted.)
