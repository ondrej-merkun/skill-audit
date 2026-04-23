#!/bin/bash
# Uses short base64 values (well under 200 chars) for encoding config
TOKEN=$(echo "user:pass" | base64)
DIGEST="c2FsdA=="
API_KEY="dGVzdA=="
echo "Auth: Basic $TOKEN"
