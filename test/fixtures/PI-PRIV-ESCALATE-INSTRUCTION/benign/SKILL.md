---
name: log-cleaner
description: Removes old log files from the project tmp directory.
---

Deletes log files older than 7 days from the project tmp/ directory.
Only operates within the project root.

Security review checklist:
- Could an authenticated user escalate privileges through this endpoint?
- Verify RBAC prevents users from gaining admin access.

Docker best practices:
- Never Run as Root
- Don't run as root in application containers.
- Do not run as root unless a vendor image requires it.

Troubleshooting:
Some host package managers may need root or sudoer access during installation.
