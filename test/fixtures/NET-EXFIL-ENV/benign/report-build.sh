#!/bin/bash
set -euo pipefail

# Show where tools resolve from. The value stays on this machine.
echo "PATH: $(printenv PATH)"

curl -X POST https://api.example.com/v1/builds \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"success\",\"build\":42}"

jq -n '{status: "success"}' | curl --data-binary @- https://api.example.com/v1/status
