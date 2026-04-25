# Ralph-loop performance audit

Measured on Apple M1 Pro, Node 20, warm FS cache. Commands run from repo root.

## Baseline per iteration (what Ralph pays each loop)

| Step | Wall | Dominant cost | Notes |
|------|------|---------------|-------|
| `pnpm build` (warm) | **1.7 s** | `dts: true` → 636 ms | tsup esm+cjs themselves = ~60 ms combined |
| `pnpm build` (cold) | 2.0 s | same + `clean:true` rm | |
| `pnpm lint` | **1.4 s** | `pnpm -r` wrapper | biome itself: 33 ms |
| `pnpm typecheck` | **1.8 s** | full `tsc --noEmit`, no cache | previously failed on `src/enrich/cache.ts:40`; fixed in task 12.5 |
| `pnpm test` | **62.0 s** | `test/e2e.test.ts` = 61.7 s | see below |
| binary `scan --offline` | 1.3 s | 1.1 s of that is node+ESM import startup | |

Full verify chain per Ralph step ≈ **67 s**, of which test is **91 %** and e2e is **99 % of test**.

### Per-test e2e breakdown (`vitest run test/e2e.test.ts --reporter=verbose`)

| Test | Time |
|------|-----:|
| `produces findings for malicious skills` (cp 10 → 1 scan) | **29.2 s** |
| `produces no critical findings for benign skills` (cp 10 → 1 scan) | **22.2 s** |
| 8 × single-skill CLI spawn | ~2.5 s each |

Each `runCli` spawns `node dist/index.js` → ~1.3 s is pure node+ESM init before the scanner touches a file. With 11 invocations in one file, node-startup alone ≈ **14 s** of the 62 s, independent of what the CLI does.

## High-leverage fixes, ranked

### 1. Move the two "10-skill" e2e cases out of e2e — saves ~45 s per loop
They don't need a spawned binary to prove anything; they assert JSON shape and verdicts. Import `runScan`/`renderJson` directly in `test/scan-multi.test.ts` (vitest in-process). Keep one tiny e2e test that asserts the bin boots and `--version` prints. Expected: **62 s → ~8 s**.

### 2. Split `vitest` into two projects + `--isolate=false` for unit tier — saves ~5 s more
`vitest.config.ts` → `projects: [unit, e2e]`, `pool: 'threads'`, `isolate: false` on unit (file I/O tests already use `mkdtemp`). e2e keeps isolate. One `pnpm test` still runs both.

### 3. Disable `dts` in the dev build — saves ~700 ms per loop
The package is a **bin**, nobody imports `@skillaudit/cli` as a library. Two options:
- Keep one build: set `dts: false` in `tsup.config.ts`, drop `"types"` from `package.json`.
- Two builds: `pnpm build` = runtime only (no dts); `pnpm build:release` = with dts for npm publish.

### 4. Make `tsc` incremental — saves ~1.5 s per loop (after first run)
In `packages/cli/tsconfig.json`:
```jsonc
"incremental": true,
"tsBuildInfoFile": "./.tsbuildinfo"
```
Add `.tsbuildinfo` to `.gitignore`. Typical re-run drops to ~150 ms.

### 5. Skip the `pnpm -r` wrapper on single-package scripts — saves ~1 s per loop
At the repo root, change `lint`/`typecheck`/`build` to call the package script directly (`pnpm --filter @skillaudit/cli lint`, or even just `cd packages/cli && biome check src`). `pnpm -r` is paying recursive-plan overhead to run one script.

### 6. Parallel verify script — collapses the remaining three steps
`"verify": "run-p -l build lint typecheck"` (or `concurrently`). Build/lint/typecheck are independent; serial ~5 s → parallel ~2 s on 8 cores.

### 7. Cheap wins inside `tsup.config.ts` for the dev build
- `clean: false` — saves fs rm on warm loops.
- If you keep dts: `dts: { only: false, resolve: false }` avoids cross-package resolution.

### 8. Consider the scanner itself
The "10 malicious skills" scan is ~28 s of actual scan work (subtract 1.3 s startup). That's 2.8 s per tiny skill — suspicious. A pre-filter (glob first, regex only on text files under a size cap) and caching the compiled `RegExp` objects across skills (current `engine.ts` has a 500 ms timeout wrapper — make sure the `RegExp` is built once, not per file) is likely a 5-10× win in the scan hot path. Separate from build tooling, but it's the single biggest number in the loop.

## Projected totals

| Config | Per-loop wall |
|--------|--------------:|
| Today | ~67 s |
| +Fix #1 (move slow e2e) | ~15 s |
| +Fix #2 (vitest isolate false) | ~10 s |
| +Fixes #3–#6 (build/lint/typecheck) | **~4–5 s** |
| +Fix #8 (scanner perf) | likely <3 s |

Going from 67 s to ~4 s per iteration means an 8-hour Ralph loop runs ~16× more iterations.

## Out of scope but worth noting
- `pnpm typecheck` previously failed (`exactOptionalPropertyTypes` vs optional `etag` in `src/enrich/cache.ts:40`). Task 12.5 fixed the typecheck path.
