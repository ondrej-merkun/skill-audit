# Roadmap

This roadmap is a maintainer guide for likely next work. It is not a release
promise and does not include dates.

## Committed Near-Term Work

These items are already queued in [`fix_plan.md`](../fix_plan.md) and should be
handled in that order by the Ralph loop:

- **Issue forms:** add structured templates for false positives, missed
  detections, and new agent support requests (`fix_plan.md` tasks 45-47).
- **Pull request template:** replace the current generic template with a
  project-specific review checklist (`fix_plan.md` task 48).

## Candidate Ideas

These ideas are not committed. They need an issue or a concrete `fix_plan.md`
task before implementation:

- **Rule tuning from reports:** use minimized public false-positive and
  missed-detection examples to improve rule precision without weakening
  malicious coverage.
- **More agent discovery adapters:** add support for additional local agent
  ecosystems only when there is a documented on-disk format and a fixture that
  proves active/exposed content.
- **Report ergonomics:** improve how users compare scan results over time,
  while keeping JSON schema compatibility explicit.
- **Optional deeper analysis:** explore AST-backed or semantic checks for cases
  regex rules cannot model well, without adding network-dependent verdicts.
- **Package and action hardening:** keep release provenance, packed-file
  contents, and GitHub Action behavior aligned with the release checklist.

## Contribution Fit

Good roadmap tasks have a narrow user problem, a fixture or reproducible input,
and a clear verification command. Avoid broad rewrites unless they remove a
specific bug, risk, or maintenance cost already visible in the project.
