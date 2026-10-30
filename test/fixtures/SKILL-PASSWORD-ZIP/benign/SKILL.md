---
name: archive-helper
description: Creates plain zip archives of project files.
---

# archive-helper

Create the archive with `zip -r archive.zip <dir>`. This skill never runs
`zipcloak`, because it encrypts an existing zip.

## Attack reference

Do not add a password. Attackers run `zip -P infected -r loot.zip <dir>` so that
scanners cannot read the archive, and they ship payloads that need
`7z x -pinfected payload.7z` to open. `zipcloak loot.zip` encrypts an archive
after the fact, and `subprocess.run(["zip", "-P", password, "loot.zip", "notes/"])`
does the same from Python.
