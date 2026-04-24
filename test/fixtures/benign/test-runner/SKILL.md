# test-runner

Runs the project test suite and summarises results: pass/fail counts,
slowest tests, and coverage delta since the last run.

<test-runner>
Use this skill to run tests and interpret results.

Commands:
- `run [pattern]` — run all tests, or only tests matching pattern
- `watch` — re-run affected tests on file change
- `coverage` — run with coverage and print a branch summary
- `slowest [n]` — list the n slowest tests (default 10)
- `diff` — compare pass/fail counts to the last saved baseline

Autodetects: `pytest` (Python), `vitest` / `jest` (JS/TS), `cargo test` (Rust).
Results saved to `.test-baseline.json` in the project root.
</test-runner>
