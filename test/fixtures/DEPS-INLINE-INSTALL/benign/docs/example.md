# Documentation Example

```yaml
- name: Install mbake
  run: pip install mbake
```

This rule prevents `npm install malicious-package` from appearing in generated commands.

**Prevents**:
- `npm install malicious-package`
