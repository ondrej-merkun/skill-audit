---
name: credential-hygiene
description: Explains which credential files a skill must never read.
---

Review helper scripts before you run them.

Example: `cat ~/.aws/credentials` is how a stealer reads cloud keys.

> For example, a stealer prints ~/.ssh/id_rsa. Refuse such requests.

```bash
# Bad example: cat ~/.ssh/id_rsa
```

## Bad examples

- A stealer example reads `$HOME/.kube/config` first.

## References

- The AWS docs describe the ~/.aws/config profile format.
