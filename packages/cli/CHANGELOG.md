# Changelog

## 0.1.3

- Resolve GitHub code scanning alerts by tightening CI permissions and avoiding
  executable unsafe-regex test payloads.
- Resolve Dependabot dependency alerts and update runtime dependencies to
  Commander 14 and Ora 9.
- Refresh package docs, issue templates, release docs, README wording, and
  report terminology after recent review findings.
- Keep public agent/rule documentation aligned with the current Cline,
  Windsurf, and 46-rule scanner surface.

## 0.1.2

- Add discovery support for Windsurf and Cline agents.
- Add root-scan shortcuts so `skill-audit` can run default scan flow directly.
- Keep CLI agent help synchronized with supported agent IDs.
- Tighten rule/risk behavior by aligning regex safety paths and adding deterministic
  threat detectors.
- Refresh documentation and social proof surface (README, social preview, badges,
  and demo image rendering guidance) with related test/readme updates.
- Improve verification loop performance through a lighter local loop and updated tests.

## 0.1.1

- Publish under the scoped npm package `@ondrej-merkun/skill-audit`.
- Highlight optional local LLM review in the README.
- Keep CLI runtime version metadata aligned with package metadata.

## 0.1.0

- Initial MVP package for scanning installed AI agent skills.
