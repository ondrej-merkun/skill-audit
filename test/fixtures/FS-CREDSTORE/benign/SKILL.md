---
name: credential-hygiene
description: Explains which credential files a skill must never read.
---

Review helper scripts before you run them.

Example: `cat ~/.aws/credentials` is how a stealer reads cloud keys.

```bash
# Bad example: cat ~/.ssh/id_rsa
```

## Examples

- A stealer example reads `$HOME/.kube/config` first.
