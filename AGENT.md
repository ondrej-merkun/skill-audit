# AGENT.md — conventions for the `skillaudit` repo

This file tells Ralph (and any future contributor) how to build, test,
and structure code in this repo. Keep it short and keep it accurate.

## Tech stack (do not drift)

| Concern | Choice |
|---|---|
| Language | TypeScript strict mode |
| Runtime | Node.js 20+ |
| Package manager | pnpm (workspaces) |
| Bundler | tsup (outputs CJS + ESM + .d.ts) |
| CLI framework | commander |
| Terminal colors | chalk v5 (ESM) |
| Terminal tables | cli-table3 |
| Spinners | ora |
| Multi-step pipelines | listr2 |
| Test runner | vitest |
| Linter/formatter | biome |

Do **not** add: ink, react, yargs, jest, eslint, prettier, axios
(use native fetch), lodash (use native), or any native-module
dependency (`node-gyp`).

## Repo layout

```
skillaudit/
├── packages/
│   ├── cli/                      @skillaudit/cli — the npm package
│   │   ├── src/
│   │   │   ├── index.ts          shebang + commander setup
│   │   │   ├── commands/         scan, list, explain, ignore
│   │   │   ├── discovery/        per-agent discovery plugins
│   │   │   ├── rules/            TypeScript rule defs (pure regex)
│   │   │   ├── semgrep/          YAML rules for optional AST pass
│   │   │   ├── enrich/           skills.sh, github, deps.dev + cache
│   │   │   ├── output/           table, json, html, summary renderers
│   │   │   ├── score.ts          scoring + verdict bands
│   │   │   └── allowlist/        anthropic-skills.json etc.
│   │   └── package.json
│   └── skill/                    SKILL.md wrapper for Claude Code
├── scripts/
│   └── vendor-allowlist.ts       regenerates sha256 tree for allowlisted skills
├── test/
│   └── fixtures/                 malicious-* and benign-* skill trees
├── docs/
├── README.md
├── CHANGELOG.md
└── pnpm-workspace.yaml
```

## Build / test / lint commands

Canonical commands (the Ralph loop runs these to verify):

```bash
pnpm install          # install deps
pnpm build            # tsup build — must produce dist/ with no errors
pnpm test             # vitest run — all tests must pass
pnpm lint             # biome check — may warn, must not error
pnpm typecheck        # tsc --noEmit — must pass
```

A single top-level `pnpm test` runs everything. Do not introduce more
than one test runner. If a test is slow, mark it `test.skip` with a
`// TODO: performance` comment — do not split into multiple test
commands.

## TypeScript conventions

- `strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`.
- Prefer `type` over `interface` for data shapes; use `interface` only
  when you need declaration merging (rare here).
- No `any`. Use `unknown` and narrow. For third-party libs without
  types, create a minimal `.d.ts` in `src/types/`.
- Avoid classes for data. Use plain objects + pure functions.
- One discovery plugin = one file in `src/discovery/` exporting a
  default object conforming to `AgentDiscovery`.
- One rule = one entry in a category file in `src/rules/`. Rule id is
  SCREAMING-KEBAB-CASE and matches the spec's rule catalog exactly.

## Rule authoring conventions

Each rule is an object:
```ts
export const PI_OVERRIDE: Rule = {
  id: 'PI-OVERRIDE',
  category: 'prompt-injection',
  severity: 'critical',
  appliesTo: ['*.md', '*.mdc', 'SKILL.md', 'AGENTS.md'],
  patterns: [
    /\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)\b/i,
    // ... more patterns
  ],
  message: 'Instruction-override phrasing detected.',
  fix: 'Remove instructions that ask the model to disregard prior context.',
  cwe: ['CWE-1427'],
};
```

**Every rule ships with at least two fixtures**: one malicious (must
fire) and one benign (must not fire). File them under
`test/fixtures/<rule-id>/malicious/` and `test/fixtures/<rule-id>/benign/`.
The test harness (`test/rules.test.ts`) walks these automatically.

## Commit style

Conventional commits. Scope is the package or subsystem:
- `feat(discovery): add cursor mcp discovery`
- `feat(rules): add NET-EXFIL-ENV`
- `fix(scoring): mandatory-fail list should override allowlist demotion`
- `test(rules): add benign fixture for PI-OVERRIDE`
- `docs(readme): add hero gif placeholder`
- `chore(plan): complete task 3.2`

One concern per commit. If you touched both discovery and rules in one
task, make two commits.

## What "done" means for a task

A task is done when:
1. The feature is implemented per the spec section it references.
2. New code has tests, and `pnpm test` passes.
3. `pnpm build` produces a clean `dist/`.
4. `pnpm lint` produces no errors (warnings ok).
5. You've updated `fix_plan.md` checkbox.
6. You've committed both the feature and the checkbox change.

## When the spec and AGENT.md disagree

The spec (`specs/SPEC.md`) wins on *what* to build. AGENT.md wins on
*how* to structure the code. If they genuinely conflict, prefer the
spec and add a note in `fix_plan.md` under "Spec-vs-AGENT conflicts".
