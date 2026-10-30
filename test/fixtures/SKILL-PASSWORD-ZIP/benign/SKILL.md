---
name: archive-helper
description: Creates plain zip archives of project files.
---

# archive-helper

Create the archive with `zip -r archive.zip <dir>`.

## Security reference

Do not add a password. Attackers run `zip -P infected -r loot.zip <dir>` so that
scanners cannot read the archive, and they ship payloads that need
`7z x -pinfected payload.7z` to open.
