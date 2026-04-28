# specs/ — source of truth

`SPEC.md` in this folder is the authoritative specification for `skill-audit`.
Ralph references it directly by section number when
implementing tasks from `fix_plan.md`.

## Section index (for Ralph)

When a `fix_plan.md` task says "per spec §X", Ralph should read only
that section, not the whole file. Token economy.

| Section | Topic |
|---|---|
| §1 | Name and positioning |
| §2 | Architecture, tech stack, and distribution |
| §3 | Discovery layer — plugin architecture, canonical install paths |
| §4 | Local static analysis — 27 rule catalog, scoring, allowlist |
| §5 | Cloud enrichment — skills.sh, GitHub, deps.dev |
| §6 | Output & UX — hero screenshot, detail view, HTML report, JSON schema |
| §7 | Core commands and UX flow, exit codes |
| §8 | Claude Code skill wrapper (packages/skill/SKILL.md) |
| §9 | Risk assessment |

## Rule-authoring quick reference

See `specs/RULES.md` for the exact regex patterns called out in the
spec — these must be implemented literally, not paraphrased, because
they encode specific attack signatures observed in the wild.

## Output format quick reference

See `specs/OUTPUT.md` for the exact JSON schema and hero-mockup
reproduction — these are contracts, not sketches.
