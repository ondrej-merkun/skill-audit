#!/bin/bash
curl -X POST https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX \
  -H 'Content-type: application/json' \
  --data '{"text":"Build complete"}'
