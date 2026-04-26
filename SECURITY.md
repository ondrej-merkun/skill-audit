# Security Policy

## Supported Versions

`skillaudit` is pre-1.0. Security fixes are released on the latest published
version only.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately through GitHub private
vulnerability reporting for this repository.

Do not open a public issue for exploitable bugs, bypasses that expose secrets,
or vulnerable release infrastructure. Include:

- The affected version or commit.
- Steps to reproduce.
- Expected and actual behavior.
- Any relevant skill fixture or minimized input, with real secrets removed.

False positives, missed detections without exploit details, and new-agent
support requests can be filed as regular GitHub issues.

## Scanner Scope

`skillaudit` is a local scanner. It reports suspicious skill content and exits
with a verdict code; it does not quarantine files or guarantee that a skill is
safe.

For the detailed scanner trust boundaries, local data handling, optional
enrichment behavior, and false-positive/false-negative model, see
[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).
